import { BadRequestException } from "@nestjs/common";
import { CLUB_CATALOG } from "./clubs.data";
import { ClubsService } from "./clubs.service";
import { DatabaseService } from "../database/database.service";
import { PgliteDatabase } from "../database/pglite.testing";
import { HallLayoutService } from "./hall-layout.service";

const clubId = "zen-game-club";

describe.each([
  ["в памяти", async () => new DatabaseService()],
  ["в PostgreSQL", async () => PgliteDatabase.create()]
])("HallLayoutService %s", (_label, createDatabase) => {
  let database: DatabaseService;
  let clubs: ClubsService;
  let layouts: HallLayoutService;
  let seatId: string;

  beforeEach(async () => {
    database = await createDatabase();
    clubs = new ClubsService(database);
    if (database.configured) await clubs.upsertCatalog(CLUB_CATALOG);
    layouts = new HallLayoutService(database, clubs);
    const [zone] = await clubs.findZones(clubId);
    seatId = `${clubId}-${zone.id}-01`;
  }, 120_000);

  afterEach(() => database.onModuleDestroy?.());

  it("saves seats and furniture and drops seats that are no longer in the zones", async () => {
    expect(await layouts.find(clubId)).toBeNull();
    const saved = await layouts.save(clubId, {
      columns: 20,
      rows: 10,
      items: [
        { id: "a", kind: "seat", x: 0, y: 0, w: 1, h: 1, seatId },
        { id: "b", kind: "sofa", x: 2, y: 0, w: 2, h: 1, label: "Лаунж" }
      ]
    });
    expect(saved.items).toHaveLength(2);
    const zones = await clubs.findZones(clubId);
    await clubs.replaceZones(clubId, zones.map((zone, index) => ({ ...zone, id: index === 0 ? `${zone.id}-new` : zone.id })));
    expect((await layouts.find(clubId))!.items.map((item) => item.id)).toEqual(["b"]);
  });

  it("refuses items outside the grid, unknown seats and a seat placed twice", async () => {
    const base = { columns: 10, rows: 10 };
    await expect(layouts.save(clubId, { ...base, items: [{ id: "a", kind: "wall", x: 9, y: 0, w: 2, h: 1 }] })).rejects.toThrow(BadRequestException);
    await expect(layouts.save(clubId, { ...base, items: [{ id: "a", kind: "seat", x: 0, y: 0, w: 1, h: 1, seatId: "nope" }] })).rejects.toThrow(/нет в зонах/);
    await expect(
      layouts.save(clubId, { ...base, items: [{ id: "a", kind: "seat", x: 0, y: 0, w: 1, h: 1, seatId }, { id: "b", kind: "seat", x: 1, y: 0, w: 1, h: 1, seatId }] })
    ).rejects.toThrow(/дважды/);
  });
});
