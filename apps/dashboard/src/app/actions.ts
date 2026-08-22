"use server";

import type { AuthSession, BookingReceipt, ClubSummary, ClubZone, ManagedClub, RequestCodeResponse, UpdateBookingStatusRequest, UpdateClubRequest, UpsertZoneRequest } from "@oyna/contracts";
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
  revalidatePath("/");
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
