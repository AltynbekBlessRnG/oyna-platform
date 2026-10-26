const MONEY = new Intl.NumberFormat("ru-KZ");
const TIME_ZONE = "Asia/Almaty";
/** Имя, которое касса ставит гостю без имени: такого игрока различаем по номеру. */
export const DEFAULT_PLAYER_NAME = "Игрок Zen";

export function money(amount: number): string {
  return `${MONEY.format(amount)} ₸`;
}

export function number(value: number): string {
  return MONEY.format(value);
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
}

export function day(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: TIME_ZONE });
}

export function dayTime(iso: string): string {
  return `${day(iso)}, ${clock(iso)}`;
}

export function duration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} мин`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

export function minutesUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 60_000));
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** +7 701 234 56 78 */
export function phone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
}

/** Гость без имени показывается по хвосту номера, гость с именем — именем. */
export function playerLabel(name: string, phoneTail?: string): string {
  if (name === DEFAULT_PLAYER_NAME || !name.trim()) return phoneTail ? `Гость ··${phoneTail}` : "Гость";
  return name;
}

/** Ник клиента для CRM: гостя без имени кассир узнаёт по хвосту номера. */
export function clientName(nickname: string, phoneNumber: string): string {
  return playerLabel(nickname, phoneNumber.replace(/\D/g, "").slice(-4));
}

/** «сегодня», «вчера», «5 дней назад», «12 марта» — для давности визита. */
export function ago(iso: string | undefined, now: number): string {
  if (!iso) return "ещё не был";
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 30) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  return day(iso);
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
