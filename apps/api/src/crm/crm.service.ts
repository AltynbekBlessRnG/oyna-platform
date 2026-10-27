import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type {
  AnalyticsTotals,
  AuthUser,
  BookingStatus,
  ClientNote,
  ClientSegment,
  ClientSort,
  ClientTimelineEntry,
  ClubAnalytics,
  ClubClient,
  ClubClientDetail,
  ClubClientsResponse,
  ClubOrderLine,
  ClubOrderStatus
} from "@oyna/contracts";
import { randomUUID } from "node:crypto";
import { ClubHallService } from "../clubs/club-hall.service";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";

/** Весь Казахстан живёт по UTC+5: дни и часы в отчётах считаются по времени клуба. */
export const CLUB_TIME_ZONE = "Asia/Almaty";
const CLUB_UTC_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
const ANALYTICS_PERIODS = [7, 30, 90] as const;
const MAX_TAGS = 10;
const MAX_ADJUSTMENT = 1_000_000;

interface ClientRow {
  user_id: string;
  name: string;
  phone: string;
  nickname: string | null;
  balance: number;
  bonus_points: number;
  tags: string[];
  first_seen_at: Date | string;
  last_visit_at: Date | string | null;
  visit_days: number;
  visit_days_30: number;
  sessions_count: number;
  minutes_played: number;
  spent_on_time: number;
  spent_on_bar: number;
  topped_up: number;
  bookings_count: number;
  cancelled_bookings: number;
}

/**
 * Все, кто хоть раз взаимодействовал с клубом: открыл клубный аккаунт, бронировал,
 * сидел за компьютером или заказывал в баре. Агрегаты считаются по всем источникам сразу.
 * $1 — клуб, $2 — часовой пояс клуба.
 */
const CLIENTS_SQL = `
WITH seen AS (
  SELECT user_id, created_at AS at FROM club_accounts WHERE club_id = $1
  UNION ALL SELECT user_id, created_at FROM bookings WHERE club_id = $1
  UNION ALL SELECT user_id, started_at FROM play_sessions WHERE club_id = $1
  UNION ALL SELECT user_id, created_at FROM club_orders WHERE club_id = $1
),
first_seen AS (SELECT user_id, MIN(at) AS first_seen_at FROM seen GROUP BY user_id),
visits AS (
  SELECT user_id, started_at AS at FROM play_sessions WHERE club_id = $1
  UNION ALL
  SELECT user_id, start_at FROM bookings WHERE club_id = $1 AND status IN ('confirmed', 'completed') AND start_at <= NOW()
),
visit_stats AS (
  SELECT user_id,
         COUNT(DISTINCT (at AT TIME ZONE $2)::date)::int AS visit_days,
         COUNT(DISTINCT (at AT TIME ZONE $2)::date) FILTER (WHERE at > NOW() - INTERVAL '30 days')::int AS visit_days_30,
         MAX(at) AS last_visit_at
  FROM visits GROUP BY user_id
),
session_stats AS (
  SELECT user_id, COUNT(*)::int AS sessions_count,
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, LEAST(NOW(), ends_at)) - started_at)) / 60), 0)::int AS minutes_played,
         COALESCE(SUM(charged), 0)::int AS spent_on_time
  FROM play_sessions WHERE club_id = $1 GROUP BY user_id
),
order_stats AS (
  SELECT user_id, COALESCE(SUM(total), 0)::int AS spent_on_bar FROM club_orders WHERE club_id = $1 AND status <> 'cancelled' GROUP BY user_id
),
booking_stats AS (
  SELECT user_id, COUNT(*)::int AS bookings_count, COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_bookings
  FROM bookings WHERE club_id = $1 GROUP BY user_id
),
topup_stats AS (
  SELECT user_id, COALESCE(SUM(amount), 0)::int AS topped_up FROM club_balance_transactions WHERE club_id = $1 AND kind = 'top_up' GROUP BY user_id
)
SELECT f.user_id, u.name, u.phone, a.nickname,
       COALESCE(a.balance, 0) AS balance, COALESCE(a.bonus_points, 0) AS bonus_points, COALESCE(a.tags, '{}') AS tags,
       f.first_seen_at, v.last_visit_at,
       COALESCE(v.visit_days, 0) AS visit_days, COALESCE(v.visit_days_30, 0) AS visit_days_30,
       COALESCE(s.sessions_count, 0) AS sessions_count, COALESCE(s.minutes_played, 0) AS minutes_played,
       COALESCE(s.spent_on_time, 0) AS spent_on_time, COALESCE(o.spent_on_bar, 0) AS spent_on_bar,
       COALESCE(t.topped_up, 0) AS topped_up,
       COALESCE(b.bookings_count, 0) AS bookings_count, COALESCE(b.cancelled_bookings, 0) AS cancelled_bookings
FROM first_seen f
JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL AND u.role <> 'platform_admin'
LEFT JOIN club_accounts a ON a.club_id = $1 AND a.user_id = f.user_id
LEFT JOIN visit_stats v ON v.user_id = f.user_id
LEFT JOIN session_stats s ON s.user_id = f.user_id
LEFT JOIN order_stats o ON o.user_id = f.user_id
LEFT JOIN booking_stats b ON b.user_id = f.user_id
LEFT JOIN topup_stats t ON t.user_id = f.user_id
-- Сотрудники клуба — не клиенты: их тестовые брони и пополнения не должны попадать в CRM.
WHERE NOT EXISTS (SELECT 1 FROM club_memberships m WHERE m.club_id = $1 AND m.user_id = f.user_id)
`;

