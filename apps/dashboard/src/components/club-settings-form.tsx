"use client";

import type { ClubStatus, ClubSummary, ClubZone, UpsertZoneRequest } from "@oyna/contracts";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveClubProfile, saveClubZones } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ClubSettingsFormProps {
  clubId: string;
  club: ClubSummary;
  zones: ClubZone[];
}

interface ZoneRow extends UpsertZoneRequest {
  isNew: boolean;
}

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const STATUS_OPTIONS: { value: ClubStatus; label: string }[] = [
  { value: "available", label: "Открыт" },
  { value: "busy", label: "Мест нет" },
  { value: "offline", label: "Не принимает брони" }
];

export function ClubSettingsForm({ clubId, club, zones }: ClubSettingsFormProps) {
  const [profile, setProfile] = useState({
    name: club.name,
    address: club.address,
    city: club.city,
    status: club.status,
    equipment: club.equipment,
    phone: club.phone ?? "",
    openingHours: club.openingHours ?? "",
    tags: club.tags.join(", ")
  });
  const [rows, setRows] = useState<ZoneRow[]>(zones.map((zone) => ({ ...zone, isNew: false })));
  const [profileResult, setProfileResult] = useState("");
  const [zoneResult, setZoneResult] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitProfile(): void {
    startTransition(async () => {
      const result = await saveClubProfile(clubId, {
        name: profile.name,
        address: profile.address,
        city: profile.city,
        status: profile.status,
        equipment: profile.equipment,
        phone: profile.phone || undefined,
        openingHours: profile.openingHours || undefined,
        tags: profile.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      setProfileResult(result.message);
    });
  }

  function submitZones(): void {
    startTransition(async () => {
      const result = await saveClubZones(
        clubId,
        rows.map(({ isNew: _isNew, ...zone }) => zone)
      );
      setZoneResult(result.message);
      if (result.ok) setRows((current) => current.map((row) => ({ ...row, isNew: false })));
    });
  }

  function patchRow(index: number, patch: Partial<ZoneRow>): void {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  const totalSeats = rows.reduce((sum, row) => sum + (Number.isFinite(row.seatCount) ? row.seatCount : 0), 0);
  const priceFrom = rows.length ? Math.min(...rows.map((row) => row.pricePerHour)) : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Карточка клуба</CardTitle><p className="text-sm text-muted-foreground">Как клуб выглядит в приложении игрока</p></CardHeader>
        <CardContent className="grid gap-3">
          <label className="text-sm font-medium" htmlFor="club-name">Название</label>
          <input id="club-name" className={inputClass} value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
          <label className="text-sm font-medium" htmlFor="club-address">Адрес</label>
          <input id="club-address" className={inputClass} value={profile.address} onChange={(event) => setProfile({ ...profile, address: event.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="club-city">Город</label>
              <input id="club-city" className={`${inputClass} mt-2`} value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="club-status">Статус</label>
              <select id="club-status" className={`${inputClass} mt-2`} value={profile.status} onChange={(event) => setProfile({ ...profile, status: event.target.value as ClubStatus })}>
                {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="club-phone">Телефон</label>
              <input id="club-phone" className={`${inputClass} mt-2`} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="club-hours">Часы работы</label>
              <input id="club-hours" className={`${inputClass} mt-2`} value={profile.openingHours} onChange={(event) => setProfile({ ...profile, openingHours: event.target.value })} />
            </div>
          </div>
          <label className="text-sm font-medium" htmlFor="club-equipment">Оборудование</label>
          <input id="club-equipment" className={inputClass} value={profile.equipment} onChange={(event) => setProfile({ ...profile, equipment: event.target.value })} />
          <label className="text-sm font-medium" htmlFor="club-tags">Теги через запятую</label>
          <input id="club-tags" className={inputClass} value={profile.tags} onChange={(event) => setProfile({ ...profile, tags: event.target.value })} />
          {profileResult ? <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{profileResult}</p> : null}
          <Button className="justify-self-start" disabled={isPending} onClick={submitProfile}><Save className="size-4" />Сохранить клуб</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Зоны, цены и места</CardTitle><p className="mt-1 text-sm text-muted-foreground">Из этих зон игрок выбирает ПК</p></div>
          <Badge>{totalSeats} мест · от {priceFrom.toLocaleString("ru-KZ")} ₸</Badge>
        </CardHeader>
        <CardContent className="grid gap-4">
          {rows.map((row, index) => (
            <article key={`${row.id}-${index}`} className="grid gap-3 rounded-xl border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor={`zone-id-${index}`}>Идентификатор</label>
                  <input
                    id={`zone-id-${index}`}
                    className={`${inputClass} mt-1 font-mono disabled:opacity-60`}
                    value={row.id}
                    disabled={!row.isNew}
                    onChange={(event) => patchRow(index, { id: event.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor={`zone-name-${index}`}>Название</label>
                  <input id={`zone-name-${index}`} className={`${inputClass} mt-1`} value={row.name} onChange={(event) => patchRow(index, { name: event.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground" htmlFor={`zone-description-${index}`}>Описание</label>
                <input id={`zone-description-${index}`} className={`${inputClass} mt-1`} value={row.description} onChange={(event) => patchRow(index, { description: event.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor={`zone-price-${index}`}>Цена за час, ₸</label>
                  <input id={`zone-price-${index}`} type="number" min={0} className={`${inputClass} mt-1 font-mono`} value={row.pricePerHour} onChange={(event) => patchRow(index, { pricePerHour: Number(event.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground" htmlFor={`zone-seats-${index}`}>Мест</label>
                  <input id={`zone-seats-${index}`} type="number" min={1} max={200} className={`${inputClass} mt-1 font-mono`} value={row.seatCount} onChange={(event) => patchRow(index, { seatCount: Number(event.target.value) })} />
                </div>
                <Button variant="ghost" size="sm" aria-label={`Удалить зону ${row.name}`} onClick={() => setRows((current) => current.filter((_, position) => position !== index))}>
                  <Trash2 className="size-4" />Удалить
                </Button>
              </div>
            </article>
          ))}
          <Button variant="secondary" className="justify-self-start" onClick={() => setRows((current) => [...current, { id: "", name: "", description: "", pricePerHour: 800, seatCount: 10, isNew: true }])}>
            <Plus className="size-4" />Добавить зону
          </Button>
          <p className="text-xs text-muted-foreground">
            Идентификатор существующей зоны менять нельзя: к нему привязаны созданные брони. Зону с будущими бронями API не даст удалить или уменьшить.
          </p>
          {zoneResult ? <p role="status" className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{zoneResult}</p> : null}
          <Button className="justify-self-start" disabled={isPending || rows.length === 0} onClick={submitZones}><Save className="size-4" />Сохранить зоны</Button>
        </CardContent>
      </Card>
    </div>
  );
}
