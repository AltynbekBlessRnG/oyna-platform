"use client";

import type { ClubStation, ClubZone, HallLayout, HallLayoutItem, HallLayoutItemKind, PlaySession, SeatMapSeat, SeatMapZone } from "@oyna/contracts";
import { PencilRuler } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { KIND_META } from "@/lib/hall-layout";
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

interface HallMapProps {
  zones: SeatMapZone[];
  sessionBySeat: Map<string, PlaySession>;
  stationBySeat: Map<string, ClubStation>;
  now: number | null;
  selectedId: string | null;
  onSelect: (seatId: string) => void;
  /** Сохранённая схема зала: места встают в свои клетки. Без неё — места по зонам. */
  layout?: HallLayout | null;
}

type TileProps = Omit<HallMapProps, "zones" | "layout">;

/**
 * Карта зала — главное на странице: тёмный «пол» в тонкую сетку и маленькие мониторы мест.
 * Занятое место залито золотом, на исходе — оранжевым, свободное — тёмное; под монитором — сколько осталось.
 * Если клуб нарисовал схему, пол повторяет зал: места на своих местах, вокруг — диваны, бар и вход.
 */
export function HallMap({ zones, layout, ...tile }: HallMapProps) {
  const drawn = Boolean(layout && layout.items.some((item) => item.kind === "seat"));
  return (
    <section aria-label="Карта зала" className="hall-floor h-full rounded-2xl border border-[#262d36]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-t-2xl border-b border-[#262d36] bg-[#12161b]/80 px-4 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Карта зала</h2>
        <Legend />
        <Link href="/hall/layout" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground">
          <PencilRuler className="size-3.5" aria-hidden />
          {layout ? "Редактировать схему" : "Схема зала"}
        </Link>
      </div>
      {layout && drawn ? (
        <LayoutFloor layout={layout} zones={zones} {...tile} />
      ) : (
        <div className="grid gap-5 p-4 md:p-5">
          {zones.map(({ zone, seats }) => (
            <ZoneBlock key={zone.id} zone={zone} seats={seats} {...tile} />
          ))}
          <Link
            href="/hall/layout"
            className="flex items-center gap-3 justify-self-start rounded-xl border border-dashed border-[#36404b] px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            <PencilRuler className="size-4 text-primary" aria-hidden />
            <span>
              <span className="block font-semibold text-foreground">Нарисовать схему зала</span>
              <span className="block text-xs">Места встанут на карте так же, как стоят в клубе</span>
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}

const FURNITURE_LOOK: Partial<Record<HallLayoutItemKind, string>> = {
  wall: "rounded-[3px] bg-[#2c343d]",
  label: "text-foreground/45",
  entrance: "rounded-md border border-primary/25 bg-primary/[0.04] text-primary/60"
};

/** Пол по схеме: клетки растягиваются на ширину карты, на узком экране карту прокручивают вбок. */
function LayoutFloor({ layout, zones, ...tile }: TileProps & { layout: HallLayout; zones: SeatMapZone[] }) {
  const seats = new Map<string, { seat: SeatMapSeat; zone: ClubZone }>();
  for (const { zone, seats: list } of zones) for (const seat of list) seats.set(seat.id, { seat, zone });
  const placed = new Set(layout.items.map((item) => item.seatId).filter(Boolean));
  const unplaced = zones.map(({ zone, seats: list }) => ({ zone, seats: list.filter((seat) => !placed.has(seat.id)) })).filter((group) => group.seats.length);
  const furniture = layout.items.filter((item) => item.kind !== "seat");
  const seatItems = layout.items.filter((item) => item.kind === "seat" && item.seatId && seats.has(item.seatId));
  const area = (item: HallLayoutItem): CSSProperties => ({ gridColumn: `${item.x + 1} / span ${item.w}`, gridRow: `${item.y + 1} / span ${item.h}` });

  return (
    <div className="grid gap-4 p-3 md:p-4">
      <div className="overflow-x-auto">
        <ul
          className="layout-floor grid rounded-lg"
          aria-label="Схема зала"
          style={{
            gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
            aspectRatio: `${layout.columns} / ${layout.rows}`,
            // Весь зал — в один экран: ширину ограничивает высота окна за вычетом шапки и сводки.
            maxWidth: `max(36rem, calc((100vh - 26rem) * ${layout.columns / layout.rows}))`,
            marginInline: "auto",
            minWidth: `${layout.columns * 1.4}rem`,
            ["--cols" as string]: layout.columns,
            ["--rows" as string]: layout.rows
          }}
        >
          {furniture.map((item) => {
            const { name, icon: Icon } = KIND_META[item.kind];
            const look = FURNITURE_LOOK[item.kind] ?? "rounded-md border border-white/[0.07] bg-white/[0.025] text-muted-foreground/55";
            return (
              <li key={item.id} style={area(item)} className="p-[2px]" aria-label={item.label || name}>
                <span className={cn("flex size-full items-center justify-center gap-1.5 overflow-hidden px-1", look)} title={item.label || name}>
                  {item.kind === "wall" ? null : item.kind === "label" ? (
                    <span className="truncate font-display text-xs font-semibold">{item.label}</span>
                  ) : (
                    <>
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {item.w >= 3 ? <span className="truncate text-[11px] font-medium">{item.label || name}</span> : null}
                    </>
                  )}
                </span>
              </li>
            );
          })}
          {seatItems.map((item) => {
            const { seat, zone } = seats.get(item.seatId!)!;
            return (
              <li key={item.id} style={area(item)} className="relative z-[1] min-w-0 p-[3px] hover:z-30 focus-within:z-30">
                <SeatTile
                  variant="cell"
                  tipBelow={item.y < 3}
                  zoneName={zone.name}
                  seat={seat}
                  session={tile.sessionBySeat.get(seat.id)}
                  station={tile.stationBySeat.get(seat.id)}
                  now={tile.now}
                  selected={tile.selectedId === seat.id}
                  onSelect={() => tile.onSelect(seat.id)}
                />
              </li>
            );
          })}
        </ul>
      </div>
      {unplaced.length ? (
        <section aria-label="Не на схеме" className="grid gap-2 border-t border-[#262d36] pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Не на схеме</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {unplaced.map(({ zone, seats: list }) => (
              <div key={zone.id} className="grid gap-1.5">
                <span className="text-[11px] text-foreground/80">{zone.name}</span>
                <ul className="flex flex-wrap gap-x-[var(--seat-gap)] gap-y-3">
                  {list.map((seat) => (
                    <li key={seat.id} className="w-[var(--seat)]">
                      <SeatTile
                        zoneName={zone.name}
                        seat={seat}
                        session={tile.sessionBySeat.get(seat.id)}
                        station={tile.stationBySeat.get(seat.id)}
                        now={tile.now}
                        selected={tile.selectedId === seat.id}
                        onSelect={() => tile.onSelect(seat.id)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ZoneBlock({ zone, seats, sessionBySeat, stationBySeat, now, selectedId, onSelect }: TileProps & { zone: ClubZone; seats: SeatMapSeat[] }) {
  const busy = seats.filter((seat) => sessionBySeat.has(seat.id) || seat.status === "occupied").length;
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
        {seats.map((seat) => (
          <li key={seat.id}>
            <SeatTile
              seat={seat}
              session={sessionBySeat.get(seat.id)}
              station={stationBySeat.get(seat.id)}
              now={now}
              selected={selectedId === seat.id}
              onSelect={() => onSelect(seat.id)}
            />
          </li>
        ))}
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

function SeatTile({ seat, session, station, now, selected, onSelect, variant = "flow", tipBelow, zoneName }: {
  /** `flow` — плитка в ряду зоны с подписью под монитором; `cell` — плитка заполняет свои клетки схемы, подпись внутри. */
  variant?: "flow" | "cell";
  /** У верхнего края схемы подсказка открывается вниз, чтобы не обрезалась. */
  tipBelow?: boolean;
  /** На схеме номера мест разных зон повторяются: зону называем в подсказке. */
  zoneName?: string;
  seat: SeatMapSeat;
  session?: PlaySession;
  station?: ClubStation;
  now: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = seatState(seat, session, station, now);
  const cell = variant === "cell";
  const left = session && now !== null ? minutesUntil(session.endsAt, now) : null;
  const player = session ? playerLabel(session.playerName, session.playerPhoneTail) : "";
  // Полоса под монитором: у идущей сессии — сколько времени осталось, у свободного места — что Vence на связи.
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
      aria-label={`Место ${seat.label}${zoneName ? `, ${zoneName}` : ""}: ${describe}`}
      className={cn("group relative flex w-full flex-col items-stretch text-left outline-none", cell && "@container size-full")}
    >
      {/* Монитор: номер места крупно по центру. */}
      <span
        className={cn(
          "relative w-full rounded-lg transition-shadow",
          cell ? "flex size-full flex-col items-center justify-center overflow-hidden rounded-md" : "grid aspect-square place-items-center",
          SCREEN[state],
          selected ? "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]" : "group-hover:shadow-[0_0_0_2px_var(--background),0_0_0_3px_color-mix(in_srgb,var(--foreground)_55%,transparent)] group-focus-visible:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--ring)]"
        )}
      >
        <span className={cn("font-display font-semibold leading-none tabular-nums", cell ? "text-[clamp(0.7rem,30cqw,1.2rem)]" : "text-[1.15rem]")}>{seat.label}</span>
        {cell && caption ? <span className="mt-1 max-w-full truncate px-1 text-[clamp(0.55rem,15cqw,0.7rem)] font-semibold leading-none tabular-nums opacity-80">{caption}</span> : null}
        {cell ? (
          <span className="absolute inset-x-[12%] bottom-[7%] block h-[3px] overflow-hidden rounded-full bg-black/25" aria-hidden>
            <span className={cn("block h-full rounded-full", state === "busy" || state === "booked" ? "bg-primary-foreground/60" : BAR[state])} style={{ width: `${bar * 100}%` }} />
          </span>
        ) : null}
        {session?.packageName && !cell ? (
          <span className="absolute inset-x-1 top-1 truncate text-center text-[9px] font-bold leading-3 opacity-75" title={`Пакет «${session.packageName}»`}>
            {session.packageName}
          </span>
        ) : null}
        {state === "lost" ? (
          <span className={cn("absolute grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-[#2b0a10] ring-2 ring-[#12161b]", cell ? "right-1 top-1" : "-right-1.5 -top-1.5")} aria-hidden>!</span>
        ) : station ? (
          <span
            className={cn("absolute right-1.5 top-1.5 size-1.5 rounded-full", station.online ? "bg-success shadow-[0_0_5px_var(--success)]" : "bg-current opacity-30")}
            aria-hidden
          />
        ) : (
          <span className={cn("absolute text-[9px] font-semibold leading-none opacity-35", cell ? "right-1.5 top-1" : "bottom-1 right-1.5")} title="Клиент Vence не установлен" aria-hidden>?</span>
        )}
      </span>
      {cell ? null : (
        <>
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
        </>
      )}

      {/* Подсказка при наведении: кто играет и сколько осталось. */}
      <span
        role="presentation"
        className={cn(
          "pointer-events-none absolute left-1/2 z-20 hidden w-max max-w-[15rem] -translate-x-1/2 rounded-lg border border-border bg-[#0d1014] px-3 py-2 text-xs shadow-xl group-hover:block group-focus-visible:block",
          tipBelow ? "top-full mt-2" : "bottom-full mb-2"
        )}
      >
        <span className="block font-semibold text-foreground">Место {seat.label}{zoneName ? <span className="font-normal text-muted-foreground">, {zoneName}</span> : null}</span>
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
          {station ? (station.online ? "Vence на связи" : state === "lost" ? "Компьютер не отвечает" : "Vence не на связи") : "Vence не установлен"}
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
      <li className={item}><span className="size-1.5 rounded-full bg-success" />Vence на связи</li>
      <li className={item}><span className="text-[10px] font-semibold opacity-60">?</span>без Vence</li>
    </ul>
  );
}