/**
 * CRM для владельца клуба: кто ходит, сколько тратит, кто пропал, и как загружен зал.
 * Работает только поверх PostgreSQL: временное хранилище в памяти теряет историю при перезапуске.
 */
@Injectable()
export class CrmService {
  constructor(
    private readonly database: DatabaseService,
    private readonly clubs: ClubsService,
    private readonly hall: ClubHallService
  ) {}

  async listClients(
    clubId: string,
    options: { search?: string; segment?: ClientSegment | "risk"; sort?: ClientSort } = {},
    now = Date.now()
  ): Promise<ClubClientsResponse> {
    const all = await this.loadClients(clubId, now);
    const segments: Record<ClientSegment, number> = { vip: 0, regular: 0, new: 0, sleeping: 0, occasional: 0, never: 0 };
    for (const client of all) segments[client.segment] += 1;

    const query = options.search?.trim().toLowerCase() ?? "";
    const digits = query.replace(/\D/g, "");
    const filtered = all.filter((client) => {
      if (options.segment === "risk" && !client.atRisk) return false;
      if (options.segment && options.segment !== "risk" && client.segment !== options.segment) return false;
      if (!query) return true;
      const text = `${client.name} ${client.nickname} ${client.tags.join(" ")}`.toLowerCase();
      return text.includes(query) || (digits.length >= 3 && client.phone.replace(/\D/g, "").includes(digits));
    });
    return { clients: this.sort(filtered, options.sort ?? "lastVisit"), total: all.length, segments, atRisk: all.filter((client) => client.atRisk).length };
  }

  async getClient(clubId: string, userId: string, now = Date.now()): Promise<ClubClientDetail> {
    const client = (await this.loadClients(clubId, now)).find((item) => item.userId === userId);
    if (!client) throw new NotFoundException("Клиент не найден в этом клубе");
    const [notes, timeline] = await Promise.all([this.listNotes(clubId, userId), this.timeline(clubId, userId)]);
    return { client, notes, timeline };
  }

  async addNote(clubId: string, userId: string, text: string, author: AuthUser): Promise<ClientNote> {
    const value = text?.trim() ?? "";
    if (value.length < 1 || value.length > 1000) throw new BadRequestException("Заметка от 1 до 1000 символов");
    await this.assertClient(clubId, userId);
    const note: ClientNote = { id: randomUUID(), text: value, authorName: author.name, createdAt: new Date().toISOString() };
    await this.database.query(
      "INSERT INTO club_client_notes (id, club_id, user_id, author_id, author_name, text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [note.id, clubId, userId, author.id, author.name, note.text, note.createdAt]
    );
    return note;
  }

