import { ConflictException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@oyna/contracts";
import { AuthService } from "../auth/auth.service";
import { BookingsService } from "../bookings/bookings.service";
import { ClubHallService } from "../clubs/club-hall.service";
import { CLUB_CATALOG } from "../clubs/clubs.data";
import { ClubsService } from "../clubs/clubs.service";
import { CrmService } from "../crm/crm.service";
import { DatabaseService } from "../database/database.service";
import { PgliteDatabase } from "../database/pglite.testing";
import { SessionsService } from "../sessions/sessions.service";
import { NotificationsService } from "../social/notifications.service";
import { ShiftsService } from "./shifts.service";

const clubId = "zen-game-club";
const arman: AuthUser = { id: "admin-arman", phone: "+77000000011", name: "Арман", role: "club_admin" };
const dana: AuthUser = { id: "admin-dana", phone: "+77000000012", name: "Дана", role: "club_admin" };

async function build(database: DatabaseService) {
  const clubs = new ClubsService(database);
  if (database.configured) await clubs.upsertCatalog(CLUB_CATALOG);
  const hall = new ClubHallService(database, clubs);
  const auth = new AuthService(database);
  const shifts = new ShiftsService(database, clubs, hall);
  const sessions = new SessionsService(database, clubs, hall, auth, new BookingsService(clubs, database, new NotificationsService(database)), shifts);
  const crm = new CrmService(database, clubs, hall, shifts);
  return { shifts, sessions, crm };
}

describe.each([
  ["в памяти", async () => new DatabaseService()],
  ["в PostgreSQL", async () => PgliteDatabase.create()]
])("ShiftsService %s", (_label, createDatabase) => {
  let database: DatabaseService;
  let shifts: ShiftsService;
  let sessions: SessionsService;
  let crm: CrmService;

  beforeEach(async () => {
    database = await createDatabase();
    ({ shifts, sessions, crm } = await build(database));
  }, 120_000);

  afterEach(() => database.onModuleDestroy?.());

  it("takes no money until a shift is open and allows only one open shift", async () => {
    await expect(sessions.topUp(clubId, "+77010000101", 1000, arman)).rejects.toThrow(ConflictException);
    await expect(shifts.close(clubId, 0, undefined, arman)).rejects.toThrow(NotFoundException);
    await shifts.open(clubId, 5000, arman);
    await expect(shifts.open(clubId, 0, dana)).rejects.toThrow(ConflictException);
    await expect(sessions.topUp(clubId, "+77010000101", 1000, arman, "bitcoin" as never)).rejects.toThrow(/Способ оплаты/);
  });

  it("counts cash, Kaspi and card per staff member and shows the shortage at closing", async () => {
    await shifts.open(clubId, 5000, arman);
    await sessions.topUp(clubId, "+77010000101", 2000, arman);
    await sessions.topUp(clubId, "+77010000102", 3000, arman, "kaspi");
    await sessions.topUp(clubId, "+77010000103", 1500, dana, "cash");
    await sessions.topUp(clubId, "+77010000104", 1000, dana, "card");
    const player = await sessions.topUp(clubId, "+77010000105", 500, dana);
    // CRM работает только с базой: в памяти корректировок нет.
    if (database.configured) await crm.adjustBalance(clubId, player.userId, 700, "Компенсация за сбой", dana);

    const current = await shifts.current(clubId);
    expect(current?.totals).toMatchObject({ cash: 4000, kaspi: 3000, card: 1000, topUpCount: 5 });
    if (database.configured) expect(current?.totals).toMatchObject({ adjustments: 700, adjustmentCount: 1 });
    expect(current?.expectedCash).toBe(9000);
    expect(current?.difference).toBeUndefined();
    const byName = Object.fromEntries((current?.staff ?? []).map((person) => [person.name, person]));
    expect(byName["Арман"]).toMatchObject({ cash: 2000, kaspi: 3000, card: 0, topUpCount: 2 });
    expect(byName["Дана"]).toMatchObject({ cash: 2000, kaspi: 0, card: 1000, topUpCount: 3 });

    const closed = await shifts.close(clubId, 8500, "  Не хватает 500 ₸  ", dana);
    expect(closed).toMatchObject({ countedCash: 8500, expectedCash: 9000, difference: -500, note: "Не хватает 500 ₸", closedBy: { name: "Дана" } });
    expect(await shifts.current(clubId)).toBeNull();
    await expect(sessions.topUp(clubId, "+77010000101", 1000, arman)).rejects.toThrow(ConflictException);

    const next = await shifts.open(clubId, 8500, arman);
    expect(next.totals.cash).toBe(0);
    const history = await shifts.list(clubId);
    expect(history.map((shift) => shift.difference)).toEqual([undefined, -500]);
  });
});
