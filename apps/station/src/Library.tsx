import type { PlaySession, StationState } from "@oyna/contracts";
import { useEffect, useMemo, useState } from "react";
import type { Link } from "./connection";
import { clock, hoursMinutes, money, playerLabel } from "./format";
import { LAUNCHER_NAMES, platform, type InstalledGame } from "./platform";
import { GameCover, Icon, Rail, type View } from "./ui";

const WARN_BEFORE_MS = 5 * 60_000;
const ALL = "Все";

/**
 * Сколько денег останется после уже сыгранного. Сервер списывает в конце сессии, каждая начатая
 * минута целиком и не дольше оплаченного времени, а `playerBalance` приходит ещё без этого списания.
 */
function balanceLeft(balance: number, session: PlaySession, now: number): number {
  const start = Date.parse(session.startedAt);
  const end = Math.min(now, Date.parse(session.endsAt));
  const minutes = Math.max(0, Math.ceil((end - start) / 60_000));
  return Math.max(0, balance - Math.ceil((minutes * session.pricePerHour) / 60));
}

/** Игрок вошёл: библиотека игр, оставшееся время и выход. */
export function Library({
  state,
  session,
  games,
  link,
  now,
  endSession
}: {
  state: StationState;
  session: PlaySession;
  games: InstalledGame[];
  link: Link;
  now: number;
  endSession: () => Promise<void>;
}) {
  const [view, setView] = useState<View>("games");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(ALL);
  const [recent, setRecent] = useState<string[]>([]);
  const [opened, setOpened] = useState<InstalledGame | null>(null);

  const genres = useMemo(() => [ALL, ...new Set(games.flatMap((game) => (game.genre ? [game.genre] : [])))], [games]);
  const shown = useMemo(() => {
    if (view === "recent") return recent.flatMap((id) => games.filter((game) => game.id === id));
    const needle = query.trim().toLowerCase();
    return games.filter((game) => (genre === ALL || game.genre === genre) && (!needle || game.name.toLowerCase().includes(needle)));
  }, [games, view, recent, query, genre]);

  const launch = async (game: InstalledGame) => {
    setOpened(null);
    setRecent((ids) => [game.id, ...ids.filter((id) => id !== game.id)]);
    await platform.launch(game);
  };

  return (
    <div className="screen">
      <Rail active={view} onSelect={setView} />
      <main className="center">
        {view === "help" ? (
          <Help />
        ) : (
          <>
            {view === "games" ? (
              <header className="filters">
                <label className="search">
                  <Icon name="search" size={18} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игру" aria-label="Найти игру" />
                </label>
                {genres.length > 1 && <div className="chips" role="group" aria-label="Жанр">
                  {genres.map((name) => (
                    <button key={name} className="chip" aria-pressed={genre === name} onClick={() => setGenre(name)}>
                      {name}
                    </button>
                  ))}
                </div>}
              </header>
            ) : (
              <header className="lock-head">
                <h1>Недавние</h1>
                <span className="muted">игры, которые вы запускали в эту сессию</span>
              </header>
            )}
            {shown.length > 0 ? (
              <div className="grid">
                {shown.map((game) => (
                  <button className="tile" key={game.id} onClick={() => setOpened(game)}>
                    <GameCover game={game} />
                    <div className="tile-name">{game.name}</div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty muted">{view === "recent" ? "Пока ничего не запускали." : "Такой игры на этом компьютере нет. Спросите администратора — он может её поставить."}</p>
            )}
          </>
        )}
      </main>
      <SessionPanel state={state} session={session} link={link} now={now} endSession={endSession} />
      {opened && <GameDialog game={opened} session={session} onClose={() => setOpened(null)} onPlay={() => void launch(opened)} />}
      <TimeWarning session={session} now={now} />
    </div>
  );
}

function SessionPanel({ state, session, link, now, endSession }: { state: StationState; session: PlaySession; link: Link; now: number; endSession: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const name = playerLabel(session.playerName, session.playerPhoneTail);
  const total = Date.parse(session.endsAt) - Date.parse(session.startedAt);
  const left = Date.parse(session.endsAt) - now;
  const spent = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 1;

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 5_000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const finish = async () => {
    if (!confirming) return setConfirming(true);
    try {
      setError(undefined);
      await endSession();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не получилось завершить сессию");
      setConfirming(false);
    }
  };

  return (
    <aside className="side">
      <div className="player">
        <span className="avatar">{name.replace(/^Гость ··/, "").slice(0, 1).toUpperCase()}</span>
        <div>
          <div className="player-name">{name}</div>
          <div className="muted small">
            Место {state.station.seatLabel} · {session.zoneName}
          </div>
        </div>
      </div>

      <section className="time-card" aria-label="Оставшееся время">
        <span className="muted small">Осталось</span>
        <span className={left <= WARN_BEFORE_MS ? "left warn" : "left"}>{hoursMinutes(left)}</span>
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${spent * 100}%` }} />
        </div>
        <span className="muted small">
          до {clock(session.endsAt)} · начали в {clock(session.startedAt)}
        </span>
      </section>

      {session.packageName ? (
        <section className="money-card" aria-label="Пакет">
          <span className="muted small">Пакет</span>
          <span className="money">{session.packageName}</span>
          <span className="muted small">уже оплачен</span>
        </section>
      ) : (
        state.playerBalance !== undefined && (
          <section className="money-card" aria-label="Баланс">
            <span className="muted small">На балансе</span>
            <span className="money">{money(balanceLeft(state.playerBalance, session, now))}</span>
            <span className="muted small">с учётом сыгранного времени</span>
          </section>
        )
      )}

      <dl className="facts">
        <dt>Тариф</dt>
        <dd>{money(session.pricePerHour)} в час</dd>
      </dl>
      <p className="muted small">Чтобы играть дольше, пополните баланс на кассе или в приложении — время продлится само.</p>
      {link !== "online" && <p className="offline small">Нет связи с сервером. Играйте спокойно: время идёт как было.</p>}

      <span className="grow" />
      {error && <p className="offline small">{error}</p>}
      <button className={confirming ? "danger confirm" : "danger"} onClick={() => void finish()}>
        {confirming ? "Нажмите ещё раз, чтобы выйти" : "Завершить сессию"}
      </button>
    </aside>
  );
}

function GameDialog({ game, session, onClose, onPlay }: { game: InstalledGame; session: PlaySession; onClose: () => void; onPlay: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const launcher = LAUNCHER_NAMES[game.launcher];
  const ownAccount = game.launcher !== "other";
  return (
    <div className="backdrop" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={game.name} className="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-cover" style={game.cover ? { background: `center / cover no-repeat url(${game.cover})` } : { background: game.bg, color: game.ink }}>
          <span>{game.cover ? "" : game.logo}</span>
          <button className="dialog-close" aria-label="Закрыть" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="dialog-body">
          <div>
            <h2>{game.name}</h2>
            <p className="muted">
              {game.genre ? `${game.genre} · ` : ""}запускается через {launcher}
            </p>
          </div>
          <div className="dialog-cards">
            {ownAccount && (
              <div className="info">
                <span className="info-title">Войдите в свой {launcher}</span>
                <span className="muted small">Ваши скины, друзья и звание — с вами. После сессии Zen выйдет из аккаунта и сотрёт данные входа с этого компьютера.</span>
              </div>
            )}
            <div className="info">
              <span className="info-title">Времени хватит до {clock(session.endsAt)}</span>
              <span className="muted small">За 5 минут до конца предупредим прямо в игре.</span>
            </div>
          </div>
          <button className="primary play" autoFocus onClick={onPlay}>
            Играть
          </button>
        </div>
      </section>
    </div>
  );
}

/** За 5 минут до конца. Если игрок пополнит баланс, конец отодвинется и предупреждение уйдёт само. */
function TimeWarning({ session, now }: { session: PlaySession; now: number }) {
  const [dismissedFor, setDismissedFor] = useState<string>();
  const left = Date.parse(session.endsAt) - now;
  if (left > WARN_BEFORE_MS || dismissedFor === session.endsAt) return null;
  return (
    <section role="status" className="warning">
      <div className="warning-head">
        <span className="warning-icon">
          <Icon name="recent" />
        </span>
        <div>
          <div className="warning-title">Осталось {Math.max(1, Math.ceil(left / 60_000))} мин</div>
          <div className="muted small">до {clock(session.endsAt)}</div>
        </div>
      </div>
      <p className="small">Сохранитесь или доиграйте раунд. Чтобы играть дальше, пополните баланс — время продлится само, выходить не нужно.</p>
      <button className="primary" onClick={() => setDismissedFor(session.endsAt)}>
        Понятно
      </button>
    </section>
  );
}

function Help() {
  return (
    <div className="help">
      <h1>Помощь</h1>
      <section>
        <h2>Как продлить время</h2>
        <p className="muted">Пополните баланс на кассе или в приложении Zen. Время продлится само, выходить из игры не нужно.</p>
      </section>
      <section>
        <h2>Игра не запускается или нужна другая</h2>
        <p className="muted">Подойдите к администратору: он проверит компьютер или поставит игру.</p>
      </section>
      <section>
        <h2>Ваши аккаунты в безопасности</h2>
        <p className="muted">Когда сессия закончится, Zen закроет игры, выйдет из ваших аккаунтов Steam, Riot и других и сотрёт данные входа с этого компьютера.</p>
      </section>
    </div>
  );
}
