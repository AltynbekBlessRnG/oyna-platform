import type { AuthSession, AvailabilitySnapshot, BookingReceipt, ChatChannel, ChatMessage, ClubSummary, ClubZone, CreateBookingRequest, GameSummary, NotificationItem, PlayerProfile, RequestCodeResponse, TournamentSummary, UpdateProfileRequest } from "@oyna/contracts";
import { demoClubs } from "@/data/demo-clubs";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api";
const demoBookings = new Map<string, BookingReceipt>();
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function authHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function requestLoginCode(phone: string): Promise<RequestCodeResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/auth/request-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
  } catch {
    return { challengeId: `demo:${phone}`, expiresInSeconds: 300, devCode: "0000" };
  }
  if (!response.ok) throw new Error("Проверь номер телефона");
  return (await response.json()) as RequestCodeResponse;
}

export async function verifyLoginCode(challengeId: string, code: string, name: string): Promise<AuthSession> {
  if (challengeId.startsWith("demo:")) {
    if (code !== "0000") throw new Error("Неверный код");
    const phone = challengeId.slice(5);
    return { accessToken: `demo-token:${phone}`, user: { id: `demo-user:${phone}`, phone, name: name.trim() || "Игрок OYNA", role: "player" } };
  }
  const response = await fetch(`${apiUrl}/auth/verify-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId, code, name }) });
  if (!response.ok) throw new Error("Неверный или просроченный код");
  return (await response.json()) as AuthSession;
}

export async function getClubs(): Promise<ClubSummary[]> {
  try {
    const response = await fetch(`${apiUrl}/clubs`);
    if (!response.ok) throw new Error("Catalog request failed");
    return (await response.json()) as ClubSummary[];
  } catch {
    return demoClubs;
  }
}

export async function getClub(id: string): Promise<ClubSummary | undefined> {
  const clubs = await getClubs();
  return clubs.find((club) => club.id === id);
}

export async function getZones(clubId: string): Promise<ClubZone[]> {
  try {
    const response = await fetch(`${apiUrl}/clubs/${clubId}/zones`);
    if (!response.ok) throw new Error("Zones request failed");
    return (await response.json()) as ClubZone[];
  } catch {
    return [
      { id: "standard", clubId, name: "Standard", description: "RTX 4060 · 180 Hz", pricePerHour: 900, seatCount: 12 },
      { id: "vip", clubId, name: "VIP", description: "RTX 4070 · 240 Hz", pricePerHour: 1400, seatCount: 8 },
      { id: "bootcamp", clubId, name: "Bootcamp", description: "Закрытая комната · 5 мест", pricePerHour: 1800, seatCount: 5 }
    ];
  }
}

export async function getAvailability(clubId: string, zoneId: string, startAt: string, durationHours: number): Promise<AvailabilitySnapshot> {
  const query = new URLSearchParams({ zoneId, startAt, durationHours: String(durationHours) });
  try {
    const response = await fetch(`${apiUrl}/clubs/${clubId}/availability?${query}`);
    if (!response.ok) throw new Error("Availability request failed");
    return (await response.json()) as AvailabilitySnapshot;
  } catch {
    const zones = await getZones(clubId);
    const zone = zones.find((item) => item.id === zoneId) ?? zones[0];
    return {
      clubId,
      zoneId,
      startAt,
      durationHours,
      seats: Array.from({ length: zone.seatCount }, (_, index) => ({
        id: `${clubId}-${zoneId}-${String(index + 1).padStart(2, "0")}`,
        label: String(index + 1).padStart(2, "0"),
        row: index < Math.ceil(zone.seatCount / 2) ? "A" : "B",
        status: "available"
      }))
    };
  }
}

export async function createBooking(request: CreateBookingRequest): Promise<BookingReceipt> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/bookings`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(request) });
  } catch {
    const zones = await getZones(request.clubId);
    const zone = zones.find((item) => item.id === request.zoneId) ?? zones[0];
    const now = new Date().toISOString();
    const booking: BookingReceipt = {
      ...request,
      id: `OY-${Math.floor(3000 + Math.random() * 6000)}`,
      status: "pending",
      zoneName: zone.name,
      seatLabels: request.seatIds.map((seatId) => seatId.slice(-2)),
      totalAmount: zone.pricePerHour * request.durationHours * request.seatIds.length,
      createdAt: now,
      updatedAt: now
    };
    demoBookings.set(booking.id, booking);
    return booking;
  }
  if (!response.ok) throw new Error(`Booking rejected with status ${response.status}`);
  const booking = (await response.json()) as BookingReceipt;
  demoBookings.set(booking.id, booking);
  return booking;
}

export async function getBooking(id: string): Promise<BookingReceipt | undefined> {
  const demoBooking = demoBookings.get(id);
  if (demoBooking) return demoBooking;
  try {
    const response = await fetch(`${apiUrl}/bookings/${id}`, { headers: authHeaders() });
    if (!response.ok) return undefined;
    return (await response.json()) as BookingReceipt;
  } catch {
    return undefined;
  }
}

export async function getMyBookings(): Promise<BookingReceipt[]> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/bookings`, { headers: authHeaders() });
  } catch {
    return [...demoBookings.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  if (!response.ok) throw new Error("Не удалось загрузить историю");
  return (await response.json()) as BookingReceipt[];
}

export async function cancelBooking(id: string): Promise<BookingReceipt> {
  const demo = demoBookings.get(id);
  if (demo) {
    const updated = { ...demo, status: "cancelled" as const, updatedAt: new Date().toISOString() };
    demoBookings.set(id, updated);
    return updated;
  }
  const response = await fetch(`${apiUrl}/bookings/${id}/cancel`, { method: "PATCH", headers: authHeaders() });
  if (!response.ok) throw new Error("Booking cannot be cancelled");
  return (await response.json()) as BookingReceipt;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
export const getGames = () => api<GameSummary[]>("/games");
export const getChatChannels = (city="Алматы") => api<ChatChannel[]>(`/chat/channels?city=${encodeURIComponent(city)}`);
export const getChatMessages = (channelId:string) => api<ChatMessage[]>(`/chat/channels/${channelId}/messages`);
export const sendChatMessage = (channelId:string,text:string) => api<ChatMessage>(`/chat/channels/${channelId}/messages`,{method:"POST",body:JSON.stringify({text})});
export const getTournaments = (gameId?:string) => api<TournamentSummary[]>(`/tournaments${gameId?`?gameId=${encodeURIComponent(gameId)}`:""}`);
export const registerTournament = (id:string,teamId?:string) => api<{status:string}>(`/tournaments/${id}/register`,{method:"POST",body:JSON.stringify({teamId})});
export const getMyProfile = () => api<PlayerProfile>("/profiles/me");
export const updateMyProfile = (value:UpdateProfileRequest) => api<PlayerProfile>("/profiles/me",{method:"PATCH",body:JSON.stringify(value)});
export const requestAccountDeletion = () => api<{deletionScheduledAt:string}>("/account/deletion/request",{method:"POST"});
export const getNotifications = () => api<NotificationItem[]>("/notifications");
export const markNotificationRead = (id: string) => api<void>(`/notifications/${id}/read`, { method: "PATCH" });
export const registerPushDevice = (token: string, platform: string) => api<void>("/notifications/devices", { method: "POST", body: JSON.stringify({ token, platform }) });
