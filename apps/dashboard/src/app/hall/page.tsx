import Link from "next/link";
import { HallBoard } from "@/components/hall-board";
import { Sidebar } from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl, type HallSnapshot, loadActiveClub, loadHall, requireSession } from "@/lib/api";

export default async function HallPage() {
  await requireSession();
  const { club } = await loadActiveClub();
  let hall: HallSnapshot | undefined;
  let error = "";
  try {
    hall = await loadHall(club.id);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Не удалось загрузить зал";
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar active="hall" />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <header className="mb-8">
          <p className="text-sm text-muted-foreground">{club.name} · {club.city}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Зал и касса</h1>
        </header>
        {hall ? (
          <HallBoard clubId={club.id} hall={hall} apiUrl={apiUrl.replace(/\/api\/?$/, "")} />
        ) : (
          <Card className="max-w-xl">
            <CardHeader><CardTitle>Зал недоступен</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <p>{error}</p>
              <p>Запустите API (<span className="font-mono">pnpm dev:api</span>) либо <Link className="text-primary" href="/login">войдите под администратором клуба</Link>.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
