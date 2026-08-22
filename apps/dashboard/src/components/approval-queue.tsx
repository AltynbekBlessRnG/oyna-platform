"use client";

import type { BookingReceipt, BookingStatus } from "@oyna/contracts";
import { Check, Clock3, Monitor, X } from "lucide-react";
import { useState, useTransition } from "react";
import { updateBookingStatus } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ApprovalQueueProps {
  clubId: string;
  initialBookings: BookingReceipt[];
}

const STATUS_LABELS: Record<BookingStatus, string> = { pending: "Ожидает", confirmed: "Подтверждено", cancelled: "Отменено", completed: "Завершено" };

export function ApprovalQueue({ clubId, initialBookings }: ApprovalQueueProps) {
  const [bookings, setBookings] = useState(initialBookings);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function changeStatus(id: string, status: "confirmed" | "cancelled"): void {
    setPendingId(id);
    setError("");
    startTransition(async () => {
      try {
        const updated = await updateBookingStatus(clubId, id, status);
        setBookings((current) => current.map((booking) => booking.id === id ? updated : booking));
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : "API недоступен. Запусти сервер OYNA и повтори действие.");
      } finally {
        setPendingId(null);
      }
    });
  }

  const pendingBookings = bookings.filter((booking) => booking.status === "pending");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div><CardTitle>Новые заявки</CardTitle><p className="mt-1 text-sm text-muted-foreground">Подтверди места до визита игрока</p></div>
        <Badge tone={pendingBookings.length ? "warning" : "success"}>{pendingBookings.length ? `${pendingBookings.length} ожидают` : "Всё обработано"}</Badge>
      </CardHeader>
      <CardContent>
        {error ? <p role="alert" className="mb-4 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-300">{error}</p> : null}
        {pendingBookings.length === 0 ? <div className="rounded-xl bg-secondary p-6 text-center text-sm text-muted-foreground">Новых заявок пока нет.</div> : <div className="grid gap-3">
          {pendingBookings.map((booking) => {
            const start = new Date(booking.startAt);
            const busy = isPending && pendingId === booking.id;
            return <article key={booking.id} className="grid gap-4 rounded-xl border border-border bg-background/40 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div><div className="flex items-center gap-2"><strong>{booking.playerName}</strong><span className="font-mono text-xs text-muted-foreground">{booking.id}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{start.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, {start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {booking.durationHours} ч</span><span className="flex items-center gap-1.5"><Monitor className="size-3.5" />{booking.zoneName} · {booking.seatLabels.join(", ")}</span></div></div>
              <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => changeStatus(booking.id, "confirmed")}><Check className="size-4" />Подтвердить</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => changeStatus(booking.id, "cancelled")}><X className="size-4" />Отклонить</Button></div>
            </article>;
          })}
        </div>}
      </CardContent>
    </Card>
  );
}
