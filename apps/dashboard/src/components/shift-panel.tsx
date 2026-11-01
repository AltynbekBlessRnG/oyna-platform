"use client";

import type { ClubShift } from "@oyna/contracts";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { closeShift, openShift } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { clock, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const inputClass = "h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/**
 * Смена кассы одной строкой над сводкой зала: суммы по способам оплаты — в сводке, здесь — что должно
 * лежать в кассе и закрытие. Без открытой смены касса деньги не принимает.
 */
export function ShiftPanel({ clubId, shift, owner = true }: { clubId: string; shift: ClubShift | null; owner?: boolean }) {
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function open(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await openShift(clubId, Number(cash || 0));
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setCash("");
    });
  }

  function close(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await closeShift(clubId, Number(cash), note);
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      const difference = result.data.difference ?? 0;
      setMessage({
        ok: difference >= 0,
        text: difference === 0 ? "Смена закрыта, касса сошлась" : difference < 0 ? `Смена закрыта. Недостача ${money(-difference)}` : `Смена закрыта. Излишек ${money(difference)}`
      });
      setClosing(false);
      setCash("");
      setNote("");
    });
  }

  if (!shift) {
    return (
      <section aria-label="Смена кассы" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-dashed border-border bg-card px-4 py-3">
        <LockKeyhole className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Смена закрыта: касса не принимает деньги</p>
          {message ? <p role="status" className={cn("text-sm", message.ok ? "text-success" : "text-danger")}>{message.text}</p> : null}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <input className={cn(inputClass, "sm:w-52")} inputMode="numeric" aria-label="Наличные в кассе сейчас" placeholder="Наличные в кассе, ₸" value={cash} onChange={(event) => setCash(event.target.value.replace(/\D/g, ""))} />
          <Button size="sm" className="h-9" onClick={open} disabled={isPending}>Открыть смену</Button>
        </div>
        {owner ? <Link className="text-xs text-muted-foreground underline" href="/shifts">История смен</Link> : null}
      </section>
    );
  }

  const counted = cash === "" ? null : Number(cash);
  const difference = counted === null ? null : counted - shift.expectedCash;
  return (
    <section aria-label="Смена кассы" className="grid gap-3 rounded-2xl border border-primary/35 bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <LockKeyholeOpen className="size-4 shrink-0 text-primary" />
          <span className="text-sm">
            <span className="font-medium">Смена открыта</span>
            <span className="text-muted-foreground"> с {clock(shift.openedAt)}, {shift.openedBy.name}</span>
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          пополнений {shift.totals.topUpCount}
          {shift.totals.barOrders > 0 ? `, бар ${shift.totals.barOrders} на ${money(shift.totals.barTotal)}` : ""}
          {shift.totals.adjustmentCount > 0 ? `, корректировок ${shift.totals.adjustmentCount} на ${money(shift.totals.adjustments)}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-4">
          <span className="text-right">
            <span className="block text-[11px] leading-tight text-muted-foreground">В кассе должно быть</span>
            <span className="font-display text-lg font-semibold tabular-nums">{money(shift.expectedCash)}</span>
          </span>
          {closing ? null : (
            <Button size="sm" variant="secondary" className="h-9" onClick={() => setClosing(true)}>Закрыть смену</Button>
          )}
          {owner ? <Link className="hidden text-xs text-muted-foreground underline sm:inline" href="/shifts">История</Link> : null}
        </span>
      </div>
      {closing ? (
        <div className="grid gap-3 border-t border-border pt-3 md:grid-cols-[1fr_2fr_auto] md:items-start">
          <div className="grid gap-1">
            <input className={inputClass} inputMode="numeric" autoFocus aria-label="Пересчитанные наличные" placeholder="Пересчитали наличных, ₸" value={cash} onChange={(event) => setCash(event.target.value.replace(/\D/g, ""))} />
            {difference !== null ? (
              <span className={cn("text-sm", difference < 0 ? "text-danger" : difference > 0 ? "text-primary" : "text-success")}>
                {difference === 0 ? "Сходится" : difference < 0 ? `Недостача ${money(-difference)}` : `Излишек ${money(difference)}`}
              </span>
            ) : null}
          </div>
          <input className={inputClass} aria-label="Комментарий к смене" placeholder="Комментарий: почему не сошлось, что случилось" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex gap-2">
            <Button onClick={close} disabled={isPending || counted === null}>Закрыть смену</Button>
            <Button variant="ghost" onClick={() => setClosing(false)}>Отмена</Button>
          </div>
        </div>
      ) : null}
      {message ? <p role="status" className={cn("text-sm", message.ok ? "text-success" : "text-danger")}>{message.text}</p> : null}
    </section>
  );
}
