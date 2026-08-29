import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuthService } from "./auth/auth.service";
import { CLUB_CATALOG, type ClubCatalogEntry } from "./clubs/clubs.data";
import { ClubsService } from "./clubs/clubs.service";
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
    const clubIds = await new ClubsService(database).upsertCatalog(catalog);
    for (const { club, zones } of catalog) {
      console.info(`клуб ${club.id}: ${zones.length} зон, ${zones.reduce((sum, zone) => sum + zone.seatCount, 0)} мест`);
    }
    if (!clubIds.length) throw new Error("каталог не загружен");
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
