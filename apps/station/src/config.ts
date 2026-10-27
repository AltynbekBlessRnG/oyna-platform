/** С каким клубом и под каким ключом работает этот компьютер. Ключ выдаёт кабинет при подключении места. */
export interface StationConfig {
  apiUrl: string;
  stationId: string;
  token: string;
}

// В браузере настройки живут в localStorage. Оболочка для Windows будет хранить их
// в файле, доступном только администратору, и отдавать через тот же интерфейс.
const KEY = "zen.station";

export const DEFAULT_API_URL = "https://oyna-api.onrender.com";

export function loadConfig(): StationConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StationConfig>) : null;
    return parsed?.apiUrl && parsed.stationId && parsed.token ? (parsed as StationConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(config: StationConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Без хранилища компьютер проработает до перезапуска, потом попросит ключ снова.
  }
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего стирать.
  }
}
