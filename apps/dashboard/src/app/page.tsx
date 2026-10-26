import type { BookingReceipt, ClubAnalytics } from "@oyna/contracts";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ApprovalQueue } from "@/components/approval-queue";
import { HallPulse } from "@/components/hall-pulse";
import { TournamentSection } from "@/components/tournament-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type HallSnapshot, loadActiveClub, loadAnalytics, loadClubBookings, loadHall, requireSession } from "@/lib/api";
import { clock, day, money, number } from "@/lib/format";

const BOOKING_STATUS: Record<BookingReceipt["status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  pending: { label: "Ждёт ответа", tone: "warning" },
  confirmed: { label: "Подтверждена", tone: "success" },
  cancelled: { label: "Отменена", tone: "neutral" },
  completed: { label: "Завершена", tone: "neutral" }
};

export default async function OverviewPage() {
  await requireSession();
  const { club, clubs, offline } = await loadActiveClub();
  const [{ bookings }, hall, { analytics, error: analyticsError }] = await Promise.all([
    loadClubBookings(club.id),
    loadHall(club.id).catch(() => undefined),
    loadAnalytics(club.id, 7)
  ]);
  const now = Date.now();
  const upcoming = bookings
    .filter((booking) => booking.status !== "cancelled" && new Date(booking.startAt).getTime() + booking.durationHours * 3_600_000 > now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 6);

  return (
    <AppShell active="overview" club={club} clubs={clubs}>
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{new Date(now).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Almaty" })}</p>
        <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Обзор</h1>
      </header>

      {offline ? (
        <p role="status" className="mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          Сервер Zen не отвечает, поэтому показаны демонстрационные данные. Проверьте, что API запущен.
        </p>
      ) : null}

      <HallPulse hall={hall as HallSnapshot | undefined} now={now} />

      <section className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <ApprovalQueue clubId={club.id} initialBookings={bookings} />
        <TodayCard analytics={analytics} error={analyticsError} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Ближайшие брони</CardTitle></CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Броней на ближайшее время нет.</p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((booking) => (
                  <li key={booking.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="w-16 shrink-0">
                      <p className="font-display text-base font-semibold">{clock(booking.startAt)}</p>
                      <p className="text-xs text-muted-foreground">{day(booking.startAt)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{booking.playerName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {booking.zoneName}, {booking.seatLabels.length > 1 ? "места" : "место"} {booking.seatLabels.join(", ")}, {booking.durationHours} ч
                      </p>
                    </div>
                    <Badge tone={BOOKING_STATUS[booking.status].tone}>{BOOKING_STATUS[booking.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <TournamentSection clubId={club.id} />
      </section>
    </AppShell>
  );
}

/** Деньги за сегодня рядом со вчерашними: владельцу важна динамика, а не одинокая цифра. */
function TodayCard({ analytics, error }: { analytics?: ClubAnalytics; error?: string }) {
  if (!analytics) {
    return (
      <Card>
        <CardHeader><CardTitle>Сегодня</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error ?? "Выручка появится, когда подключена база данных."}</CardContent>
      </Card>
    );
  }
  const today = analytics.daily.at(-1);
  const yesterday = analytics.daily.at(-2);
  const revenue = (today?.timeRevenue ?? 0) + (today?.barRevenue ?? 0);
  const yesterdayRevenue = (yesterday?.timeRevenue ?? 0) + (yesterday?.barRevenue ?? 0);
  const sessions = today?.sessions ?? 0;
  return (
    <Card>
      <CardHeader><CardTitle>Сегодня</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <p className="font-display text-3xl font-semibold">{money(revenue)}</p>
          <p className="mt-1 text-sm text-muted-foreground">выручка, вчера было {money(yesterdayRevenue)}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-secondary p-3">
            <dt className="text-muted-foreground">Время за ПК</dt>
            <dd className="mt-1 font-semibold">{money(today?.timeRevenue ?? 0)}</dd>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <dt className="text-muted-foreground">Бар</dt>
            <dd className="mt-1 font-semibold">{money(today?.barRevenue ?? 0)}</dd>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <dt className="text-muted-foreground">Внесли на балансы</dt>
            <dd className="mt-1 font-semibold">{money(today?.toppedUp ?? 0)}</dd>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <dt className="text-muted-foreground">Сессий</dt>
            <dd className="mt-1 font-semibold">{number(sessions)}</dd>
          </div>
        </dl>
        <Link href="/analytics" className="text-sm font-medium text-primary hover:underline">Отчёт за неделю и месяц</Link>
      </CardContent>
    </Card>
  );
}
