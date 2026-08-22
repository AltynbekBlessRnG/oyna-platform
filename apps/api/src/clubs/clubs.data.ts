import type { ClubSummary, ClubZone } from "@oyna/contracts";

/**
 * Каталог демонстрационного пилота. В рабочем режиме клубы и зоны живут в PostgreSQL:
 * этот набор используется как стартовый seed (`pnpm db:seed`) и как запасной каталог,
 * когда база не подключена.
 */
export interface ClubCatalogEntry {
  club: Omit<ClubSummary, "priceFrom" | "totalSeats" | "availableSeats">;
  zones: Omit<ClubZone, "clubId">[];
}

export const CLUB_CATALOG: ClubCatalogEntry[] = [
  {
    club: {
      id: "vertex-arena",
      name: "Vertex Arena",
      address: "пр. Абая, 44",
      city: "Алматы",
      distanceKm: 1.2,
      rating: 4.9,
      reviewCount: 218,
      status: "available",
      tags: ["24/7", "VIP", "Bootcamp"],
      equipment: "RTX 4070 · 240 Hz",
      accent: "#b8ff45",
      openingHours: "Круглосуточно"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 · 180 Hz", pricePerHour: 900, seatCount: 12 },
      { id: "vip", name: "VIP", description: "RTX 4070 · 240 Hz", pricePerHour: 1400, seatCount: 8 },
      { id: "bootcamp", name: "Bootcamp", description: "Закрытая комната · 5 мест", pricePerHour: 1800, seatCount: 5 }
    ]
  },
  {
    club: {
      id: "qazaq-cyber",
      name: "Qazaq Cyber",
      address: "ул. Жандосова, 58",
      city: "Алматы",
      distanceKm: 2.7,
      rating: 4.8,
      reviewCount: 164,
      status: "available",
      tags: ["PS5", "Парковка"],
      equipment: "RTX 4060 Ti · 180 Hz",
      accent: "#8b7cff",
      openingHours: "10:00 — 04:00"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 Ti · 180 Hz", pricePerHour: 700, seatCount: 10 },
      { id: "vip", name: "VIP", description: "RTX 4070 · 240 Hz", pricePerHour: 1100, seatCount: 6 }
    ]
  },
  {
    club: {
      id: "respawn-point",
      name: "Respawn Point",
      address: "ул. Толе би, 189",
      city: "Алматы",
      distanceKm: 3.4,
      rating: 4.7,
      reviewCount: 96,
      status: "busy",
      tags: ["24/7", "Кухня"],
      equipment: "RTX 3060 · 165 Hz",
      accent: "#ff795c",
      openingHours: "Круглосуточно"
    },
    zones: [{ id: "standard", name: "Standard", description: "RTX 3060 · 165 Hz", pricePerHour: 600, seatCount: 10 }]
  }
];
