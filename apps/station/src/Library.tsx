import type { PlaySession, StationOrderResult, StationState } from "@oyna/contracts";
import { useEffect, useMemo, useState } from "react";
import { Bar, type Cart } from "./Bar";
import { BarPreview, PackageBoard, TournamentCard } from "./blocks";
import { type ClubInfo, packagesForZone, upcomingTournaments } from "./club";
import type { Link, StationOrderRequest } from "./connection";
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

const TITLES: Record<Exclude<View, "home">, string> = {
  games: "Игры",
  bar: "Бар",
  recent: "Недавние",
  help: "Помощь"
};

/** Игрок вошёл: главная, игры, бар, недавние и помощь; время и выход всегда наверху. */
export function Library({
  state,
  session,
  games,
  club,
  link,
  now,
  endSession,
  placeOrder
}: {
  state: StationState;
  session: PlaySession;
  games: InstalledGame[];
  club: ClubInfo;
  link: Link;
  now: number;
  endSession: () => Promise<void>;
  placeOrder: (request: StationOrderRequest) => Promise<StationOrderResult>;
}) {
  const [view, setView] = useState<View>("home");
  const [recent, setRecent] = useState<string[]>([]);
  const [opened, setOpened] = useState<InstalledGame | null>(null);
  const [cart, setCart] = useState<Cart>({});

  const recentGames = useMemo(() => recent.flatMap((id) => games.filter((game) => game.id === id)), [recent, games]);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);

  const launch = async (game: InstalledGame) => {
    setOpened(null);
    setRecent((ids) => [game.id, ...ids.filter((id) => id !== game.id)]);
    await platform.launch(game);
  };

  return (
    <div className="screen">
      <Rail active={view} onSelect={setView} badges={{ bar: cartCount }} />
      <div className="app">
        <TopBar state={state} session={session} link={link} now={now} view={view} endSession={endSession} />
        <main className="app-body">
          {view === "home" ? (
            <Home state={state} session={session} games={games} recentGames={recentGames} club={club} now={now} onOpen={setOpened} onNavigate={setView} />
          ) : view === "games" ? (
            <Games games={games} onOpen={setOpened} />
          ) : view === "bar" ? (
            <Bar menu={club.menu} seatLabel={state.station.seatLabel} cart={cart} setCart={setCart} link={link} placeOrder={placeOrder} />
          ) : view === "recent" ? (
            <div className="page">
              <p className="muted page-lead">Игры, которые вы запускали в эту сессию.</p>
              {recentGames.length > 0 ? <GameGrid games={recentGames} onOpen={setOpened} /> : <p className="empty muted">Пока ничего не запускали.</p>}
            </div>
          ) : (
            <Help />
          )}
        </main>
      </div>
      {opened && <GameDialog game={opened} session={session} onClose={() => setOpened(null)} onPlay={() => void launch(opened)} />}
      <TimeWarning session={session} now={now} />
    </div>
  );
}

/** Верхняя строка: где я, сколько осталось и выход. На главной время крупно в карточках, здесь его не дублируем. */
function TopBar({ state, session, link, now, view, endSession }: { state: StationState; session: PlaySession; link: Link; now: number; view: View; endSession: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const name = playerLabel(session.playerName, session.playerPhoneTail);
  const guest = name.startsWith("Гость ··");
  const left = Date.parse(session.endsAt) - now;

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
    <header className="topbar">
      {view === "home" ? (
        <div className="greeting">
          <span className="avatar">{name.replace(/^Гость ··/, "").slice(0, 1).toUpperCase()}</span>
          <div>
            <h1>{guest ? "Добро пожаловать" : `Привет, ${name}`}</h1>
            <span className="muted small">
              {guest ? `${name}, ` : ""}
              {state.clubName}
            </span>
          </div>
        </div>
      ) : (
        <h1 className="topbar-title">{TITLES[view]}</h1>
      )}
      <span className="grow" />
      {link !== "online" && <span className="pill offline-pill">Нет связи, время идёт как было</span>}
      {error && <span className="pill offline-pill">{error}</span>}
      <span className="pill">
        Место <strong>{state.station.seatLabel}</strong>
        <span className="muted">{session.zoneName}</span>
      </span>
      {view !== "home" && (
        <>
          <span className={left <= WARN_BEFORE_MS ? "pill time-pill warn" : "pill time-pill"}>
            <Icon name="recent" size={16} />
            <strong>{hoursMinutes(left)}</strong>
            <span className="muted">до {clock(session.endsAt)}</span>
          </span>
          {!session.packageName && state.playerBalance !== undefined && (
            <span className="pill">
              <strong>{money(balanceLeft(state.playerBalance, session, now))}</strong>
              <span className="muted">на балансе</span>
            </span>
          )}
        </>
      )}
      <button className={confirming ? "danger confirm" : "danger"} onClick={() => void finish()}>
        {confirming ? "Нажмите ещё раз, чтобы выйти" : "Завершить сессию"}
      </button>
    </header>
  );
}

