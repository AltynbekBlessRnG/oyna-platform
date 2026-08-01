export type ClubStatus = "available" | "busy" | "offline";

export interface ClubSummary {
  id: string;
  name: string;
  address: string;
  city: string;
  distanceKm: number;
  rating: number;
  reviewCount: number;
  priceFrom: number;
  availableSeats: number;
  totalSeats: number;
  status: ClubStatus;
  tags: string[];
  equipment: string;
  accent: string;
}

export interface DashboardMetric {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "flat";
}

export interface BookingSummary {
  id: string;
  playerName: string;
  zone: string;
  seats: number;
  startsAt: string;
  durationHours: number;
  amount: number;
  status: BookingStatus;
}

export interface ClubZone {
  id: string;
  clubId: string;
  name: string;
  description: string;
  pricePerHour: number;
  seatCount: number;
}

export type SeatStatus = "available" | "occupied" | "selected";

export interface SeatAvailability {
  id: string;
  label: string;
  row: string;
  status: Exclude<SeatStatus, "selected">;
}

export interface AvailabilitySnapshot {
  clubId: string;
  zoneId: string;
  startAt: string;
  durationHours: number;
  seats: SeatAvailability[];
}

export interface CreateBookingRequest {
  clubId: string;
  zoneId: string;
  seatIds: string[];
  startAt: string;
  durationHours: number;
  playerName: string;
}

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

export interface BookingReceipt extends CreateBookingRequest {
  id: string;
  status: BookingStatus;
  zoneName: string;
  seatLabels: string[];
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestCodeRequest {
  phone: string;
}

export interface RequestCodeResponse {
  challengeId: string;
  expiresInSeconds: number;
  devCode?: string;
}

export interface VerifyCodeRequest {
  challengeId: string;
  code: string;
  name?: string;
}

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface UpdateBookingStatusRequest {
  status: Extract<BookingStatus, "confirmed" | "cancelled" | "completed">;
}
