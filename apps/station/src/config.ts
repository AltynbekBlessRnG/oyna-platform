import { invoke, isTauri } from "@tauri-apps/api/core";

/** С каким клубом и под каким ключом работает этот компьютер. Ключ выдаётся при подключении по коду клуба. */
export interface StationConfig {
  apiUrl: string;
  stationId: string;
  token: string;
  /** SHA-256 PIN администратора: по нему Vence выпускает в обычную Windows. */
  adminPinHash?: string;
}

// В Windows настройки лежат в C:\ProgramData\Vence, общем для всех пользователей: гостевой профиль
// может сбрасываться, а компьютер должен помнить свой клуб. В браузере — localStorage.
const KEY = "zen.station";

export const DEFAULT_API_URL = "https://oyna-api.onrender.com";

export async function loadConfig(): Promise<StationConfig | null> {
  try {
    const raw = isTauri() ? await invoke<string | null>("load_config") : localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StationConfig>) : null;
    return parsed?.apiUrl && parsed.stationId && parsed.token ? (parsed as StationConfig) : null;
  } catch {
    return null;
  }
}

export async function saveConfig(config: StationConfig): Promise<void> {
  const raw = JSON.stringify(config);
  if (isTauri()) return invoke("save_config", { raw });
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // Без хранилища компьютер проработает до перезапуска, потом попросит код клуба снова.
  }
}

export async function clearConfig(): Promise<void> {
  if (isTauri()) return invoke("clear_config");
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего стирать.
  }
}

export async function hashPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`zen-admin:${pin}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