  async deleteNote(clubId: string, userId: string, noteId: string): Promise<void> {
    this.assertDatabase();
    const result = await this.database.query("DELETE FROM club_client_notes WHERE id = $1 AND club_id = $2 AND user_id = $3", [noteId, clubId, userId]);
    if (result.rowCount === 0) throw new NotFoundException("Заметка не найдена");
  }

  async setTags(clubId: string, userId: string, tags: string[]): Promise<string[]> {
    if (!Array.isArray(tags)) throw new BadRequestException("Теги передаются списком");
    const clean = [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
    if (clean.length > MAX_TAGS) throw new BadRequestException(`Не больше ${MAX_TAGS} тегов`);
    if (clean.some((tag) => tag.length > 24)) throw new BadRequestException("Тег не длиннее 24 символов");
    const user = await this.assertClient(clubId, userId);
    await this.database.query(
      `INSERT INTO club_accounts (club_id, user_id, nickname, tags) VALUES ($1, $2, $3, $4)
       ON CONFLICT (club_id, user_id) DO UPDATE SET tags = EXCLUDED.tags`,
      [clubId, userId, user.name, clean]
    );
    return clean;
  }

  /** Возврат, компенсация или исправление ошибки кассы — всегда с причиной, она видна в истории клиента. */
  async adjustBalance(clubId: string, userId: string, amount: number, reason: string, author: AuthUser): Promise<number> {
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUSTMENT) {
      throw new BadRequestException(`Сумма корректировки — целое число от −${MAX_ADJUSTMENT} до ${MAX_ADJUSTMENT}, не ноль`);
    }
    const text = reason?.trim() ?? "";
    if (text.length < 3 || text.length > 200) throw new BadRequestException("Укажите причину корректировки, от 3 до 200 символов");
    const user = await this.assertClient(clubId, userId);
    return this.hall.changeBalance(clubId, user, amount, { kind: "adjustment", createdBy: author.id, reason: text });
  }

  async analytics(clubId: string, days: number, now = Date.now()): Promise<ClubAnalytics> {
    this.assertDatabase();
    if (!ANALYTICS_PERIODS.includes(days as (typeof ANALYTICS_PERIODS)[number])) throw new BadRequestException("Период: 7, 30 или 90 дней");
    const zones = await this.clubs.findZones(clubId);
    const seats = zones.reduce((sum, zone) => sum + zone.seatCount, 0);
    // Период выровнен по полуночи клуба: «30 дней» — это 30 полных календарных дней, включая сегодня.
    const todayStart = Math.floor((now + CLUB_UTC_OFFSET_MS) / DAY_MS) * DAY_MS - CLUB_UTC_OFFSET_MS;
    const to = new Date(Math.min(now, todayStart + DAY_MS));
    const from = new Date(todayStart - (days - 1) * DAY_MS);
    const previousFrom = new Date(from.getTime() - days * DAY_MS);

    const [totals, previous, daily, heatmap, zoneStats, topClients] = await Promise.all([
      this.totals(clubId, from, to, seats),
      this.totals(clubId, previousFrom, from, seats),
      this.daily(clubId, from, to),
      this.heatmap(clubId, from, to, seats),
      this.zoneStats(clubId, from, to),
      this.topClients(clubId, from, to)
    ]);
    const periodMinutes = Math.max(1, (to.getTime() - from.getTime()) / 60_000);
    return {
      clubId,
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      previous,
      daily,
      heatmap,
      zones: zones.map((zone) => {
        const stat = zoneStats.get(zone.id);
        const minutes = stat?.minutes ?? 0;
        return {
          zoneId: zone.id,
          zoneName: zone.name,
          seats: zone.seatCount,
          minutesPlayed: minutes,
          revenue: stat?.revenue ?? 0,
          occupancy: this.ratio(minutes, zone.seatCount * periodMinutes)
        };
      }),
      topClients
    };
  }

  // ---------- Клиенты ----------

