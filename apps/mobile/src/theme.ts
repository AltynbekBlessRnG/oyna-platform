export const colors = {
  background: "#111014",
  surface: "#1A191F",
  surfaceRaised: "#222127",
  border: "#302F36",
  text: "#F8F7FA",
  muted: "#9D9AA5",
  primary: "#B8FF45",
  primaryText: "#172000",
  danger: "#FF795C",
  white: "#FFFFFF",
  // Карта зала: занято — зелёный, свободно — серый, забронировано — голубой.
  seatOccupied: "#39D98A",
  seatFree: "#2C2B33",
  seatReserved: "#4FC3F7"
} as const;

export const seatLegend = [
  { status: "occupied", label: "Занято", color: colors.seatOccupied },
  { status: "free", label: "Свободно", color: colors.seatFree },
  { status: "reserved", label: "Забронировано", color: colors.seatReserved }
] as const;
