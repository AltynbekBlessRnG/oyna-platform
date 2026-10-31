import { useEffect, useRef, useState } from "react";
import { clearConfig, loadConfig, saveConfig, type StationConfig } from "./config";
import { serverNow, useNow, useStation } from "./connection";
import { AdminExit } from "./AdminExit";
import { useClubInfo } from "./club";
import { Library } from "./Library";
import { Lock } from "./Lock";
import { platform, type InstalledGame } from "./platform";
import { Setup } from "./Setup";
import { Logo } from "./ui";

export function App() {
  // undefined — ещё читаем настройки с диска, null — компьютер не подключён.
  const [config, setConfig] = useState<StationConfig | null | undefined>(undefined);
  const [notice, setNotice] = useState<string>();
  const [lastApiUrl, setLastApiUrl] = useState<string>();

  useEffect(() => {
    void loadConfig().then(setConfig);
  }, []);

  if (config === undefined) {
    return (
      <main className="splash">
        <Logo />
      </main>
    );
  }
  if (!config) {
    return (
      <Setup
        notice={notice}
        apiUrl={lastApiUrl}
        onSave={(next) => {
          void saveConfig(next);
          setNotice(undefined);
          setConfig(next);
        }}
      />
    );
  }
  return (
    <Station
      config={config}
      onRejected={(message) => {
        void clearConfig();
        setNotice(message);
        setLastApiUrl(config.apiUrl);
        setConfig(null);
      }}
    />
  );
}

function Station({ config, onRejected }: { config: StationConfig; onRejected: (message: string) => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  const { state, link, rejection, requestCode, endSession, placeOrder } = useStation(config, (command) => {
    if (command.type === "message" && command.text) {
      setNotice(command.text);
      void platform.bringToFront();
    } else if (command.type === "restart") {
      void platform.restart();
    } else if (command.type === "shutdown") {
      void platform.shutdown();
    }
  });
  const now = useNow();
  const games = useGames();
  const club = useClubInfo(config.apiUrl, state?.station.clubId, link === "online");

  // Пока есть связь, сессию заканчивает сервер. Без связи он об этом не скажет — тогда считаем
  // сами, по его же часам (см. serverNow), чтобы спешащие часы Windows не обрывали оплаченное время.
  const session = state?.session && (link === "online" || Date.parse(state.session.endsAt) > now) ? state.session : null;
  const restartAt = useRestartAfter(session?.id);

  const locked = !session;
  // Пока висит сообщение из кабинета, Zen держится поверх игры; закрыли — возвращаем как было.
  useEffect(() => {
    void (notice ? platform.bringToFront() : platform.setLocked(locked));
  }, [locked, notice]);

  useEffect(() => {
    if (link === "rejected") onRejected(rejection ?? "Сервер не принял ключ этого компьютера");
  }, [link, rejection, onRejected]);

  const screen = !state ? (
    <main className="splash">
      <Logo />
      <p className="muted">{link === "offline" ? "Нет связи с сервером клуба. Пробуем снова…" : "Подключаемся к клубу…"}</p>
    </main>
  ) : restartAt !== null && !session ? (
    <main className="splash">
      <Logo />
      <h1>Сессия окончена</h1>
      <p className="muted">Компьютер перезагрузится через {Math.max(0, Math.ceil((restartAt - now) / 1_000))} с и будет готов для следующего игрока.</p>
    </main>
  ) : !session ? (
    <Lock state={state} games={games} club={club} link={link} now={now} requestCode={requestCode} />
  ) : (
    <Library key={session.id} state={state} session={session} games={games} club={club} link={link} now={now} endSession={endSession} placeOrder={placeOrder} />
  );
  return (
    <>
      {screen}
      {notice && <ClubMessage text={notice} onClose={() => setNotice(null)} />}
      <AdminExit pinHash={config.adminPinHash} />
    </>
  );
}

/** Сообщение администратора: поверх всего, пока игрок не нажмёт «Понятно». */
function ClubMessage({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="backdrop">
      <section role="alertdialog" aria-modal="true" aria-label="Сообщение от администратора" className="setup-card">
        <span className="muted small">Сообщение от администратора</span>
        <p className="club-message">{text}</p>
        <button className="primary" autoFocus onClick={onClose}>
          Понятно
        </button>
      </section>
    </div>
  );
}

function useGames(): InstalledGame[] {
  const [games, setGames] = useState<InstalledGame[]>([]);
  useEffect(() => {
    void platform.listGames().then(setGames);
  }, []);
  return games;
}

const RESTART_AFTER_MS = 10_000;

/**
 * Сессия закончилась: закрываем игры и перезагружаемся. «Заморозка» клуба возвращает компьютер
 * в чистое состояние, и следующий игрок не найдёт чужих аккаунтов. Возвращает время перезагрузки.
 */
function useRestartAfter(sessionId: string | undefined): number | null {
  const previous = useRef(sessionId);
  const [restartAt, setRestartAt] = useState<number | null>(null);

  useEffect(() => {
    const ended = Boolean(previous.current) && previous.current !== sessionId;
    previous.current = sessionId;
    // Касса могла сразу посадить нового игрока: тогда не перезагружаемся у него под носом.
    if (sessionId) return setRestartAt(null);
    if (!ended) return;
    void platform.cleanUp();
    setRestartAt(serverNow() + RESTART_AFTER_MS);
  }, [sessionId]);

  useEffect(() => {
    if (restartAt === null) return;
    const timer = setTimeout(() => {
      // Не вышло (не гость или не Windows) — просто остаёмся на экране блокировки.
      platform.restart().catch(() => setRestartAt(null));
    }, Math.max(0, restartAt - serverNow()));
    return () => clearTimeout(timer);
  }, [restartAt]);

  return restartAt;
}
