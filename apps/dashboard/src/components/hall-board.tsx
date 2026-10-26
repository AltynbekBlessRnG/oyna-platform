"use client";

import type { ClubStation, PlaySession, SeatMapSeat, StationCredentials } from "@oyna/contracts";
import { KeyRound, Monitor, Play, Plug, Square, Unplug, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { endPlaySession, type HallResult, registerStation, removeStation, rotateStationKey, startPlaySession, topUpBalance } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HallSnapshot } from "@/lib/api";
import { cn } from "@/lib/utils";

interface HallBoardProps {
  clubId: string;
  hall: HallSnapshot;
  apiUrl: string;
}

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const MONEY = new Intl.NumberFormat("ru-KZ");
const REFRESH_MS = 15_000;

// Цвета заданы заказчиком, как в приложении: занят — зелёный, свободен — серый, забронирован — голубой.
const SEAT_TONES: Record<SeatMapSeat["status"], string> = {
  free: "border-border bg-secondary text-muted-foreground",
  occupied: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
  reserved: "border-sky-400/40 bg-sky-400/15 text-sky-200"
};
const SEAT_LABELS: Record<SeatMapSeat["status"], string> = { free: "Свободно", occupied: "Занято", reserved: "Бронь" };

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function timeLeft(iso: string, now: number): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${minutes} мин`;
}

/** Касса: карта зала с живыми сессиями, посадка игрока, пополнение и подключение компьютеров. */
export function HallBoard({ clubId, hall, apiUrl }: HallBoardProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [credentials, setCredentials] = useState<StationCredentials | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [seatPhone, setSeatPhone] = useState("");
  const [seatMinutes, setSeatMinutes] = useState("");
  const [topUpPhone, setTopUpPhone] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
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

  const stationBySeat = new Map<string, ClubStation>(hall.stations.map((station) => [station.seatId, station]));
  const sessionBySeat = new Map<string, PlaySession>(hall.sessions.map((session) => [session.seatId, session]));
  const allSeats = hall.seatMap.zones.flatMap((entry) => entry.seats.map((seat) => ({ seat, zone: entry.zone })));
  const selected = allSeats.find((entry) => entry.seat.id === selectedId);
  const selectedStation = selected ? stationBySeat.get(selected.seat.id) : undefined;
  const selectedSession = selected ? sessionBySeat.get(selected.seat.id) : undefined;
  const online = hall.stations.filter((station) => station.online).length;

  function select(seatId: string): void {
    setSelectedId(seatId);
    setCredentials(null);
    setConfirmEnd(false);
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

  function startSession(): void {
    if (!selected) return;
    const minutes = seatMinutes ? Number(seatMinutes) : undefined;
    run(() => startPlaySession(clubId, selected.seat.id, seatPhone, minutes), (session) => {
      setSeatPhone("");
      setSeatMinutes("");
      return `${session.playerName} сидит за местом ${session.seatLabel} до ${clock(session.endsAt)}`;
    });
  }

  function endSession(session: PlaySession): void {
    if (!confirmEnd) return setConfirmEnd(true);
    setConfirmEnd(false);
    run(() => endPlaySession(clubId, session.id), (ended) => `Сессия завершена, списано ${MONEY.format(ended.charged ?? 0)} ₸`);
  }

  function topUp(): void {
    run(() => topUpBalance(clubId, topUpPhone, Number(topUpAmount)), (result) => {
      setTopUpAmount("");
      return `${result.playerName}: +${MONEY.format(result.amount)} ₸, на балансе ${MONEY.format(result.balance)} ₸`;
    });
  }

  function showCredentials(action: () => Promise<HallResult<StationCredentials>>, text: string): void {
    run(action, (data) => {
      setCredentials(data);
      return text;
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Карта зала</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Нажмите на место, чтобы посадить игрока или подключить компьютер</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{hall.sessions.length} играют</Badge>
            <Badge>{online} из {hall.stations.length} ПК на связи</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          {hall.seatMap.zones.map(({ zone, seats }) => (
            <section key={zone.id} aria-label={zone.name}>
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-semibold">{zone.name}</h3>
                <span className="text-xs text-muted-foreground">{MONEY.format(zone.pricePerHour)} ₸/ч · {seats.length} мест</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                {seats.map((seat) => {
                  const station = stationBySeat.get(seat.id);
                  const session = sessionBySeat.get(seat.id);
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      onClick={() => select(seat.id)}
                      className={cn("relative rounded-xl border p-2.5 text-left transition-colors hover:border-primary", SEAT_TONES[seat.status], selectedId === seat.id && "ring-2 ring-primary")}
                    >
                      <span className="flex items-center justify-between">
                        <strong className="font-mono text-base">{seat.label}</strong>
                        {station ? (
                          <span className={cn("size-2 rounded-full", station.online ? "bg-emerald-400" : "bg-rose-400")} title={station.online ? "ПК на связи" : "ПК не на связи"} />
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-[11px]">
                        {session ? session.playerName : seat.status === "reserved" && seat.reservedFrom ? `с ${clock(seat.reservedFrom)}` : SEAT_LABELS[seat.status]}
                      </span>
                      {session && now ? <span className="block text-[11px] opacity-80">{timeLeft(session.endsAt, now)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" />клиент Zen на связи</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-400" />клиент не отвечает</span>
            <span>без точки — компьютер не подключён</span>
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={cn("rounded-xl px-4 py-3 text-sm", message.ok ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300")}>
            {message.text}
          </p>
        ) : null}

        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Monitor className="size-4" />Место {selected.seat.label}</CardTitle>
              <p className="text-sm text-muted-foreground">{selected.zone.name} · {MONEY.format(selected.zone.pricePerHour)} ₸/ч</p>
            </CardHeader>
            <CardContent className="grid gap-5 text-sm">
              {selectedSession ? (
                <div className="grid gap-3 rounded-xl bg-emerald-400/10 p-4">
                  <div>
                    <strong className="block">{selectedSession.playerName}</strong>
                    <span className="text-muted-foreground">с {clock(selectedSession.startedAt)} до {clock(selectedSession.endsAt)}{now ? ` · осталось ${timeLeft(selectedSession.endsAt, now)}` : ""}</span>
                  </div>
                  <Button variant="secondary" disabled={isPending} onClick={() => endSession(selectedSession)}>
                    <Square className="size-4" />{confirmEnd ? "Точно завершить? Нажмите ещё раз" : "Завершить сессию"}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {selected.seat.status === "reserved" && selected.seat.reservedFrom ? (
                    <p className="rounded-xl bg-sky-400/10 px-3 py-2 text-sky-200">Забронировано с {clock(selected.seat.reservedFrom)}: посадить можно только того, кто бронировал.</p>
                  ) : null}
                  <label className="grid gap-1.5">
                    <span className="text-muted-foreground">Телефон игрока</span>
                    <input className={inputClass} inputMode="tel" placeholder="+7 7XX XXX XX XX" value={seatPhone} onChange={(event) => setSeatPhone(event.target.value)} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-muted-foreground">Минут (пусто — пока хватает баланса)</span>
                    <input className={inputClass} inputMode="numeric" placeholder="например, 120" value={seatMinutes} onChange={(event) => setSeatMinutes(event.target.value.replace(/\D/g, ""))} />
                  </label>
                  <Button disabled={isPending || !seatPhone} onClick={startSession}><Play className="size-4" />Посадить за компьютер</Button>
                </div>
              )}

              <div className="grid gap-3 border-t border-border pt-4">
                <span className="font-medium">Клиент Zen на компьютере</span>
                {selectedStation ? (
                  <>
                    <p className="text-muted-foreground">
                      {selectedStation.name} ·{" "}
                      {selectedStation.online ? <span className="text-emerald-300">на связи</span> : <span className="text-rose-300">не отвечает</span>}
                      {selectedStation.lastSeenAt ? ` · был в ${clock(selectedStation.lastSeenAt)}` : " · ещё не подключался"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={isPending} onClick={() => showCredentials(() => rotateStationKey(clubId, selectedStation.id), "Новый ключ выпущен, старый больше не работает")}>
                        <KeyRound className="size-4" />Новый ключ
                      </Button>
                      <Button size="sm" variant="secondary" disabled={isPending} onClick={() => run(() => removeStation(clubId, selectedStation.id), () => "Компьютер отвязан от места")}>
                        <Unplug className="size-4" />Отвязать
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => showCredentials(() => registerStation(clubId, selected.seat.id), "Компьютер подключён к месту")}>
                    <Plug className="size-4" />Подключить компьютер
                  </Button>
                )}
                {credentials ? (
                  <div className="grid gap-2 rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-xs">
                    <strong className="text-amber-300">Ключ показывается один раз — сохраните его сейчас</strong>
                    <span>ID: <code className="break-all font-mono">{credentials.station.id}</code></span>
                    <span>Ключ: <code className="break-all font-mono">{credentials.token}</code></span>
                    <span className="text-muted-foreground">Проверка без Windows:</span>
                    <code className="break-all rounded-lg bg-background p-2 font-mono">
                      pnpm --filter @oyna/api station -- --api {apiUrl} --station {credentials.station.id} --token {credentials.token}
                    </code>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Выберите место на карте зала.</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4" />Пополнить баланс</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <input className={inputClass} inputMode="tel" placeholder="Телефон игрока" value={topUpPhone} onChange={(event) => setTopUpPhone(event.target.value)} />
            <input className={inputClass} inputMode="numeric" placeholder="Сумма, ₸" value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value.replace(/\D/g, ""))} />
            <div className="flex gap-2">
              {[500, 1000, 2000, 5000].map((amount) => (
                <Button key={amount} size="sm" variant="secondary" onClick={() => setTopUpAmount(String(amount))}>{MONEY.format(amount)}</Button>
              ))}
            </div>
            <Button disabled={isPending || !topUpPhone || !topUpAmount} onClick={topUp}>Пополнить</Button>
            <p className="text-xs text-muted-foreground">Если игрок уже за компьютером, его сессия сразу продлится.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
