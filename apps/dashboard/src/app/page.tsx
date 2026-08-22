import type { BookingReceipt, BookingSummary, DashboardMetric } from "@oyna/contracts";
import { Bell, CalendarPlus, MonitorCheck } from "lucide-react";
import Link from "next/link";
import { ApprovalQueue } from "@/components/approval-queue";
import { BookingsTable } from "@/components/bookings-table";
import { MetricCard } from "@/components/metric-card";
import { Sidebar } from "@/components/sidebar";
import { TournamentSection } from "@/components/tournament-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActiveClub, loadClubBookings, loadClubView } from "@/lib/api";

const MONEY = new Intl.NumberFormat("ru-KZ");

function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isRunningNow(booking: BookingReceipt): boolean {
  const start = new Date(booking.startAt).getTime();
  return start <= Date.now() && start + booking.durationHours * 3_600_000 > Date.now() && ["pending", "confirmed"].includes(booking.status);
}

function buildMetrics(bookings: BookingReceipt[], busySeats: number, totalSeats: number): DashboardMetric[] {
  const today = bookings.filter((booking) => isToday(booking.startAt));
  const paid = today.filter((booking) => ["confirmed", "completed"].includes(booking.status));
  const revenue = paid.reduce((sum, booking) => sum + booking.totalAmount, 0);
  const pending = today.filter((booking) => booking.status === "pending").length;
  const load = totalSeats ? Math.round((busySeats / totalSeats) * 100) : 0;
  return [
    { label: "Выручка сегодня", value: `${MONEY.format(revenue)} ₸`, change: `${paid.length} подтверждено`, trend: revenue > 0 ? "up" : "flat" },
    { label: "Загрузка сейчас", value: `${load}%`, change: `${busySeats} из ${totalSeats} мест`, trend: load > 0 ? "up" : "flat" },
    { label: "Бронирования сегодня", value: String(today.length), change: pending ? `${pending} ожидают` : "все обработаны", trend: pending ? "down" : "flat" },
    {
      label: "Средний чек",
      value: `${MONEY.format(paid.length ? Math.round(revenue / paid.length) : 0)} ₸`,
      change: "за сегодня",
      trend: "flat"
    }
  ];
}

function toSummary(booking: BookingReceipt): BookingSummary {
  return {
    id: booking.id,
    playerName: booking.playerName,
    zone: booking.zoneName,
    seats: booking.seatIds.length,
    startsAt: new Date(booking.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    durationHours: booking.durationHours,
    amount: booking.totalAmount,
    status: booking.status
  };
}

export default async function DashboardPage() {
  const { club } = await loadActiveClub();
  const [{ bookings, offline }, view] = await Promise.all([loadClubBookings(club.id), loadClubView(club.id)]);

  const busySeats = bookings.filter(isRunningNow).reduce((sum, booking) => sum + booking.seatIds.length, 0);
  const totalSeats = view?.club.totalSeats ?? view?.zones.reduce((sum, zone) => sum + zone.seatCount, 0) ?? 0;
  const upcoming = bookings
    .filter((booking) => new Date(booking.startAt).getTime() > Date.now() - 3_600_000 && booking.status !== "cancelled")
    .sort((first, second) => first.startAt.localeCompare(second.startAt))
    .slice(0, 8);

  return (
    <div className="flex min-h-screen">
      <Sidebar active="overview" />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{view?.club.name ?? club.name} · {view?.club.city ?? club.city}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Кабинет клуба</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" aria-label="Уведомления"><Bell className="size-4" /></Button>
            <Button variant="secondary" asChild><Link href="/settings"><MonitorCheck className="size-4" />Настройки клуба</Link></Button>
          </div>
        </header>
        {offline ? (
          <p role="status" className="mb-6 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
            API недоступен — показаны демонстрационные данные. Запустите <span className="font-mono">pnpm dev:api</span>, чтобы увидеть реальные брони.
          </p>
        ) : null}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Основные показатели">
          {buildMetrics(bookings, busySeats, totalSeats).map((metric) => <MetricCard key={metric.label} metric={metric} />)}
        </section>
        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <ApprovalQueue clubId={club.id} initialBookings={bookings} />
          <TournamentSection />
        </section>
        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
          <BookingsTable bookings={upcoming.map(toSummary)} subtitle={new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} />
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Загрузка клуба</CardTitle></CardHeader>
              <CardContent>
                <div className="mb-3 flex items-end justify-between">
                  <span className="font-mono text-3xl font-bold">{busySeats}<span className="text-base text-muted-foreground"> / {totalSeats}</span></span>
                  <span className="text-sm text-primary">{totalSeats ? Math.round((busySeats / totalSeats) * 100) : 0}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${totalSeats ? Math.round((busySeats / totalSeats) * 100) : 0}%` }} />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-secondary p-3"><strong className="block font-mono text-base">{Math.max(0, totalSeats - busySeats)}</strong><span className="text-muted-foreground">Свободно</span></div>
                  <div className="rounded-xl bg-secondary p-3"><strong className="block font-mono text-base">{bookings.filter((booking) => booking.status === "pending").length}</strong><span className="text-muted-foreground">Заявки</span></div>
                  <div className="rounded-xl bg-secondary p-3"><strong className="block font-mono text-base">{view?.zones.length ?? 0}</strong><span className="text-muted-foreground">Зоны</span></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Быстрые действия</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                <Button className="justify-start" asChild><Link href="/settings"><CalendarPlus className="size-4" />Зоны, цены и места</Link></Button>
                <Button variant="secondary" className="justify-start" asChild><Link href="/login">Сменить администратора</Link></Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
