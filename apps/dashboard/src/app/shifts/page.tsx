import type { ClubShift } from "@oyna/contracts";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActiveClub, loadShifts, requireSession } from "@/lib/api";
import { clock, dayTime, money } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function ShiftsPage() {
  await requireSession();
  const { club, clubs } = await loadActiveClub();
  let shifts: ClubShift[] = [];
  let error = "";
  try {
    shifts = await loadShifts(club.id);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "Не удалось загрузить смены";
  }
  const shortage = shifts.reduce((total, shift) => total + Math.min(0, shift.difference ?? 0), 0);

  return (
    <AppShell active="shifts" club={club} clubs={clubs}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Смены кассы</h1>
          <p className="text-sm text-muted-foreground">Последние 30 смен: сколько пробили, как заплатили и сошлась ли касса.</p>
        </div>
        {shortage < 0 ? <p className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger">Недостачи за период: {money(-shortage)}</p> : null}
      </header>
      {error ? (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Смены недоступны</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      ) : shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Смен ещё не было. Откройте первую в разделе «Зал и касса».</p>
      ) : (
        <div className="grid gap-3">
          {shifts.map((shift) => (
            <ShiftRow key={shift.id} shift={shift} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function ShiftRow({ shift }: { shift: ClubShift }) {
  const { totals } = shift;
  const difference = shift.difference;
  return (
    <details className="group rounded-2xl border border-border bg-card">
      <summary className="grid cursor-pointer list-none gap-2 p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] md:items-center">
        <div>
          <p className="font-medium">{dayTime(shift.openedAt)}{shift.closedAt ? ` — ${clock(shift.closedAt)}` : ""}</p>
          <p className="text-sm text-muted-foreground">{shift.openedBy.name}{shift.closedBy && shift.closedBy.name !== shift.openedBy.name ? ` → ${shift.closedBy.name}` : ""}</p>
        </div>
        <Amount label="Наличные" value={totals.cash} />
        <Amount label="Kaspi" value={totals.kaspi} />
        <Amount label="Карта" value={totals.card} />
        <div className="md:text-right">
          {shift.closedAt ? (
            <span className={cn("text-sm font-medium", difference === undefined || difference === 0 ? "text-success" : difference < 0 ? "text-danger" : "text-primary")}>
              {difference === undefined || difference === 0 ? "Касса сошлась" : difference < 0 ? `Недостача ${money(-difference)}` : `Излишек ${money(difference)}`}
            </span>
          ) : (
            <span className="text-sm font-medium text-primary">Идёт сейчас</span>
          )}
        </div>
      </summary>
      <div className="grid gap-4 border-t border-border p-4 text-sm md:grid-cols-2">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Наличные на начало</dt><dd>{money(shift.openingCash)}</dd>
          <dt className="text-muted-foreground">Должно быть в кассе</dt><dd>{money(shift.expectedCash)}</dd>
          {shift.countedCash !== undefined ? (<><dt className="text-muted-foreground">Пересчитали</dt><dd>{money(shift.countedCash)}</dd></>) : null}
          <dt className="text-muted-foreground">Пополнений</dt><dd>{totals.topUpCount}</dd>
          <dt className="text-muted-foreground">Ручных корректировок</dt><dd>{totals.adjustmentCount ? `${totals.adjustmentCount} на ${money(totals.adjustments)}` : "нет"}</dd>
          <dt className="text-muted-foreground">Списано за игру</dt><dd>{money(totals.playCharged)}</dd>
          <dt className="text-muted-foreground">Бар из приложения</dt><dd>{totals.barOrders ? `${totals.barOrders} на ${money(totals.barTotal)}` : "нет"}</dd>
        </dl>
        <div className="grid content-start gap-2">
          <p className="font-medium">Кто что пробил</p>
          {shift.staff.length === 0 ? <p className="text-muted-foreground">Пополнений не было</p> : null}
          {shift.staff.map((person) => (
            <p key={person.userId} className="flex justify-between gap-4">
              <span>{person.name} · {person.topUpCount}</span>
              <span className="text-muted-foreground">нал {money(person.cash)} · Kaspi {money(person.kaspi)} · карта {money(person.card)}</span>
            </p>
          ))}
          {shift.note ? <p className="mt-2 rounded-xl bg-secondary px-3 py-2">«{shift.note}»</p> : null}
        </div>
      </div>
    </details>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{money(value)}</p>
    </div>
  );
}
