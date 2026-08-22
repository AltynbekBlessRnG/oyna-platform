import type { BookingSummary } from "@oyna/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL: Record<BookingSummary["status"], string> = { pending: "Ожидает", confirmed: "Подтверждено", cancelled: "Отменено", completed: "Завершено" };
const STATUS_TONE: Record<BookingSummary["status"], "success" | "warning" | "neutral"> = { pending: "warning", confirmed: "success", cancelled: "neutral", completed: "neutral" };

interface BookingsTableProps { bookings: BookingSummary[]; subtitle: string; }

export function BookingsTable({ bookings, subtitle }: BookingsTableProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div><CardTitle>Ближайшие бронирования</CardTitle><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>
        <a href="#" className="text-sm font-medium text-primary">Все бронирования</a>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[660px] text-left text-sm">
          <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="pb-3 font-medium">Игрок</th><th className="pb-3 font-medium">Зона</th><th className="pb-3 font-medium">Начало</th><th className="pb-3 font-medium">Сумма</th><th className="pb-3 font-medium">Статус</th></tr>
          </thead>
          <tbody>
            {bookings.length === 0 ? <tr><td className="py-6 text-sm text-muted-foreground" colSpan={5}>Бронирований пока нет.</td></tr> : null}
            {bookings.map((booking) => (
              <tr key={booking.id} className="border-b border-border/70 last:border-0">
                <td className="py-4"><div className="font-medium">{booking.playerName}</div><div className="font-mono text-xs text-muted-foreground">{booking.id}</div></td>
                <td className="py-4">{booking.zone} · {booking.seats} мест.</td>
                <td className="py-4 font-mono">{booking.startsAt} · {booking.durationHours} ч</td>
                <td className="py-4 font-mono">{booking.amount.toLocaleString("ru-KZ")} ₸</td>
                <td className="py-4"><Badge tone={STATUS_TONE[booking.status]}>{STATUS_LABEL[booking.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

