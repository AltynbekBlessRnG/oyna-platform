"use client";

import type { ClubStation, ClubZone, PlaySession, SeatMapSeat, SeatMapZone } from "@oyna/contracts";
import type { CSSProperties } from "react";
import { clock, duration, minutesUntil, money, playerLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const ENDING_SOON_MIN = 15;

/**
 * ПК «пропал», только если идёт игра и его клиент уже выходил на связь. Компьютер, который подключили
 * к месту минуту назад и ещё не запустили, тревогой не считается.
 */
export function pcLost(session: PlaySession | undefined, station: ClubStation | undefined): boolean {
  return Boolean(session && station && !station.online && station.lastSeenAt);
}

export function endingSoon(session: PlaySession, now: number | null): boolean {
  return now !== null && minutesUntil(session.endsAt, now) <= ENDING_SOON_MIN;
}

/** Остаток коротко: «47 мин» или «2 ч 05» — чтобы читалось через весь зал. */
export function shortLeft(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")}`;
}

/** Доля оставшегося времени сессии: полоса под местом тает от посадки до конца. */
function remainingShare(session: PlaySession, now: number): number {
  const total = Date.parse(session.endsAt) - Date.parse(session.startedAt);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (Date.parse(session.endsAt) - now) / total));
}

type SeatState = "free" | "busy" | "soon" | "lost" | "reserved" | "booked";

function seatState(seat: SeatMapSeat, session: PlaySession | undefined, station: ClubStation | undefined, now: number | null): SeatState {
  if (session) return pcLost(session, station) ? "lost" : endingSoon(session, now) ? "soon" : "busy";
  if (seat.status === "occupied") return "booked";
  return seat.status === "reserved" ? "reserved" : "free";
}

/**
 * Клетка места на полу зала, считая от левого верхнего угла блока зоны. Сейчас её нет: места идут по
 * порядку зоны. Когда появится редактор планировки, координаты придут из сохранённой схемы, и плитка
 * встанет в свою клетку той же сетки, без переделки самих плиток.
 */
export interface SeatPosition {
  x: number;
  y: number;
}

interface HallMapProps {
  zones: SeatMapZone[];
  sessionBySeat: Map<string, PlaySession>;
  stationBySeat: Map<string, ClubStation>;
  now: number | null;
  selectedId: string | null;
  onSelect: (seatId: string) => void;
  /** Сохранённая планировка: id места → клетка. Без неё — поток по порядку зоны. */
  positions?: Map<string, SeatPosition>;
}

/**
 * Карта зала — главное на странице: тёмный «пол» в тонкую сетку и маленькие мониторы мест.
 * Занятое место залито золотом, на исходе — оранжевым, свободное — тёмное; под монитором — сколько осталось.
 */
export function HallMap({ zones, sessionBySeat, stationBySeat, now, selectedId, onSelect, positions }: HallMapProps) {
  return (
    <section aria-label="Карта зала" className="hall-floor h-full rounded-2xl border border-[#262d36]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-t-2xl border-b border-[#262d36] bg-[#12161b]/80 px-4 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Карта зала</h2>
        <Legend />
      </div>
      <div className="grid gap-5 p-4 md:p-5">
        {zones.map(({ zone, seats }) => (
          <ZoneBlock
            key={zone.id}
            zone={zone}
            seats={seats}
            sessionBySeat={sessionBySeat}
            stationBySeat={stationBySeat}
            now={now}
            selectedId={selectedId}
            onSelect={onSelect}
            positions={positions}
          />
        ))}
      </div>
    </section>
  );
}

