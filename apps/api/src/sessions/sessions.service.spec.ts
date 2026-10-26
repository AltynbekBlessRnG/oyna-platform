import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { AuthUser, StationState } from "@oyna/contracts";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "../bookings/bookings.service";
import { ClubHallService } from "../clubs/club-hall.service";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../social/notifications.service";
import { SessionsService } from "./sessions.service";

describe("SessionsService", () => {
  const clubId = "zen-game-club";
  const admin: AuthUser = { id: "admin-1", phone: "+77000000001", name: "Касса", role: "club_admin" };
  let service: SessionsService;
  let hall: ClubHallService;
  let bookings: BookingsService;
  let seatId: string;
  let otherSeatId: string;
  let pricePerHour: number;
  let zoneId: string;

  beforeEach(async () => {
    const database = new DatabaseService();
    const clubs = new ClubsService(database);
    hall = new ClubHallService(database, clubs);
    const auth = new AuthService(database);
    bookings = new BookingsService(clubs, database, new NotificationsService(database));
    service = new SessionsService(database, clubs, hall, auth, bookings);
    const [zone] = await clubs.findZones(clubId);
    zoneId = zone.id;
    pricePerHour = zone.pricePerHour;
    seatId = `${clubId}-${zone.id}-01`;
    otherSeatId = `${clubId}-${zone.id}-02`;
  });

  async function playerWithBalance(phone: string, amount: number): Promise<AuthUser> {
    const result = await service.topUp(clubId, phone, amount, admin);
    return { id: result.userId, phone, name: result.playerName, role: "player" };
  }

  it("refuses to start a session without money on the balance", async () => {
    await expect(service.startForPlayer(clubId, seatId, "+77010000001")).rejects.toThrow(BadRequestException);
  });

  it("lets the player sit exactly as long as the balance pays for", async () => {
    const player = await playerWithBalance("+77010000002", pricePerHour);
    const start = Date.parse("2030-01-01T10:00:00.000Z");
    const session = await service.start(clubId, seatId, player, undefined, start);
    expect(session.endsAt).toBe("2030-01-01T11:00:00.000Z");
    expect(session.seatLabel).toBe("01");
  });

  it("charges started minutes on early end and keeps the rest of the balance", async () => {
    const player = await playerWithBalance("+77010000003", pricePerHour * 2);
    const start = Date.parse("2030-01-01T10:00:00.000Z");
    const session = await service.start(clubId, seatId, player, undefined, start);
    const ended = await service.end(session.id, "player", start + 29 * 60_000 + 1);
    expect(ended.charged).toBe(Math.ceil((30 * pricePerHour) / 60));
    expect((await hall.getAccount(clubId, player)).balance).toBe(pricePerHour * 2 - ended.charged!);
    const again = await service.end(session.id, "admin", start + 90 * 60_000);
    expect(again.charged).toBe(ended.charged);
    expect(again.endReason).toBe("player");
  });

  it("expires a session when the paid time is over and never charges past it", async () => {
    const player = await playerWithBalance("+77010000004", pricePerHour);
    const start = Date.parse("2030-01-01T10:00:00.000Z");
    const session = await service.start(clubId, seatId, player, undefined, start);
    expect(await service.expireDue(start + 30 * 60_000)).toBe(0);
    expect(await service.expireDue(start + 3 * 3_600_000)).toBe(1);
    const [ended] = (await service.listActive(clubId)).filter((item) => item.id === session.id);
    expect(ended).toBeUndefined();
    expect((await hall.getAccount(clubId, player)).balance).toBe(0);
  });

  it("caps the session by the chosen minutes", async () => {
    const player = await playerWithBalance("+77010000005", pricePerHour * 5);
    const start = Date.parse("2030-01-01T10:00:00.000Z");
    const session = await service.start(clubId, seatId, player, 45, start);
    expect(session.endsAt).toBe("2030-01-01T10:45:00.000Z");
  });

  it("extends a running session after a top-up, but not past the chosen limit", async () => {
    const start = Date.now();
    const player = await playerWithBalance("+77010000006", pricePerHour);
    const open = await service.start(clubId, seatId, player, undefined, start);
    await service.topUp(clubId, player.phone, pricePerHour, admin);
    const extended = await service.findCurrent(clubId, player.id);
    expect(Date.parse(extended!.endsAt) - Date.parse(open.startedAt)).toBe(2 * 3_600_000);

    const capped = await playerWithBalance("+77010000007", pricePerHour);
    const limited = await service.start(clubId, otherSeatId, capped, 30, start);
    await service.topUp(clubId, capped.phone, pricePerHour * 3, admin);
    expect((await service.findCurrent(clubId, capped.id))!.endsAt).toBe(limited.endsAt);
  });

  it("keeps one session per seat and one per player in the club", async () => {
    const first = await playerWithBalance("+77010000008", pricePerHour);
    const second = await playerWithBalance("+77010000009", pricePerHour);
    await service.start(clubId, seatId, first);
    await expect(service.start(clubId, seatId, second)).rejects.toThrow(ConflictException);
    await expect(service.start(clubId, otherSeatId, first)).rejects.toThrow(ConflictException);
  });

  it("rejects a seat that is not on the club map", async () => {
    const player = await playerWithBalance("+77010000010", pricePerHour);
    await expect(service.start(clubId, "vertex-arena-standard-01", player)).rejects.toThrow(BadRequestException);
  });

  it("registers a station with a one-time key and checks it on connect", async () => {
    const { station, token } = await service.registerStation(clubId, seatId);
    expect(station.name).toBe("ПК 01");
    expect(station.online).toBe(false);
    await expect(service.registerStation(clubId, seatId)).rejects.toThrow(ConflictException);
    await expect(service.authenticateStation(station.id, "wrong")).rejects.toThrow(UnauthorizedException);
    await expect(service.authenticateStation(station.id, token)).resolves.toMatchObject({ id: station.id });

    const rotated = await service.rotateStationToken(clubId, station.id);
    await expect(service.authenticateStation(station.id, token)).rejects.toThrow(UnauthorizedException);
    await expect(service.authenticateStation(station.id, rotated.token)).resolves.toMatchObject({ id: station.id });
  });

  it("starts a session when the player enters the code from the station screen", async () => {
    const { station } = await service.registerStation(clubId, seatId);
    const states: (StationState | null)[] = [];
    service.onStationChange((stationId, state) => stationId === station.id && states.push(state));
    const player = await playerWithBalance("+77010000011", pricePerHour);

    const { code } = await service.issueLoginCode(station.id);
    const session = await service.claimStation(player, code);
    expect(session.seatId).toBe(seatId);
    expect(states.at(-1)?.session?.id).toBe(session.id);
    await expect(service.claimStation(player, code)).rejects.toThrow(BadRequestException);

    await service.endFromStation(station.id);
    expect(states.at(-1)?.session).toBeNull();
    expect(states.at(-1)?.station.id).toBe(station.id);

    await service.rotateStationToken(clubId, station.id);
    expect(states.at(-1)).toBeNull();
  });

  it("rejects an expired station code", async () => {
    const { station } = await service.registerStation(clubId, seatId);
    const player = await playerWithBalance("+77010000012", pricePerHour);
    const issuedAt = Date.now();
    const { code } = await service.issueLoginCode(station.id, issuedAt);
    await expect(service.claimStation(player, code, undefined, issuedAt + 3 * 60_000)).rejects.toThrow(BadRequestException);
  });

  it("lets a player end only their own session", async () => {
    const owner = await playerWithBalance("+77010000013", pricePerHour);
    const stranger = await playerWithBalance("+77010000014", pricePerHour);
    const session = await service.start(clubId, seatId, owner);
    await expect(service.endByPlayer(session.id, stranger)).rejects.toThrow(NotFoundException);
    await expect(service.endByClub("vertex-arena", session.id)).rejects.toThrow(NotFoundException);
    await expect(service.endByPlayer(session.id, owner)).resolves.toMatchObject({ status: "ended", endReason: "player" });
  });

  it("marks occupied seats and online stations on the hall map", async () => {
    const { station } = await service.registerStation(clubId, seatId);
    await service.setStationOnline(station.id, true);
    const player = await playerWithBalance("+77010000015", pricePerHour);
    const session = await service.start(clubId, seatId, player);
    const [zone] = await new ClubsService(new DatabaseService()).findZones(clubId);
    const map = await service.applyToSeatMap({
      clubId,
      generatedAt: new Date().toISOString(),
      zones: [{ zone, seats: [{ id: seatId, label: "01", row: "A", status: "free" }, { id: otherSeatId, label: "02", row: "A", status: "free" }] }]
    });
    const [seat, other] = map.zones[0].seats;
    expect(seat).toMatchObject({ status: "occupied", occupiedUntil: session.endsAt, stationOnline: true });
    expect(other.status).toBe("free");
    expect(other.stationOnline).toBeUndefined();
  });

  it("validates the top-up amount", async () => {
    await expect(service.topUp(clubId, "+77010000016", 0, admin)).rejects.toThrow(BadRequestException);
    await expect(service.topUp(clubId, "+77010000016", 10.5, admin)).rejects.toThrow(BadRequestException);
  });

  /** Бронь места на час, начиная с `startAt`. Время округлено до часа, как в приложении. */
  async function book(player: AuthUser, startAt: Date): Promise<void> {
    await bookings.create({ clubId, zoneId, seatIds: [seatId], startAt: startAt.toISOString(), durationHours: 1, playerName: player.name }, player);
  }

  function nextHour(offsetHours: number): Date {
    const date = new Date(Date.now() + offsetHours * 3_600_000);
    date.setMinutes(0, 0, 0);
    return date;
  }

  it("does not seat anyone on a place booked by another player right now", async () => {
    const owner = await playerWithBalance("+77010000020", pricePerHour * 3);
    const walkIn = await playerWithBalance("+77010000021", pricePerHour * 3);
    await book(owner, nextHour(0));
    await expect(service.start(clubId, seatId, walkIn)).rejects.toThrow(ConflictException);
    await expect(service.start(clubId, seatId, owner)).resolves.toMatchObject({ status: "active" });
  });

  it("stops a session before another player's booking and keeps it there after a top-up", async () => {
    const owner = await playerWithBalance("+77010000022", pricePerHour);
    const walkIn = await playerWithBalance("+77010000023", pricePerHour * 5);
    const bookingStart = nextHour(3);
    await book(owner, bookingStart);
    const session = await service.start(clubId, seatId, walkIn);
    expect(Date.parse(session.endsAt)).toBeLessThanOrEqual(bookingStart.getTime());
    expect(bookingStart.getTime() - Date.parse(session.endsAt)).toBeLessThan(60_000);
    await service.topUp(clubId, walkIn.phone, pricePerHour * 5, admin);
    expect(Date.parse((await service.findCurrent(clubId, walkIn.id))!.endsAt)).toBeLessThanOrEqual(bookingStart.getTime());
  });

  it("does not let anyone book a seat while a session there is still running", async () => {
    const player = await playerWithBalance("+77010000024", pricePerHour * 3);
    const other = await playerWithBalance("+77010000025", pricePerHour);
    await service.start(clubId, seatId, player);
    const hall = await bookings.getAvailability(clubId, zoneId, nextHour(1).toISOString(), 1);
    expect(hall.seats.find((seat) => seat.id === seatId)?.status).toBe("occupied");
    expect(hall.seats.find((seat) => seat.id === otherSeatId)?.status).toBe("available");
    await expect(book(other, nextHour(1))).rejects.toThrow(ConflictException);
    const later = await bookings.getAvailability(clubId, zoneId, nextHour(5).toISOString(), 1);
    expect(later.seats.find((seat) => seat.id === seatId)?.status).toBe("available");
  });
});
