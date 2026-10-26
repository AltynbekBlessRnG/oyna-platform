"use server";

import type {
  AuthSession,
  BookingReceipt,
  ClubSummary,
  ClientNote,
  ClubZone,
  ManagedClub,
  PlaySession,
  RequestCodeResponse,
  StationCredentials,
  TopUpResult,
  UpdateBookingStatusRequest,
  UpdateClubRequest,
  UpsertZoneRequest
} from "@oyna/contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminFetch, apiUrl, loadManagedClubs } from "@/lib/api";
import { clearSession, setActiveClubId, startSession } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function updateBookingStatus(clubId: string, id: string, status: UpdateBookingStatusRequest["status"]): Promise<BookingReceipt> {
  const booking = await adminFetch<BookingReceipt>(`/admin/clubs/${clubId}/bookings/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
  revalidatePath("/");
  return booking;
}

export async function requestAdminCode(phone: string): Promise<{ challengeId?: string; devCode?: string; message?: string }> {
  try {
    const response = await fetch(`${apiUrl}/auth/request-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
    if (!response.ok) return { message: "Проверьте номер телефона в формате +7XXXXXXXXXX" };
    const { challengeId, devCode } = (await response.json()) as RequestCodeResponse;
    return { challengeId, devCode };
  } catch {
    return { message: "API недоступен. Запустите pnpm dev:api и повторите." };
  }
}

