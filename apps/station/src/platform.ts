import { invoke, isTauri } from "@tauri-apps/api/core";

/** Игра, найденная на этом компьютере. Без обложки из лаунчера рисуем плитку сами: цвет и надпись. */
export interface InstalledGame {
  id: string;
  name: string;
  launcher: "steam" | "epic" | "riot" | "battlenet" | "other";
  genre?: string;
  logo: string;
  bg: string;
  ink: string;
  /** Обложка из кэша лаунчера, `data:` URL. */
  cover?: string;
}

/**
 * Всё, что экрану нужно от Windows. В браузере работает демо-версия; оболочка для Windows
 * подставит настоящую: найдёт игры в папках Steam, Epic, Riot и Battle.net, запустит их
 * и после сессии закроет игры и выйдет из аккаунтов игрока.
 */
export interface Platform {
  listGames(): Promise<InstalledGame[]>;
  launch(game: InstalledGame): Promise<void>;
  /** Сессия закончилась: закрыть игры, выйти из аккаунтов, стереть данные входа. */
  cleanUp(): Promise<void>;
  /** Свободный компьютер держит Zen поверх всего и закрывает Win, Alt+Tab и Alt+F4. */
  setLocked(locked: boolean): Promise<void>;
  /** После сессии: перезагрузка, «заморозка» клуба стирает следы игрока. */
  restart(): Promise<void>;
  /** Выключение по команде из кабинета, например при закрытии клуба. */
  shutdown(): Promise<void>;
  /** Поднять Zen поверх игры, чтобы игрок увидел сообщение из кабинета. */
  bringToFront(): Promise<void>;
  /** Выйти из Zen в обычную Windows: только после PIN администратора. */
  adminExit(): Promise<void>;
}

export const LAUNCHER_NAMES: Record<InstalledGame["launcher"], string> = {
  steam: "Steam",
  epic: "Epic Games",
  riot: "Riot Client",
  battlenet: "Battle.net",
  other: "ярлык клуба"
};

const DEMO_GAMES: InstalledGame[] = [
  { id: "cs2", name: "Counter-Strike 2", launcher: "steam", genre: "Шутеры", logo: "CS2", bg: "#e8a33d", ink: "#141414" },
  { id: "dota2", name: "Dota 2", launcher: "steam", genre: "MOBA", logo: "DOTA 2", bg: "#8c2a1f", ink: "#f5f5f5" },
  { id: "valorant", name: "Valorant", launcher: "riot", genre: "Шутеры", logo: "VALORANT", bg: "#ef4f5b", ink: "#141414" },
  { id: "pubg", name: "PUBG: Battlegrounds", launcher: "steam", genre: "Королевская битва", logo: "PUBG", bg: "#d9b25f", ink: "#141414" },
  { id: "fortnite", name: "Fortnite", launcher: "epic", genre: "Королевская битва", logo: "FORTNITE", bg: "#5b47d6", ink: "#f5f5f5" },
  { id: "lol", name: "League of Legends", launcher: "riot", genre: "MOBA", logo: "LEAGUE OF LEGENDS", bg: "#123a5c", ink: "#d9b25f" },
  { id: "apex", name: "Apex Legends", launcher: "steam", genre: "Королевская битва", logo: "APEX", bg: "#b8382a", ink: "#f5f5f5" },
  { id: "rl", name: "Rocket League", launcher: "epic", genre: "Спорт", logo: "ROCKET LEAGUE", bg: "#1f5fa8", ink: "#f5f5f5" },
  { id: "ow2", name: "Overwatch 2", launcher: "battlenet", genre: "Шутеры", logo: "OVERWATCH 2", bg: "#f08a24", ink: "#141414" },
  { id: "warface", name: "Warface", launcher: "other", genre: "Шутеры", logo: "WARFACE", bg: "#2f3a2c", ink: "#e5e5e5" },
  { id: "fc25", name: "EA Sports FC 25", launcher: "steam", genre: "Спорт", logo: "FC 25", bg: "#0f5e3a", ink: "#f5f5f5" },
  { id: "gta5", name: "Grand Theft Auto V", launcher: "steam", genre: "Открытый мир", logo: "GTA V", bg: "#3d7a3a", ink: "#f5f5f5" },
  { id: "minecraft", name: "Minecraft", launcher: "other", genre: "Открытый мир", logo: "MINECRAFT", bg: "#6b8f3d", ink: "#141414" },
  { id: "rust", name: "Rust", launcher: "steam", genre: "Открытый мир", logo: "RUST", bg: "#a8452a", ink: "#f5f5f5" },
  { id: "rivals", name: "Marvel Rivals", launcher: "steam", genre: "Шутеры", logo: "MARVEL RIVALS", bg: "#7a1f2b", ink: "#f5f5f5" },
  { id: "deadlock", name: "Deadlock", launcher: "steam", genre: "MOBA", logo: "DEADLOCK", bg: "#4a3b2a", ink: "#e8d9b5" }
];

const demoPlatform: Platform = {
  listGames: async () => DEMO_GAMES,
  launch: async (game) => console.info(`[zen] запуск ${game.name} через ${LAUNCHER_NAMES[game.launcher]}`),
  cleanUp: async () => console.info("[zen] сессия закончилась: игры закрыты, аккаунты игрока разлогинены"),
  setLocked: async () => undefined,
  restart: async () => console.info("[zen] перезагрузка компьютера"),
  shutdown: async () => console.info("[zen] выключение компьютера"),
  bringToFront: async () => undefined,
  adminExit: async () => console.info("[zen] выход в Windows")
};

/** Оболочка Windows (`src-tauri`): настоящие игры с диска. */
const windowsPlatform: Platform = {
  listGames: () => invoke<InstalledGame[]>("list_games"),
  launch: (game) => invoke("launch_game", { game }),
  cleanUp: () => invoke("clean_up"),
  setLocked: (locked) => invoke("set_locked", { locked }),
  restart: () => invoke("restart_computer"),
  shutdown: () => invoke("shutdown_computer"),
  bringToFront: () => invoke("bring_to_front"),
  adminExit: () => invoke("admin_exit")
};

export const platform: Platform = isTauri() ? windowsPlatform : demoPlatform;