function Home({
  state,
  session,
  games,
  recentGames,
  club,
  now,
  onOpen,
  onNavigate
}: {
  state: StationState;
  session: PlaySession;
  games: InstalledGame[];
  recentGames: InstalledGame[];
  club: ClubInfo;
  now: number;
  onOpen: (game: InstalledGame) => void;
  onNavigate: (view: View) => void;
}) {
  const total = Date.parse(session.endsAt) - Date.parse(session.startedAt);
  const left = Date.parse(session.endsAt) - now;
  const spent = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 1;
  const packages = packagesForZone(club.packages, state.station.zoneId);
  const tournaments = upcomingTournaments(club.tournaments, now, 2);
  const gameNames = new Map(games.map((game) => [game.id, game.name]));
  const recentIds = new Set(recentGames.map((game) => game.id));
  const featured = games.filter((game) => !recentIds.has(game.id));

  return (
    <div className="page home">
      <section className="home-hero">
        <section className={left <= WARN_BEFORE_MS ? "time-card warn" : "time-card"} aria-label="Оставшееся время">
          <span className="card-label">Осталось</span>
          <span className="left">{hoursMinutes(left)}</span>
          <div className="bar" aria-hidden="true">
            <span style={{ width: `${spent * 100}%` }} />
          </div>
          <span className="muted small">
            до {clock(session.endsAt)}, начали в {clock(session.startedAt)}
          </span>
        </section>

        {session.packageName ? (
          <section className="money-card" aria-label="Пакет">
            <span className="card-label">Пакет</span>
            <span className="money">{session.packageName}</span>
            <span className="muted small">Уже оплачен. Чтобы остаться дольше, подойдите к кассе.</span>
            <dl className="facts">
              <dt>Сыграно</dt>
              <dd>{hoursMinutes(Math.max(0, now - Date.parse(session.startedAt)))}</dd>
              {session.packagePrice !== undefined && (
                <>
                  <dt>Цена пакета</dt>
                  <dd>{money(session.packagePrice)}</dd>
                </>
              )}
            </dl>
          </section>
        ) : (
          state.playerBalance !== undefined && (
            <section className="money-card" aria-label="Баланс">
              <span className="card-label">На балансе</span>
              <span className="money">{money(balanceLeft(state.playerBalance, session, now))}</span>
              <span className="muted small">С учётом сыгранного. Пополните на кассе или в приложении — время продлится само.</span>
              <dl className="facts">
                <dt>Тариф</dt>
                <dd>{money(session.pricePerHour)} в час</dd>
                <dt>Сыграно</dt>
                <dd>{hoursMinutes(Math.max(0, now - Date.parse(session.startedAt)))}</dd>
              </dl>
            </section>
          )
        )}

        <PackageBoard packages={packages} zone={state.zone} now={now} title="Продлить выгоднее" note="Пакет оформляет касса" />
      </section>

      {recentGames.length > 0 && <Shelf title="Недавние" games={recentGames} onOpen={onOpen} />}
      {featured.length > 0 && <Shelf title="Игры на этом компьютере" games={featured} onOpen={onOpen} more={{ label: "Все игры", onClick: () => onNavigate("games") }} />}

      {(tournaments.length > 0 || club.menu) && (
        <div className="home-extra">
          {club.menu && <BarPreview menu={club.menu} note={`Принесут к месту ${state.station.seatLabel}`} onOpen={() => onNavigate("bar")} />}
          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} gameName={gameNames.get(tournament.gameId)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Одна строка обложек: сколько влезает по ширине экрана, остальное — в «Играх». */
function Shelf({ title, games, onOpen, more }: { title: string; games: InstalledGame[]; onOpen: (game: InstalledGame) => void; more?: { label: string; onClick: () => void } }) {
  return (
    <section className="shelf" aria-label={title}>
      <header className="block-head">
        <h2>{title}</h2>
        {more && (
          <button className="link-btn" onClick={more.onClick}>
            {more.label}
          </button>
        )}
      </header>
      <div className="shelf-row">
        {games.map((game) => (
          <GameTile key={game.id} game={game} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function GameTile({ game, onOpen }: { game: InstalledGame; onOpen: (game: InstalledGame) => void }) {
  return (
    <button className="tile" onClick={() => onOpen(game)}>
      <GameCover game={game} />
      <div className="tile-name">
        <span>{game.name}</span>
        {game.genre && <span className="tile-genre">{game.genre}</span>}
      </div>
    </button>
  );
}

function GameGrid({ games, onOpen }: { games: InstalledGame[]; onOpen: (game: InstalledGame) => void }) {
  return (
    <div className="grid">
      {games.map((game) => (
        <GameTile key={game.id} game={game} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Games({ games, onOpen }: { games: InstalledGame[]; onOpen: (game: InstalledGame) => void }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(ALL);
  const genres = useMemo(() => [ALL, ...new Set(games.flatMap((game) => (game.genre ? [game.genre] : [])))], [games]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return games.filter((game) => (genre === ALL || game.genre === genre) && (!needle || game.name.toLowerCase().includes(needle)));
  }, [games, query, genre]);

  return (
    <div className="page games-page">
      <header className="filters">
        <label className="search">
          <Icon name="search" size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игру" aria-label="Найти игру" />
        </label>
        {genres.length > 1 && (
          <div className="chips" role="group" aria-label="Жанр">
            {genres.map((name) => (
              <button key={name} className="chip" aria-pressed={genre === name} onClick={() => setGenre(name)}>
                {name}
              </button>
            ))}
          </div>
        )}
      </header>
      {shown.length > 0 ? <GameGrid games={shown} onOpen={onOpen} /> : <p className="empty muted">Такой игры на этом компьютере нет. Спросите администратора — он может её поставить.</p>}
    </div>
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
              {game.genre ? `${game.genre}, ` : ""}запускается через {launcher}
            </p>
          </div>
          <div className="dialog-cards">
            {ownAccount && (
              <div className="info">
                <span className="info-title">Войдите в свой {launcher}</span>
                <span className="muted small">Ваши скины, друзья и звание — с вами. После сессии Vence выйдет из аккаунта и сотрёт данные входа с этого компьютера.</span>
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
    <div className="page help">
      <section>
        <h2>Как продлить время</h2>
        <p className="muted">Пополните баланс на кассе или в приложении Vence. Время продлится само, выходить из игры не нужно. Пакеты вроде ночного оформляет касса.</p>
      </section>
      <section>
        <h2>Как заказать еду и напитки</h2>
        <p className="muted">Откройте «Бар», выберите позиции и нажмите «Заказать». Заказ принесут к вашему месту, оплата при выдаче.</p>
      </section>
      <section>
        <h2>Игра не запускается или нужна другая</h2>
        <p className="muted">Подойдите к администратору: он проверит компьютер или поставит игру.</p>
      </section>
      <section>
        <h2>Ваши аккаунты в безопасности</h2>
        <p className="muted">Когда сессия закончится, Vence закроет игры, выйдет из ваших аккаунтов Steam, Riot и других и сотрёт данные входа с этого компьютера.</p>
      </section>
    </div>
  );
}
