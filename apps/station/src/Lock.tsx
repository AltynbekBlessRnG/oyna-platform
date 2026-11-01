import type { StationLoginCode, StationState } from "@oyna/contracts";
import { useEffect, useMemo, useState } from "react";
import { BarPreview, PackageBoard, TournamentCard } from "./blocks";
import { type ClubInfo, packagesForZone, upcomingTournaments } from "./club";
import { type Link, serverNow } from "./connection";
import { clock, longDay, minutesSeconds, money, plural } from "./format";
import type { InstalledGame } from "./platform";
import { GameCover, Logo } from "./ui";

// Код просим заново за 10 секунд до истечения, чтобы игрок не успел ввести уже мёртвый.
const REFRESH_AHEAD_MS = 10_000;

/** Компьютер свободен: часы, цены клуба и витрина игр, а войти можно только по коду. */
export function Lock({
  state,
  games,
  club,
  link,
  now,
  requestCode
}: {
  state: StationState;
  games: InstalledGame[];
  club: ClubInfo;
  link: Link;
  now: number;
  requestCode: () => Promise<StationLoginCode>;
}) {
  const code = useLoginCode(link === "online", requestCode);
  const packages = packagesForZone(club.packages, state.station.zoneId);
  const tournaments = upcomingTournaments(club.tournaments, now, 2);
  const gameNames = new Map(games.map((game) => [game.id, game.name]));

  return (
    <div className="lock">
      <main className="lock-main">
        <header className="lock-hero">
          <div className="lock-brand">
            <Logo />
            <span className="lock-club">{state.clubName}</span>
          </div>
          <div className="lock-clock" aria-label={`Сейчас ${clock(now)}`}>
            {clock(now)}
          </div>
          <div className="lock-meta">
            <span className="lock-date">{longDay(now)}</span>
            {state.zone && (
              <span className="lock-zone">
                Зона {state.zone.name}, <strong>{money(state.zone.pricePerHour)}</strong> в час
              </span>
            )}
          </div>
        </header>

        {games.length > 0 && <Showcase games={games} />}

        <div className="lock-info">
          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} gameName={gameNames.get(tournament.gameId)} />
          ))}
          {club.menu && <BarPreview menu={club.menu} note="Закажите с этого компьютера после входа" />}
        </div>
      </main>

      <aside className="side lock-side">
        <div className="seat-ticket">
          <span className="muted small">Место</span>
          <span className="seat">{state.station.seatLabel}</span>
          <span className="free">
            <span className="free-dot" aria-hidden="true" />
            свободно
          </span>
        </div>

        <section className="code-card" aria-label="Вход по коду">
          <span className="code-title">Код для входа</span>
          {code ? (
            <>
              <div className="digits" aria-label={code.code}>
                {code.code.split("").map((digit, index) => (
                  <span key={index} className={index === 3 ? "digit gap" : "digit"}>
                    {digit}
                  </span>
                ))}
              </div>
              <span className="code-perforation" aria-hidden="true" />
              <ol className="steps">
                <li>Откройте приложение Vence</li>
                <li>Нажмите «Я в клубе»</li>
                <li>Введите этот код</li>
              </ol>
              <span className="muted small">Код сменится через {minutesSeconds(Date.parse(code.expiresAt) - REFRESH_AHEAD_MS - now)}</span>
            </>
          ) : (
            <span className="muted">{link === "online" ? "Получаем код…" : "Нет связи с сервером клуба. Код появится, как только связь вернётся."}</span>
          )}
        </section>

        <section className="hint">
          <span className="hint-title">Нет приложения?</span>
          <span className="muted small">Подойдите к кассе: администратор пополнит баланс и откроет этот компьютер по номеру телефона.</span>
        </section>

        <span className="grow" />
        <PackageBoard packages={packages} zone={state.zone} now={now} title="Пакеты" note="Купить на кассе" />
      </aside>
    </div>
  );
}

// Сколько обложек в ленте минимум: с тремя играми на компьютере лента всё равно не рвётся.
const SHOWCASE_MIN = 10;

/** Витрина игр: ленты обложек медленно плывут, соседние — навстречу друг другу. */
function Showcase({ games }: { games: InstalledGame[] }) {
  const rows = useMemo(() => {
    const filled: InstalledGame[] = [];
    while (filled.length < SHOWCASE_MIN) filled.push(...games);
    // Каждая лента начинается со своего места, чтобы одна и та же игра не стояла в лентах друг под другом.
    return [0, 1, 2].map((row) => {
      const start = Math.floor((filled.length * row) / 3);
      return [...filled.slice(start), ...filled.slice(0, start)];
    });
  }, [games]);

  return (
    <section className="showcase" aria-label={`На этом компьютере ${games.length} ${plural(games.length, ["игра", "игры", "игр"])}`}>
      <header className="showcase-head">
        <h2>
          {games.length} {plural(games.length, ["игра", "игры", "игр"])} на этом компьютере
        </h2>
        <span className="muted">Войдите, чтобы играть</span>
      </header>
      <div className="showcase-rows" aria-hidden="true">
        {rows.map((row, index) => (
          <div className={index % 2 ? "showcase-row reverse" : "showcase-row"} key={index}>
            {/* Лента нарисована дважды: сдвиг на половину ширины возвращает её в начало без скачка. */}
            <div className="showcase-track">
              {[...row, ...row].map((game, position) => (
                <div className="showcase-item" key={position}>
                  <GameCover game={game} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function useLoginCode(enabled: boolean, requestCode: () => Promise<StationLoginCode>): StationLoginCode | null {
  const [code, setCode] = useState<StationLoginCode | null>(null);
  useEffect(() => {
    if (!enabled) {
      setCode(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await requestCode();
        if (cancelled) return;
        setCode(next);
        timer = setTimeout(load, Math.max(5_000, Date.parse(next.expiresAt) - REFRESH_AHEAD_MS - serverNow()));
      } catch {
        if (!cancelled) timer = setTimeout(load, 5_000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, requestCode]);
  return code;
}
