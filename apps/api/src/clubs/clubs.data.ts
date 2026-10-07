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
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Lan%20party-lan-arena-7.jpg?width=900",
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
      openingHours: "Круглосуточно",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Winter%202004%20DreamHack%20LAN%20Party.jpg?width=900"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 · 180 Hz", pricePerHour: 900, seatCount: 12 },
      { id: "vip", name: "VIP", description: "RTX 4070 · 240 Hz", pricePerHour: 1400, seatCount: 8 },
      { id: "bootcamp", name: "Bootcamp", description: "Закрытая комната · 5 мест", pricePerHour: 1800, seatCount: 5 }
    ],
    menu: [
      { id: "vx-espresso", category: "drinks", name: "Эспрессо", description: "Двойной", price: 600, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900" },
      { id: "vx-energy", category: "drinks", name: "Энергетик", description: "0.45 л", price: 900, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900" },
      { id: "vx-lemonade", category: "drinks", name: "Лимонад", description: "0.4 л", price: 1000, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Mint_lemonade_in_summer.jpg?width=900" },
      { id: "vx-burger", category: "food", name: "Бургер", description: "Говядина, чеддер", price: 2300, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Cheeseburger.jpg?width=900" },
      { id: "vx-shawarma", category: "food", name: "Шаурма", description: "Курица, 350 г", price: 1900, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Shawarma-sandwich-01.jpg?width=900" },
      { id: "vx-fries", category: "snacks", name: "Картофель фри", description: "Средняя порция", price: 1100, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hesburger_French_fries_on_a_plate.jpg?width=900" },
      { id: "vx-chips", category: "snacks", name: "Чипсы", description: "Пачка 81 г", price: 700, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chips_in_a_bowl_at_a_party.JPG?width=900" },
      { id: "vx-pizza", category: "food", name: "Пицца пепперони", description: "30 см", price: 3400, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Pepperoni_Pizza_-_Greggs_2024-03-16.jpg?width=900" }
    ],
    tournaments: [
      {
        id: "vertex-cs2-weekly",
        gameId: "cs2",
        name: "Vertex Weekly CS2",
        description: "Еженедельный командный турнир на буткемп-зоне. Играем каждую субботу.",
        rules: "MR12, двойное выбывание. Состав подтверждается за 30 минут до старта.",
        kind: "team",
        capacity: 16,
        entryFeeText: "6 000 ₸ с команды",
        prizeText: "200 000 ₸",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Johor%20Esports%20Festival%202022.jpg?width=900",
        startsInDays: 6,
        registrationClosesInDays: 5
      },
      {
        id: "vertex-valorant",
        gameId: "valorant",
        name: "Vertex Valorant Cup",
        description: "Соло-турнир с жеребьёвкой составов на месте.",
        rules: "Bo1 в группе, Bo3 в плей-офф.",
        kind: "solo",
        capacity: 32,
        entryFeeText: "1 500 ₸",
        prizeText: "80 000 ₸",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/RGB%20gaming%20headset%20on%20desk%20with%20ambient%20lighting.jpg?width=900",
        startsInDays: 12,
        registrationClosesInDays: 10
      }
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
      openingHours: "10:00 — 04:00",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Internet%20caf%C3%A9%20in%20Berlin.jpg?width=900"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 Ti · 180 Hz", pricePerHour: 700, seatCount: 10 },
      { id: "vip", name: "VIP", description: "RTX 4070 · 240 Hz", pricePerHour: 1100, seatCount: 6 }
    ],
    menu: [
      { id: "qz-espresso", category: "drinks", name: "Эспрессо", description: "Двойной", price: 600, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900" },
      { id: "qz-energy", category: "drinks", name: "Энергетик", description: "0.45 л", price: 900, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900" },
      { id: "qz-lemonade", category: "drinks", name: "Лимонад", description: "0.4 л", price: 1000, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Mint_lemonade_in_summer.jpg?width=900" },
      { id: "qz-burger", category: "food", name: "Бургер", description: "Говядина, чеддер", price: 2300, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Cheeseburger.jpg?width=900" },
      { id: "qz-shawarma", category: "food", name: "Шаурма", description: "Курица, 350 г", price: 1900, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Shawarma-sandwich-01.jpg?width=900" },
      { id: "qz-fries", category: "snacks", name: "Картофель фри", description: "Средняя порция", price: 1100, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hesburger_French_fries_on_a_plate.jpg?width=900" },
      { id: "qz-chips", category: "snacks", name: "Чипсы", description: "Пачка 81 г", price: 700, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chips_in_a_bowl_at_a_party.JPG?width=900" },
      { id: "qz-doner", category: "food", name: "Денер", description: "Говядина, лаваш", price: 2100, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Doner%20kebap200505.jpg?width=900" }
    ],
    tournaments: [
      {
        id: "qazaq-dota-cup",
        gameId: "dota2",
        name: "Qazaq Dota Cup",
        description: "Турнир выходного дня для команд из пяти человек.",
        rules: "Captains Mode, Bo2 в группе, Bo3 в финале.",
        kind: "team",
        capacity: 8,
        entryFeeText: "5 000 ₸ с команды",
        prizeText: "150 000 ₸",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/LoL_Worlds_2020_Stage_-_01.jpg?width=900",
        startsInDays: 9,
        registrationClosesInDays: 7
      }
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
      openingHours: "Круглосуточно",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/41-Internet%20Cafe.jpg?width=900"
    },
    zones: [{ id: "standard", name: "Standard", description: "RTX 3060 · 165 Hz", pricePerHour: 600, seatCount: 10 }],
    menu: [
      { id: "rp-espresso", category: "drinks", name: "Американо", description: "0.3 л", price: 500, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900" },
      { id: "rp-energy", category: "drinks", name: "Энергетик", description: "0.45 л", price: 850, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900" },
      { id: "rp-hotdog", category: "food", name: "Хот-дог", description: "Классический", price: 1200, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hot%20dog%2001.jpg?width=900" },
      { id: "rp-shawarma", category: "food", name: "Шаурма", description: "Курица, 350 г", price: 1800, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Shawarma-sandwich-01.jpg?width=900" },
      { id: "rp-nuggets", category: "snacks", name: "Наггетсы", description: "6 штук", price: 1400, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chicken_nuggets_on_a_plate.jpg?width=900" },
      { id: "rp-chips", category: "snacks", name: "Чипсы", description: "Пачка 81 г", price: 700, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chips_in_a_bowl_at_a_party.JPG?width=900" }
    ]
  },
  {
    club: {
      id: "nomad-esports",
      name: "Nomad Esports",
      address: "пр. Мангилик Ел, 55",
      city: "Астана",
      distanceKm: 0.0,
      rating: 4.9,
      reviewCount: 287,
      status: "available",
      tags: ["24/7", "VIP", "Турниры", "Бар"],
      equipment: "RTX 4080 · 360 Hz",
      accent: "#ffb347",
      openingHours: "Круглосуточно",
      phone: "+7 701 000 00 11",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Esports%20at%20movistar%20arena%20buenosaires.jpg?width=900"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 Ti · 27″ · 180 Hz", pricePerHour: 800, seatCount: 18 },
      { id: "pro", name: "Pro", description: "RTX 4070 Ti · 27″ · 240 Hz", pricePerHour: 1200, seatCount: 14 },
      { id: "vip", name: "VIP", description: "RTX 4080 · 27″ · 360 Hz", pricePerHour: 1900, seatCount: 8 }
    ],
    menu: [
      { id: "nm-espresso", category: "drinks", name: "Эспрессо", description: "Двойной", price: 600, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900" },
      { id: "nm-energy", category: "drinks", name: "Энергетик", description: "0.45 л", price: 900, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900" },
      { id: "nm-lemonade", category: "drinks", name: "Лимонад", description: "0.4 л", price: 1000, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Mint_lemonade_in_summer.jpg?width=900" },
      { id: "nm-burger", category: "food", name: "Бургер", description: "Говядина, чеддер", price: 2300, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Cheeseburger.jpg?width=900" },
      { id: "nm-fries", category: "snacks", name: "Картофель фри", description: "Средняя порция", price: 1100, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hesburger_French_fries_on_a_plate.jpg?width=900" },
      { id: "nm-chips", category: "snacks", name: "Чипсы", description: "Пачка 81 г", price: 700, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chips_in_a_bowl_at_a_party.JPG?width=900" },
      { id: "nm-caesar", category: "food", name: "Цезарь", description: "С курицей, 250 г", price: 2300, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Caesar_salad_with_chicken%2C_homemade_-_Massachusetts.jpg?width=900" },
      { id: "nm-doner", category: "food", name: "Денер", description: "Говядина", price: 2100, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Doner%20kebap200505.jpg?width=900" }
    ],
    tournaments: [
      {
        id: "nomad-cs2-major",
        gameId: "cs2",
        name: "Nomad Major: CS2",
        description: "Главный турнир клуба. Команды из Астаны и Алматы, сетка на 16.",
        rules: "MR12, двойное выбывание, финал Bo3. Регистрация закрывается за двое суток.",
        kind: "team",
        capacity: 16,
        entryFeeText: "10 000 ₸ с команды",
        prizeText: "500 000 ₸",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Iskandar%20Investment%20Esports%20Carnival%202019.jpg?width=900",
        startsInDays: 11,
        registrationClosesInDays: 9
      },
      {
        id: "nomad-dota-open",
        gameId: "dota2",
        name: "Nomad Dota Open",
        description: "Открытый соло-турнир, составы собираются на месте.",
        rules: "Captains Mode, Bo1 до полуфинала.",
        kind: "solo",
        capacity: 32,
        entryFeeText: "2 000 ₸",
        prizeText: "100 000 ₸",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/LoL_Worlds_2020_Stage_-_01.jpg?width=900",
        startsInDays: 5,
        registrationClosesInDays: 4
      }
    ]
  },
  {
    club: {
      id: "aim-lab-almaty",
      name: "Aim Lab",
      address: "ул. Сатпаева, 90",
      city: "Алматы",
      distanceKm: 1.9,
      rating: 4.6,
      reviewCount: 134,
      status: "available",
      tags: ["Тренировки", "PS5", "Парковка"],
      equipment: "RTX 4060 · 240 Hz",
      accent: "#45e08a",
      openingHours: "09:00 — 03:00",
      phone: "+7 701 000 00 22",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/LAN%20party%20example.jpg?width=900"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 · 24″ · 240 Hz", pricePerHour: 650, seatCount: 14 },
      { id: "ps5", name: "PlayStation 5", description: "PS5 · телевизор 55″", pricePerHour: 1600, seatCount: 3 }
    ],
    menu: [
      { id: "al-espresso", category: "drinks", name: "Эспрессо", description: "Двойной", price: 600, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900" },
      { id: "al-energy", category: "drinks", name: "Энергетик", description: "0.45 л", price: 900, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900" },
      { id: "al-lemonade", category: "drinks", name: "Лимонад", description: "0.4 л", price: 1000, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Mint_lemonade_in_summer.jpg?width=900" },
      { id: "al-burger", category: "food", name: "Бургер", description: "Говядина, чеддер", price: 2300, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Cheeseburger.jpg?width=900" },
      { id: "al-fries", category: "snacks", name: "Картофель фри", description: "Средняя порция", price: 1100, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hesburger_French_fries_on_a_plate.jpg?width=900" },
      { id: "al-chips", category: "snacks", name: "Чипсы", description: "Пачка 81 г", price: 700, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chips_in_a_bowl_at_a_party.JPG?width=900" },
      { id: "al-hotdog", category: "food", name: "Хот-дог", description: "Классический", price: 1200, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hot%20dog%2001.jpg?width=900" }
    ],
    tournaments: [
      {
        id: "aimlab-valorant",
        gameId: "valorant",
        name: "Aim Lab Valorant Night",
        description: "Ночной турнир для соло-игроков. Отдельная сетка для новичков.",
        rules: "Bo1 в группе, Bo3 в финале. Овертайм до разницы в два раунда.",
        kind: "solo",
        capacity: 16,
        entryFeeText: "Бесплатно",
        prizeText: "40 000 ₸ и мерч",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/RGB%20gaming%20headset%20on%20desk%20with%20ambient%20lighting.jpg?width=900",
        startsInDays: 8,
        registrationClosesInDays: 7
      }
    ]
  },
  {
    club: {
      id: "steppe-wolves",
      name: "Steppe Wolves",
      address: "пр. Тауке хана, 18",
      city: "Шымкент",
      distanceKm: 0.0,
      rating: 4.5,
      reviewCount: 72,
      status: "available",
      tags: ["24/7", "Кухня", "Турниры"],
      equipment: "RTX 4060 · 165 Hz",
      accent: "#ff6b9d",
      openingHours: "Круглосуточно",
      phone: "+7 701 000 00 33",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Private%20LAN%20party%20in%20Norway.JPG?width=900"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 4060 · 24″ · 165 Hz", pricePerHour: 550, seatCount: 16 },
      { id: "pro", name: "Pro", description: "RTX 4070 · 27″ · 240 Hz", pricePerHour: 950, seatCount: 8 }
    ],
    menu: [
      { id: "sw-espresso", category: "drinks", name: "Американо", description: "0.3 л", price: 450, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900" },
      { id: "sw-latte", category: "drinks", name: "Латте", description: "0.3 л", price: 800, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Caffe_Latte_at_Pulse_Cafe.jpg?width=900" },
      { id: "sw-energy", category: "drinks", name: "Энергетик", description: "0.45 л", price: 800, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900" },
      { id: "sw-shawarma", category: "food", name: "Шаурма", description: "Курица, 350 г", price: 1600, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Shawarma-sandwich-01.jpg?width=900" },
      { id: "sw-pizza", category: "food", name: "Пицца пепперони", description: "25 см", price: 2800, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Pepperoni_Pizza_-_Greggs_2024-03-16.jpg?width=900" },
      { id: "sw-fries", category: "snacks", name: "Картофель фри", description: "Большая порция", price: 1000, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Hesburger_French_fries_on_a_plate.jpg?width=900" }
    ],
    tournaments: [
      {
        id: "wolves-cs2",
        gameId: "cs2",
        name: "Steppe Cup",
        description: "Городской турнир Шымкента. Призовой фонд собирается из взносов.",
        rules: "MR12, одиночное выбывание, финал Bo3.",
        kind: "team",
        capacity: 8,
        entryFeeText: "4 000 ₸ с команды",
        prizeText: "120 000 ₸",
        imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Johor%20Esports%20Festival%202022.jpg?width=900",
        startsInDays: 16,
        registrationClosesInDays: 14
      }
    ]
  },
  {
    club: {
      id: "pixel-house",
      name: "Pixel House",
      address: "ул. Бухар жырау, 47",
      city: "Караганда",
      distanceKm: 0.0,
      rating: 4.4,
      reviewCount: 58,
      status: "busy",
      tags: ["PS5", "Кухня"],
      equipment: "RTX 3070 · 165 Hz",
      accent: "#7cc4ff",
      openingHours: "10:00 — 02:00",
      phone: "+7 701 000 00 44",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/LAN%20party%20in%20France%20in%202003.jpg?width=900"
    },
    zones: [
      { id: "standard", name: "Standard", description: "RTX 3070 · 24″ · 165 Hz", pricePerHour: 500, seatCount: 12 },
      { id: "ps5", name: "PlayStation 5", description: "PS5 · телевизор 50″", pricePerHour: 1400, seatCount: 2 }
    ],
    menu: [
      { id: "px-espresso", category: "drinks", name: "Эспрессо", description: "Двойной", price: 500, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Espresso_Coffee_01.jpg?width=900" },
      { id: "px-energy", category: "drinks", name: "Энергетик", description: "0.45 л", price: 800, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Energy_Drink_Battery_Cans.jpg?width=900" },
      { id: "px-burger", category: "food", name: "Бургер", description: "Говядина, чеддер", price: 2000, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Cheeseburger.jpg?width=900" },
      { id: "px-nuggets", category: "snacks", name: "Наггетсы", description: "8 штук", price: 1500, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chicken_nuggets_on_a_plate.jpg?width=900" },
      { id: "px-chips", category: "snacks", name: "Чипсы", description: "Пачка 81 г", price: 650, imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Chips_in_a_bowl_at_a_party.JPG?width=900" }
    ]
  }
];
