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
  phone?: string;
  openingHours?: string;
  /** Фотография клуба для списка и шапки. */
  imageUrl?: string;
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

/** Доступность всего зала на выбранное время: зоны с их ценами и компьютерами. */
export interface ClubAvailabilityZone {
  zone: ClubZone;
  seats: SeatAvailability[];
}

export interface ClubAvailability {
  clubId: string;
  startAt: string;
  durationHours: number;
  zones: ClubAvailabilityZone[];
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
  /** Ссылка на бота, который подтвердит номер без SMS. Нет, если бот не настроен. */
  telegramBotUrl?: string;
}

/** Опрос сессии, пока игрок подтверждает номер в Telegram. */
export interface ChallengeStatusResponse {
  status: "pending" | "verified";
  session?: AuthSession;
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
export interface NotificationItem { id: string; type: "chat_reply" | "team_invite" | "tournament_registration" | "match_scheduled" | "match_result" | "booking_status"; title: string; body: string; href?: string; readAt?: string; createdAt: string; }
export type TournamentStatus = "draft" | "published" | "registration_closed" | "in_progress" | "completed" | "cancelled";
export type RegistrationStatus = "pending" | "approved" | "waitlisted" | "rejected" | "withdrawn";
export interface TeamSummary { id: string; gameId: string; name: string; logoUrl?: string; captainId: string; memberIds: string[]; }
export interface TournamentSummary {
  id: string; clubId: string; gameId: string; name: string; description: string; rules: string; kind: "solo" | "team";
  capacity: 4 | 8 | 16 | 32; status: TournamentStatus; registrationStartsAt: string; registrationEndsAt: string; startsAt: string;
  entryFeeText?: string; prizeText?: string; registeredCount: number; imageUrl?: string;
}
export interface TournamentMatch { id: string; tournamentId: string; round: number; position: number; participantAId?: string; participantBId?: string; scoreA?: number; scoreB?: number; winnerId?: string; status: "pending" | "awaiting_confirmation" | "disputed" | "completed"; }

export interface UpdateClubRequest {
  name?: string;
  address?: string;
  city?: string;
  status?: ClubStatus;
  tags?: string[];
  equipment?: string;
  accent?: string;
  phone?: string;
  openingHours?: string;
}

export interface UpsertZoneRequest {
  id: string;
  name: string;
  description: string;
  pricePerHour: number;
  seatCount: number;
}

export interface ClubAdminView {
  club: ClubSummary;
  zones: ClubZone[];
}

export type ClubMemberRole = "admin" | "moderator";

export interface ClubMember {
  clubId: string;
  userId: string;
  name: string;
  phone: string;
  role: ClubMemberRole;
  createdAt: string;
}

export interface AddClubMemberRequest {
  phone: string;
  name?: string;
  role?: ClubMemberRole;
}

export interface ManagedClub {
  id: string;
  name: string;
  city: string;
  role: ClubMemberRole;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface UpdateBookingStatusRequest {
  status: Extract<BookingStatus, "confirmed" | "cancelled" | "completed">;
}

/** Статус компьютера на живой карте зала. */
export type SeatLiveStatus = "free" | "occupied" | "reserved";

export interface SeatMapSeat {
  id: string;
  label: string;
  row: string;
  status: SeatLiveStatus;
  /** Для занятого места — когда текущая сессия закончится. */
  occupiedUntil?: string;
  /** Для забронированного места — во сколько придёт игрок. */
  reservedFrom?: string;
  /** На компьютере стоит клиент Zen, и он сейчас на связи. Нет — клиента нет. */
  stationOnline?: boolean;
}

export interface SeatMapZone {
  zone: ClubZone;
  seats: SeatMapSeat[];
}

export interface ClubSeatMap {
  clubId: string;
  generatedAt: string;
  zones: SeatMapZone[];
}

export type MenuCategory = "drinks" | "food" | "snacks" | "other";

export interface MenuItem {
  id: string;
  clubId: string;
  category: MenuCategory;
  name: string;
  description: string;
  price: number;
  available: boolean;
  /** Фото позиции. Нет — карточка рисует запасную плашку. */
  imageUrl?: string;
}

export type ClubOrderStatus = "new" | "accepted" | "delivered" | "cancelled";

export interface ClubOrderLine {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ClubOrder {
  id: string;
  clubId: string;
  seatLabel: string;
  lines: ClubOrderLine[];
  total: number;
  status: ClubOrderStatus;
  comment?: string;
  createdAt: string;
}

export interface CreateOrderRequest {
  seatLabel: string;
  comment?: string;
  lines: { itemId: string; quantity: number }[];
}

/** Аккаунт игрока внутри конкретного клуба: свой ник, баланс и накопленные бонусы. */
export interface ClubAccount {
  clubId: string;
  clubName: string;
  nickname: string;
  balance: number;
  bonusPoints: number;
  hoursPlayed: number;
  joinedAt: string;
}

/** Компьютер в зале с установленным клиентом Zen. Привязан к месту на карте зала. */
export interface ClubStation {
  id: string;
  clubId: string;
  seatId: string;
  seatLabel: string;
  zoneId: string;
  name: string;
  /** Клиент сейчас на связи с сервером. */
  online: boolean;
  lastSeenAt?: string;
  createdAt: string;
}

export interface RegisterStationRequest {
  seatId: string;
  name?: string;
}

/** Ключ клиента показывается один раз: на сервере хранится только его хеш. */
export interface StationCredentials {
  station: ClubStation;
  token: string;
}

export type PlaySessionStatus = "active" | "ended";
export type PlaySessionEndReason = "player" | "admin" | "expired" | "station";

/** Игровая сессия за компьютером: время списывается с клубного баланса игрока. */
export interface PlaySession {
  id: string;
  clubId: string;
  seatId: string;
  seatLabel: string;
  zoneId: string;
  zoneName: string;
  userId: string;
  playerName: string;
  /** Последние 4 цифры телефона: касса различает гостей без имени, полный номер на компьютер не уходит. */
  playerPhoneTail?: string;
  pricePerHour: number;
  startedAt: string;
  /** Когда сессия закончится сама: хватает баланса или выбранного времени. */
  endsAt: string;
  status: PlaySessionStatus;
  endedAt?: string;
  endReason?: PlaySessionEndReason;
  /** Списано с баланса по факту, только у завершённой сессии. */
  charged?: number;
}

/** Запуск сессии администратором с кассы. */
export interface StartSessionRequest {
  seatId: string;
  phone: string;
  /** Ограничить время; без него сессия идёт, пока хватает баланса. */
  minutes?: number;
}

/** Игрок сканирует код с экрана компьютера и садится за него. */
export interface ClaimStationRequest {
  code: string;
  minutes?: number;
}

export interface TopUpRequest {
  phone: string;
  amount: number;
}

export interface TopUpResult {
  clubId: string;
  userId: string;
  playerName: string;
  amount: number;
  balance: number;
}

export interface StationLoginCode {
  code: string;
  expiresAt: string;
}

/** Всё, что клиенту на компьютере нужно знать, чтобы заблокировать или открыть экран. */
export interface StationState {
  station: ClubStation;
  session: PlaySession | null;
}

// ---------- CRM клуба ----------

/**
 * Сегмент клиента: VIP — топ-10 % по тратам или тег VIP; постоянный — 4+ дня визитов за 30 дней
 * и был не позже двух недель назад; новый — впервые пришёл за последние 14 дней; спящий — 30+ дней без визитов.
 */
export type ClientSegment = "vip" | "regular" | "new" | "sleeping" | "occasional";

export interface ClubClient {
  userId: string;
  name: string;
  /** Клубный ник; совпадает с именем, если игрок его не менял. */
  nickname: string;
  phone: string;
  balance: number;
  bonusPoints: number;
  tags: string[];
  segment: ClientSegment;
  /** Ходил часто, но пропал на 2+ недели: стоит позвонить или дать бонус. */
  atRisk: boolean;
  firstSeenAt: string;
  lastVisitAt?: string;
  /** Дни, в которые игрок был в клубе: сессия за ПК или подтверждённая бронь. */
  visitDays: number;
  visitDays30: number;
  sessionsCount: number;
  minutesPlayed: number;
  spentOnTime: number;
  spentOnBar: number;
  totalSpent: number;
  toppedUp: number;
  bookingsCount: number;
  cancelledBookings: number;
}

export type ClientSort = "lastVisit" | "spent" | "visits" | "balance" | "name";

export interface ClubClientsResponse {
  clients: ClubClient[];
  total: number;
  segments: Record<ClientSegment, number>;
  atRisk: number;
}

export interface ClientNote {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
}

export type ClientTimelineEntry =
  | { kind: "session"; id: string; at: string; seatLabel: string; zoneName: string; minutes: number; charged?: number; active: boolean }
  | { kind: "balance"; id: string; at: string; amount: number; type: "top_up" | "adjustment"; reason?: string }
  | { kind: "booking"; id: string; at: string; startAt: string; zoneName: string; seatLabels: string[]; durationHours: number; status: BookingStatus }
  | { kind: "order"; id: string; at: string; total: number; status: ClubOrderStatus; summary: string };

export interface ClubClientDetail {
  client: ClubClient;
  notes: ClientNote[];
  timeline: ClientTimelineEntry[];
}

/** Ручная корректировка баланса: возврат, компенсация, исправление ошибки кассы. */
export interface BalanceAdjustmentRequest {
  amount: number;
  reason: string;
}

export interface AnalyticsTotals {
  /** Выручка: оплаченное время плюс бар. */
  revenue: number;
  timeRevenue: number;
  barRevenue: number;
  /** Деньги, которые игроки внесли на балансы. */
  toppedUp: number;
  sessions: number;
  minutesPlayed: number;
  avgSessionMinutes: number;
  uniquePlayers: number;
  newPlayers: number;
  /** Игроки, пришедшие в периоде в два и более разных дня. */
  returningPlayers: number;
  /** Доля занятого машинного времени от круглосуточной ёмкости зала, 0..1. */
  occupancy: number;
}

export interface ClubAnalytics {
  clubId: string;
  days: number;
  from: string;
  to: string;
  totals: AnalyticsTotals;
  /** Тот же показатель за предыдущий период такой же длины. */
  previous: AnalyticsTotals;
  daily: { date: string; timeRevenue: number; barRevenue: number; toppedUp: number; sessions: number }[];
  /** Загрузка по дням недели (1 — понедельник) и часам по времени клуба. */
  heatmap: { weekday: number; hour: number; occupancy: number }[];
  zones: { zoneId: string; zoneName: string; seats: number; minutesPlayed: number; revenue: number; occupancy: number }[];
  topClients: { userId: string; name: string; phone: string; spent: number; minutesPlayed: number; visitDays: number }[];
}
