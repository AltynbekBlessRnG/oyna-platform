import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "@oyna/contracts";
import { DatabaseService } from "../database/database.service";
import { ClubHallService } from "./club-hall.service";
import { ClubsService } from "./clubs.service";

describe("ClubHallService", () => {
  const database = new DatabaseService();
  const service = new ClubHallService(database, new ClubsService(database));
  const player: AuthUser = { id: "user-1", phone: "+77000000000", name: "Игрок", role: "player" };

  it("returns the bar menu of the pilot club", async () => {
    const menu = await service.findMenu("zen-game-club");
    expect(menu.length).toBeGreaterThan(0);
    expect(menu.every((item) => item.clubId === "zen-game-club")).toBe(true);
  });

  it("counts the order total from menu prices, not from the client", async () => {
    const menu = await service.findMenu("zen-game-club");
    const [first, second] = menu;
    const order = await service.createOrder("zen-game-club", player, {
      seatLabel: "07",
      lines: [
        { itemId: first.id, quantity: 2 },
        { itemId: second.id, quantity: 1 }
      ]
    });
    expect(order.total).toBe(first.price * 2 + second.price);
    expect(order.status).toBe("new");
  });

  it("rejects an order without a seat", async () => {
    const menu = await service.findMenu("zen-game-club");
    await expect(service.createOrder("zen-game-club", player, { seatLabel: "  ", lines: [{ itemId: menu[0].id, quantity: 1 }] })).rejects.toThrow(
      BadRequestException
    );
  });

  it("rejects a position that is not on the club menu", async () => {
    await expect(service.createOrder("zen-game-club", player, { seatLabel: "07", lines: [{ itemId: "unknown", quantity: 1 }] })).rejects.toThrow(
      NotFoundException
    );
  });

  it("shows a player only their own orders", async () => {
    const menu = await service.findMenu("zen-game-club");
    const other: AuthUser = { ...player, id: "user-2" };
    await service.createOrder("zen-game-club", other, { seatLabel: "11", lines: [{ itemId: menu[0].id, quantity: 1 }] });
    const mine = await service.findMyOrders("zen-game-club", player.id);
    expect(mine.every((order) => order.seatLabel !== "11")).toBe(true);
  });

  it("opens a separate club account with its own nickname", async () => {
    const account = await service.getAccount("zen-game-club", player);
    expect(account.clubName).toBe("Zen Game Club");
    const renamed = await service.renameAccount("zen-game-club", player, "  ZenMaster  ");
    expect(renamed.nickname).toBe("ZenMaster");
    await expect(service.renameAccount("zen-game-club", player, "z")).rejects.toThrow(BadRequestException);
    const other = await service.getAccount("vertex-arena", player);
    expect(other.nickname).toBe("Игрок");
  });
});
