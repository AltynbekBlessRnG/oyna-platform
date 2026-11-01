import type { ClubSeatMap, HallLayout } from "@oyna/contracts";
import { AppShell } from "@/components/app-shell";
import { HallLayoutEditor } from "@/components/hall-layout-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActiveClub, loadHallLayout, loadSeatMap, requireSession, requireOwner } from "@/lib/api";

export default async function HallLayoutPage() {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  requireOwner(club);
  let seatMap: ClubSeatMap | undefined;
  let layout: HallLayout | null = null;
  let error = "";
  try {
    [seatMap, layout] = await Promise.all([loadSeatMap(club.id), loadHallLayout(club.id)]);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Не удалось загрузить зал";
  }

  return (
    <AppShell active="hall" club={club} clubs={clubs}>
      {seatMap ? (
        <HallLayoutEditor key={club.id} clubId={club.id} zones={seatMap.zones} layout={layout} />
      ) : (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Схема недоступна</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}. Проверьте, что сервер Vence запущен.</CardContent>
        </Card>
      )}
    </AppShell>
  );
}
