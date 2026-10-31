import { AppShell } from "@/components/app-shell";
import { HallBoard } from "@/components/hall-board";
import { HallPower } from "@/components/hall-power";
import { LiveClock } from "@/components/live-clock";
import { ShiftPanel } from "@/components/shift-panel";
import { StationEnrollment } from "@/components/station-enrollment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl, type HallSnapshot, loadActiveClub, loadHall, requireSession } from "@/lib/api";

export default async function HallPage() {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  let hall: HallSnapshot | undefined;
  let error = "";
  try {
    hall = await loadHall(club.id);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Не удалось загрузить зал";
  }

  // Занято — где идёт сессия или место занято по брони, как на плитках карты.
  const occupancy = hall
    ? (() => {
        const playing = new Set(hall.sessions.map((session) => session.seatId));
        const seats = hall.seatMap.zones.flatMap((zone) => zone.seats);
        return { busy: seats.filter((seat) => playing.has(seat.id) || seat.status === "occupied").length, total: seats.length };
      })()
    : null;

  return (
    <AppShell active="hall" club={club} clubs={clubs}>
      <header className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="order-1 grid gap-0.5">
          <h1 className="text-xl font-semibold md:text-2xl">Зал и касса</h1>
          <LiveClock />
        </div>
        <div className="order-3 flex w-full flex-wrap items-center gap-2 md:order-2 md:ml-auto md:w-auto md:gap-3">
          <HallPower clubId={club.id} />
          <StationEnrollment clubId={club.id} />
        </div>
        {occupancy ? (
          <div className="order-2 ml-auto grid justify-items-end md:order-3 md:ml-0 md:border-l md:border-border md:pl-4" role="group" aria-label={`Загрузка: ${occupancy.busy} из ${occupancy.total}`}>
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Загрузка</span>
            <span className="font-display text-3xl font-semibold leading-none tabular-nums">
              {occupancy.busy}<span className="text-muted-foreground">/{occupancy.total}</span>
            </span>
            <span className="mt-0.5 text-xs tabular-nums text-primary">{occupancy.total ? Math.round((occupancy.busy / occupancy.total) * 100) : 0}%</span>
          </div>
        ) : null}
      </header>
      {hall ? (
        <div className="grid gap-4">
          <ShiftPanel clubId={club.id} shift={hall.shift} />
          <HallBoard clubId={club.id} hall={hall} apiUrl={apiUrl.replace(/\/api\/?$/, "")} />
        </div>
      ) : (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Зал недоступен</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}. Проверьте, что сервер Zen запущен.</CardContent>
        </Card>
      )}
    </AppShell>
  );
}
