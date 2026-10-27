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
  const [config, setConfig] = useState(loadConfig);
  const [notice, setNotice] = useState<string>();
  const [lastApiUrl, setLastApiUrl] = useState<string>();

  if (!config) {
    return (
      <Setup
        notice={notice}
        apiUrl={lastApiUrl}
        onSave={(next) => {
          saveConfig(next);
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
        clearConfig();
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
  useCleanUpAfter(session?.id);

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

/** Сессия сменилась или закончилась: следующий игрок не должен найти чужие игры и аккаунты открытыми. */
function useCleanUpAfter(sessionId: string | undefined) {
  const previous = useRef(sessionId);
  useEffect(() => {
    if (previous.current && previous.current !== sessionId) void platform.cleanUp();
    previous.current = sessionId;
  }, [sessionId]);
}
