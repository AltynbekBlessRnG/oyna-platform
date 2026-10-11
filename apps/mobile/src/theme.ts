/**
 * Нейтральный тёмный зал и одно золото, как на флаге.
 * Золото значит одно — «это можно взять» или «это твоё». Больше им ничего не красим.
 */
export const colors = {
  background: "#141414",
  surface: "#1E1E1E",
  surfaceRaised: "#282828",
  border: "#333333",
  text: "#F2F2F2",
  muted: "#9E9E9E",
  primary: "#FFC83D",
  primaryText: "#2B1F00",
  danger: "#FF6B81",
  white: "#FFFFFF",
  // Карта зала: свободный компьютер светится золотым контуром, занятый гаснет.
  seatFree: "#FFC83D",
  seatOccupied: "#282828",
  seatReserved: "#5C5C5C"
} as const;

/** Unbounded — для того, что считают и ищут глазами: цифры, места, время, заголовки. Onest — для всего остального. */
export const fonts = {
  display: "Unbounded_600SemiBold",
  displayBold: "Unbounded_700Bold",
  body: "Onest_400Regular",
  medium: "Onest_500Medium",
  semibold: "Onest_600SemiBold",
  bold: "Onest_700Bold"
} as const;

/** Скругления по иерархии: чем крупнее и самостоятельнее блок, тем мягче угол. */
export const radii = {
  seat: 6,
  control: 12,
  card: 18
} as const;

export const seatLegend = [
  { status: "free", label: "Свободен" },
  { status: "occupied", label: "Занят" },
  { status: "reserved", label: "Бронь" }
] as const;
