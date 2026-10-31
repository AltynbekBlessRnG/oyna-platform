import type { ClubPackage, MenuItem, TournamentSummary } from "@oyna/contracts";
import { useState } from "react";
import { packageAvailableAt, packageMinutesAt } from "./club";
import { clubClock, clubDay, duration, money } from "./format";
import { Icon } from "./ui";

/**
 * Прайс клуба, как табличка над кассой: название, что даёт пакет, цена. То, что сейчас не продаётся
 * (ночной пакет днём), стоит серым с часами продажи. Рядом зачёркнута цена тех же часов по тарифу.
 */
export function PackageBoard({
  packages,
  zone,
  now,
  title,
  note
}: {
  packages: ClubPackage[];
  zone: { name: string; pricePerHour: number } | null;
  now: number;
  title: string;
  note: string;
}) {
  if (packages.length === 0) return null;
  const rows = [...packages].sort((a, b) => Number(packageAvailableAt(b, now)) - Number(packageAvailableAt(a, now)));
  return (
    <section className="board" aria-label="Пакеты клуба">
      <header className="block-head">
        <h2>{title}</h2>
        <span className="muted small">{note}</span>
      </header>
      <ul className="board-rows">
        {zone && (
          <li className="board-row base">
            <span className="board-name">Час</span>
            <span className="board-detail">по тарифу зоны {zone.name}</span>
            <span className="board-leader" aria-hidden="true" />
            <span className="board-price">{money(zone.pricePerHour)}</span>
          </li>
        )}
        {rows.map((pack) => {
          const open = packageAvailableAt(pack, now);
          const minutes = packageMinutesAt(pack, now);
          const full = zone ? Math.round((zone.pricePerHour * minutes) / 60) : 0;
          const length = pack.kind === "until" ? `до ${pack.endsAt}` : duration(minutes);
          return (
            <li key={pack.id} className={open ? "board-row" : "board-row off"}>
              <span className="board-name">{pack.name}</span>
              <span className="board-detail">{open ? length : `${length}, в продаже с ${pack.availableFrom} до ${pack.availableTo}`}</span>
              <span className="board-leader" aria-hidden="true" />
              {open && full > pack.price && <s className="board-was">{money(full)}</s>}
              <span className="board-price">{money(pack.price)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Турнир клуба: картинка, когда, что разыгрывают и сколько мест уже занято. */
export function TournamentCard({ tournament, gameName }: { tournament: TournamentSummary; gameName?: string }) {
  const live = tournament.status === "in_progress";
  const registering = tournament.status === "published";
  return (
    <article className="tourney" style={tournament.imageUrl ? { backgroundImage: `url(${tournament.imageUrl})` } : undefined}>
      <div className="tourney-shade">
        <div className="tourney-top">
          <span className="tourney-badge">
            <Icon name="trophy" size={16} />
            {live ? "Идёт сейчас" : "Турнир клуба"}
          </span>
          <span className="tourney-seats">
            {tournament.registeredCount} из {tournament.capacity}
          </span>
        </div>
        <div className="tourney-body">
          <h3>{tournament.name}</h3>
          <p className="tourney-when">
            {gameName ? `${gameName}, ` : ""}
            {clubDay(tournament.startsAt)} в {clubClock(tournament.startsAt)}
          </p>
          <dl className="tourney-facts">
            {tournament.prizeText && (
              <div>
                <dt>Призы</dt>
                <dd>{tournament.prizeText}</dd>
              </div>
            )}
            {tournament.entryFeeText && (
              <div>
                <dt>Взнос</dt>
                <dd>{tournament.entryFeeText}</dd>
              </div>
            )}
          </dl>
          {registering && <p className="tourney-cta">Запись в приложении Zen до {clubDay(tournament.registrationEndsAt)}</p>}
        </div>
      </div>
    </article>
  );
}

/** Фото позиции бара; нет фото или не загрузилось — плашка с первой буквой. */
export function DishPhoto({ item }: { item: MenuItem }) {
  const [broken, setBroken] = useState(false);
  if (!item.imageUrl || broken) {
    return (
      <div className={`dish-photo fallback ${item.category}`} aria-hidden="true">
        {item.name.slice(0, 1)}
      </div>
    );
  }
  return <img className="dish-photo" src={item.imageUrl} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />;
}

/** Несколько позиций бара с ценами: на экране блокировки и на главной. */
export function BarPreview({ menu, onOpen, note }: { menu: MenuItem[]; onOpen?: () => void; note: string }) {
  const items = menu.filter((item) => item.available).slice(0, 4);
  if (items.length === 0) return null;
  return (
    <section className="bar-preview" aria-label="Бар клуба">
      <header className="block-head">
        <h2>В баре</h2>
        <span className="muted small">{note}</span>
        {onOpen && (
          <button className="link-btn" onClick={onOpen}>
            Открыть меню
          </button>
        )}
      </header>
      <ul className="bar-preview-items">
        {items.map((item) => (
          <li key={item.id}>
            <DishPhoto item={item} />
            <span className="bar-preview-name">{item.name}</span>
            <span className="bar-preview-price">{money(item.price)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
