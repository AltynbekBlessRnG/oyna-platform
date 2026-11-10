"use client";

import type { ClubPackage, ClubStation, ClubZone, PaymentMethod, PlaySession, SeatMapSeat, StationCommandResult, StationCredentials } from "@oyna/contracts";
import { ChevronRight, CircleStop, KeyRound, MessageSquare, Play, Plug, Power, RotateCw, Unplug, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState, useTransition } from "react";
import { endPlaySession, type HallResult, registerStation, removeStation, rotateStationKey, sendStationCommand, startPlaySession, topUpBalance, topUpSeatSession } from "@/app/actions";
import { BarOrders, orderCalling } from "@/components/bar-orders";
import { endingSoon, HallMap, pcLost, shortLeft } from "@/components/hall-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PlayerPhoneInput } from "@/components/player-phone-input";
import { PAYMENT_LABELS, PaymentMethodPicker } from "@/components/payment-method";
import type { HallSnapshot } from "@/lib/api";
import { clock, duration, minutesUntil, money, number, playerLabel, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

interface HallBoardProps {
  clubId: string;
  hall: HallSnapshot;
  /** Владелец: подключает компьютеры и рисует схему. Кассиру эти кнопки не показываем. */
  owner?: boolean;
}

interface SelectedSeat {
  seat: SeatMapSeat;
  zone: ClubZone;
}

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const REFRESH_MS = 15_000;
/** Кассир берёт деньги, а не минуты: одни и те же быстрые суммы при посадке и пополнении. */
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const PAGE_TITLE = "Зал и касса — Vence";
/** Выбранный вариант (пакет, сумма): золотая обводка, а не заливка — заливка только у главной кнопки. */
const CHOSEN = "bg-primary/12 text-primary ring-1 ring-inset ring-primary/60 hover:bg-primary/15";

/** Час клуба по Алматы (UTC+5): пакеты продаются в свои часы, как их проверяет сервер. */
function clubMinuteOfDay(now: number): number {
  return Math.floor((now / 60_000 + 5 * 60) % 1440);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function packageOpen(pack: ClubPackage, now: number): boolean {
  if (!pack.availableFrom || !pack.availableTo) return true;
  const minute = clubMinuteOfDay(now);
  const from = toMinutes(pack.availableFrom);
  const to = toMinutes(pack.availableTo);
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

function packageTerms(pack: ClubPackage): string {
  return pack.kind === "duration" ? duration(pack.durationMinutes ?? 0) : `до ${pack.endsAt}`;
}

/** Сколько спишется, если завершить сейчас: как считает сервер — начатая минута целиком, пакет по своей цене. */
function chargeIfEnded(session: PlaySession, now: number): number {
  if (session.packagePrice !== undefined) return session.packagePrice;
  const end = Math.min(now, Date.parse(session.endsAt));
  const minutes = Math.max(0, Math.ceil((end - Date.parse(session.startedAt)) / 60_000));
  return Math.ceil((minutes * session.pricePerHour) / 60);
}

/** Сколько минут покупает сумма по цене зоны. Бесплатная зона — без ограничения (undefined). */
function minutesFor(amount: number, pricePerHour: number): number | undefined {
  if (!amount || pricePerHour <= 0) return undefined;
  return Math.max(1, Math.floor((amount * 60) / pricePerHour));
}

/**
 * Касса: сводка зала, карта мест с живыми сессиями, очередь бара, посадка игрока и пополнение.
 * Карта мест — в hall-map.tsx; здесь сводка, правая колонка и окно места.
 */
export function HallBoard({ clubId, hall, owner = true }: HallBoardProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [credentials, setCredentials] = useState<StationCredentials | null>(null);
  // Номер из пополнения подставляется в посадку: обычно кассир сначала берёт деньги, потом сажает.
  const [lastPhone, setLastPhone] = useState("");
  const [isPending, startTransition] = useTransition();
  const closeSeat = useCallback(() => setSelectedId(null), []);

  // Касса смотрит на зал весь день: подтягиваем свежие данные и пересчитываем остаток времени.
  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const freshOrders = hall.orders.filter((order) => order.status === "new").length;
  // Вкладка кассы часто в фоне: число новых заказов видно прямо в заголовке.
  // Next ставит заголовок из metadata уже после гидрации и при каждом refresh: следим за <head> и возвращаем свой.
  useEffect(() => {
    const title = freshOrders ? `(${freshOrders}) ${PAGE_TITLE}` : PAGE_TITLE;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [freshOrders]);

  const stationBySeat = new Map<string, ClubStation>(hall.stations.map((station) => [station.seatId, station]));
  const sessionBySeat = new Map<string, PlaySession>(hall.sessions.map((session) => [session.seatId, session]));
  const selected = hall.seatMap.zones.flatMap(({ zone, seats }) => seats.map((seat) => ({ seat, zone }))).find((entry) => entry.seat.id === selectedId);

  function select(seatId: string): void {
    setSelectedId(seatId);
    setCredentials(null);
    setMessage(null);
  }

  function run<T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string): void {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { ok: true, text: onSuccess(result.data) } : { ok: false, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <HallSummary hall={hall} stationBySeat={stationBySeat} now={now} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem] xl:grid-rows-[auto_auto_1fr] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div id="bar-orders" className="grid scroll-mt-4 gap-3 xl:col-start-2 xl:row-start-1">
          {message && !selected ? <Notice message={message} /> : null}
          <BarOrders clubId={clubId} orders={hall.orders} now={now} isPending={isPending} run={run} />
        </div>

        {/* Карта по своей высоте и на виду, пока правую колонку листают: пустого пола под схемой нет. */}
        <div className="xl:sticky xl:top-4 xl:col-start-1 xl:row-span-3 xl:row-start-1 xl:self-start">
          <HallMap zones={hall.seatMap.zones} sessionBySeat={sessionBySeat} stationBySeat={stationBySeat} now={now} selectedId={selectedId} onSelect={select} layout={hall.layout} editable={owner} />
        </div>

        <div id="playing" className="scroll-mt-4 xl:col-start-2">
          <ActiveSessions sessions={hall.sessions} stationBySeat={stationBySeat} now={now} onSelect={select} showZone={hall.seatMap.zones.length > 1} />
        </div>
        <div className="xl:col-start-2">
          <TopUpCard clubId={clubId} run={run} isPending={isPending} onToppedUp={setLastPhone} shiftOpen={Boolean(hall.shift)} />
        </div>
      </div>

      {selected ? (
        <SeatPanel
          key={selected.seat.id}
          clubId={clubId}
          entry={selected}
          session={sessionBySeat.get(selected.seat.id)}
          station={stationBySeat.get(selected.seat.id)}
          now={now}
          message={message}
          credentials={credentials}
          initialPhone={lastPhone}
          shiftOpen={Boolean(hall.shift)}
          owner={owner}
          packages={hall.packages.filter((pack) => pack.zoneIds.length === 0 || pack.zoneIds.includes(selected.zone.id))}
          isPending={isPending}
          run={run}
          onCredentials={setCredentials}
          onClose={closeSeat}
        />
      ) : null}
    </div>
  );
}

/**
 * Сводка над залом: пять чисел, на которые касса смотрит весь день. Ячейка, где нужно действие,
 * отмечена своим цветом: оранжевым — время на исходе, золотой кромкой — новый заказ, розовым — ПК пропал.
 */
function HallSummary({ hall, stationBySeat, now }: {
  hall: HallSnapshot;
  stationBySeat: Map<string, ClubStation>;
  now: number | null;
}) {
  const online = hall.stations.filter((station) => station.online).length;
  const lost = hall.sessions.filter((session) => pcLost(session, stationBySeat.get(session.seatId))).length;
  const players = new Set(hall.sessions.map((session) => session.userId)).size;
  // Гость — без телефона, платил на кассе; у постоянного игрока есть номер и баланс.
  const guests = hall.sessions.filter((session) => isGuest(session)).length;
  const regulars = hall.sessions.length - guests;
  const offline = hall.stations.length - online;
  const onPackage = hall.sessions.filter((session) => session.packageName).length;
  const soon = hall.sessions.filter((session) => endingSoon(session, now)).sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  const waiting = hall.orders.filter((order) => order.status === "new");
  const freshOrders = waiting.filter((order) => orderCalling(order, now)).length;
  const staleOrders = waiting.length - freshOrders;
  const totals = hall.shift?.totals;
  const taken = totals ? totals.cash + totals.kaspi + totals.card : 0;

  return (
    <section aria-label="Сводка зала" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 xl:grid-cols-5">
      <Stat
        label="ПК на связи"
        tone={lost ? "danger" : undefined}
        value={hall.stations.length ? <>{online}<span className={lost ? "opacity-60" : "text-muted-foreground"}>/{hall.stations.length}</span></> : "—"}
        sub={lost ? `${lost} не ${plural(lost, "отвечает", "отвечают", "отвечают")} во время игры` : !hall.stations.length ? "компьютеры не подключены" : offline ? `${offline} не на связи` : "клиент Vence запущен"}
      />
      <Stat
        label={hall.shift?.blind ? "Kaspi и карта за смену" : "Принято за смену"}
        value={totals ? money(taken) : "—"}
        sub={
          totals ? (
            <span className="flex flex-wrap gap-x-2.5">
              {/* У кассира наличные скрыты: их сверяет владелец («слепая» касса). */}
              {hall.shift?.blind ? null : <span>нал {number(totals.cash)}</span>}
              <span>Kaspi {number(totals.kaspi)}</span>
              <span>карта {number(totals.card)}</span>
            </span>
          ) : (
            "смена закрыта"
          )
        }
      />
      <Stat
        label="Играют"
        value={players}
        sub={
          hall.sessions.length
            ? [
                regulars ? `${regulars} ${plural(regulars, "постоянный", "постоянных", "постоянных")}` : "",
                guests ? `${guests} ${plural(guests, "гость", "гостя", "гостей")}` : "",
                onPackage ? `по пакету ${onPackage}` : ""
              ].filter(Boolean).join(", ")
            : "в зале никого"
        }
      />
      <Stat
        label="Заканчивают за 15 мин"
        href="#playing"
        tone={soon.length ? "warning" : undefined}
        value={soon.length}
        sub={soon.length && now !== null ? `первым место ${soon[0].seatLabel}, через ${minutesUntil(soon[0].endsAt, now)} мин` : "никто не торопится"}
      />
      <Stat
        label="Заказы бара"
        href="#bar-orders"
        className="col-span-2 xl:col-span-1"
        tone={freshOrders ? "call" : undefined}
        value={hall.orders.length}
        sub={
          freshOrders ? (
            <span><span className="mr-1.5 rounded-full bg-primary/15 px-1.5 py-px font-semibold text-primary">{freshOrders} {plural(freshOrders, "новый", "новых", "новых")}</span>{plural(freshOrders, "ждёт", "ждут", "ждут")} принятия</span>
          ) : staleOrders ? `${staleOrders} давно ${plural(staleOrders, "ждёт", "ждут", "ждут")} принятия` : hall.orders.length ? "все приняты" : "очередь пуста"
        }
      />
    </section>
  );
}

function Stat({ label, value, aside, sub, note, tone, href, className: extra }: {
  label: string;
  value: ReactNode;
  aside?: string;
  sub?: ReactNode;
  note?: ReactNode;
  tone?: "warning" | "danger" | "call";
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <span className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            "font-display text-[1.65rem] font-semibold leading-none tabular-nums",
            tone === "warning" && "text-warning",
            tone === "danger" && "text-danger",
            tone === "call" && "text-primary"
          )}
        >
          {value}
        </span>
        {aside ? <span className="text-sm font-medium tabular-nums text-muted-foreground">{aside}</span> : null}
      </span>
      {note}
      {sub ? <span className={cn("mt-1.5 block text-xs", tone === "danger" ? "text-danger" : "text-muted-foreground")}>{sub}</span> : null}
    </>
  );
  const className = cn(
    "block min-w-0 px-4 py-3",
    extra,
    tone === "call" ? "bg-card shadow-[inset_3px_0_0_var(--primary)]" : tone === "warning" ? "bg-[color-mix(in_srgb,var(--warning)_7%,var(--card))]" : tone === "danger" ? "bg-[color-mix(in_srgb,var(--danger)_8%,var(--card))]" : "bg-card"
  );
  return href ? (
    <a href={href} className={cn(className, "transition-colors hover:brightness-110")}>{body}</a>
  ) : (
    <div className={className}>{body}</div>
  );
}

function isGuest(session: { playerName: string; playerPhoneTail?: string }): boolean {
  return session.playerName === "Гость" && !session.playerPhoneTail;
}

/** Кто играет: сначала те, у кого время на исходе, — к ним кассир подойдёт первым. */
function ActiveSessions({ sessions, stationBySeat, now, onSelect, showZone }: {
  sessions: PlaySession[];
  showZone: boolean;
  stationBySeat: Map<string, ClubStation>;
  now: number | null;
  onSelect: (seatId: string) => void;
}) {
  const sorted = [...sessions].sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  const soon = sorted.filter((session) => endingSoon(session, now));
  const rest = sorted.filter((session) => !endingSoon(session, now));

  const row = (session: PlaySession) => {
    const lost = pcLost(session, stationBySeat.get(session.seatId));
    const isSoon = endingSoon(session, now);
    const left = now !== null ? minutesUntil(session.endsAt, now) : null;
    return (
      <li key={session.id}>
        <button type="button" onClick={() => onSelect(session.seatId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-secondary">
          <span className={cn("grid h-8 min-w-9 place-items-center rounded-md px-1 font-display text-xs font-semibold", isSoon ? "bg-warning/15 text-warning" : "bg-secondary")}>{session.seatLabel}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{playerLabel(session.playerName, session.playerPhoneTail)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {[showZone ? session.zoneName : "", session.packageName ? `пакет «${session.packageName}»` : "", `до ${clock(session.endsAt)}`].filter(Boolean).join(", ")}
            </span>
          </span>
          <span className={cn("text-right font-display text-sm font-semibold tabular-nums", lost ? "text-danger" : isSoon ? "text-warning" : "text-foreground")}>
            {lost ? "ПК пропал" : left !== null ? shortLeft(left) : clock(session.endsAt)}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section aria-label="Сейчас играют" className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold">Сейчас играют</h2>
        {sorted.length ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{sorted.length}</span> : null}
      </header>
      {sorted.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">В зале никого.</p>
      ) : (
        <div className="grid gap-1 px-2 pb-2 xl:max-h-[24rem] xl:overflow-y-auto">
          {soon.length ? (
            <>
              <p className="px-2 pt-1 text-xs font-medium text-warning">Скоро заканчивают</p>
              <ul>{soon.map(row)}</ul>
            </>
          ) : null}
          {rest.length ? (
            <>
              {soon.length ? <p className="px-2 pt-2 text-xs font-medium text-muted-foreground">Играют дальше</p> : null}
              <ul>{rest.map(row)}</ul>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}


/**
 * Действия с местом — окно по центру экрана на любом устройстве: раньше панель на широком экране
 * висела справа сверху и закрывала «Сейчас играют» и пополнение.
 */
function SeatPanel(props: {
  clubId: string;
  entry: SelectedSeat;
  session?: PlaySession;
  station?: ClubStation;
  now: number | null;
  message: { ok: boolean; text: string } | null;
  credentials: StationCredentials | null;
  initialPhone: string;
  shiftOpen: boolean;
  owner: boolean;
  packages: ClubPackage[];
  isPending: boolean;
  run: <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;
  onCredentials: (credentials: StationCredentials | null) => void;
  onClose: () => void;
}) {
  const { clubId, entry, session, station, now, message, credentials, initialPhone, shiftOpen, owner, packages, isPending, run, onCredentials, onClose } = props;
  const [phone, setPhone] = useState(initialPhone);
  // По умолчанию гость: пришёл, заплатил, сел. Телефон — для постоянных, у кого копится баланс.
  const [mode, setMode] = useState<"guest" | "player">(initialPhone ? "player" : "guest");
  const [payNow, setPayNow] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [packageId, setPackageId] = useState<string | null>(null);
  const chosenPackage = packages.find((pack) => pack.id === packageId);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const { seat, zone } = entry;

  const guest = mode === "guest";
  const taking = guest || payNow;
  const price = chosenPackage ? chosenPackage.price : Number(amount) || 0;
  const phoneReady = phone.replace(/\D/g, "").length >= 10;
  // Почему кнопка не нажимается — пишем словами, а не оставляем её молча серой.
  const blocker = !guest && !phoneReady
    ? "Введите телефон игрока или выберите его из подсказки"
    : taking && !shiftOpen
      ? "Откройте смену вверху страницы, чтобы принимать деньги"
      : taking && price <= 0
        ? chosenPackage ? "" : "Выберите пакет или впишите сумму"
        : "";

  function start(): void {
    const minutes = chosenPackage ? undefined : minutesFor(Number(amount), zone.pricePerHour);
    const payment = taking && price > 0 ? { amount: price, method } : undefined;
    run(() => startPlaySession(clubId, seat.id, guest ? "" : phone, minutes, chosenPackage?.id, payment), (started) => {
      setPhone("");
      setAmount("");
      setPackageId(null);
      const paid = payment ? `, принято ${money(payment.amount)} (${PAYMENT_LABELS[payment.method].toLowerCase()})` : "";
      const pack = started.packageName ? `, пакет «${started.packageName}»` : "";
      return `${playerLabel(started.playerName, started.playerPhoneTail)} сидит за местом ${started.seatLabel} до ${clock(started.endsAt)}${pack}${paid}`;
    });
  }

  function end(current: PlaySession): void {
    if (!confirmEnd) return setConfirmEnd(true);
    setConfirmEnd(false);
    run(() => endPlaySession(clubId, current.id), (ended) => {
      const left = ended.balanceLeft ?? 0;
      // У гостя без телефона остаток сгорает; постоянный игрок доиграет его в следующий раз.
      const guest = isGuest(ended);
      const rest = left > 0 ? (guest ? `, остаток гостя ${money(left)} сгорел` : `, на балансе игрока осталось ${money(left)}`) : "";
      return `Сессия завершена, списано ${money(ended.charged ?? 0)}${rest}`;
    });
  }

  // После отвязки ключ на ПК придётся ставить заново, поэтому, как и завершение сессии, — со второго нажатия.
  function unbind(current: ClubStation): void {
    if (!confirmUnbind) return setConfirmUnbind(true);
    setConfirmUnbind(false);
    onCredentials(null);
    run(() => removeStation(clubId, current.id), () => "Компьютер отвязан от места");
  }

  function issueKey(action: () => Promise<HallResult<StationCredentials>>, text: string): void {
    run(action, (data) => {
      onCredentials(data);
      return text;
    });
  }

  return (
    <Modal title={`Место ${seat.label}`} label={`Место ${seat.label}`} subtitle={`${zone.name}, ${money(zone.pricePerHour)} в час`} onClose={onClose}>
      <div className="grid gap-5 text-sm">
        {message ? <Notice message={message} /> : null}

        {session ? (
          <div className={cn("grid gap-3 rounded-xl p-4", pcLost(session, station) ? "bg-danger/10" : "bg-secondary")}>
            <div>
              <p className="font-semibold">{playerLabel(session.playerName, session.playerPhoneTail)}</p>
              {session.packageName ? <p className="text-primary">Пакет «{session.packageName}», оплачен {money(session.packagePrice ?? 0)}</p> : null}
              <p className="text-muted-foreground">
                с {clock(session.startedAt)} до {clock(session.endsAt)}
                {now ? `, осталось ${duration(minutesUntil(session.endsAt, now))}` : ""}
              </p>
              {pcLost(session, station) ? (
                <p className="mt-2 text-danger">Компьютер не отвечает. Время идёт: проверьте ПК или завершите сессию, чтобы не списывать лишнее.</p>
              ) : null}
            </div>
            <SeatTopUp clubId={clubId} session={session} shiftOpen={shiftOpen} isPending={isPending} run={run} />
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => end(session)}
              className={cn(confirmEnd ? "bg-danger text-[#2b0a10] hover:bg-danger/90" : "bg-transparent text-danger ring-1 ring-inset ring-danger/45 hover:bg-danger/10")}
            >
              <CircleStop className="size-4" />
              {confirmEnd
                ? now === null
                  ? "Нажмите ещё раз, чтобы завершить"
                  : `Нажмите ещё раз — спишется ${session.packagePrice !== undefined ? "" : "~"}${money(chargeIfEnded(session, now))}`
                : "Завершить сессию"}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {seat.status === "reserved" && seat.reservedFrom ? (
              <p className="rounded-xl bg-secondary px-3 py-2">Бронь с {clock(seat.reservedFrom)}. Посадить сейчас можно только того, кто бронировал.</p>
            ) : null}
            <div className="grid gap-1.5">
              <span className="text-muted-foreground">Кто садится</span>
              <div className="grid grid-cols-2 rounded-xl bg-secondary p-1" role="radiogroup" aria-label="Кто садится">
                {([["guest", "Гость, без телефона"], ["player", "Постоянный игрок"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={cn("h-9 rounded-lg text-sm", mode === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {guest ? (
                <p className="text-xs text-muted-foreground">Без баланса и истории.</p>
              ) : (
                <PlayerPhoneInput clubId={clubId} className={inputClass} label="Телефон игрока" value={phone} onChange={setPhone} />
              )}
            </div>
            {packages.length > 0 ? (
              <div className="grid gap-1.5">
                <span className="text-muted-foreground">Пакет</span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" className={cn(!chosenPackage && CHOSEN)} aria-pressed={!chosenPackage} onClick={() => setPackageId(null)}>{guest ? "На сумму" : "По балансу"}</Button>
                  {packages.map((pack) => {
                    const open = now === null || packageOpen(pack, now);
                    return (
                      <Button
                        key={pack.id}
                        size="sm"
                        variant="secondary"
                        className={cn(pack.id === packageId && CHOSEN)}
                        aria-pressed={pack.id === packageId}
                        disabled={!open}
                        title={open ? undefined : `Продаётся с ${pack.availableFrom} до ${pack.availableTo}`}
                        onClick={() => setPackageId(pack.id)}
                      >
                        {pack.name} · {money(pack.price)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {chosenPackage ? (
              <p className="rounded-xl bg-secondary px-3 py-2">
                {packageTerms(chosenPackage)}, стоит {money(chosenPackage.price)}. Пополнение время пакета не продлевает.
              </p>
            ) : zone.pricePerHour > 0 ? (
              <div className="grid gap-1.5">
                <label className="grid gap-1.5">
                  <span className="text-muted-foreground">{taking ? "Сколько платит, ₸" : "На сколько тенге (пусто — пока хватает баланса)"}</span>
                  <input className={inputClass} inputMode="numeric" placeholder="Сумма, ₸" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {QUICK_AMOUNTS.map((value) => (
                    <Button key={value} size="sm" variant="secondary" className={cn(amount === String(value) && CHOSEN)} aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}>{value.toLocaleString("ru-KZ")}</Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {amount && Number(amount) > 0 ? `≈ ${duration(minutesFor(Number(amount), zone.pricePerHour) ?? 0)} по ${money(zone.pricePerHour)} в час` : taking ? "Впишите сумму или выберите пакет" : "Без суммы играет, пока хватает баланса"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Зона бесплатная: время не ограничено.</p>
            )}
            <div className="grid gap-2 rounded-xl border border-border bg-background/40 p-3">
              {guest ? (
                <span className="font-medium">Оплата</span>
              ) : (
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={payNow} onChange={(event) => setPayNow(event.target.checked)} />
                  Принять оплату сейчас
                </label>
              )}
              {taking ? <PaymentMethodPicker value={method} onChange={setMethod} /> : <p className="text-xs text-muted-foreground">Спишется с баланса игрока.</p>}
            </div>
            <Button disabled={isPending || Boolean(blocker)} onClick={start}>
              <Play className="size-4" />
              {taking && price > 0 ? `Принять ${money(price)} и посадить` : "Посадить за компьютер"}
            </Button>
            {blocker ? <p className="text-balance text-center text-xs text-muted-foreground">{blocker}</p> : null}
          </div>
        )}

        <ComputerSection
          clubId={clubId}
          seatId={seat.id}
          station={station}
          session={session}
          owner={owner}
          credentials={credentials}
          confirmUnbind={confirmUnbind}
          isPending={isPending}
          run={run}
          onIssueKey={issueKey}
          onUnbind={unbind}
        />
      </div>
    </Modal>
  );
}

/**
 * Компьютер за местом одной строкой: имя и связь видны сразу, остальное — под раскрытием «Компьютер».
 * Сообщение, перезагрузка и выключение — всем, когда ПК на связи; ключи и привязка — только владельцу.
 */
function ComputerSection({ clubId, seatId, station, session, owner, credentials, confirmUnbind, isPending, run, onIssueKey, onUnbind }: {
  clubId: string;
  seatId: string;
  station?: ClubStation;
  session?: PlaySession;
  owner: boolean;
  credentials: StationCredentials | null;
  confirmUnbind: boolean;
  isPending: boolean;
  run: <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;
  onIssueKey: (action: () => Promise<HallResult<StationCredentials>>, text: string) => void;
  onUnbind: (station: ClubStation) => void;
}) {
  const status = station ? (
    <>
      {station.name},{" "}
      {station.online ? (
        <span className="text-success">на связи</span>
      ) : station.lastSeenAt ? (
        <><span className="text-danger">не отвечает</span>, был в {clock(station.lastSeenAt)}</>
      ) : (
        "ещё не подключался"
      )}
    </>
  ) : (
    "Vence не установлен"
  );
  const hasTools = owner || Boolean(station?.online);

  if (!hasTools) {
    return (
      <div className="grid gap-1 border-t border-border pt-4">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">Компьютер</span>
          <span className="text-muted-foreground">{status}</span>
        </p>
        {station ? null : <p className="text-xs text-muted-foreground">Подключает компьютеры владелец клуба.</p>}
      </div>
    );
  }

  return (
    <details className="group/pc border-t border-border pt-3" open={Boolean(credentials)}>
      <summary className="-mx-2 flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open/pc:rotate-90" aria-hidden />
        <span className="font-medium">Компьютер</span>
        <span className="ml-auto min-w-0 truncate text-right text-muted-foreground">{status}</span>
      </summary>
      <div className="mt-3 grid gap-3">
        {station?.online ? <StationControls clubId={clubId} station={station} session={session} isPending={isPending} run={run} /> : null}
        {owner ? (
          station ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={isPending} onClick={() => onIssueKey(() => rotateStationKey(clubId, station.id), "Новый ключ выпущен, старый больше не работает")}>
                <KeyRound className="size-4" />Новый ключ
              </Button>
              <Button size="sm" variant="secondary" disabled={isPending} onClick={() => onUnbind(station)} className={cn(confirmUnbind && "text-danger")}>
                <Unplug className="size-4" />{confirmUnbind ? "Нажмите ещё раз, чтобы отвязать" : "Отвязать"}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" className="justify-self-start" disabled={isPending} onClick={() => onIssueKey(() => registerStation(clubId, seatId), "Компьютер подключён к месту")}>
              <Plug className="size-4" />Подключить компьютер
            </Button>
          )
        ) : null}
        {owner && credentials ? (
          <div className="grid gap-1.5 rounded-xl border border-primary/50 bg-primary/5 p-3 text-xs">
            <strong className="text-primary">Ключ показывается один раз, сохраните его сейчас</strong>
            <span>ID: <code className="break-all">{credentials.station.id}</code></span>
            <span>Ключ: <code className="break-all">{credentials.token}</code></span>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** Сообщение на экран компьютера, перезагрузка и выключение. Если за ПК играют, просим подтвердить. */
function StationControls({ clubId, station, session, isPending, run }: {
  clubId: string;
  station: ClubStation;
  session?: PlaySession;
  isPending: boolean;
  run: <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;
}) {
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<"restart" | "shutdown" | null>(null);

  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(null), 5_000);
    return () => clearTimeout(timer);
  }, [confirm]);

  const delivered = (result: StationCommandResult, what: string) => (result.delivered ? `ПК ${result.seatLabel}: ${what}` : `ПК ${result.seatLabel} не подтвердил команду — проверьте его`);

  function send(): void {
    run(() => sendStationCommand(clubId, station.id, { type: "message", text }), (result) => {
      setText("");
      return delivered(result, "сообщение показано");
    });
  }

  function power(type: "restart" | "shutdown"): void {
    if (confirm !== type) return setConfirm(type);
    setConfirm(null);
    run(() => sendStationCommand(clubId, station.id, { type }), (result) => delivered(result, type === "restart" ? "перезагружается" : "выключается"));
  }

  const label = (type: "restart" | "shutdown", idle: string) =>
    confirm === type ? (session ? `За ним играют — точно ${idle.toLowerCase()}?` : `Нажмите ещё раз: ${idle.toLowerCase()}`) : idle;

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <input className={inputClass} aria-label="Сообщение на экран компьютера" placeholder="Сообщение на экран: заказ готов…" maxLength={200} value={text} onChange={(event) => setText(event.target.value)} />
        <Button size="sm" variant="secondary" className="h-11" disabled={isPending || !text.trim()} onClick={send}><MessageSquare className="size-4" />Отправить</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => power("restart")} className={cn(confirm === "restart" && "text-danger")}>
          <RotateCw className="size-4" />{label("restart", "Перезагрузить")}
        </Button>
        <Button size="sm" variant="secondary" disabled={isPending} onClick={() => power("shutdown")} className={cn(confirm === "shutdown" && "text-danger")}>
          <Power className="size-4" />{label("shutdown", "Выключить")}
        </Button>
      </div>
    </div>
  );
}

/** «15-й компьютер, плюс 500»: пополнение прямо из окна места, без номера телефона. */
function SeatTopUp({ clubId, session, shiftOpen, isPending, run }: {
  clubId: string;
  session: PlaySession;
  shiftOpen: boolean;
  isPending: boolean;
  run: <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  function submit(): void {
    run(() => topUpSeatSession(clubId, session.id, Number(amount), method), (result) => {
      setAmount("");
      const more = session.packageName ? "деньги остались на балансе, пакет не продлевается" : "время продлено";
      return `Место ${session.seatLabel}: +${money(result.amount)} (${PAYMENT_LABELS[method].toLowerCase()}), на балансе ${money(result.balance)}, ${more}`;
    });
  }

  if (!shiftOpen) return <p className="text-xs text-muted-foreground">Откройте смену, чтобы пополнять.</p>;
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-background/40 p-3">
      <span className="flex items-center gap-2 font-medium"><Wallet className="size-4" />Пополнить этому игроку</span>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_AMOUNTS.map((value) => (
          <Button key={value} size="sm" variant="secondary" className={cn(amount === String(value) && CHOSEN)} aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}>
            {value.toLocaleString("ru-KZ")}
          </Button>
        ))}
      </div>
      <input className={inputClass} inputMode="numeric" aria-label="Сумма пополнения, ₸" placeholder="Другая сумма, ₸" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
      <PaymentMethodPicker value={method} onChange={setMethod} />
      <Button disabled={isPending || !amount} onClick={submit}>Пополнить{amount ? ` на ${money(Number(amount))}` : ""}</Button>
    </div>
  );
}

function TopUpCard({ clubId, run, isPending, onToppedUp, shiftOpen }: {
  clubId: string;
  shiftOpen: boolean;
  onToppedUp: (phone: string) => void;
  run: <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;
  isPending: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  function submit(): void {
    run(() => topUpBalance(clubId, phone, Number(amount), method), (result) => {
      setAmount("");
      onToppedUp(phone);
      return `${playerLabel(result.playerName, phone.replace(/\D/g, "").slice(-4))}: +${money(result.amount)} (${PAYMENT_LABELS[method].toLowerCase()}), на балансе ${money(result.balance)}`;
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4" />Пополнить баланс</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <PlayerPhoneInput clubId={clubId} className={inputClass} label="Телефон игрока" value={phone} onChange={setPhone} />
        <input className={inputClass} inputMode="numeric" aria-label="Сумма в тенге" placeholder="Сумма, ₸" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
        <div className="grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((value) => (
            <Button key={value} size="sm" variant="secondary" className={cn(amount === String(value) && CHOSEN)} aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}>{value.toLocaleString("ru-KZ")}</Button>
          ))}
        </div>
        <PaymentMethodPicker value={method} onChange={setMethod} />
        <Button disabled={isPending || !shiftOpen || phone.replace(/\D/g, "").length < 10 || !amount} onClick={submit}>Пополнить</Button>
        <p className="text-pretty text-xs text-muted-foreground">{shiftOpen ? "Время за компьютером продлится сразу." : "Откройте смену, чтобы принимать деньги."}</p>
      </CardContent>
    </Card>
  );
}

function Notice({ message }: { message: { ok: boolean; text: string } }) {
  return (
    <p role={message.ok ? "status" : "alert"} className={cn("rounded-xl px-4 py-3 text-sm", message.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
      {message.text}
    </p>
  );
}
