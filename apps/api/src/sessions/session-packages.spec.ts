import { BadRequestException } from "@nestjs/common";
import type { AuthUser } from "@oyna/contracts";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "../bookings/bookings.service";
import { ClubHallService } from "../clubs/club-hall.service";
import { ClubPackagesService, packageAvailableAt, packageMinutesAt } from "../clubs/club-packages.service";
import { CLUB_CATALOG } from "../clubs/clubs.data";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { PgliteDatabase } from "../database/pglite.testing";
import { ShiftsService } from "../shifts/shifts.service";
import { NotificationsService } from "../social/notifications.service";
import { SessionsService } from "./sessions.service";

const clubId = "zen-game-club";
const admin: AuthUser = { id: "admin-1", phone: "+77000000001", name: "Касса", role: "club_admin" };
/** 2030-01-01 23:00 по Алматы. */
const lateEvening = Date.parse("2030-01-01T18:00:00.000Z");

describe("package time rules", () => {
  const night = { id: "n", clubId, name: "Ночь", price: 2000, kind: "until" as const, endsAt: "08:00", availableFrom: "22:00", availableTo: "04:00", zoneIds: [], active: true };

  it("sells a night package only inside its window that crosses midnight", () => {
    expect(packageAvailableAt(night, lateEvening)).toBe(true);
    expect(packageAvailableAt(night, Date.parse("2030-01-01T21:30:00.000Z"))).toBe(true); // 02:30
    expect(packageAvailableAt(night, Date.parse("2030-01-01T23:30:00.000Z"))).toBe(false); // 04:30
    expect(packageAvailableAt(night, Date.parse("2030-01-01T12:00:00.000Z"))).toBe(false); // 17:00
  });

  it("ends an until-package at the next occurrence of its hour", () => {
    expect(packageMinutesAt(night, lateEvening)).toBe(9 * 60);
    expect(packageMinutesAt({ ...night, kind: "duration", durationMinutes: 300 }, lateEvening)).toBe(300);
  });
});

