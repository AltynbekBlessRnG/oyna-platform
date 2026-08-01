"use server";

import type { BookingReceipt, UpdateBookingStatusRequest } from "@oyna/contracts";

export async function updateBookingStatus(id: string, status: UpdateBookingStatusRequest["status"]): Promise<BookingReceipt> {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000/api";
  const adminKey = process.env.CLUB_ADMIN_KEY ?? "pilot-admin";
  const response = await fetch(`${apiUrl}/admin/bookings/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-club-admin-key": adminKey },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error("Не удалось обновить статус бронирования");
  return (await response.json()) as BookingReceipt;
}
