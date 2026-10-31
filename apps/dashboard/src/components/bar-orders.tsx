"use client";

import type { ClubOrder } from "@oyna/contracts";
import { Check, CookingPot, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type HallResult, setOrderStatus } from "@/app/actions";
import { money, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

type Run = <T>(action: () => Promise<HallResult<T>>, onSuccess: (data: T) => string) => void;

function age(createdAt: string, now: number | null): string {
  if (now === null) return "";
  const minutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
  return minutes < 1 ? "только что" : `${minutes} мин назад`;
}

/**
 * Очередь бара: заказы приходят с компьютеров игроков. Новый — жёлтый и пульсирует, пока его не приняли;
 * принятый спокойнее и ждёт, когда его отнесут. Отмена — со второго нажатия.
 */
export function BarOrders({ clubId, orders, now, isPending, run }: {
  clubId: string;
  orders: ClubOrder[];
  now: number | null;
  isPending: boolean;
  run: Run;
}) {
  const fresh = orders.filter((order) => order.status === "new").length;
  return (
    <section aria-label="Заказы бара" className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CookingPot className="size-4 text-muted-foreground" />
          Заказы бара
        </h2>
        {orders.length ? (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", fresh ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
            {fresh ? `${fresh} ${plural(fresh, "новый", "новых", "новых")}` : `${orders.length} в работе`}
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
        "grid gap-2.5 rounded-xl p-3",
        isNew ? "order-call bg-primary text-primary-foreground" : "bg-secondary"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("grid min-w-12 place-items-center rounded-lg px-2 py-1", isNew ? "bg-primary-foreground/12" : "bg-background")}>
          <span className={cn("text-[10px] leading-none", isNew ? "text-primary-foreground/70" : "text-muted-foreground")}>место</span>
          <span className="font-display text-lg font-semibold leading-tight">{order.seatLabel}</span>
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
          {order.comment ? <p className={cn("mt-1 text-xs italic", isNew ? "text-primary-foreground/80" : "text-muted-foreground")}>«{order.comment}»</p> : null}
        </div>
        <div className="text-right">
          <p className="font-display text-sm font-semibold tabular-nums">{money(order.total)}</p>
          <p className={cn("text-xs", isNew ? "text-primary-foreground/70" : "text-muted-foreground")}>{age(order.createdAt, now)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        {isNew ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => move("accepted")}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-foreground text-sm font-semibold text-primary hover:bg-primary-foreground/90 disabled:opacity-50"
          >
            <Check className="size-4" />Принять
          </button>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => move("delivered")}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
              : isNew
                ? "text-primary-foreground/80 hover:bg-primary-foreground/10"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
          )}
        >
          <X className="size-4" />{confirmCancel ? "Точно отменить?" : "Отменить"}
        </button>
      </div>
    </li>
  );
}
