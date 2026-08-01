import type { ClubZone, SeatAvailability } from "@oyna/contracts";

export const ZONES: ClubZone[] = [
  { id: "standard", clubId: "vertex-arena", name: "Standard", description: "RTX 4060 · 180 Hz", pricePerHour: 900, seatCount: 12 },
  { id: "vip", clubId: "vertex-arena", name: "VIP", description: "RTX 4070 · 240 Hz", pricePerHour: 1400, seatCount: 8 },
  { id: "bootcamp", clubId: "vertex-arena", name: "Bootcamp", description: "Закрытая комната · 5 мест", pricePerHour: 1800, seatCount: 5 },
  { id: "standard", clubId: "qazaq-cyber", name: "Standard", description: "RTX 4060 Ti · 180 Hz", pricePerHour: 700, seatCount: 10 },
  { id: "vip", clubId: "qazaq-cyber", name: "VIP", description: "RTX 4070 · 240 Hz", pricePerHour: 1100, seatCount: 6 },
  { id: "standard", clubId: "respawn-point", name: "Standard", description: "RTX 3060 · 165 Hz", pricePerHour: 600, seatCount: 10 }
];

export function createSeats(zone: ClubZone): SeatAvailability[] {
  return Array.from({ length: zone.seatCount }, (_, index) => {
    const seatNumber = index + 1;
    return {
      id: `${zone.clubId}-${zone.id}-${String(seatNumber).padStart(2, "0")}`,
      label: String(seatNumber).padStart(2, "0"),
      row: seatNumber <= Math.ceil(zone.seatCount / 2) ? "A" : "B",
      status: seatNumber % 7 === 0 ? "occupied" : "available"
    };
  });
}

