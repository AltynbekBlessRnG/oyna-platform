import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AuthUser } from "@oyna/contracts";
import { PgliteDatabase } from "../database/pglite.testing";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "../bookings/bookings.service";
import { ClubHallService } from "../clubs/club-hall.service";
import { CLUB_CATALOG } from "../clubs/clubs.data";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { SessionsService } from "../sessions/sessions.service";
import { NotificationsService } from "../social/notifications.service";
import { CrmService } from "./crm.service";

const DAY = 86_400_000;
const clubId = "zen-game-club";

describe("CrmService on PostgreSQL", () => {
  let database: PgliteDatabase;
  let crm: CrmService;
  let sessions: SessionsService;
  let auth: AuthService;
  let pricePerHour: number;
  let zoneId: string;
  const admin: AuthUser = { id: "admin-1", phone: "+77000000001", name: "Касса", role: "club_admin" };
  const now = Date.now();
  const players: Record<string, AuthUser> = {};

  /** Сессия в прошлом: пополнение ровно на её стоимость, запуск и завершение по факту. */
  async function play(player: AuthUser, daysAgo: number, minutes: number, seat = "01"): Promise<void> {
    await sessions.topUp(clubId, player.phone, Math.ceil((minutes * pricePerHour) / 60), admin);
    const start = now - daysAgo * DAY;
    const session = await sessions.start(clubId, `${clubId}-${zoneId}-${seat}`, player, minutes, start);
    await sessions.end(session.id, "player", start + minutes * 60_000);
  }

  async function player(key: string, phone: string, name: string): Promise<AuthUser> {
    const user = await auth.ensureUser(phone, name);
    players[key] = { ...user, role: "player" };
    return players[key];
  }

  beforeAll(async () => {
    database = await PgliteDatabase.create();
    const clubs = new ClubsService(database);
    await clubs.upsertCatalog(CLUB_CATALOG);
    const hall = new ClubHallService(database, clubs);
    auth = new AuthService(database);
    const bookings = new BookingsService(clubs, database, new NotificationsService(database));
    sessions = new SessionsService(database, clubs, hall, auth, bookings);
    crm = new CrmService(database, clubs, hall);
    const [zone] = await clubs.findZones(clubId);
    zoneId = zone.id;
    pricePerHour = zone.pricePerHour;

    // VIP: часто и много, каждые два дня по 4 часа.
    const vip = await player("vip", "+77011110001", "Арман");
    for (let day = 2; day <= 20; day += 2) await play(vip, day, 240);
    // Постоянный: 5 разных дней за последний месяц, по часу.
    const regular = await player("regular", "+77011110002", "Дана");
    for (const day of [1, 3, 5, 8, 12]) await play(regular, day, 60, "02");
    // Новичок: впервые пришёл три дня назад.
    const fresh = await player("fresh", "+77011110003", "Ерлан");
    await play(fresh, 3, 90, "03");
    // Ходил часто, но три недели как пропал.
    const lost = await player("lost", "+77011110004", "Мадина");
    for (const day of [21, 23, 25, 27, 29]) await play(lost, day, 120, "04");
    // Спящий: один визит полтора месяца назад, в прошлом периоде аналитики.
    const sleeping = await player("sleeping", "+77011110005", "Тимур");
    await play(sleeping, 45, 60, "05");
    await database.query("UPDATE club_accounts SET created_at = $3 WHERE club_id = $1 AND user_id = $2", [clubId, sleeping.id, new Date(now - 45 * DAY).toISOString()]);
    for (const key of ["vip", "regular", "fresh", "lost"]) {
      const first = await database.query<{ at: Date }>("SELECT MIN(started_at) AS at FROM play_sessions WHERE user_id = $1", [players[key].id]);
      await database.query("UPDATE club_accounts SET created_at = $3 WHERE club_id = $1 AND user_id = $2", [clubId, players[key].id, first.rows[0].at]);
    }
    // Бар: Дана заказала дважды, один заказ отменён и не считается.
    await database.query(
      `INSERT INTO club_orders (id, club_id, user_id, seat_label, lines, total, status, created_at) VALUES
       ('o1', $1, $2, '02', '[{"itemId":"zen-latte","name":"Латте","price":1100,"quantity":2}]', 2200, 'delivered', $3),
       ('o2', $1, $2, '02', '[{"itemId":"zen-chips","name":"Чипсы","price":800,"quantity":1}]', 800, 'cancelled', $3)`,
      [clubId, regular.id, new Date(now - DAY).toISOString()]
    );
  }, 120_000);

  afterAll(() => database.onModuleDestroy());

  it("puts every client into the right segment", async () => {
    const { clients, segments, total } = await crm.listClients(clubId, {}, now);
    const byId = new Map(clients.map((client) => [client.userId, client]));
    expect(total).toBe(5);
    expect(byId.get(players.vip.id)?.segment).toBe("vip");
    expect(byId.get(players.regular.id)?.segment).toBe("regular");
    expect(byId.get(players.fresh.id)?.segment).toBe("new");
    expect(byId.get(players.sleeping.id)?.segment).toBe("sleeping");
    expect(byId.get(players.lost.id)).toMatchObject({ segment: "occasional", atRisk: true });
    expect(segments).toEqual({ vip: 1, regular: 1, new: 1, sleeping: 1, occasional: 1 });
  });

  it("sums time and bar spending and ignores cancelled orders", async () => {
    const { clients } = await crm.listClients(clubId, {}, now);
    const regular = clients.find((client) => client.userId === players.regular.id)!;
    expect(regular.spentOnTime).toBe(5 * pricePerHour);
    expect(regular.spentOnBar).toBe(2200);
    expect(regular.totalSpent).toBe(5 * pricePerHour + 2200);
    expect(regular.visitDays).toBe(5);
    expect(regular.minutesPlayed).toBe(300);
    expect(regular.balance).toBe(0);
    expect(regular.toppedUp).toBe(5 * pricePerHour);
  });

  it("finds clients by phone digits and name, filters by risk and sorts by spending", async () => {
    expect((await crm.listClients(clubId, { search: "1110003" }, now)).clients.map((client) => client.name)).toEqual(["Ерлан"]);
    expect((await crm.listClients(clubId, { search: "мади" }, now)).clients.map((client) => client.name)).toEqual(["Мадина"]);
    expect((await crm.listClients(clubId, { segment: "risk" }, now)).clients.map((client) => client.name)).toEqual(["Мадина"]);
    const bySpent = (await crm.listClients(clubId, { sort: "spent" }, now)).clients;
    expect(bySpent[0].name).toBe("Арман");
  });

  it("keeps notes, tags and balance corrections in the client card", async () => {
    const userId = players.fresh.id;
    const note = await crm.addNote(clubId, userId, "  Просил место у окна  ", admin);
    expect(note.text).toBe("Просил место у окна");
    expect(await crm.setTags(clubId, userId, ["студент", " студент ", "VIP"])).toEqual(["студент", "VIP"]);
    expect(await crm.adjustBalance(clubId, userId, 500, "Компенсация за сбой ПК", admin)).toBe(500);
    await expect(crm.adjustBalance(clubId, userId, -10_000, "Ошибка", admin)).rejects.toThrow(BadRequestException);
    await expect(crm.adjustBalance(clubId, userId, 100, "", admin)).rejects.toThrow(BadRequestException);

    const detail = await crm.getClient(clubId, userId, now);
    expect(detail.client).toMatchObject({ segment: "vip", balance: 500, tags: ["студент", "VIP"] });
    expect(detail.notes.map((item) => item.text)).toEqual(["Просил место у окна"]);
    expect(detail.timeline[0]).toMatchObject({ kind: "balance", type: "adjustment", amount: 500, reason: "Компенсация за сбой ПК" });
    expect(detail.timeline.some((entry) => entry.kind === "session" && entry.minutes === 90)).toBe(true);

    await crm.deleteNote(clubId, userId, note.id);
    expect((await crm.getClient(clubId, userId, now)).notes).toEqual([]);
    await crm.setTags(clubId, userId, []);
  });

  it("does not show a player of another club", async () => {
    await expect(crm.getClient("vertex-arena", players.vip.id, now)).rejects.toThrow(NotFoundException);
    await expect(crm.addNote("vertex-arena", players.vip.id, "чужой", admin)).rejects.toThrow(NotFoundException);
  });

  it("builds a 30-day report whose daily rows add up to the totals", async () => {
    const report = await crm.analytics(clubId, 30, now);
    const expectedTime = 10 * 4 * pricePerHour + 5 * pricePerHour + Math.ceil((90 * pricePerHour) / 60) + 5 * 2 * pricePerHour;
    expect(report.totals.timeRevenue).toBe(expectedTime);
    expect(report.totals.barRevenue).toBe(2200);
    expect(report.totals.revenue).toBe(expectedTime + 2200);
    expect(report.daily).toHaveLength(30);
    expect(report.daily.reduce((sum, day) => sum + day.timeRevenue, 0)).toBe(report.totals.timeRevenue);
    expect(report.daily.reduce((sum, day) => sum + day.barRevenue, 0)).toBe(report.totals.barRevenue);
    expect(report.totals.sessions).toBe(21);
    expect(report.totals.uniquePlayers).toBe(4);
    expect(report.totals.returningPlayers).toBe(3);
    expect(report.totals.minutesPlayed).toBe(2400 + 300 + 90 + 600);
    expect(report.totals.avgSessionMinutes).toBe(Math.round(3390 / 21));
    expect(report.previous.sessions).toBe(1);
    expect(report.topClients[0]).toMatchObject({ name: "Арман", visitDays: 10 });
  });

  it("spreads played minutes over the weekly heatmap and zones", async () => {
    const report = await crm.analytics(clubId, 30, now);
    expect(report.heatmap).toHaveLength(7 * 24);
    expect(report.heatmap.some((cell) => cell.occupancy > 0)).toBe(true);
    expect(report.heatmap.every((cell) => cell.occupancy >= 0 && cell.occupancy <= 1)).toBe(true);
    const zone = report.zones.find((item) => item.zoneId === zoneId)!;
    expect(zone.minutesPlayed).toBe(report.totals.minutesPlayed);
    expect(zone.revenue).toBe(report.totals.timeRevenue);
    expect(zone.occupancy).toBeGreaterThan(0);
  });

  it("accepts only 7, 30 or 90 days", async () => {
    await expect(crm.analytics(clubId, 14, now)).rejects.toThrow(BadRequestException);
    await expect(crm.analytics(clubId, 7, now)).resolves.toMatchObject({ days: 7 });
  });

  it("asks for a database instead of showing an empty CRM", async () => {
    const memory = new DatabaseService();
    const clubs = new ClubsService(memory);
    const service = new CrmService(memory, clubs, new ClubHallService(memory, clubs));
    await expect(service.listClients(clubId)).rejects.toThrow(ServiceUnavailableException);
  });
});
