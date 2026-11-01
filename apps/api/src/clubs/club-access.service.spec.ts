import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "@oyna/contracts";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { CrmService } from "../crm/crm.service";
import { PgliteDatabase } from "../database/pglite.testing";
import { ClubAccessService } from "./club-access.service";
import { ClubHallService } from "./club-hall.service";
import { CLUB_CATALOG } from "./clubs.data";
import { ClubsService } from "./clubs.service";

describe("ClubAccessService", () => {
  const database = new DatabaseService();
  const service = new ClubAccessService(database, new ClubsService(database), new AuthService(database));
  const player: AuthUser = { id: "user-1", phone: "+77000000000", name: "Игрок", role: "player" };
  const clubAdmin: AuthUser = { ...player, id: "user-2", role: "club_admin" };
  const platformAdmin: AuthUser = { ...player, id: "user-3", role: "platform_admin" };

  it("keeps players away from the club cabinet", async () => {
    await expect(service.canManage(player, "vertex-arena")).resolves.toBe(false);
    await expect(service.assertCanManage(player, "vertex-arena")).rejects.toThrow(ForbiddenException);
    await expect(service.listManagedClubs(player)).resolves.toEqual([]);
  });

  it("lets a club administrator manage the pilot catalog without a database", async () => {
    await expect(service.canManage(clubAdmin, "vertex-arena")).resolves.toBe(true);
    await expect(service.listManagedClubs(clubAdmin)).resolves.toHaveLength(CLUB_CATALOG.length);
  });

  it("gives the platform owner access to every club", async () => {
    await expect(service.canManage(platformAdmin, "respawn-point")).resolves.toBe(true);
  });
});

describe("Club staff roles in PostgreSQL", () => {
  let database: DatabaseService;
  let access: ClubAccessService;
  let crm: CrmService;
  let hall: ClubHallService;
  const clubId = "vertex-arena";

  beforeEach(async () => {
    database = await PgliteDatabase.create();
    const clubs = new ClubsService(database);
    await clubs.upsertCatalog(CLUB_CATALOG);
    hall = new ClubHallService(database, clubs);
    access = new ClubAccessService(database, clubs, new AuthService(database));
    crm = new CrmService(database, clubs, hall);
  }, 120_000);

  afterEach(() => database.onModuleDestroy?.());

  const asUser = (member: { userId: string; phone: string; name: string }): AuthUser => ({ id: member.userId, phone: member.phone, name: member.name, role: "club_admin" });

  it("lets a cashier run the hall but not manage the club, and keeps the last owner", async () => {
    const owner = await access.addMember(clubId, { phone: "+77015550001", name: "Владелец" });
    const cashier = await access.addMember(clubId, { phone: "87015550002", name: "Дана", role: "cashier" });
    expect(cashier).toMatchObject({ role: "cashier", phone: "+77015550002" });

    await expect(access.staffRole(asUser(cashier), clubId)).resolves.toBe("cashier");
    await expect(access.assertStaff(asUser(cashier), clubId)).resolves.toBeUndefined();
    await expect(access.assertCanManage(asUser(cashier), clubId)).rejects.toThrow(ForbiddenException);
    await expect(access.assertStaff(asUser(cashier), "respawn-point")).rejects.toThrow(ForbiddenException);
    expect(await access.listManagedClubs(asUser(cashier))).toEqual([expect.objectContaining({ id: clubId, role: "cashier" })]);

    await expect(access.removeMember(clubId, owner.userId)).rejects.toThrow(/единственный владелец/);
    await expect(access.addMember(clubId, { phone: owner.phone, role: "cashier" })).rejects.toThrow(/единственный владелец/);
    await access.removeMember(clubId, cashier.userId);
    await expect(access.staffRole(asUser(cashier), clubId)).resolves.toBeUndefined();
  });

  it("finds regular players for the cash desk by name or digits, never guests", async () => {
    await hall.changeBalance(clubId, { id: (await new AuthService(database).ensureUser("+77015550003", "Арман")).id, name: "Арман" }, 500, { kind: "top_up" });
    const guest = await new AuthService(database).createGuest();
    await hall.changeBalance(clubId, guest, 300, { kind: "top_up" });

    expect(await crm.searchPlayers(clubId, "арм")).toEqual([expect.objectContaining({ name: "Арман", phone: "+77015550003", balance: 500 })]);
    expect(await crm.searchPlayers(clubId, "0003")).toHaveLength(1);
    expect(await crm.searchPlayers(clubId, "гост")).toEqual([]);
    expect(await crm.searchPlayers(clubId, "а")).toEqual([]);
  });
});
