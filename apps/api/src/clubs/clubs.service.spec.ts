import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { CLUB_CATALOG } from "./clubs.data";
import { ClubsService } from "./clubs.service";

describe("ClubsService", () => {
  const service = new ClubsService(new DatabaseService());

  it("returns the club catalog", async () => {
    await expect(service.findAll()).resolves.toHaveLength(CLUB_CATALOG.length);
  });

  it("derives the price and seat count from zones", async () => {
    const club = await service.findOne("vertex-arena");
    expect(club.priceFrom).toBe(900);
    expect(club.totalSeats).toBe(25);
  });

  it("throws for an unknown club", async () => {
    await expect(service.findOne("unknown")).rejects.toThrow(NotFoundException);
  });

  it("applies an administrator edit", async () => {
    const updated = await service.update("qazaq-cyber", { name: "  Qazaq Cyber Center  ", status: "busy" });
    expect(updated.name).toBe("Qazaq Cyber Center");
    expect(updated.status).toBe("busy");
    // Частичный патч не должен стирать поля, которых в нём нет.
    expect(updated.address).toBe("ул. Жандосова, 58");
    expect(updated.tags).toEqual(["PS5", "Парковка"]);
  });

  it("rejects an invalid accent colour", async () => {
    await expect(service.update("qazaq-cyber", { accent: "green" })).rejects.toThrow(BadRequestException);
  });

  it("replaces zones and recalculates the club price", async () => {
    const zones = await service.replaceZones("respawn-point", [
      { id: "standard", name: "Standard", description: "RTX 3060", pricePerHour: 500, seatCount: 8 },
      { id: "vip", name: "VIP", description: "RTX 4080", pricePerHour: 2000, seatCount: 4 }
    ]);
    expect(zones.map((zone) => zone.id)).toEqual(["standard", "vip"]);
    expect(zones[0].clubId).toBe("respawn-point");
    await expect(service.findOne("respawn-point")).resolves.toMatchObject({ priceFrom: 500, totalSeats: 12 });
  });

  it("rejects a zone identifier that is not a slug", async () => {
    await expect(
      service.replaceZones("respawn-point", [{ id: "Зона 1", name: "Standard", description: "", pricePerHour: 500, seatCount: 8 }])
    ).rejects.toThrow(BadRequestException);
  });

  it("refuses to load a catalog without a database", async () => {
    await expect(service.upsertCatalog([{ club: { id: "x", name: "X" } as never, zones: [] }])).rejects.toThrow(ServiceUnavailableException);
  });

  it("requires at least one zone", async () => {
    await expect(service.replaceZones("respawn-point", [])).rejects.toThrow(BadRequestException);
  });
});
