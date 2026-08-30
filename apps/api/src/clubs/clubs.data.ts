import type { ClubSummary, ClubZone, MenuItem } from "@oyna/contracts";

/**
 * Каталог демонстрационного пилота. В рабочем режиме клубы и зоны живут в PostgreSQL:
 * этот набор используется как стартовый seed (`pnpm db:seed`) и как запасной каталог,
 * когда база не подключена.
 */
export interface ClubCatalogEntry {
  club: Omit<ClubSummary, "priceFrom" | "totalSeats" | "availableSeats">;
  zones: Omit<ClubZone, "clubId">[];
  /** Барное меню клуба: заказ приносят прямо за компьютер. */
  menu?: (Omit<MenuItem, "clubId" | "available"> & { available?: boolean })[];
}

export const CLUB_CATALOG: ClubCatalogEntry[] = [
  {
    club: {
      id: "zen-game-club",
      name: "Zen Game Club",
      address: "ул. Байтурсынова, 12",
      city: "Алматы",
      distanceKm: 0.8,
      rating: 5,
      reviewCount: 342,
      status: "available",
      tags: ["24/7", "VIP", "PS5", "Бар"],
      equipment: "RTX 4080 · 360 Hz",
      accent: "#45e0ff",
      openingHours: "Круглосуточно",
      phone: "+7 707 000 00 00"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 · 24\" · 180 Hz · Logitech G102", pricePerHour: 700, seatCount: 16 },
      { id: "pro", name: "Pro", description: "RTX 4070 Super · 27\" · 240 Hz · Razer Viper", pricePerHour: 1100, seatCount: 12 },
      { id: "vip", name: "VIP", description: "RTX 4080 · 27\" · 360 Hz · кресла Herman Miller", pricePerHour: 1800, seatCount: 8 },
      { id: "ps5", name: "PlayStation 5", description: "PS5 Pro · телевизор 65\" · два геймпада", pricePerHour: 2000, seatCount: 4 }
    ],
    menu: [
      { id: "zen-espresso", category: "drinks", name: "Эспрессо", description: "Двойной, зерно Kimbo", price: 700 },
      { id: "zen-latte", category: "drinks", name: "Латте", description: "300 мл", price: 1100 },
      { id: "zen-energy", category: "drinks", name: "Энергетик", description: "Red Bull 0.35 л", price: 900 },
      { id: "zen-lemonade", category: "drinks", name: "Домашний лимонад", description: "0.4 л, лимон-мята", price: 1200 },
      { id: "zen-burger", category: "food", name: "Чизбургер", description: "Говядина, чеддер, соус Zen", price: 2600 },
      { id: "zen-caesar", category: "food", name: "Цезарь с курицей", description: "Классический, 250 г", price: 2400 },
      { id: "zen-pizza", category: "food", name: "Пицца пепперони", description: "25 см", price: 3200 },
      { id: "zen-nuggets", category: "snacks", name: "Наггетсы", description: "8 штук, соус на выбор", price: 1800 },
      { id: "zen-fries", category: "snacks", name: "Картофель фри", description: "Большая порция", price: 1300 },
      { id: "zen-chips", category: "snacks", name: "Чипсы Lays", description: "Пачка 81 г", price: 800 }
    ]
  },
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
