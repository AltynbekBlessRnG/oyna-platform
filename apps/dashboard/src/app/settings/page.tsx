import type { ClubAdminView } from "@oyna/contracts";
import Link from "next/link";
import { ClubSettingsForm } from "@/components/club-settings-form";
import { Sidebar } from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminFetch, loadActiveClub, requireSession } from "@/lib/api";

export default async function SettingsPage() {
  await requireSession();
  const { club } = await loadActiveClub();
  let view: ClubAdminView | undefined;
  let error = "";
  try {
    view = await adminFetch<ClubAdminView>(`/admin/clubs/${club.id}`);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Не удалось загрузить клуб";
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar active="settings" />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <header className="mb-8">
          <p className="text-sm text-muted-foreground">{club.city}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Настройки клуба</h1>
        </header>
        {view ? (
          <ClubSettingsForm clubId={club.id} club={view.club} zones={view.zones} />
        ) : (
          <Card className="max-w-xl">
            <CardHeader><CardTitle>Клуб недоступен</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <p>{error}</p>
              <p>Запустите API (<span className="font-mono">pnpm dev:api</span>) и загрузите каталог (<span className="font-mono">pnpm db:seed</span>), либо <Link className="text-primary" href="/login">войдите под администратором клуба</Link>.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