  private async loadClients(clubId: string, now: number): Promise<ClubClient[]> {
    this.assertDatabase();
    await this.clubs.findOne(clubId);
    const result = await this.database.query<ClientRow>(CLIENTS_SQL, [clubId, CLUB_TIME_ZONE]);
    const clients = result.rows.map((row) => this.mapClient(row));
    return this.assignSegments(clients, now);
  }

  /**
   * VIP — первые 10 % по тратам среди тех, кто был хотя бы 3 дня, или помеченные тегом VIP.
   * Остальные сегменты взаимоисключающие и считаются от даты последнего визита.
   */
  private assignSegments(clients: ClubClient[], now: number): ClubClient[] {
    const spenders = clients
      .filter((client) => client.totalSpent > 0 && client.visitDays >= 3)
      .map((client) => client.totalSpent)
      .sort((a, b) => b - a);
    const vipThreshold = spenders.length ? spenders[Math.max(0, Math.ceil(spenders.length * 0.1) - 1)] : Number.POSITIVE_INFINITY;
    return clients.map((client) => {
      const lastActivity = Date.parse(client.lastVisitAt ?? client.firstSeenAt);
      const idleDays = (now - lastActivity) / DAY_MS;
      const tagged = client.tags.some((tag) => tag.toLowerCase() === "vip");
      const vip = tagged || (client.visitDays >= 3 && client.totalSpent >= vipThreshold);
      let segment: ClientSegment;
      if (vip) segment = "vip";
      // Постоянный ходит прямо сейчас: кто был часто, но пропал на две недели, уже не постоянный, а в зоне риска.
      else if (client.visitDays30 >= 4 && idleDays < 14) segment = "regular";
      else if (now - Date.parse(client.firstSeenAt) <= 14 * DAY_MS) segment = "new";
      // Без единого визита «спящим» не назвать: человек ещё не пришёл, ему нужен другой разговор.
      else if (!client.lastVisitAt) segment = "never";
      else if (idleDays > 30) segment = "sleeping";
      else segment = "occasional";
      const loyal = vip || client.visitDays >= 4;
      return { ...client, segment, atRisk: loyal && idleDays >= 14 && idleDays <= 60 };
    });
  }

  private sort(clients: ClubClient[], sort: ClientSort): ClubClient[] {
    const byLastVisit = (client: ClubClient) => Date.parse(client.lastVisitAt ?? client.firstSeenAt);
    const comparators: Record<ClientSort, (a: ClubClient, b: ClubClient) => number> = {
      lastVisit: (a, b) => byLastVisit(b) - byLastVisit(a),
      spent: (a, b) => b.totalSpent - a.totalSpent,
      visits: (a, b) => b.visitDays - a.visitDays,
      balance: (a, b) => b.balance - a.balance,
      name: (a, b) => a.nickname.localeCompare(b.nickname, "ru")
    };
    return [...clients].sort(comparators[sort] ?? comparators.lastVisit);
  }

  private async assertClient(clubId: string, userId: string): Promise<{ id: string; name: string }> {
    this.assertDatabase();
    await this.clubs.findOne(clubId);
    const result = await this.database.query<{ id: string; name: string }>(
      `SELECT u.id, u.name FROM users u
       WHERE u.id = $2 AND u.deleted_at IS NULL AND (
         EXISTS (SELECT 1 FROM club_accounts WHERE club_id = $1 AND user_id = u.id)
         OR EXISTS (SELECT 1 FROM bookings WHERE club_id = $1 AND user_id = u.id)
         OR EXISTS (SELECT 1 FROM play_sessions WHERE club_id = $1 AND user_id = u.id)
         OR EXISTS (SELECT 1 FROM club_orders WHERE club_id = $1 AND user_id = u.id)
       )`,
      [clubId, userId]
    );
    if (!result.rows[0]) throw new NotFoundException("Клиент не найден в этом клубе");
    return result.rows[0];
  }

