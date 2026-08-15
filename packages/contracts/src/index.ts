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
  role: UserRole;
}

export type UserRole = "player" | "club_admin" | "moderator" | "platform_admin";

export interface GameSummary { id: string; slug: string; name: string; steamAppId?: number; teamSize: number; active: boolean; }
export interface PlayerProfile {
  id: string; nickname: string; name: string; avatarUrl?: string; city?: string; bio?: string; favoriteGameIds: string[];
  visibility: { city: boolean; steam: boolean; analytics: boolean };
  steam?: { steamId: string; personaName?: string; avatarUrl?: string; profileUrl?: string; isPublic: boolean; playtimeMinutes?: number; syncedAt?: string };
  analytics: { completedBookings: number; clubHours: number; tournaments: number; matches: number; wins: number; podiums: number };
}
export interface UpdateProfileRequest { nickname?: string; avatarUrl?: string; city?: string; bio?: string; favoriteGameIds?: string[]; visibility?: Partial<PlayerProfile["visibility"]>; }
export interface ChatChannel { id: string; gameId: string; scope: "country" | "city"; city?: string; name: string; }
export interface ChatMessage {
  id: string; channelId: string; author: Pick<PlayerProfile, "id" | "nickname" | "avatarUrl">; text: string;
  replyToId?: string; imageUrl?: string; deletedAt?: string; createdAt: string;
}
export interface NotificationItem { id: string; type: "chat_reply" | "team_invite" | "tournament_registration" | "match_scheduled" | "match_result"; title: string; body: string; href?: string; readAt?: string; createdAt: string; }
export type TournamentStatus = "draft" | "published" | "registration_closed" | "in_progress" | "completed" | "cancelled";
export type RegistrationStatus = "pending" | "approved" | "waitlisted" | "rejected" | "withdrawn";
export interface TeamSummary { id: string; gameId: string; name: string; logoUrl?: string; captainId: string; memberIds: string[]; }
export interface TournamentSummary {
  id: string; clubId: string; gameId: string; name: string; description: string; rules: string; kind: "solo" | "team";
  capacity: 4 | 8 | 16 | 32; status: TournamentStatus; registrationStartsAt: string; registrationEndsAt: string; startsAt: string;
  entryFeeText?: string; prizeText?: string; registeredCount: number;
}
export interface TournamentMatch { id: string; tournamentId: string; round: number; position: number; participantAId?: string; participantBId?: string; scoreA?: number; scoreB?: number; winnerId?: string; status: "pending" | "awaiting_confirmation" | "disputed" | "completed"; }

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface UpdateBookingStatusRequest {
  status: Extract<BookingStatus, "confirmed" | "cancelled" | "completed">;
}
