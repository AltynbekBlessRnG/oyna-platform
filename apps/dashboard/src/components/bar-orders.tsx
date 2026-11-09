"use client";

import type { ClubOrder } from "@oyna/contracts";
import { Check, CookingPot, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type HallResult, setOrderStatus } from "@/app/actions";
import { money, plural, since } from "@/lib/format";
import { cn } from "@/lib/utils";

type Run = <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;

/** Через сколько часов непринятый заказ перестаёт звать: скорее всего, про него уже забыли или выдали мимо кассы. */
const STALE_HOURS = 3;

/** Новый заказ, который ещё ждут: свежее STALE_HOURS. Старый «давно» показываем тихо. */
export function orderCalling(order: ClubOrder, now: number | null): boolean {
  return order.status === "new" && (now === null || now - Date.parse(order.createdAt) < STALE_HOURS * 3_600_000);
}

/**
 * Очередь бара: заказы приходят с компьютеров игроков. Новый отмечен золотой кромкой и меткой, пока его
 * не приняли; принятый ждёт, когда его отнесут; непринятый дольше STALE_HOURS — тихий, с меткой «давно».
 * Отмена — со второго нажатия.
 */
export function BarOrders({ clubId, orders, now, isPending, run }: {
  clubId: string;
  orders: ClubOrder[];
  now: number | null;
  isPending: boolean;
  run: Run;
}) {
  const fresh = orders.filter((order) => orderCalling(order, now)).length;
  const stale = orders.filter((order) => order.status === "new").length - fresh;
  return (
    <section aria-label="Заказы бара" className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CookingPot className="size-4 text-muted-foreground" />
          Заказы бара
        </h2>
        {orders.length ? (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", fresh ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
            {fresh ? `${fresh} ${plural(fresh, "новый", "новых", "новых")}` : stale ? `${stale} давно ${plural(stale, "ждёт", "ждут", "ждут")}` : `${orders.length} в работе`}
          </span>
        ) : null}
      </header>
      {orders.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">Заказов нет. Новые появятся здесь, как только игрок закажет с компьютера.</p>
      ) : (
        <ol className="grid gap-2 px-2 pb-2">
          {orders.map((order) => (
            <OrderTicket key={order.id} clubId={clubId} order={order} now={now} isPending={isPending} run={run} />
          ))}
        </ol>
      )}
    </section>
  );
}

function OrderTicket({ clubId, order, now, isPending, run }: { clubId: string; order: ClubOrder; now: number | null; isPending: boolean; run: Run }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isNew = order.status === "new";
  const calling = orderCalling(order, now);
  const stale = isNew && !calling;

  useEffect(() => {
    if (!confirmCancel) return;
    const timer = setTimeout(() => setConfirmCancel(false), 5_000);
    return () => clearTimeout(timer);
  }, [confirmCancel]);

  function move(status: "accepted" | "delivered" | "cancelled"): void {
    const done = { accepted: "принят", delivered: "выдан", cancelled: "отменён" }[status];
    run(() => setOrderStatus(clubId, order.id, status), (updated) => `Заказ на место ${updated.seatLabel} ${done}`);
  }

  function cancel(): void {
    if (!confirmCancel) return setConfirmCancel(true);
    setConfirmCancel(false);
    move("cancelled");
  }

  return (
    <li
      className={cn(
        "anim-row grid gap-2.5 rounded-xl bg-secondary p-3 ring-1 ring-inset ring-transparent transition-[background-color,box-shadow] duration-300",
        calling && "ring-primary/35",
        stale && "bg-secondary/55"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid min-w-12 place-items-center rounded-lg bg-background px-2 py-1">
          <span className="text-[10px] leading-none text-muted-foreground">место</span>
          <span className={cn("font-display text-lg font-semibold leading-tight", stale && "text-foreground/70")}>{order.seatLabel}</span>
        </div>
        <div className="min-w-0 flex-1">
          <ul className="text-sm leading-snug">
            {order.lines.map((line, index) => (
              <li key={`${line.itemId}-${index}`} className="flex gap-1.5">
                <span className="tabular-nums font-semibold">{line.quantity}×</span>
                <span className="truncate">{line.name}</span>
              </li>
            ))}
          </ul>
          {order.comment ? <p className="mt-1 text-xs italic text-muted-foreground">«{order.comment}»</p> : null}
        </div>
        <div className="grid justify-items-end gap-1 text-right">
          <p className="font-display text-sm font-semibold tabular-nums">{money(order.total)}</p>
          {isNew ? (
            <span className={cn("rounded-full px-1.5 py-px text-[11px] font-semibold leading-4", calling ? "order-call bg-primary/15 text-primary" : "bg-background text-muted-foreground")}>
              {calling ? "новый" : "давно"}
            </span>
          ) : null}
          <p className="text-xs text-muted-foreground">{now === null ? "" : since(order.createdAt, now)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {isNew ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => move("accepted")}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold disabled:opacity-50",
              calling ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-background text-foreground hover:bg-background/70"
            )}
          >
            <Check className="size-4" />Принять
          </button>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => move("delivered")}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-background text-sm font-semibold text-foreground hover:bg-background/70 disabled:opacity-50"
          >
            <Check className="size-4" />Выдан
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={cancel}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50",
            confirmCancel
              ? "bg-danger text-[#2b0a10]"
              : "text-muted-foreground hover:bg-background hover:text-foreground"
          )}
        >
          <X className="size-4" />{confirmCancel ? "Точно отменить?" : "Отменить"}
        </button>
      </div>
    </li>
  );
}
