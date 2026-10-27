"use client";

import type { ClubShift } from "@oyna/contracts";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { closeShift, openShift } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { clock, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/** Смена кассы над картой зала: без открытой смены касса деньги не принимает. */
export function ShiftPanel({ clubId, shift }: { clubId: string; shift: ClubShift | null }) {
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
      <section aria-label="Смена кассы" className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-4 md:flex md:items-end md:justify-between">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Смена закрыта</p>
            <p className="text-sm text-muted-foreground">Пока смена не открыта, касса не принимает деньги. <Link className="underline" href="/shifts">История смен</Link></p>
            {message ? <p role="status" className={cn("mt-1 text-sm", message.ok ? "text-success" : "text-danger")}>{message.text}</p> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <input className={cn(inputClass, "md:w-56")} inputMode="numeric" aria-label="Наличные в кассе сейчас" placeholder="Наличные в кассе, ₸" value={cash} onChange={(event) => setCash(event.target.value.replace(/\D/g, ""))} />
          <Button onClick={open} disabled={isPending}>Открыть смену</Button>
        </div>
      </section>
    );
  }

  const counted = cash === "" ? null : Number(cash);
  const difference = counted === null ? null : counted - shift.expectedCash;
  return (
    <section aria-label="Смена кассы" className="mb-6 grid gap-4 rounded-2xl border border-primary/50 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <LockKeyholeOpen className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="font-medium">Смена открыта · {shift.openedBy.name} · с {clock(shift.openedAt)}</p>
            <p className="text-sm text-muted-foreground">
              Наличные {money(shift.totals.cash)} · Kaspi {money(shift.totals.kaspi)} · Карта {money(shift.totals.card)} · пополнений {shift.totals.topUpCount}
              {shift.totals.adjustmentCount > 0 ? ` · корректировок ${shift.totals.adjustmentCount} на ${money(shift.totals.adjustments)}` : ""}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">В кассе должно быть</p>
          <p className="font-display text-2xl font-semibold">{money(shift.expectedCash)}</p>
        </div>
      </div>
      {closing ? (
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-start">
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
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setClosing(true)}>Закрыть смену</Button>
          <Link className="text-sm text-muted-foreground underline" href="/shifts">История смен</Link>
        </div>
      )}
      {message ? <p role="status" className={cn("text-sm", message.ok ? "text-success" : "text-danger")}>{message.text}</p> : null}
    </section>
  );
}
