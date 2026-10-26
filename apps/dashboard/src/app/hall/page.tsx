import { AppShell } from "@/components/app-shell";
import { HallBoard } from "@/components/hall-board";
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

  return (
    <AppShell active="hall" club={club} clubs={clubs}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold md:text-3xl">Зал и касса</h1>
      </header>
      {hall ? (
        <HallBoard clubId={club.id} hall={hall} apiUrl={apiUrl.replace(/\/api\/?$/, "")} />
      ) : (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Зал недоступен</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}. Проверьте, что сервер Zen запущен.</CardContent>
        </Card>
      )}
    </AppShell>
  );
}
