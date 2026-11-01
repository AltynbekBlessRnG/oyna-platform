export const clock = (value: string | number) => new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export const today = (now: number) => new Date(now).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });

export const money = (value: number) => `${value.toLocaleString("ru-RU")} ₸`;

/** «1:12» — часы и минуты; меньше часа — «5 мин», чтобы «0:05» не читалось как секунды. Округляем вверх: «0» не висит, пока идёт последняя минута. */
export function hoursMinutes(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export const longDay = (now: number) => new Date(now).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

/**
 * Час и дата по времени клуба: весь Казахстан живёт по UTC+5. Сдвигаем сами и форматируем как UTC,
 * чтобы не зависеть от часового пояса Windows и от старых таблиц поясов, где Алматы ещё в UTC+6.
 */
const CLUB_OFFSET_MS = 5 * 3_600_000;
const inClub = (value: string | number) => new Date(new Date(value).getTime() + CLUB_OFFSET_MS);

export const clubClock = (value: string | number) => inClub(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export const clubDay = (value: string | number) => inClub(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

/** «5 ч», «1 ч 30 мин», «45 мин». */
export function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** plural(3, ["игра", "игры", "игр"]) → «игры». */
export function plural(count: number, [one, few, many]: [string, string, string]): string {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  return ones === 1 ? one : ones >= 2 && ones <= 4 ? few : many;
}

/** «1:42» — минуты и секунды для обратного отсчёта кода. */
export function minutesSeconds(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Гостя без имени касса заводит как «Игрок Vence»; на экране его узнают по хвосту номера, как в кабинете. */
export function playerLabel(name: string, phoneTail?: string): string {
  return name === "Игрок Vence" && phoneTail ? `Гость ··${phoneTail}` : name;
}