function ZoneBlock({ zone, seats, sessionBySeat, stationBySeat, now, selectedId, onSelect, positions }: Omit<HallMapProps, "zones"> & { zone: ClubZone; seats: SeatMapSeat[] }) {
  const busy = seats.filter((seat) => sessionBySeat.has(seat.id) || seat.status === "occupied").length;
  const placed = Boolean(positions && seats.length && seats.every((seat) => positions.has(seat.id)));
  return (
    <section aria-label={zone.name}>
      <div className="mb-2 flex items-baseline gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/90">{zone.name}</h3>
        <span className="text-[11px] text-muted-foreground">{zone.pricePerHour > 0 ? `${money(zone.pricePerHour)} в час` : "бесплатно"}</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          <strong className="font-semibold text-foreground">{busy}</strong>/{seats.length}
        </span>
      </div>
      <ul className="seat-grid">
        {seats.map((seat) => {
          const position = placed ? positions?.get(seat.id) : undefined;
          const style: CSSProperties | undefined = position ? { gridColumnStart: position.x + 1, gridRowStart: position.y + 1 } : undefined;
          return (
            <li key={seat.id} style={style}>
              <SeatTile
                seat={seat}
                session={sessionBySeat.get(seat.id)}
                station={stationBySeat.get(seat.id)}
                now={now}
                selected={selectedId === seat.id}
                onSelect={() => onSelect(seat.id)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SCREEN: Record<SeatState, string> = {
  free: "bg-[#222a33] text-[#c9d2dc] ring-1 ring-inset ring-white/[0.06] group-hover:ring-primary/70",
  busy: "bg-primary text-primary-foreground",
  soon: "bg-warning text-[#2e1500]",
  lost: "bg-[#3a1a22] text-danger ring-1 ring-inset ring-danger/70",
  reserved: "seat-hatch bg-[#1c2430] text-reserved ring-1 ring-inset ring-reserved/60",
  booked: "bg-primary/55 text-primary-foreground"
};

const BAR: Record<SeatState, string> = {
  free: "bg-success",
  busy: "bg-primary",
  soon: "bg-warning",
  lost: "bg-danger",
  reserved: "bg-reserved",
  booked: "bg-primary/60"
};

function SeatTile({ seat, session, station, now, selected, onSelect }: {
  seat: SeatMapSeat;
  session?: PlaySession;
  station?: ClubStation;
  now: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = seatState(seat, session, station, now);
  const left = session && now !== null ? minutesUntil(session.endsAt, now) : null;
  const player = session ? playerLabel(session.playerName, session.playerPhoneTail) : "";
  // Полоса под монитором: у идущей сессии — сколько времени осталось, у свободного места — что Zen на связи.
  const bar = session ? (now !== null ? remainingShare(session, now) : 1) : state === "reserved" ? 1 : station?.online ? 1 : 0;
  const caption = state === "lost" ? "офлайн" : left !== null ? shortLeft(left) : session ? `до ${clock(session.endsAt)}` : state === "reserved" && seat.reservedFrom ? `бронь ${clock(seat.reservedFrom)}` : state === "booked" ? "по брони" : "";
  const describe = session
    ? `${player}, ${state === "lost" ? "компьютер не отвечает" : left !== null ? `осталось ${duration(left)}` : `до ${clock(session.endsAt)}`}${session.packageName ? `, пакет «${session.packageName}»` : ""}`
    : state === "reserved" ? `бронь${seat.reservedFrom ? ` с ${clock(seat.reservedFrom)}` : ""}` : state === "booked" ? "занято по брони" : "свободно";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Место ${seat.label}: ${describe}`}
      className="group relative flex w-full flex-col items-stretch text-left outline-none"
    >
      {/* Монитор: номер места крупно по центру. */}
      <span
        className={cn(
          "relative grid aspect-square w-full place-items-center rounded-lg transition-shadow",
          SCREEN[state],
          selected ? "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]" : "group-hover:shadow-[0_0_0_2px_var(--background),0_0_0_3px_color-mix(in_srgb,var(--foreground)_55%,transparent)] group-focus-visible:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--ring)]"
        )}
      >
        <span className="font-display text-[1.15rem] font-semibold leading-none tabular-nums">{seat.label}</span>
        {session?.packageName ? (
          <span className="absolute inset-x-1 top-1 truncate text-center text-[9px] font-bold leading-3 opacity-75" title={`Пакет «${session.packageName}»`}>
            {session.packageName}
          </span>
        ) : null}
        {state === "lost" ? (
          <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-[#2b0a10] ring-2 ring-[#12161b]" aria-hidden>!</span>
        ) : station ? (
          <span
            className={cn("absolute right-1.5 top-1.5 size-1.5 rounded-full", station.online ? "bg-success shadow-[0_0_5px_var(--success)]" : "bg-current opacity-30")}
            aria-hidden
          />
        ) : (
          <span className="absolute bottom-1 right-1.5 text-[9px] font-semibold leading-none opacity-35" title="Клиент Zen не установлен" aria-hidden>?</span>
        )}
      </span>
      {/* Подставка монитора и полоса статуса. */}
      <span className="mx-auto mt-[3px] block h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
        <span className={cn("block h-full rounded-full", BAR[state])} style={{ width: `${bar * 100}%` }} />
      </span>
      <span
        className={cn(
          "mt-1 block h-3.5 truncate text-center text-[11px] font-semibold leading-3.5 tabular-nums",
          state === "lost" ? "text-danger" : state === "soon" ? "text-warning" : state === "reserved" ? "text-reserved" : "text-foreground/80"
        )}
      >
        {caption}
      </span>
      {session ? <span className="block truncate text-center text-[10px] leading-3 text-muted-foreground">{player}</span> : null}

      {/* Подсказка при наведении: кто играет и сколько осталось. */}
      <span
        role="presentation"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[15rem] -translate-x-1/2 rounded-lg border border-border bg-[#0d1014] px-3 py-2 text-xs shadow-xl group-hover:block group-focus-visible:block"
      >
        <span className="block font-semibold text-foreground">Место {seat.label}</span>
        {session ? (
          <>
            <span className="block text-foreground/90">{player}</span>
            <span className="block text-muted-foreground">
              {clock(session.startedAt)}–{clock(session.endsAt)}
              {left !== null ? `, осталось ${duration(left)}` : ""}
            </span>
            {session.packageName ? <span className="block text-primary">Пакет «{session.packageName}»</span> : null}
          </>
        ) : (
          <span className="block text-muted-foreground">{describe}</span>
        )}
        <span className={cn("block", station?.online ? "text-success" : state === "lost" ? "text-danger" : "text-muted-foreground")}>
          {station ? (station.online ? "Zen на связи" : state === "lost" ? "Компьютер не отвечает" : "Zen не на связи") : "Zen не установлен"}
        </span>
      </span>
    </button>
  );
}

function Legend() {
  const item = "flex items-center gap-1.5";
  const swatch = "size-3 rounded-[3px]";
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground" aria-label="Обозначения">
      <li className={item}><span className={cn(swatch, "bg-[#222a33] ring-1 ring-white/10")} />свободно</li>
      <li className={item}><span className={cn(swatch, "bg-primary")} />играют</li>
      <li className={item}><span className={cn(swatch, "bg-warning")} />≤ {ENDING_SOON_MIN} мин</li>
      <li className={item}><span className={cn(swatch, "seat-hatch bg-[#1c2430] text-reserved ring-1 ring-reserved/60")} />бронь</li>
      <li className={item}><span className="grid size-3 place-items-center rounded-full bg-danger text-[8px] font-bold text-[#2b0a10]">!</span>ПК пропал</li>
      <li className={item}><span className="size-1.5 rounded-full bg-success" />Zen на связи</li>
      <li className={item}><span className="text-[10px] font-semibold opacity-60">?</span>без Zen</li>
    </ul>
  );
}
