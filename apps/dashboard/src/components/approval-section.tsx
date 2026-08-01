import type { BookingReceipt } from "@oyna/contracts";
import { ApprovalQueue } from "@/components/approval-queue";

const fallbackBookings: BookingReceipt[] = [
  { id: "OY-PILOT1", playerName: "Арман С.", clubId: "vertex-arena", zoneId: "vip", zoneName: "VIP", seatIds: ["vertex-arena-vip-01", "vertex-arena-vip-02"], seatLabels: ["01", "02"], startAt: new Date(Date.now() + 3_600_000).toISOString(), durationHours: 3, totalAmount: 8400, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
];

async function getBookings(): Promise<BookingReceipt[]> {
  const apiUrl = process.env.API_URL ?? "http://localhost:4000/api";
  const adminKey = process.env.CLUB_ADMIN_KEY ?? "pilot-admin";
  try {
    const response = await fetch(`${apiUrl}/admin/clubs/vertex-arena/bookings`, { cache: "no-store", headers: { "x-club-admin-key": adminKey }, signal: AbortSignal.timeout(800) });
    if (!response.ok) return fallbackBookings;
    return (await response.json()) as BookingReceipt[];
  } catch {
    return fallbackBookings;
  }
}

export async function ApprovalSection() {
  const bookings = await getBookings();
  return <ApprovalQueue initialBookings={bookings} />;
}
