import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "@oyna/contracts";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { ClubAccessService } from "./club-access.service";
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
    await expect(service.listManagedClubs(clubAdmin)).resolves.toHaveLength(3);
  });

  it("gives the platform owner access to every club", async () => {
    await expect(service.canManage(platformAdmin, "respawn-point")).resolves.toBe(true);
  });
});
