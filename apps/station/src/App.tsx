import { useEffect, useRef, useState } from "react";
import { clearConfig, loadConfig, saveConfig, type StationConfig } from "./config";
import { useNow, useStation } from "./connection";
import { AdminExit } from "./AdminExit";
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
  const { state, link, rejection, requestCode, endSession } = useStation(config);
  const now = useNow();
  const games = useGames();

  // Без связи сервер не скажет, что время вышло, поэтому конец сессии считаем и сами.
  const session = state?.session && Date.parse(state.session.endsAt) > now ? state.session : null;
  const restartAt = useRestartAfter(session?.id);

  const locked = !session;
  useEffect(() => {
    void platform.setLocked(locked);
  }, [locked]);

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
    <Lock state={state} games={games} link={link} now={now} requestCode={requestCode} />
  ) : (
    <Library key={session.id} state={state} session={session} games={games} link={link} now={now} endSession={endSession} />
  );
  return (
    <>
      {screen}
      <AdminExit pinHash={config.adminPinHash} />
    </>
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
    setRestartAt(Date.now() + RESTART_AFTER_MS);
  }, [sessionId]);

  useEffect(() => {
    if (restartAt === null) return;
    const timer = setTimeout(() => {
      // Не вышло (не гость или не Windows) — просто остаёмся на экране блокировки.
      platform.restart().catch(() => setRestartAt(null));
    }, Math.max(0, restartAt - Date.now()));
    return () => clearTimeout(timer);
  }, [restartAt]);

  return restartAt;
}
