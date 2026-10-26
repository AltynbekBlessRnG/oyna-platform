import type { TournamentStatus, TournamentSummary } from "@oyna/contracts";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/api";

const STATUS: Record<TournamentStatus, { label: string; tone: "success" | "warning" | "neutral" }> = {
  draft: { label: "Черновик", tone: "neutral" },
  published: { label: "Идёт запись", tone: "success" },
  registration_closed: { label: "Запись закрыта", tone: "warning" },
  in_progress: { label: "Идёт", tone: "warning" },
  completed: { label: "Завершён", tone: "neutral" },
  cancelled: { label: "Отменён", tone: "neutral" }
};

/** Турниры только этого клуба: раньше блок показывал все турниры платформы. */
async function load(clubId: string): Promise<TournamentSummary[]> {
  try {
    const response = await fetch(`${apiUrl}/tournaments?clubId=${encodeURIComponent(clubId)}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return response.ok ? ((await response.json()) as TournamentSummary[]) : [];
  } catch {
    return [];
  }
}

export async function TournamentSection({ clubId }: { clubId: string }) {
  const tournaments = (await load(clubId)).filter((item) => item.clubId === clubId).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-primary" />Турниры клуба</CardTitle>
      </CardHeader>
      <CardContent>
        {tournaments.length ? (
          <ul className="divide-y divide-border">
            {tournaments.slice(0, 4).map((tournament) => (
              <li key={tournament.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tournament.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tournament.startsAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, записалось {tournament.registeredCount} из {tournament.capacity}
                  </p>
                </div>
                <Badge tone={STATUS[tournament.status].tone}>{STATUS[tournament.status].label}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">У клуба пока нет турниров.</p>
        )}
      </CardContent>
    </Card>
  );
}
