import type { BookingSummary, DashboardMetric } from "@oyna/contracts";
import { Bell, CalendarPlus, ChevronDown, MonitorCheck } from "lucide-react";
import { BookingsTable } from "@/components/bookings-table";
import { MetricCard } from "@/components/metric-card";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApprovalSection } from "@/components/approval-section";
import { TournamentSection } from "@/components/tournament-section";

const metrics: DashboardMetric[] = [
  { label: "Выручка сегодня", value: "186 400 ₸", change: "+12.4%", trend: "up" },
  { label: "Загрузка сейчас", value: "78%", change: "+8 мест", trend: "up" },
  { label: "Бронирования", value: "34", change: "+6 сегодня", trend: "up" },
  { label: "Средний чек", value: "3 240 ₸", change: "−2.1%", trend: "down" }
];

const bookings: BookingSummary[] = [
  { id: "OY-2841", playerName: "Арман С.", zone: "VIP", seats: 5, startsAt: "19:00", durationHours: 3, amount: 18000, status: "confirmed" },
  { id: "OY-2845", playerName: "Данияр К.", zone: "Standard", seats: 2, startsAt: "19:30", durationHours: 4, amount: 7200, status: "pending" },
  { id: "OY-2848", playerName: "Айша М.", zone: "Bootcamp", seats: 5, startsAt: "21:00", durationHours: 5, amount: 32500, status: "confirmed" }
];

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div><p className="text-sm text-muted-foreground">Vertex Arena · Алматы</p><h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Добрый день, Тимур</h1></div>
          <div className="flex items-center gap-2"><Button variant="secondary" size="icon" aria-label="Уведомления"><Bell className="size-4" /></Button><Button variant="secondary">Клуб открыт <span className="size-2 rounded-full bg-emerald-400" /><ChevronDown className="size-4" /></Button></div>
        </header>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Основные показатели">
          {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
        </section>
        <section className="mt-6 grid gap-6 xl:grid-cols-2"><ApprovalSection /><TournamentSection /></section>
        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
          <BookingsTable bookings={bookings} />
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Загрузка клуба</CardTitle></CardHeader>
              <CardContent>
                <div className="mb-3 flex items-end justify-between"><span className="font-mono text-3xl font-bold">47<span className="text-base text-muted-foreground"> / 60</span></span><span className="text-sm text-primary">78%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[78%] rounded-full bg-primary" /></div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-secondary p-3"><strong className="block font-mono text-base">8</strong><span className="text-muted-foreground">Свободно</span></div><div className="rounded-xl bg-secondary p-3"><strong className="block font-mono text-base">5</strong><span className="text-muted-foreground">Бронь</span></div><div className="rounded-xl bg-secondary p-3"><strong className="block font-mono text-base">0</strong><span className="text-muted-foreground">Сервис</span></div></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Быстрые действия</CardTitle></CardHeader>
              <CardContent className="grid gap-2"><Button className="justify-start"><CalendarPlus className="size-4" />Добавить бронь</Button><Button variant="secondary" className="justify-start"><MonitorCheck className="size-4" />Схема мест</Button></CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
