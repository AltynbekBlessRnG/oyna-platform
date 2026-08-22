import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuthService } from "./auth/auth.service";
import { CLUB_CATALOG, type ClubCatalogEntry } from "./clubs/clubs.data";
import { DatabaseService } from "./database/database.service";

/**
 * Наполнение базы для пилота.
 *
 *   pnpm db:seed                                             демонстрационный каталог
 *   pnpm db:seed -- --file=./clubs/example-club.json         каталог реального клуба (шаблон рядом)
 *   pnpm db:seed -- --admin-phone=+77011234567 --club=vertex-arena   права администратора клуба
 *
 * Скрипт идемпотентен: повторный запуск обновляет клубы и зоны, ничего не удаляя.
 */
function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

function readCatalog(): ClubCatalogEntry[] {
  const file = argument("file");
  if (!file) return CLUB_CATALOG;
  const parsed: unknown = JSON.parse(readFileSync(resolve(process.cwd(), file), "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Файл каталога должен содержать массив клубов");
  for (const entry of parsed as ClubCatalogEntry[]) {
    if (!entry.club?.id || !entry.club.name) throw new Error("У каждого клуба нужны поля club.id и club.name");
    if (!Array.isArray(entry.zones) || entry.zones.length === 0) throw new Error(`У клуба ${entry.club.id} нет зон`);
  }
  return parsed as ClubCatalogEntry[];
}

async function seedCatalog(database: DatabaseService, catalog: ClubCatalogEntry[]): Promise<void> {
  for (const { club, zones } of catalog) {
    await database.query(
      `INSERT INTO clubs (id, name, address, city, status, tags, equipment, accent, phone, opening_hours, rating, review_count, distance_km)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, address = EXCLUDED.address, city = EXCLUDED.city, status = EXCLUDED.status,
         tags = EXCLUDED.tags, equipment = EXCLUDED.equipment, accent = EXCLUDED.accent,
         phone = EXCLUDED.phone, opening_hours = EXCLUDED.opening_hours, updated_at = NOW()`,
      [
        club.id,
        club.name,
        club.address,
        club.city,
        club.status ?? "available",
        club.tags ?? [],
        club.equipment ?? "",
        club.accent ?? "#b8ff45",
        club.phone ?? null,
        club.openingHours ?? null,
        club.rating ?? 0,
        club.reviewCount ?? 0,
        club.distanceKm ?? 0
      ]
    );
    for (const [index, zone] of zones.entries()) {
      await database.query(
        `INSERT INTO club_zones (club_id, id, name, description, price_per_hour, seat_count, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (club_id, id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description,
           price_per_hour = EXCLUDED.price_per_hour, seat_count = EXCLUDED.seat_count, sort_order = EXCLUDED.sort_order`,
        [club.id, zone.id, zone.name, zone.description ?? "", zone.pricePerHour, zone.seatCount, index]
      );
    }
    console.info(`клуб ${club.id}: ${zones.length} зон, ${zones.reduce((sum, zone) => sum + zone.seatCount, 0)} мест`);
  }
}

async function grantAdmin(database: DatabaseService, phone: string, clubId: string): Promise<void> {
  const club = await database.query("SELECT 1 FROM clubs WHERE id = $1", [clubId]);
  if (!club.rowCount) throw new Error(`Клуб ${clubId} не найден: сначала загрузите каталог`);
  const user = await new AuthService(database).ensureUser(phone);
  await database.query("UPDATE users SET role = 'club_admin', updated_at = NOW() WHERE id = $1 AND role = 'player'", [user.id]);
  await database.query(
    "INSERT INTO club_memberships (club_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT (club_id, user_id) DO UPDATE SET role = 'admin'",
    [clubId, user.id]
  );
  console.info(`администратор ${user.phone} получил доступ к клубу ${clubId}`);
}

async function main(): Promise<void> {
  // Сначала разбираем файл каталога: ошибку в данных видно до подключения к базе.
  const catalog = readCatalog();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL не задан: заполните .env или запустите pnpm db:up");
  const database = new DatabaseService();
  await database.onModuleInit();
  try {
    await seedCatalog(database, catalog);
    const adminPhone = argument("admin-phone");
    if (adminPhone) {
      const clubId = argument("club");
      if (!clubId) throw new Error("Укажите --club=<id> вместе с --admin-phone");
      await grantAdmin(database, adminPhone, clubId);
    }
    console.info("готово");
  } finally {
    await database.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  // У ошибок подключения pg сообщение бывает пустым, поэтому печатаем и саму ошибку.
  const message = error instanceof Error && error.message ? error.message : String(error);
  console.error(`seed не выполнен: ${message}`);
  if (error instanceof Error && !error.message) console.error(error);
  process.exitCode = 1;
});