export async function confirmAdminCode(challengeId: string, code: string): Promise<ActionResult> {
  let clubs: ManagedClub[];
  try {
    const response = await fetch(`${apiUrl}/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, code })
    });
    if (!response.ok) return { ok: false, message: "Неверный или просроченный код" };
    const session = (await response.json()) as AuthSession;
    // Клуб ещё неизвестен: временно кладём токен, чтобы запросить список доступных клубов.
    await startSession(session.accessToken, "");
    clubs = await loadManagedClubs();
  } catch (error) {
    await clearSession();
    return { ok: false, message: describe(error, "Не удалось войти") };
  }
  if (clubs.length === 0) {
    await clearSession();
    return { ok: false, message: "У этого номера нет доступа ни к одному клубу. Попросите владельца платформы выдать права." };
  }
  await setActiveClubId(clubs[0].id);
  redirect("/");
}

export async function switchClub(clubId: string): Promise<void> {
  await setActiveClubId(clubId);
  // Клуб влияет на каждую страницу кабинета, а не только на обзор.
  revalidatePath("/", "layout");
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect("/login");
}

export async function saveClubProfile(clubId: string, patch: UpdateClubRequest): Promise<ActionResult> {
  try {
    await adminFetch<ClubSummary>(`/admin/clubs/${clubId}`, { method: "PATCH", body: JSON.stringify(patch) });
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, message: "Карточка клуба сохранена" };
  } catch (error) {
    return { ok: false, message: describe(error, "Не удалось сохранить клуб") };
  }
}

export async function saveClubZones(clubId: string, zones: UpsertZoneRequest[]): Promise<ActionResult> {
  try {
    await adminFetch<ClubZone[]>(`/admin/clubs/${clubId}/zones`, { method: "PUT", body: JSON.stringify({ zones }) });
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, message: "Зоны, цены и места обновлены" };
  } catch (error) {
    return { ok: false, message: describe(error, "Не удалось сохранить зоны") };
  }
}

/** Результат действия кассы: данные при успехе, понятное сообщение при отказе API. */
export type HallResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function hallAction<T>(work: () => Promise<T>, fallback: string): Promise<HallResult<T>> {
  try {
    const data = await work();
    revalidatePath("/hall");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: describe(error, fallback) };
  }
}

export async function startPlaySession(clubId: string, seatId: string, phone: string, minutes?: number): Promise<HallResult<PlaySession>> {
  return hallAction(
    () => adminFetch<PlaySession>(`/admin/clubs/${clubId}/sessions`, { method: "POST", body: JSON.stringify({ seatId, phone, ...(minutes ? { minutes } : {}) }) }),
    "Не удалось запустить сессию"
  );
}

export async function endPlaySession(clubId: string, sessionId: string): Promise<HallResult<PlaySession>> {
  return hallAction(() => adminFetch<PlaySession>(`/admin/clubs/${clubId}/sessions/${sessionId}/end`, { method: "POST" }), "Не удалось завершить сессию");
}

export async function topUpBalance(clubId: string, phone: string, amount: number): Promise<HallResult<TopUpResult>> {
  return hallAction(() => adminFetch<TopUpResult>(`/admin/clubs/${clubId}/top-ups`, { method: "POST", body: JSON.stringify({ phone, amount }) }), "Не удалось пополнить баланс");
}

export async function registerStation(clubId: string, seatId: string): Promise<HallResult<StationCredentials>> {
  return hallAction(() => adminFetch<StationCredentials>(`/admin/clubs/${clubId}/stations`, { method: "POST", body: JSON.stringify({ seatId }) }), "Не удалось подключить компьютер");
}

export async function rotateStationKey(clubId: string, stationId: string): Promise<HallResult<StationCredentials>> {
  return hallAction(() => adminFetch<StationCredentials>(`/admin/clubs/${clubId}/stations/${stationId}/token`, { method: "POST" }), "Не удалось выпустить ключ");
}

export async function removeStation(clubId: string, stationId: string): Promise<HallResult<null>> {
  return hallAction(async () => {
    await adminFetch<void>(`/admin/clubs/${clubId}/stations/${stationId}`, { method: "DELETE" });
    return null;
  }, "Не удалось отвязать компьютер");
}

// ---------- CRM ----------

function revalidateClient(userId: string): void {
  revalidatePath(`/clients/${userId}`);
  revalidatePath("/clients");
}

export async function addClientNote(clubId: string, userId: string, text: string): Promise<HallResult<ClientNote>> {
  try {
    const note = await adminFetch<ClientNote>(`/admin/clubs/${clubId}/clients/${userId}/notes`, { method: "POST", body: JSON.stringify({ text }) });
    revalidateClient(userId);
    return { ok: true, data: note };
  } catch (error) {
    return { ok: false, message: describe(error, "Не удалось сохранить заметку") };
  }
}

export async function deleteClientNote(clubId: string, userId: string, noteId: string): Promise<HallResult<null>> {
  try {
    await adminFetch<void>(`/admin/clubs/${clubId}/clients/${userId}/notes/${noteId}`, { method: "DELETE" });
    revalidateClient(userId);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, message: describe(error, "Не удалось удалить заметку") };
  }
}

export async function setClientTags(clubId: string, userId: string, tags: string[]): Promise<HallResult<string[]>> {
  try {
    const result = await adminFetch<{ tags: string[] }>(`/admin/clubs/${clubId}/clients/${userId}/tags`, { method: "PUT", body: JSON.stringify({ tags }) });
    revalidateClient(userId);
    return { ok: true, data: result.tags };
  } catch (error) {
    return { ok: false, message: describe(error, "Не удалось сохранить теги") };
  }
}

export async function adjustClientBalance(clubId: string, userId: string, amount: number, reason: string): Promise<HallResult<number>> {
  try {
    const result = await adminFetch<{ balance: number }>(`/admin/clubs/${clubId}/clients/${userId}/balance-adjustments`, {
      method: "POST",
      body: JSON.stringify({ amount, reason })
    });
    revalidateClient(userId);
    return { ok: true, data: result.balance };
  } catch (error) {
    return { ok: false, message: describe(error, "Не удалось изменить баланс") };
  }
}

export async function topUpClient(clubId: string, userId: string, phone: string, amount: number): Promise<HallResult<TopUpResult>> {
  try {
    const result = await adminFetch<TopUpResult>(`/admin/clubs/${clubId}/top-ups`, { method: "POST", body: JSON.stringify({ phone, amount }) });
    revalidateClient(userId);
    revalidatePath("/hall");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, message: describe(error, "Не удалось пополнить баланс") };
  }
}
