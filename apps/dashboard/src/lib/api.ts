import type { BookingReceipt, ClubAdminView, ManagedClub } from "@oyna/contracts";
import { redirect } from "next/navigation";
import { getActiveClubId, getSessionToken } from "@/lib/session";

export const apiUrl = process.env.API_URL ?? "http://localhost:4000/api";

/** Клуб для локальной демонстрации, когда API ещё не запущен. */
export const DEMO_CLUB: ManagedClub = { id: "vertex-arena", name: "Vertex Arena", city: "Алматы", role: "admin" };

/**
 * Пилотный ключ остаётся запасным входом на время демонстраций и в разработке.
 * В production он работает, только если задан явно.
 */
function pilotKey(): string | undefined {
  return process.env.CLUB_ADMIN_KEY ?? (process.env.NODE_ENV === "production" ? undefined : "pilot-admin");
}

async function adminHeaders(): Promise<Record<string, string>> {
  const token = await getSessionToken();
  if (token) return { Authorization: `Bearer ${token}` };
  const key = pilotKey();
  return key ? { "x-club-admin-key": key } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(await adminHeaders()), ...(init.headers ?? {}) }
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => undefined);
    const message = typeof detail?.message === "string" ? detail.message : `Запрос не выполнен (${response.status})`;
    throw new ApiError(message, response.status);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function loadManagedClubs(): Promise<ManagedClub[]> {
  return adminFetch<ManagedClub[]>("/admin/me/clubs");
}

/**
 * Страницы кабинета доступны только тому, кто вошёл. Пилотный ключ остаётся входом
 * для локальной демонстрации, поэтому там, где он не задан (production), анонимного
 * посетителя отправляем на форму входа.
 */
export async function requireSession(): Promise<void> {
  if (await getSessionToken()) return;
  if (pilotKey()) return;
  redirect("/login");
}

/** Активный клуб кабинета: из cookie, иначе первый доступный, иначе демонстрационный. */
export async function loadActiveClub(): Promise<{ club: ManagedClub; clubs: ManagedClub[]; offline: boolean }> {
  const selected = await getActiveClubId();
  try {
    const clubs = await loadManagedClubs();
    if (clubs.length === 0) return { club: DEMO_CLUB, clubs: [], offline: false };
    return { club: clubs.find((item) => item.id === selected) ?? clubs[0], clubs, offline: false };
  } catch {
    return { club: DEMO_CLUB, clubs: [DEMO_CLUB], offline: true };
  }
}

/** Демонстрационная заявка: кабинет остаётся наглядным, даже когда API ещё не запущен. */
const DEMO_BOOKINGS: BookingReceipt[] = [
  {
    id: "OY-PILOT1",
    playerName: "Арман С.",
    clubId: DEMO_CLUB.id,
    zoneId: "vip",
    zoneName: "VIP",
    seatIds: ["vertex-arena-vip-01", "vertex-arena-vip-02"],
    seatLabels: ["01", "02"],
    startAt: new Date(Date.now() + 3_600_000).toISOString(),
    durationHours: 3,
    totalAmount: 8400,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export async function loadClubBookings(clubId: string): Promise<{ bookings: BookingReceipt[]; offline: boolean }> {
  try {
    return { bookings: await adminFetch<BookingReceipt[]>(`/admin/clubs/${clubId}/bookings`), offline: false };
  } catch {
    return { bookings: DEMO_BOOKINGS, offline: true };
  }
}

export async function loadClubView(clubId: string): Promise<ClubAdminView | undefined> {
  return adminFetch<ClubAdminView>(`/admin/clubs/${clubId}`).catch(() => undefined);
}
