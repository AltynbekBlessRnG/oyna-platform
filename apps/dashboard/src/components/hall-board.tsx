"use client";

import type { ClubStation, ClubZone, PlaySession, SeatMapSeat, StationCredentials } from "@oyna/contracts";
import { KeyRound, Play, Plug, Square, Unplug, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { endPlaySession, type HallResult, registerStation, removeStation, rotateStationKey, startPlaySession, topUpBalance } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HallSnapshot } from "@/lib/api";
import { clock, duration, minutesUntil, money, playerLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface HallBoardProps {
  clubId: string;
  hall: HallSnapshot;
  apiUrl: string;
}

interface SelectedSeat {
  seat: SeatMapSeat;
  zone: ClubZone;
}

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const REFRESH_MS = 15_000;
const ENDING_SOON_MIN = 15;

/**
 * ПК «пропал», только если идёт игра и его клиент уже выходил на связь. Компьютер, который подключили
 * к месту минуту назад и ещё не запустили, тревогой не считается.
 */
function pcLost(session: PlaySession | undefined, station: ClubStation | undefined): boolean {
  return Boolean(session && station && !station.online && station.lastSeenAt);
}

/**
 * Касса: карта зала с живыми сессиями, посадка игрока, пополнение и подключение компьютеров.
 * Язык мест тот же, что в приложении игрока: золотой контур — свободно, заливка — занято, пунктир — бронь.
 */
export function HallBoard({ clubId, hall, apiUrl }: HallBoardProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [credentials, setCredentials] = useState<StationCredentials | null>(null);
  // Номер из пополнения подставляется в посадку: обычно кассир сначала берёт деньги, потом сажает.
  const [lastPhone, setLastPhone] = useState("");
  const [isPending, startTransition] = useTransition();

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

  useEffect(() => {
    if (!selectedId) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelectedId(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedId]);

  const stationBySeat = new Map<string, ClubStation>(hall.stations.map((station) => [station.seatId, station]));
  const sessionBySeat = new Map<string, PlaySession>(hall.sessions.map((session) => [session.seatId, session]));
  const selected = hall.seatMap.zones.flatMap(({ zone, seats }) => seats.map((seat) => ({ seat, zone }))).find((entry) => entry.seat.id === selectedId);
  const lostCount = hall.sessions.filter((session) => pcLost(session, stationBySeat.get(session.seatId))).length;
  const online = hall.stations.filter((station) => station.online).length;

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
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Карта зала</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge tone={hall.sessions.length ? "warning" : "neutral"}>играют: {hall.sessions.length}</Badge>
            <Badge tone={lostCount ? "danger" : "neutral"}>
              {lostCount ? `не отвечают во время игры: ${lostCount}` : `ПК на связи: ${online} из ${hall.stations.length}`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          {hall.seatMap.zones.map(({ zone, seats }) => (
            <section key={zone.id} aria-label={zone.name}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-sm font-semibold">{zone.name}</h2>
                <span className="text-xs text-muted-foreground">{money(zone.pricePerHour)} в час</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
                {seats.map((seat) => (
                  <SeatTile
                    key={seat.id}
                    seat={seat}
                    session={sessionBySeat.get(seat.id)}
                    station={stationBySeat.get(seat.id)}
                    now={now}
                    selected={selectedId === seat.id}
                    onSelect={() => select(seat.id)}
                  />
                ))}
              </div>
            </section>
          ))}
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="Обозначения">
            <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] border border-primary" />свободно</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-secondary ring-1 ring-foreground/20" />занято</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] border border-dashed border-muted-foreground" />бронь</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded-[3px] bg-danger/25 ring-1 ring-danger" />ПК не отвечает во время игры</li>
            <li className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" />клиент Zen на связи</li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {message && !selected ? <Notice message={message} /> : null}
        <ActiveSessions sessions={hall.sessions} stationBySeat={stationBySeat} now={now} onSelect={select} showZone={hall.seatMap.zones.length > 1} />
        <TopUpCard clubId={clubId} run={run} isPending={isPending} onToppedUp={setLastPhone} />
      </div>

      {selected ? (
        <SeatPanel
          key={selected.seat.id}
          clubId={clubId}
          entry={selected}
          session={sessionBySeat.get(selected.seat.id)}
          station={stationBySeat.get(selected.seat.id)}
          now={now}
          apiUrl={apiUrl}
          message={message}
          credentials={credentials}
          initialPhone={lastPhone}
          isPending={isPending}
          run={run}
          onCredentials={setCredentials}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function SeatTile({ seat, session, station, now, selected, onSelect }: {
  seat: SeatMapSeat;
  session?: PlaySession;
  station?: ClubStation;
  now: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const lost = pcLost(session, station);
  const soon = Boolean(session && now && minutesUntil(session.endsAt, now) <= ENDING_SOON_MIN);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative min-h-[4.75rem] rounded-xl p-2.5 text-left transition-colors",
        lost
          ? "bg-danger/20 ring-1 ring-danger"
          : session || seat.status === "occupied"
            ? "bg-secondary ring-1 ring-foreground/15 hover:ring-foreground/40"
            : seat.status === "reserved"
              ? "border border-dashed border-muted-foreground/70 hover:border-foreground"
              : "border border-primary/70 hover:border-primary hover:bg-primary/5",
        selected && "outline-2 outline-offset-2 outline-primary"
      )}
    >
      <span className="flex items-center justify-between">
        <strong className={cn("font-display text-base", !session && seat.status === "free" ? "text-primary" : "text-foreground")}>{seat.label}</strong>
        {station ? (
          <span className={cn("size-2 rounded-full", station.online ? "bg-success" : lost ? "bg-danger" : "bg-muted-foreground/50")} title={station.online ? "ПК на связи" : "ПК не на связи"} />
        ) : null}
      </span>
      {session ? (
        <>
          <span className="mt-1 block truncate text-xs font-medium">{playerLabel(session.playerName, session.playerPhoneTail)}</span>
          <span className={cn("block text-xs", lost ? "text-danger" : soon ? "text-primary" : "text-muted-foreground")}>
            {lost ? "ПК не отвечает" : now ? `ещё ${duration(minutesUntil(session.endsAt, now))}` : `до ${clock(session.endsAt)}`}
          </span>
        </>
      ) : (
        <span className="mt-1 block text-xs text-muted-foreground">
          {seat.status === "reserved" && seat.reservedFrom ? `бронь с ${clock(seat.reservedFrom)}` : seat.status === "occupied" ? "занято по брони" : "свободно"}
        </span>
      )}
    </button>
  );
}

/** Пока место не выбрано, правая колонка показывает, кто играет и кто скоро освободится. */
function ActiveSessions({ sessions, stationBySeat, now, onSelect, showZone }: {
  sessions: PlaySession[];
  showZone: boolean;
  stationBySeat: Map<string, ClubStation>;
  now: number | null;
  onSelect: (seatId: string) => void;
}) {
  const sorted = [...sessions].sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  return (
    <Card>
      <CardHeader><CardTitle>Сейчас играют</CardTitle></CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">В зале никого. Нажмите на свободное место, чтобы посадить игрока.</p>
        ) : (
          <ul className="-mx-2">
            {sorted.map((session) => {
              const lost = pcLost(session, stationBySeat.get(session.seatId));
              return (
                <li key={session.id}>
                  <button type="button" onClick={() => onSelect(session.seatId)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary">
                    <span className="w-9 font-display text-sm font-semibold">{session.seatLabel}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{playerLabel(session.playerName, session.playerPhoneTail)}</span>
                      {showZone ? <span className="block truncate text-xs text-muted-foreground">{session.zoneName}</span> : null}
                    </span>
                    <span className={cn("text-xs", lost ? "text-danger" : "text-muted-foreground")}>
                      {lost ? "ПК не отвечает" : now ? `ещё ${duration(minutesUntil(session.endsAt, now))}` : `до ${clock(session.endsAt)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Действия с местом. На широком экране — панель поверх правой колонки, на телефоне и планшете —
 * шторка снизу: раньше форма оказывалась ниже карты, и после нажатия на место ничего не происходило.
 */
function SeatPanel(props: {
  clubId: string;
  entry: SelectedSeat;
  session?: PlaySession;
  station?: ClubStation;
  now: number | null;
  apiUrl: string;
  message: { ok: boolean; text: string } | null;
  credentials: StationCredentials | null;
  initialPhone: string;
  isPending: boolean;
  run: <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;
  onCredentials: (credentials: StationCredentials | null) => void;
  onClose: () => void;
}) {
  const { clubId, entry, session, station, now, apiUrl, message, credentials, initialPhone, isPending, run, onCredentials, onClose } = props;
  const [phone, setPhone] = useState(initialPhone);
  const [minutes, setMinutes] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const { seat, zone } = entry;

  function start(): void {
    run(() => startPlaySession(clubId, seat.id, phone, minutes ? Number(minutes) : undefined), (started) => {
      setPhone("");
      setMinutes("");
      return `${playerLabel(started.playerName, started.playerPhoneTail)} сидит за местом ${started.seatLabel} до ${clock(started.endsAt)}`;
    });
  }

  function end(current: PlaySession): void {
    if (!confirmEnd) return setConfirmEnd(true);
    setConfirmEnd(false);
    run(() => endPlaySession(clubId, current.id), (ended) => `Сессия завершена, списано ${money(ended.charged ?? 0)}`);
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
    <div className="fixed inset-0 z-40 flex items-end bg-black/50 xl:pointer-events-none xl:items-start xl:justify-end xl:bg-transparent" onClick={onClose}>
      <section
        role="dialog"
        aria-label={`Место ${seat.label}`}
        onClick={(event) => event.stopPropagation()}
        className="pointer-events-auto max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl xl:mr-8 xl:mt-28 xl:w-[380px] xl:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Место {seat.label}</h2>
            <p className="text-sm text-muted-foreground">{zone.name}, {money(zone.pricePerHour)} в час</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-5 text-sm">
          {message ? <Notice message={message} /> : null}

          {session ? (
            <div className={cn("grid gap-3 rounded-xl p-4", pcLost(session, station) ? "bg-danger/10" : "bg-secondary")}>
              <div>
                <p className="font-semibold">{playerLabel(session.playerName, session.playerPhoneTail)}</p>
                <p className="text-muted-foreground">
                  с {clock(session.startedAt)} до {clock(session.endsAt)}
                  {now ? `, осталось ${duration(minutesUntil(session.endsAt, now))}` : ""}
                </p>
                {pcLost(session, station) ? (
                  <p className="mt-2 text-danger">Компьютер не отвечает. Время идёт: проверьте ПК или завершите сессию, чтобы не списывать лишнее.</p>
                ) : null}
              </div>
              <Button variant="secondary" disabled={isPending} onClick={() => end(session)}>
                <Square className="size-4" />{confirmEnd ? "Нажмите ещё раз, чтобы завершить" : "Завершить сессию"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {seat.status === "reserved" && seat.reservedFrom ? (
                <p className="rounded-xl bg-secondary px-3 py-2">Бронь с {clock(seat.reservedFrom)}. Посадить сейчас можно только того, кто бронировал.</p>
              ) : null}
              <label className="grid gap-1.5">
                <span className="text-muted-foreground">Телефон игрока</span>
                <input className={inputClass} inputMode="tel" autoComplete="off" placeholder="+7 7XX XXX XX XX" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-muted-foreground">Сколько минут (пусто — пока хватает баланса)</span>
                <input className={inputClass} inputMode="numeric" placeholder="например, 120" value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ""))} />
              </label>
              <Button disabled={isPending || phone.replace(/\D/g, "").length < 10} onClick={start}><Play className="size-4" />Посадить за компьютер</Button>
            </div>
          )}

          <div className="grid gap-3 border-t border-border pt-4">
            <p className="font-medium">Клиент Zen на компьютере</p>
            {station ? (
              <>
                <p className="text-muted-foreground">
                  {station.name},{" "}
                  {station.online ? (
                    <span className="text-success">на связи</span>
                  ) : station.lastSeenAt ? (
                    <><span className="text-danger">не отвечает</span>, был в {clock(station.lastSeenAt)}</>
                  ) : (
                    "ещё не подключался"
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => issueKey(() => rotateStationKey(clubId, station.id), "Новый ключ выпущен, старый больше не работает")}>
                    <KeyRound className="size-4" />Новый ключ
                  </Button>
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => unbind(station)}>
                    <Unplug className="size-4" />{confirmUnbind ? "Нажмите ещё раз, чтобы отвязать" : "Отвязать"}
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" variant="secondary" disabled={isPending} onClick={() => issueKey(() => registerStation(clubId, seat.id), "Компьютер подключён к месту")}>
                <Plug className="size-4" />Подключить компьютер
              </Button>
            )}
            {credentials ? (
              <div className="grid gap-2 rounded-xl border border-primary/50 bg-primary/5 p-3 text-xs">
                <strong className="text-primary">Ключ показывается один раз, сохраните его сейчас</strong>
                <span>ID: <code className="break-all">{credentials.station.id}</code></span>
                <span>Ключ: <code className="break-all">{credentials.token}</code></span>
                <span className="text-muted-foreground">Проверка без Windows:</span>
                <code className="break-all rounded-lg bg-background p-2">
                  pnpm --filter @oyna/api station -- --api {apiUrl} --station {credentials.station.id} --token {credentials.token}
                </code>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function TopUpCard({ clubId, run, isPending, onToppedUp }: {
  clubId: string;
  onToppedUp: (phone: string) => void;
  run: <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;
  isPending: boolean;
}) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");

  function submit(): void {
    run(() => topUpBalance(clubId, phone, Number(amount)), (result) => {
      setAmount("");
      onToppedUp(phone);
      return `${playerLabel(result.playerName, phone.replace(/\D/g, "").slice(-4))}: +${money(result.amount)}, на балансе ${money(result.balance)}`;
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4" />Пополнить баланс</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <input className={inputClass} inputMode="tel" autoComplete="off" aria-label="Телефон игрока" placeholder="Телефон игрока" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <input className={inputClass} inputMode="numeric" aria-label="Сумма в тенге" placeholder="Сумма, ₸" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
        <div className="grid grid-cols-4 gap-2">
          {[500, 1000, 2000, 5000].map((value) => (
            <Button key={value} size="sm" variant="secondary" onClick={() => setAmount(String(value))}>{value.toLocaleString("ru-KZ")}</Button>
          ))}
        </div>
        <Button disabled={isPending || phone.replace(/\D/g, "").length < 10 || !amount} onClick={submit}>Пополнить</Button>
        <p className="text-xs text-muted-foreground">Если игрок уже за компьютером, его время сразу продлится.</p>
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