  private async listNotes(clubId: string, userId: string): Promise<ClientNote[]> {
    const result = await this.database.query<{ id: string; text: string; author_name: string; created_at: Date | string }>(
      "SELECT id, text, author_name, created_at FROM club_client_notes WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC",
      [clubId, userId]
    );
    return result.rows.map((row) => ({ id: row.id, text: row.text, authorName: row.author_name, createdAt: this.iso(row.created_at) }));
  }

  /** История клиента в клубе: сессии, пополнения и корректировки, брони и заказы бара — свежие сверху. */
  private async timeline(clubId: string, userId: string): Promise<ClientTimelineEntry[]> {
    const [sessions, balance, bookings, orders] = await Promise.all([
      this.database.query<{ id: string; started_at: Date | string; ended_at: Date | string | null; ends_at: Date | string; seat_label: string; zone_name: string; charged: number | null; status: string }>(
        "SELECT id, started_at, ended_at, ends_at, seat_label, zone_name, charged, status FROM play_sessions WHERE club_id = $1 AND user_id = $2 ORDER BY started_at DESC LIMIT 100",
        [clubId, userId]
      ),
      this.database.query<{ id: string; created_at: Date | string; amount: number; kind: "top_up" | "adjustment"; reason: string | null }>(
        "SELECT id, created_at, amount, kind, reason FROM club_balance_transactions WHERE club_id = $1 AND user_id = $2 AND kind IN ('top_up', 'adjustment') ORDER BY created_at DESC LIMIT 100",
        [clubId, userId]
      ),
      this.database.query<{ id: string; created_at: Date | string; start_at: Date | string; zone_name: string; seat_labels: string[]; duration_hours: number; status: BookingStatus }>(
        "SELECT id, created_at, start_at, zone_name, seat_labels, duration_hours, status FROM bookings WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 100",
        [clubId, userId]
      ),
      this.database.query<{ id: string; created_at: Date | string; total: number; status: ClubOrderStatus; lines: ClubOrderLine[] }>(
        "SELECT id, created_at, total, status, lines FROM club_orders WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 100",
        [clubId, userId]
      )
    ]);
    const now = Date.now();
    const entries: ClientTimelineEntry[] = [
      ...sessions.rows.map<ClientTimelineEntry>((row) => {
        const end = row.ended_at ? Date.parse(this.iso(row.ended_at)) : Math.min(now, Date.parse(this.iso(row.ends_at)));
        return {
          kind: "session",
          id: row.id,
          at: this.iso(row.started_at),
          seatLabel: row.seat_label,
          zoneName: row.zone_name,
          minutes: Math.max(0, Math.round((end - Date.parse(this.iso(row.started_at))) / 60_000)),
          ...(row.charged !== null ? { charged: row.charged } : {}),
          active: row.status === "active"
        };
      }),
      ...balance.rows.map<ClientTimelineEntry>((row) => ({
        kind: "balance",
        id: row.id,
        at: this.iso(row.created_at),
        amount: row.amount,
        type: row.kind,
        ...(row.reason ? { reason: row.reason } : {})
      })),
      ...bookings.rows.map<ClientTimelineEntry>((row) => ({
        kind: "booking",
        id: row.id,
        at: this.iso(row.created_at),
        startAt: this.iso(row.start_at),
        zoneName: row.zone_name,
        seatLabels: row.seat_labels,
        durationHours: row.duration_hours,
        status: row.status
      })),
      ...orders.rows.map<ClientTimelineEntry>((row) => ({
        kind: "order",
        id: row.id,
        at: this.iso(row.created_at),
        total: row.total,
        status: row.status,
        summary: row.lines.map((line) => (line.quantity > 1 ? `${line.name} ×${line.quantity}` : line.name)).join(", ")
      }))
    ];
    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200);
  }

  // ---------- Аналитика ----------

  private async totals(clubId: string, from: Date, to: Date, seats: number): Promise<AnalyticsTotals> {
    const result = await this.database.query<{
      time_revenue: number;
      bar_revenue: number;
      topped_up: number;
      sessions: number;
      minutes_played: number;
      unique_players: number;
      returning_players: number;
      new_players: number;
    }>(
      `WITH bounds AS (SELECT $2::timestamptz AS from_at, $3::timestamptz AS to_at),
       visits AS (
         SELECT user_id, started_at AS at FROM play_sessions, bounds WHERE club_id = $1 AND started_at >= from_at AND started_at < to_at
         UNION ALL
         SELECT user_id, start_at FROM bookings, bounds
         WHERE club_id = $1 AND status IN ('confirmed', 'completed') AND start_at >= from_at AND start_at < to_at AND start_at <= NOW()
       ),
       per_player AS (SELECT user_id, COUNT(DISTINCT (at AT TIME ZONE $4)::date) AS days FROM visits GROUP BY user_id),
       seen AS (
         SELECT user_id, MIN(at) AS first_at FROM (
           SELECT user_id, created_at AS at FROM club_accounts WHERE club_id = $1
           UNION ALL SELECT user_id, created_at FROM bookings WHERE club_id = $1
           UNION ALL SELECT user_id, started_at FROM play_sessions WHERE club_id = $1
           UNION ALL SELECT user_id, created_at FROM club_orders WHERE club_id = $1
         ) all_seen GROUP BY user_id
       )
       SELECT
         (SELECT COALESCE(SUM(charged), 0) FROM play_sessions, bounds WHERE club_id = $1 AND status = 'ended' AND ended_at >= from_at AND ended_at < to_at)::int AS time_revenue,
         (SELECT COALESCE(SUM(total), 0) FROM club_orders, bounds WHERE club_id = $1 AND status <> 'cancelled' AND created_at >= from_at AND created_at < to_at)::int AS bar_revenue,
         (SELECT COALESCE(SUM(amount), 0) FROM club_balance_transactions, bounds WHERE club_id = $1 AND kind = 'top_up' AND created_at >= from_at AND created_at < to_at)::int AS topped_up,
         (SELECT COUNT(*) FROM play_sessions, bounds WHERE club_id = $1 AND started_at >= from_at AND started_at < to_at)::int AS sessions,
         (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, LEAST(NOW(), ends_at)), to_at) - GREATEST(started_at, from_at))) / 60), 0)
            FROM play_sessions, bounds WHERE club_id = $1 AND started_at < to_at AND COALESCE(ended_at, LEAST(NOW(), ends_at)) > from_at)::int AS minutes_played,
         (SELECT COUNT(*) FROM per_player)::int AS unique_players,
         (SELECT COUNT(*) FROM per_player WHERE days >= 2)::int AS returning_players,
         (SELECT COUNT(*) FROM seen, bounds WHERE first_at >= from_at AND first_at < to_at)::int AS new_players`,
      [clubId, from.toISOString(), to.toISOString(), CLUB_TIME_ZONE]
    );
    const row = result.rows[0];
    const periodMinutes = Math.max(1, (to.getTime() - from.getTime()) / 60_000);
    return {
      revenue: row.time_revenue + row.bar_revenue,
      timeRevenue: row.time_revenue,
      barRevenue: row.bar_revenue,
      toppedUp: row.topped_up,
      sessions: row.sessions,
      minutesPlayed: row.minutes_played,
      avgSessionMinutes: row.sessions ? Math.round(row.minutes_played / row.sessions) : 0,
      uniquePlayers: row.unique_players,
      newPlayers: row.new_players,
      returningPlayers: row.returning_players,
      occupancy: this.ratio(row.minutes_played, seats * periodMinutes)
    };
  }

  private async daily(clubId: string, from: Date, to: Date): Promise<ClubAnalytics["daily"]> {
    const result = await this.database.query<{ day: string; time_revenue: number; bar_revenue: number; topped_up: number; sessions: number }>(
      `WITH days AS (
         SELECT generate_series(($2::timestamptz AT TIME ZONE $4)::date, (($3::timestamptz - INTERVAL '1 second') AT TIME ZONE $4)::date, INTERVAL '1 day')::date AS day
       ),
       ended AS (SELECT (ended_at AT TIME ZONE $4)::date AS day, SUM(charged) AS amount FROM play_sessions
                 WHERE club_id = $1 AND status = 'ended' AND ended_at >= $2 AND ended_at < $3 GROUP BY 1),
       started AS (SELECT (started_at AT TIME ZONE $4)::date AS day, COUNT(*) AS amount FROM play_sessions
                   WHERE club_id = $1 AND started_at >= $2 AND started_at < $3 GROUP BY 1),
       bar AS (SELECT (created_at AT TIME ZONE $4)::date AS day, SUM(total) AS amount FROM club_orders
               WHERE club_id = $1 AND status <> 'cancelled' AND created_at >= $2 AND created_at < $3 GROUP BY 1),
       topups AS (SELECT (created_at AT TIME ZONE $4)::date AS day, SUM(amount) AS amount FROM club_balance_transactions
                  WHERE club_id = $1 AND kind = 'top_up' AND created_at >= $2 AND created_at < $3 GROUP BY 1)
       SELECT d.day::text AS day,
              COALESCE(e.amount, 0)::int AS time_revenue, COALESCE(b.amount, 0)::int AS bar_revenue,
              COALESCE(t.amount, 0)::int AS topped_up, COALESCE(s.amount, 0)::int AS sessions
       FROM days d
       LEFT JOIN ended e ON e.day = d.day LEFT JOIN bar b ON b.day = d.day
       LEFT JOIN topups t ON t.day = d.day LEFT JOIN started s ON s.day = d.day
       ORDER BY d.day`,
      [clubId, from.toISOString(), to.toISOString(), CLUB_TIME_ZONE]
    );
    return result.rows.map((row) => ({ date: row.day, timeRevenue: row.time_revenue, barRevenue: row.bar_revenue, toppedUp: row.topped_up, sessions: row.sessions }));
  }

  /** Минуты игры раскладываются по часовым ячейкам, загрузка ячейки — от ёмкости зала за все такие часы периода. */
  private async heatmap(clubId: string, from: Date, to: Date, seats: number): Promise<ClubAnalytics["heatmap"]> {
    const result = await this.database.query<{ weekday: number; hour: number; minutes: number }>(
      `WITH spans AS (
         SELECT GREATEST(started_at, $2::timestamptz) AS s, LEAST(COALESCE(ended_at, LEAST(NOW(), ends_at)), $3::timestamptz) AS e
         FROM play_sessions WHERE club_id = $1 AND started_at < $3 AND COALESCE(ended_at, LEAST(NOW(), ends_at)) > $2
       )
       SELECT EXTRACT(ISODOW FROM slot AT TIME ZONE $4)::int AS weekday, EXTRACT(HOUR FROM slot AT TIME ZONE $4)::int AS hour,
              SUM(EXTRACT(EPOCH FROM (LEAST(slot + INTERVAL '1 hour', spans.e) - GREATEST(slot, spans.s))) / 60)::float AS minutes
       FROM spans, LATERAL generate_series(date_trunc('hour', spans.s), spans.e, INTERVAL '1 hour') AS slot
       WHERE slot < spans.e
       GROUP BY 1, 2`,
      [clubId, from.toISOString(), to.toISOString(), CLUB_TIME_ZONE]
    );
    const minutes = new Map(result.rows.map((row) => [`${row.weekday}:${row.hour}`, Number(row.minutes)]));
    // Сколько раз каждый час недели встречается в периоде: у 30 дней четыре или пять понедельников.
    const occurrences = new Map<string, number>();
    for (let at = from.getTime(); at < to.getTime(); at += 3_600_000) {
      const local = new Date(at + CLUB_UTC_OFFSET_MS);
      const key = `${local.getUTCDay() || 7}:${local.getUTCHours()}`;
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }
    const cells: ClubAnalytics["heatmap"] = [];
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const key = `${weekday}:${hour}`;
        cells.push({ weekday, hour, occupancy: this.ratio(minutes.get(key) ?? 0, seats * 60 * (occurrences.get(key) ?? 0)) });
      }
    }
    return cells;
  }

  private async zoneStats(clubId: string, from: Date, to: Date): Promise<Map<string, { minutes: number; revenue: number }>> {
    const result = await this.database.query<{ zone_id: string; minutes: number; revenue: number }>(
      `SELECT zone_id,
              COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, LEAST(NOW(), ends_at)), $3::timestamptz) - GREATEST(started_at, $2::timestamptz))) / 60), 0)::int AS minutes,
              COALESCE(SUM(charged) FILTER (WHERE ended_at >= $2 AND ended_at < $3), 0)::int AS revenue
       FROM play_sessions WHERE club_id = $1 AND started_at < $3 AND COALESCE(ended_at, LEAST(NOW(), ends_at)) > $2
       GROUP BY zone_id`,
      [clubId, from.toISOString(), to.toISOString()]
    );
    return new Map(result.rows.map((row) => [row.zone_id, { minutes: row.minutes, revenue: row.revenue }]));
  }

  private async topClients(clubId: string, from: Date, to: Date): Promise<ClubAnalytics["topClients"]> {
    const result = await this.database.query<{ user_id: string; name: string; phone: string; spent: number; minutes: number; visit_days: number }>(
      `WITH spend AS (
         SELECT user_id, charged AS amount, EXTRACT(EPOCH FROM (COALESCE(ended_at, LEAST(NOW(), ends_at)) - started_at)) / 60 AS minutes, started_at AS visit_at
         FROM play_sessions WHERE club_id = $1 AND started_at >= $2 AND started_at < $3
         UNION ALL
         SELECT user_id, total, 0, NULL FROM club_orders WHERE club_id = $1 AND status <> 'cancelled' AND created_at >= $2 AND created_at < $3
       )
       SELECT s.user_id, COALESCE(a.nickname, u.name) AS name, u.phone,
              COALESCE(SUM(s.amount), 0)::int AS spent, COALESCE(SUM(s.minutes), 0)::int AS minutes,
              COUNT(DISTINCT (s.visit_at AT TIME ZONE $4)::date)::int AS visit_days
       FROM spend s JOIN users u ON u.id = s.user_id
       LEFT JOIN club_accounts a ON a.club_id = $1 AND a.user_id = s.user_id
       GROUP BY s.user_id, a.nickname, u.name, u.phone
       ORDER BY spent DESC, minutes DESC
       LIMIT 10`,
      [clubId, from.toISOString(), to.toISOString(), CLUB_TIME_ZONE]
    );
    return result.rows.map((row) => ({ userId: row.user_id, name: row.name, phone: row.phone, spent: row.spent, minutesPlayed: row.minutes, visitDays: row.visit_days }));
  }

  // ---------- Внутреннее ----------

  private mapClient(row: ClientRow): ClubClient {
    const spentOnTime = Number(row.spent_on_time);
    const spentOnBar = Number(row.spent_on_bar);
    return {
      userId: row.user_id,
      name: row.name,
      nickname: row.nickname ?? row.name,
      phone: row.phone,
      balance: Number(row.balance),
      bonusPoints: Number(row.bonus_points),
      tags: row.tags ?? [],
      segment: "occasional",
      atRisk: false,
      firstSeenAt: this.iso(row.first_seen_at),
      ...(row.last_visit_at ? { lastVisitAt: this.iso(row.last_visit_at) } : {}),
      visitDays: Number(row.visit_days),
      visitDays30: Number(row.visit_days_30),
      sessionsCount: Number(row.sessions_count),
      minutesPlayed: Number(row.minutes_played),
      spentOnTime,
      spentOnBar,
      totalSpent: spentOnTime + spentOnBar,
      toppedUp: Number(row.topped_up),
      bookingsCount: Number(row.bookings_count),
      cancelledBookings: Number(row.cancelled_bookings)
    };
  }

  private ratio(part: number, whole: number): number {
    if (whole <= 0) return 0;
    return Math.min(1, Math.round((part / whole) * 1000) / 1000);
  }

  private iso(value: Date | string): string {
    return new Date(value).toISOString();
  }

  private assertDatabase(): void {
    if (!this.database.configured) throw new ServiceUnavailableException("CRM и аналитика работают только с базой данных: задайте DATABASE_URL");
  }
}
