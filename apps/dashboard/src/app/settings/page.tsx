import type { ClubAdminView, ClubMember, ClubPackage } from "@oyna/contracts";
import { AppShell } from "@/components/app-shell";
import { ClubSettingsForm } from "@/components/club-settings-form";
import { PackagesEditor } from "@/components/packages-editor";
import { StaffManager } from "@/components/staff-manager";
import { TelegramAlertsCard } from "@/components/telegram-alerts-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminFetch, loadActiveClub, requireSession, requireOwner } from "@/lib/api";

export default async function SettingsPage() {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  requireOwner(club);
  let view: ClubAdminView | undefined;
  let packages: ClubPackage[] = [];
  let members: ClubMember[] = [];
  let telegram: { linked: boolean; url?: string } = { linked: false };
  let error = "";
  try {
    [view, packages, members, telegram] = await Promise.all([
      adminFetch<ClubAdminView>(`/admin/clubs/${club.id}`),
      adminFetch<ClubPackage[]>(`/admin/clubs/${club.id}/packages`),
      // Без базы данных (локальная демонстрация) сотрудников нет — страница всё равно открывается.
      adminFetch<ClubMember[]>(`/admin/clubs/${club.id}/members`).catch(() => []),
      adminFetch<{ linked: boolean; url?: string }>("/admin/me/telegram").catch(() => ({ linked: false }))
    ]);
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
          <StaffManager clubId={club.id} members={members} />
          <TelegramAlertsCard linked={telegram.linked} url={telegram.url} />
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
