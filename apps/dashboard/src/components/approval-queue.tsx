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
        setError(cause instanceof Error && cause.message ? cause.message : "Сервер Zen не ответил. Повторите через минуту.");
      } finally {
        setPendingId(null);
      }
    });
  }

  const pendingBookings = bookings.filter((booking) => booking.status === "pending");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Заявки на бронь</CardTitle>
        <Badge tone={pendingBookings.length ? "warning" : "neutral"}>{pendingBookings.length ? `${pendingBookings.length} ждут ответа` : "Все разобраны"}</Badge>
      </CardHeader>
      <CardContent>
        {error ? <p role="alert" className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}
        {pendingBookings.length === 0 ? <p className="text-sm text-muted-foreground">Новых заявок нет. Когда игрок забронирует место в приложении, заявка появится здесь.</p> : <div className="grid gap-3">
          {pendingBookings.map((booking) => {
            const start = new Date(booking.startAt);
            const busy = isPending && pendingId === booking.id;
            return <article key={booking.id} className="grid gap-4 rounded-xl border border-border bg-background/40 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div><div className="flex items-center gap-2"><strong>{booking.playerName}</strong><span className="text-xs text-muted-foreground">{booking.id}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{start.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, {start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {booking.durationHours} ч</span><span className="flex items-center gap-1.5"><Monitor className="size-3.5" />{booking.zoneName} · {booking.seatLabels.join(", ")}</span></div></div>
              <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => changeStatus(booking.id, "confirmed")}><Check className="size-4" />Подтвердить</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => changeStatus(booking.id, "cancelled")}><X className="size-4" />Отклонить</Button></div>
            </article>;
          })}
        </div>}
      </CardContent>
    </Card>
  );
}
