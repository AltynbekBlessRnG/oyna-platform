import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OccupancyBar, OccupancyHeatmap, RevenueColumns } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActiveClub, loadAnalytics, requireSession } from "@/lib/api";
import { clientName, day, duration, money, number, percent, phone } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" }
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  const requested = Number((await searchParams).days);
  const days = PERIODS.some((period) => period.days === requested) ? requested : 30;
  const { analytics, error } = await loadAnalytics(club.id, days);

  return (
    <AppShell active="analytics" club={club} clubs={clubs}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Аналитика</h1>
          {analytics ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {day(analytics.from)} — {day(new Date(Date.parse(analytics.to) - 1).toISOString())}, сравнение с предыдущими {days} днями
            </p>
          ) : null}
        </div>
        <nav className="flex rounded-xl bg-secondary p-1" aria-label="Период">
          {PERIODS.map((period) => (
            <Link
              key={period.days}
              href={`/analytics?days=${period.days}`}
              aria-current={period.days === days ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", period.days === days ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {period.label}
            </Link>
          ))}
        </nav>
      </header>

      {!analytics ? (
        <Card className="max-w-xl">
          <CardContent className="p-5 text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Итоги периода">
            <Stat label="Выручка" value={money(analytics.totals.revenue)} current={analytics.totals.revenue} previous={analytics.previous.revenue}
              note={`время ${money(analytics.totals.timeRevenue)}, бар ${money(analytics.totals.barRevenue)}`} />
            <Stat label="Загрузка зала" value={percent(analytics.totals.occupancy)} current={analytics.totals.occupancy} previous={analytics.previous.occupancy}
              note={`${duration(analytics.totals.minutesPlayed)} за компьютерами`} />
            <Stat label="Игроков" value={number(analytics.totals.uniquePlayers)} current={analytics.totals.uniquePlayers} previous={analytics.previous.uniquePlayers}
              note={`новых ${analytics.totals.newPlayers}, вернулись ${analytics.totals.returningPlayers}`} />
            <Stat label="Средняя сессия" value={duration(analytics.totals.avgSessionMinutes)} current={analytics.totals.avgSessionMinutes} previous={analytics.previous.avgSessionMinutes}
              note={`${number(analytics.totals.sessions)} сессий, внесли на балансы ${money(analytics.totals.toppedUp)}`} />
          </section>

          <Card>
            <CardHeader><CardTitle>Выручка по дням</CardTitle></CardHeader>
            <CardContent><RevenueColumns daily={analytics.daily} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Когда зал загружен</CardTitle>
              <p className="text-sm text-muted-foreground">Доля занятых мест по дням недели и часам, по времени клуба. Пустые часы — повод для акции.</p>
            </CardHeader>
            <CardContent><OccupancyHeatmap cells={analytics.heatmap} /></CardContent>
          </Card>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Зоны</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr><th className="pb-2 font-medium">Зона</th><th className="pb-2 font-medium">Загрузка</th><th className="pb-2 text-right font-medium">Выручка</th></tr>
                  </thead>
                  <tbody>
                    {analytics.zones.map((zone) => (
                      <tr key={zone.zoneId} className="border-t border-border">
                        <td className="py-3 pr-4">
                          <p className="font-medium">{zone.zoneName}</p>
                          <p className="text-xs text-muted-foreground">{zone.seats} мест, {duration(zone.minutesPlayed)}</p>
                        </td>
                        <td className="w-1/2 py-3 pr-4"><OccupancyBar value={zone.occupancy} /></td>
                        <td className="py-3 text-right tabular-nums">{money(zone.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Лучшие клиенты периода</CardTitle></CardHeader>
              <CardContent>
                {analytics.topClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">За этот период никто не играл.</p>
                ) : (
                  <ol className="divide-y divide-border">
                    {analytics.topClients.map((client) => (
                      <li key={client.userId}>
                        <Link href={`/clients/${client.userId}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{clientName(client.name, client.phone)}</span>
                            <span className="block text-xs text-muted-foreground">{phone(client.phone)}, {client.visitDays} дн., {duration(client.minutesPlayed)}</span>
                          </span>
                          <span className="text-sm tabular-nums">{money(client.spent)}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </AppShell>
  );
}

/** Итог периода и его изменение к прошлому такому же периоду. */
function Stat({ label, value, current, previous, note }: { label: string; value: string; current: number; previous: number; note: string }) {
  const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
        <p className={cn("mt-1 text-xs", change === null ? "text-muted-foreground" : change >= 0 ? "text-success" : "text-danger")}>
          {change === null ? "в прошлом периоде данных нет" : `${change >= 0 ? "+" : "−"}${Math.abs(change)}% к прошлому периоду`}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

