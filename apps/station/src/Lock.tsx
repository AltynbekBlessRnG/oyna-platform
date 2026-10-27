import type { StationLoginCode, StationState } from "@oyna/contracts";
import { useEffect, useState } from "react";
import type { Link } from "./connection";
import { clock, minutesSeconds, money, today } from "./format";
import type { InstalledGame } from "./platform";
import { GameCover, Rail } from "./ui";

// Код просим заново за 10 секунд до истечения, чтобы игрок не успел ввести уже мёртвый.
const REFRESH_AHEAD_MS = 10_000;

/** Компьютер свободен: игры видно, но открыть их можно только после входа по коду. */
export function Lock({ state, games, link, now, requestCode }: { state: StationState; games: InstalledGame[]; link: Link; now: number; requestCode: () => Promise<StationLoginCode> }) {
  const code = useLoginCode(link === "online", requestCode);

  return (
    <div className="screen">
      <Rail />
      <main className="center">
        <header className="lock-head">
          <h1>{state.clubName}</h1>
          <span className="muted">{games.length > 0 ? `на этом компьютере ${gamesCount(games.length)} — войдите, чтобы играть` : "войдите по коду, чтобы начать"}</span>
        </header>
        <div className="grid dimmed" aria-hidden="true">
          {games.map((game) => (
            <div className="tile" key={game.id}>
              <GameCover game={game} />
              <div className="tile-name">{game.name}</div>
            </div>
          ))}
        </div>
      </main>
      <aside className="side">
        <div className="side-head">
          <div>
            <div className="seat">Место {state.station.seatLabel}</div>
            <div className="free">свободно</div>
          </div>
          <div className="time">
            <div className="time-now">{clock(now)}</div>
            <div className="muted small">{today(now)}</div>
          </div>
        </div>
        {state.zone && (
          <div className="muted">
            {state.zone.name} · {money(state.zone.pricePerHour)} в час
          </div>
        )}

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
              <ol className="steps">
                <li>Откройте приложение Zen</li>
                <li>Нажмите «Я в клубе»</li>
                <li>Введите этот код</li>
              </ol>
              <span className="muted small">Код сменится через {minutesSeconds(Date.parse(code.expiresAt) - REFRESH_AHEAD_MS - now)}</span>
            </>
          ) : (
            <span className="muted">{link === "online" ? "Получаем код…" : "Нет связи с сервером клуба. Код появится, как только связь вернётся."}</span>
          )}
        </section>

        <span className="grow" />
        <section className="hint">
          <span className="hint-title">Нет приложения?</span>
          <span className="muted small">Подойдите к кассе: администратор пополнит баланс и откроет этот компьютер по номеру телефона.</span>
        </section>
      </aside>
    </div>
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
        timer = setTimeout(load, Math.max(5_000, Date.parse(next.expiresAt) - REFRESH_AHEAD_MS - Date.now()));
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

function gamesCount(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  const word = tens >= 11 && tens <= 14 ? "игр" : ones === 1 ? "игра" : ones >= 2 && ones <= 4 ? "игры" : "игр";
  return `${count} ${word}`;
}
