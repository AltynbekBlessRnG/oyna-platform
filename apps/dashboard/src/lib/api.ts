import type { BookingReceipt, ClientSegment, ClientSort, ClubAdminView, ClubAnalytics, ClubClientDetail, ClubOrder, ClubClientsResponse, ClubPackage, ClubSeatMap, ClubShift, ClubStation, ManagedClub, PlaySession } from "@oyna/contracts";
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

export interface HallSnapshot {
  seatMap: ClubSeatMap;
  stations: ClubStation[];
  sessions: PlaySession[];
  /** Открытая смена кассы; без неё пополнять балансы нельзя. */
  shift: ClubShift | null;
  /** Пакеты клуба для посадки; выключенные сюда не попадают. */
  packages: ClubPackage[];
  /** Открытые заказы бара (новые и принятые), старые сверху: их несут по очереди. */
  orders: ClubOrder[];
}

/** Зал для кассы: карта мест, компьютеры с клиентом Zen и идущие сессии. */
export async function loadHall(clubId: string): Promise<HallSnapshot> {
  const [seatMapResponse, stations, sessions, shift, packages, orders] = await Promise.all([
    fetch(`${apiUrl}/clubs/${clubId}/seatmap`, { cache: "no-store" }),
    adminFetch<ClubStation[]>(`/admin/clubs/${clubId}/stations`),
    adminFetch<PlaySession[]>(`/admin/clubs/${clubId}/sessions`),
    adminFetch<ClubShift | null>(`/admin/clubs/${clubId}/shifts/current`),
    adminFetch<ClubPackage[]>(`/admin/clubs/${clubId}/packages`),
    // Очередь бара не должна ронять весь зал: без неё касса всё равно сажает и пополняет.
    adminFetch<ClubOrder[]>(`/admin/clubs/${clubId}/orders`).catch(() => [] as ClubOrder[])
  ]);
  if (!seatMapResponse.ok) throw new ApiError(`Карта зала недоступна (${seatMapResponse.status})`, seatMapResponse.status);
  // Нет открытой смены — API отвечает пустым телом.
  return {
    seatMap: (await seatMapResponse.json()) as ClubSeatMap,
    stations,
    sessions,
    shift: shift ?? null,
    packages: packages.filter((pack) => pack.active),
    orders: [...(orders ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  };
}

/** История смен кассы, новые сверху. */
export async function loadShifts(clubId: string): Promise<ClubShift[]> {
  return adminFetch<ClubShift[]>(`/admin/clubs/${clubId}/shifts`);
}

/** Аналитика нужна базе данных: без неё API отвечает 503, и кабинет показывает пояснение вместо нулей. */
export async function loadAnalytics(clubId: string, days: number): Promise<{ analytics?: ClubAnalytics; error?: string }> {
  try {
    return { analytics: await adminFetch<ClubAnalytics>(`/admin/clubs/${clubId}/analytics?days=${days}`) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Аналитика недоступна" };
  }
}

export async function loadClients(
  clubId: string,
  options: { search?: string; segment?: ClientSegment | "risk"; sort?: ClientSort }
): Promise<{ data?: ClubClientsResponse; error?: string }> {
  const query = new URLSearchParams();
  if (options.search) query.set("search", options.search);
  if (options.segment) query.set("segment", options.segment);
  if (options.sort) query.set("sort", options.sort);
  try {
    return { data: await adminFetch<ClubClientsResponse>(`/admin/clubs/${clubId}/clients?${query.toString()}`) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Клиенты недоступны" };
  }
}

export async function loadClient(clubId: string, userId: string): Promise<{ data?: ClubClientDetail; error?: string; status?: number }> {
  try {
    return { data: await adminFetch<ClubClientDetail>(`/admin/clubs/${clubId}/clients/${encodeURIComponent(userId)}`) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Клиент недоступен", status: error instanceof ApiError ? error.status : undefined };
  }
}
