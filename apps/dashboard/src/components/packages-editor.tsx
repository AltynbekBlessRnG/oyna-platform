"use client";

import type { ClubPackage, ClubZone, UpsertPackageRequest } from "@oyna/contracts";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveClubPackages } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PackagesEditorProps {
  clubId: string;
  zones: ClubZone[];
  packages: ClubPackage[];
}

type PackageRow = UpsertPackageRequest & { key: string };

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

let nextKey = 0;
const newKey = (): string => `new-${nextKey++}`;

/** Частые пакеты клубов: цена считается от самой дешёвой зоны, админ потом поправит. */
function templates(hourPrice: number): { label: string; row: UpsertPackageRequest }[] {
  return [
    { label: "2+1", row: { name: "2+1", price: hourPrice * 2, kind: "duration", durationMinutes: 180, zoneIds: [], active: true } },
    { label: "3+2", row: { name: "3+2", price: hourPrice * 3, kind: "duration", durationMinutes: 300, zoneIds: [], active: true } },
    { label: "Ночь", row: { name: "Ночь", price: hourPrice * 4, kind: "until", endsAt: "08:00", availableFrom: "22:00", availableTo: "04:00", zoneIds: [], active: true } },
    { label: "День", row: { name: "День", price: hourPrice * 4, kind: "until", endsAt: "18:00", availableFrom: "10:00", availableTo: "15:00", zoneIds: [], active: true } }
  ];
}

export function PackagesEditor({ clubId, zones, packages }: PackagesEditorProps) {
  const [rows, setRows] = useState<PackageRow[]>(packages.map(({ clubId: _club, ...pack }) => ({ ...pack, key: pack.id })));
  const [result, setResult] = useState("");
  const [isPending, startTransition] = useTransition();
  const hourPrice = zones.length ? Math.min(...zones.map((zone) => zone.pricePerHour)) : 500;

  function patchRow(key: string, patch: Partial<UpsertPackageRequest>): void {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function toggleZone(row: PackageRow, zoneId: string): void {
    patchRow(row.key, { zoneIds: row.zoneIds.includes(zoneId) ? row.zoneIds.filter((id) => id !== zoneId) : [...row.zoneIds, zoneId] });
  }

  function submit(): void {
    startTransition(async () => {
      const saved = await saveClubPackages(clubId, rows.map(({ key: _key, ...row }) => row));
      setResult(saved.message);
      if (saved.ok) setRows(saved.data.map(({ clubId: _club, ...pack }) => ({ ...pack, key: pack.id })));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пакеты</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Время по фиксированной цене. Касса выбирает пакет при посадке, цена сразу списывается с баланса игрока.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Пакетов пока нет. Начните с готового:</p> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <article key={row.key} className={cn("grid gap-3 rounded-xl border border-border p-4", !row.active && "opacity-60")}>
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Название
                  <input className={inputClass} value={row.name} onChange={(event) => patchRow(row.key, { name: event.target.value })} />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Цена, ₸
                  <input className={inputClass} inputMode="numeric" value={row.price} onChange={(event) => patchRow(row.key, { price: Number(event.target.value.replace(/\D/g, "")) })} />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Сколько играть
                  <select
                    className={inputClass}
                    value={row.kind}
                    onChange={(event) =>
                      patchRow(row.key, event.target.value === "duration" ? { kind: "duration", durationMinutes: row.durationMinutes ?? 180 } : { kind: "until", endsAt: row.endsAt ?? "08:00" })
                    }
                  >
                    <option value="duration">Столько-то часов</option>
                    <option value="until">До определённого времени</option>
                  </select>
                </label>
                {row.kind === "duration" ? (
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    Часов
                    <input
                      className={inputClass}
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={(row.durationMinutes ?? 0) / 60}
                      onChange={(event) => patchRow(row.key, { durationMinutes: Math.round(Number(event.target.value) * 60) })}
                    />
                  </label>
                ) : (
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    До
                    <input className={inputClass} type="time" value={row.endsAt ?? ""} onChange={(event) => patchRow(row.key, { endsAt: event.target.value })} />
                  </label>
                )}
              </div>

              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!row.availableFrom}
                    onChange={(event) => patchRow(row.key, event.target.checked ? { availableFrom: undefined, availableTo: undefined } : { availableFrom: "22:00", availableTo: "04:00" })}
                  />
                  Продаётся круглосуточно
                </label>
                {row.availableFrom ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      Продаётся с
                      <input className={inputClass} type="time" value={row.availableFrom} onChange={(event) => patchRow(row.key, { availableFrom: event.target.value })} />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">
                      до
                      <input className={inputClass} type="time" value={row.availableTo ?? ""} onChange={(event) => patchRow(row.key, { availableTo: event.target.value })} />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">Зоны {row.zoneIds.length === 0 ? "— все" : ""}</span>
                <div className="flex flex-wrap gap-2">
                  {zones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      aria-pressed={row.zoneIds.includes(zone.id)}
                      onClick={() => toggleZone(row, zone.id)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs",
                        row.zoneIds.includes(zone.id) ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {zone.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={row.active} onChange={(event) => patchRow(row.key, { active: event.target.checked })} />
                  Включён
                </label>
                <Button variant="ghost" size="sm" aria-label={`Удалить пакет ${row.name}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                  <Trash2 className="size-4" />Удалить
                </Button>
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {templates(hourPrice).map((template) => (
            <Button key={template.label} variant="secondary" size="sm" onClick={() => setRows((current) => [...current, { ...template.row, key: newKey() }])}>
              <Plus className="size-4" />{template.label}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRows((current) => [...current, { name: "", price: hourPrice, kind: "duration", durationMinutes: 60, zoneIds: [], active: true, key: newKey() }])}
          >
            <Plus className="size-4" />Свой пакет
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          «До определённого времени» заканчивается в ближайший такой час: ночь до 08:00, купленная в 01:00, всё равно закончится в 08:00. Время — по Алматы.
        </p>
        {result ? <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{result}</p> : null}
        <Button className="justify-self-start" disabled={isPending} onClick={submit}><Save className="size-4" />Сохранить пакеты</Button>
      </CardContent>
    </Card>
  );
}