describe.each([
  ["в памяти", async () => new DatabaseService()],
  ["в PostgreSQL", async () => PgliteDatabase.create()]
])("Sessions with packages %s", (_label, createDatabase) => {
  let database: DatabaseService;
  let sessions: SessionsService;
  let packages: ClubPackagesService;
  let hall: ClubHallService;
  let seatId: string;
  let zoneId: string;
  let pricePerHour: number;

  beforeEach(async () => {
    database = await createDatabase();
    const clubs = new ClubsService(database);
    if (database.configured) await clubs.upsertCatalog(CLUB_CATALOG);
    hall = new ClubHallService(database, clubs);
    const shifts = new ShiftsService(database, clubs, hall);
    packages = new ClubPackagesService(database, clubs);
    sessions = new SessionsService(database, clubs, hall, new AuthService(database), new BookingsService(clubs, database, new NotificationsService(database)), shifts, packages);
    await shifts.open(clubId, 0, admin);
    const [zone] = await clubs.findZones(clubId);
    zoneId = zone.id;
    pricePerHour = zone.pricePerHour;
    seatId = `${clubId}-${zone.id}-01`;
  }, 120_000);

  afterEach(() => database.onModuleDestroy?.());

  async function playerWithBalance(phone: string, amount: number): Promise<AuthUser> {
    const result = await sessions.topUp(clubId, phone, amount, admin);
    return { id: result.userId, phone, name: result.playerName, role: "player" };
  }

  async function balanceOf(player: AuthUser): Promise<number> {
    return (await hall.getAccount(clubId, player)).balance;
  }

  it("charges the package price at once, keeps the end time on top-up and does not charge again", async () => {
    const [threePlusTwo] = await packages.replace(clubId, [{ name: "3+2", price: pricePerHour * 3, kind: "duration", durationMinutes: 300, zoneIds: [], active: true }]);
    const player = await playerWithBalance("+77010000301", pricePerHour * 4);
    const session = await sessions.start(clubId, seatId, player, undefined, lateEvening, threePlusTwo.id);
    expect(session).toMatchObject({ packageName: "3+2", packagePrice: pricePerHour * 3, endsAt: new Date(lateEvening + 300 * 60_000).toISOString() });
    expect(await balanceOf(player)).toBe(pricePerHour);

    await sessions.topUp(clubId, player.phone!, pricePerHour * 10, admin);
    expect((await sessions.findCurrent(clubId, player.id))!.endsAt).toBe(session.endsAt);

    const ended = await sessions.end(session.id, "admin", lateEvening + 10 * 60_000);
    expect(ended.charged).toBe(pricePerHour * 3);
    expect(await balanceOf(player)).toBe(pricePerHour * 11);
  });

  it("refuses a package the player cannot afford, outside its hours or in another zone", async () => {
    const [night, vipOnly] = await packages.replace(clubId, [
      { name: "Ночь", price: 5000, kind: "until", endsAt: "08:00", availableFrom: "22:00", availableTo: "04:00", zoneIds: [], active: true },
      { name: "VIP 2+1", price: 100, kind: "duration", durationMinutes: 180, zoneIds: [], active: true }
    ]);
    const poor = await playerWithBalance("+77010000302", 4000);
    await expect(sessions.start(clubId, seatId, poor, undefined, lateEvening, night.id)).rejects.toThrow(BadRequestException);
    expect(await balanceOf(poor)).toBe(4000);

    const rich = await playerWithBalance("+77010000303", 10_000);
    await expect(sessions.start(clubId, seatId, rich, undefined, Date.parse("2030-01-01T10:00:00.000Z"), night.id)).rejects.toThrow(/продаётся с 22:00 до 04:00/);
    await expect(sessions.start(clubId, seatId, rich, 30, lateEvening, vipOnly.id)).rejects.toThrow(/либо пакет/);

    await packages.replace(clubId, [{ id: vipOnly.id, name: "VIP 2+1", price: 100, kind: "duration", durationMinutes: 180, zoneIds: [zoneId], active: true }]);
    const otherZoneSeat = (await new ClubsService(database).findZones(clubId)).find((zone) => zone.id !== zoneId);
    if (otherZoneSeat) {
      await expect(sessions.start(clubId, `${clubId}-${otherZoneSeat.id}-01`, rich, undefined, lateEvening, vipOnly.id)).rejects.toThrow(/не действует в зоне/);
    }
  });

  it("validates package settings", async () => {
    await expect(packages.replace(clubId, [{ name: "", price: 100, kind: "duration", durationMinutes: 60, zoneIds: [], active: true }])).rejects.toThrow(BadRequestException);
    await expect(packages.replace(clubId, [{ name: "Ночь", price: 100, kind: "until", zoneIds: [], active: true }])).rejects.toThrow(/до какого времени/);
    await expect(packages.replace(clubId, [{ name: "Ночь", price: 100, kind: "until", endsAt: "08:00", availableFrom: "22:00", zoneIds: [], active: true }])).rejects.toThrow(/оба часа/);
    await expect(packages.replace(clubId, [{ name: "X", price: 100, kind: "duration", durationMinutes: 60, zoneIds: ["nope"], active: true }])).rejects.toThrow(/нет зоны/);
    expect(await packages.replace(clubId, [])).toEqual([]);
  });

  it("takes a bar order from the station only during a session, on behalf of the player at it", async () => {
    const credentials = await sessions.registerStation(clubId, seatId);
    const [item] = (await hall.findMenu(clubId)).filter((entry) => entry.available);
    await expect(sessions.orderFromStation(credentials.station.id, { lines: [{ itemId: item.id, quantity: 1 }] })).rejects.toThrow(/во время сессии/);
    const player = await playerWithBalance("+77010000305", pricePerHour);
    await sessions.start(clubId, seatId, player);
    const order = await sessions.orderFromStation(credentials.station.id, { lines: [{ itemId: item.id, quantity: 2 }] });
    expect(order).toMatchObject({ seatLabel: "01", total: item.price * 2 });
    expect(await hall.findMyOrders(clubId, player.id)).toHaveLength(1);
  });

  it("tells the station the player's balance during a session", async () => {
    const player = await playerWithBalance("+77010000304", pricePerHour * 2);
    const credentials = await sessions.registerStation(clubId, seatId);
    expect((await sessions.getStationState(credentials.station.id)).playerBalance).toBeUndefined();
    await sessions.start(clubId, seatId, player);
    expect((await sessions.getStationState(credentials.station.id)).playerBalance).toBe(pricePerHour * 2);
  });
});
