import type { ClubAdminView, ClubPackage } from "@oyna/contracts";
import { AppShell } from "@/components/app-shell";
import { ClubSettingsForm } from "@/components/club-settings-form";
import { PackagesEditor } from "@/components/packages-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminFetch, loadActiveClub, requireSession } from "@/lib/api";

export default async function SettingsPage() {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  let view: ClubAdminView | undefined;
  let packages: ClubPackage[] = [];
  let error = "";
  try {
    [view, packages] = await Promise.all([adminFetch<ClubAdminView>(`/admin/clubs/${club.id}`), adminFetch<ClubPackage[]>(`/admin/clubs/${club.id}/packages`)]);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Не удалось загрузить клуб";
  }

  return (
    <AppShell active="settings" club={club} clubs={clubs}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold md:text-3xl">Настройки клуба</h1>
      </header>
      {view ? (
        <div className="grid gap-6">
          <ClubSettingsForm clubId={club.id} club={view.club} zones={view.zones} />
          <PackagesEditor clubId={club.id} zones={view.zones} packages={packages} />
        </div>
      ) : (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Клуб недоступен</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}. Проверьте, что сервер Vence запущен и у вас есть доступ к этому клубу.</CardContent>
        </Card>
      )}
    </AppShell>
  );
}
