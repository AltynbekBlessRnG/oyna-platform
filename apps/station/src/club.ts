import type { ClubPackage, MenuItem, TournamentSummary } from "@oyna/contracts";
import { useEffect, useState } from "react";

/** Открытые данные клуба для экрана: пакеты, меню бара, турниры. `null` — не загрузилось, блок прячем. */
export interface ClubInfo {
  packages: ClubPackage[] | null;
  menu: MenuItem[] | null;
  tournaments: TournamentSummary[] | null;
}

const REFRESH_MS = 3 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status}`);
  return (await response.json()) as T;
}

/**
 * Пакеты, меню и турниры по HTTP с сервера клуба, раз в несколько минут и сразу, как вернулась связь.
 * Не загрузилось — оставляем то, что уже знали; ничего не знали — блок на экране не показываем.
 */
export function useClubInfo(apiUrl: string, clubId: string | undefined, online: boolean): ClubInfo {
  const [info, setInfo] = useState<ClubInfo>({ packages: null, menu: null, tournaments: null });

  useEffect(() => {
    if (!clubId) return;
    const base = `${apiUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;
    const club = encodeURIComponent(clubId);
    let cancelled = false;
    const load = <K extends keyof ClubInfo>(key: K, url: string) =>
      getJson<NonNullable<ClubInfo[K]>>(url).then(
        (value) => !cancelled && Array.isArray(value) && setInfo((current) => ({ ...current, [key]: value })),
        () => undefined
      );
    const refresh = () => {
      void load("packages", `${base}/clubs/${club}/packages`);
      void load("menu", `${base}/clubs/${club}/menu`);
      void load("tournaments", `${base}/tournaments?clubId=${club}`);
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiUrl, clubId, online]);

  return info;
}

// ---------- Пакеты: те же правила, что на сервере (apps/api/src/clubs/club-packages.service.ts) ----------

/** Весь Казахстан живёт по UTC+5 без перехода на летнее время. */
const CLUB_UTC_OFFSET_MINUTES = 5 * 60;

function clubMinuteOfDay(now: number): number {
  return Math.floor((now / 60_000 + CLUB_UTC_OFFSET_MINUTES) % 1440);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Можно ли купить пакет сейчас: окно может переходить через полночь, как у ночного. */
export function packageAvailableAt(pack: ClubPackage, now: number): boolean {
  if (!pack.availableFrom || !pack.availableTo) return true;
  const minute = clubMinuteOfDay(now);
  const from = toMinutes(pack.availableFrom);
  const to = toMinutes(pack.availableTo);
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** Сколько минут даёт пакет, если сесть сейчас: «до 08:00» считается до ближайших 08:00. */
export function packageMinutesAt(pack: ClubPackage, now: number): number {
  if (pack.kind === "duration") return pack.durationMinutes ?? 0;
  const left = (toMinutes(pack.endsAt ?? "00:00") - clubMinuteOfDay(now) + 1440) % 1440;
  return left === 0 ? 1440 : left;
}

/** Пакеты, которые касса может продать на это место: включённые и для зоны этого компьютера. */
export function packagesForZone(packages: ClubPackage[] | null, zoneId: string): ClubPackage[] {
  return (packages ?? []).filter((pack) => pack.active && (pack.zoneIds.length === 0 || pack.zoneIds.includes(zoneId)));
}

// ---------- Турниры ----------

const UPCOMING: TournamentSummary["status"][] = ["published", "registration_closed", "in_progress"];

/** Ближайшие турниры клуба: идущие и те, что ещё впереди. */
export function upcomingTournaments(tournaments: TournamentSummary[] | null, now: number, limit = 2): TournamentSummary[] {
  return (tournaments ?? [])
    .filter((tournament) => UPCOMING.includes(tournament.status) && (tournament.status === "in_progress" || Date.parse(tournament.startsAt) > now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, limit);
}
