export const clock = (value: string | number) => new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export const today = (now: number) => new Date(now).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });

export const money = (value: number) => `${value.toLocaleString("ru-RU")} ₸`;

/** «1:12» — часы и минуты; меньше часа — «5 мин», чтобы «0:05» не читалось как секунды. Округляем вверх: «0» не висит, пока идёт последняя минута. */
export function hoursMinutes(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** «1:42» — минуты и секунды для обратного отсчёта кода. */
export function minutesSeconds(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Гостя без имени касса заводит как «Игрок Zen»; на экране его узнают по хвосту номера, как в кабинете. */
export function playerLabel(name: string, phoneTail?: string): string {
  return name === "Игрок Zen" && phoneTail ? `Гость ··${phoneTail}` : name;
}
