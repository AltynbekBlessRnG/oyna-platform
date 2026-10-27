import type { ClientSegment, ClientSort } from "@oyna/contracts";

export const SEGMENTS: Record<ClientSegment, { label: string; hint: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  vip: { label: "VIP", hint: "топ-10 % по тратам или тег VIP", tone: "warning" },
  regular: { label: "Постоянные", hint: "4+ дня за месяц, были на этой неделе или прошлой", tone: "success" },
  new: { label: "Новые", hint: "впервые пришли за последние 14 дней", tone: "neutral" },
  occasional: { label: "Иногда", hint: "заходят время от времени", tone: "neutral" },
  sleeping: { label: "Спящие", hint: "больше 30 дней без визитов", tone: "neutral" },
  never: { label: "Не приходили", hint: "завели аккаунт или бронировали, но ни разу не были", tone: "neutral" }
};

export const SEGMENT_ORDER: ClientSegment[] = ["vip", "regular", "new", "occasional", "sleeping", "never"];

export const SORTS: { value: ClientSort; label: string }[] = [
  { value: "lastVisit", label: "по последнему визиту" },
  { value: "spent", label: "по тратам" },
  { value: "visits", label: "по числу визитов" },
  { value: "balance", label: "по балансу" },
  { value: "name", label: "по имени" }
];

export function isSegment(value: string | undefined): value is ClientSegment | "risk" {
  return value === "risk" || (value !== undefined && value in SEGMENTS);
}

export function isSort(value: string | undefined): value is ClientSort {
  return SORTS.some((sort) => sort.value === value);
}
