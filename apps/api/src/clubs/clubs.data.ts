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
  /** Турниры клуба. Даты заданы сдвигом в днях, чтобы витрина не протухала. */
  tournaments?: CatalogTournament[];
}

export interface CatalogTournament {
  id: string;
  gameId: string;
  name: string;
  description: string;
  rules: string;
  kind: "solo" | "team";
  capacity: 4 | 8 | 16 | 32;
  entryFeeText?: string;
  prizeText?: string;
  imageUrl?: string;
  /** Через сколько дней от сегодня стартует турнир и закрывается регистрация. */
  startsInDays: number;
  registrationClosesInDays: number;
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
      { id: "zen-espresso", category: "drinks", name: "Эспрессо", description: "Двойной, зерно Kimbo", price: 700, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900"},
      { id: "zen-latte", category: "drinks", name: "Латте", description: "300 мл", price: 1100, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Caffe_Latte_at_Pulse_Cafe.jpg?width=900"},
      { id: "zen-energy", category: "drinks", name: "Энергетик", description: "Red Bull 0.35 л", price: 900, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900"},
      { id: "zen-lemonade", category: "drinks", name: "Домашний лимонад", description: "0.4 л, лимон-мята", price: 1200, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Mint_lemonade_in_summer.jpg?width=900"},
      { id: "zen-burger", category: "food", name: "Чизбургер", description: "Говядина, чеддер, соус Zen", price: 2600, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Cheeseburger.jpg?width=900"},
      { id: "zen-caesar", category: "food", name: "Цезарь с курицей", description: "Классический, 250 г", price: 2400, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Caesar_salad_with_chicken%2C_homemade_-_Massachusetts.jpg?width=900"},
      { id: "zen-pizza", category: "food", name: "Пицца пепперони", description: "25 см", price: 3200, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Pepperoni_Pizza_-_Greggs_2024-03-16.jpg?width=900"},
      { id: "zen-nuggets", category: "snacks", name: "Наггетсы", description: "8 штук, соус на выбор", price: 1800, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chicken_nuggets_on_a_plate.jpg?width=900"},
      { id: "zen-fries", category: "snacks", name: "Картофель фри", description: "Большая порция", price: 1300, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hesburger_French_fries_on_a_plate.jpg?width=900"},
      { id: "zen-chips", category: "snacks", name: "Чипсы Lays", description: "Пачка 81 г", price: 800, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chips_in_a_bowl_at_a_party.JPG?width=900"}
    ],
    tournaments: [
      {
        id: "zen-cs2-cup",
        gameId: "cs2",
        name: "Zen Cup: Counter-Strike 2",
        description: "Командный турнир 5×5 на машинах VIP-зоны. Формат — двойное выбывание, карты по правилам Active Duty.",
        rules: "MR12, овертайм MR3. Капитан подтверждает состав за 30 минут до старта. Опоздание больше 10 минут — техническое поражение.",
        kind: "team",
        capacity: 8,
        entryFeeText: "8 000 ₸ с команды",
        prizeText: "300 000 ₸",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/ApEX_during_Vitality%27s_victory_at_Blast_Paris_Major_2023_%28cropped%29.jpg?width=900",
        startsInDays: 9,
        registrationClosesInDays: 7
      },
      {
        id: "zen-dota-night",
        gameId: "dota2",
        name: "Ночь Dota 2",
        description: "Ночной турнир для соло-игроков: жеребьёвка составов на месте, играем до последней команды.",
        rules: "Captains Mode, bo1 до финала, финал bo3. Составы формируются рандомом среди зарегистрированных.",
        kind: "solo",
        capacity: 32,
        entryFeeText: "2 000 ₸",
        prizeText: "120 000 ₸ + месяц Pro-зоны",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/LoL_Worlds_2020_Stage_-_01.jpg?width=900",
        startsInDays: 4,
        registrationClosesInDays: 3
      },
      {
        id: "zen-valorant-open",
        gameId: "valorant",
        name: "VALORANT Open",
        description: "Открытый турнир выходного дня. Новичкам отдельная сетка, ставим на Pro-зону.",
        rules: "Bo1 в группе, Bo3 в плей-офф. Overtime до разницы в два раунда.",
        kind: "solo",
        capacity: 16,
        entryFeeText: "Бесплатно",
        prizeText: "50 000 ₸ и мерч клуба",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/RGB_gaming_headset_on_desk_with_ambient_lighting.jpg?width=900",
        startsInDays: 14,
        registrationClosesInDays: 12
      }
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
