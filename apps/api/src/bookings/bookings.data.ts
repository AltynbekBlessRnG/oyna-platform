import type { ClubZone, SeatAvailability } from "@oyna/contracts";

/** Места нумеруются по зоне: занятость приходит только из реальных броней. */
export function createSeats(zone: ClubZone): SeatAvailability[] {
  return Array.from({ length: zone.seatCount }, (_, index) => {
    const seatNumber = index + 1;
    return {
      id: `${zone.clubId}-${zone.id}-${String(seatNumber).padStart(2, "0")}`,
      label: String(seatNumber).padStart(2, "0"),
      row: seatNumber <= Math.ceil(zone.seatCount / 2) ? "A" : "B",
      status: "available" as const
    };
  });
}
