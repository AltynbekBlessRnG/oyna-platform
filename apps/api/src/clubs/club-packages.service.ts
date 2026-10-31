import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ClubPackage, UpsertPackageRequest } from "@oyna/contracts";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ClubsService } from "./clubs.service";

interface PackageRow {
  id: string;
  club_id: string;
  name: string;
  price: number;
  kind: ClubPackage["kind"];
  duration_minutes: number | null;
  ends_at: string | null;
  available_from: string | null;
  available_to: string | null;
  zone_ids: string[];
  active: boolean;
}

const MAX_PACKAGES = 30;
const MAX_PACKAGE_MINUTES = 24 * 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Весь Казахстан живёт по UTC+5 без перехода на летнее время. */
const CLUB_UTC_OFFSET_MINUTES = 5 * 60;

/** Минута суток по времени клуба. */
export function clubMinuteOfDay(now: number): number {
  return Math.floor((now / 60_000 + CLUB_UTC_OFFSET_MINUTES) % 1440);
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Можно ли купить пакет сейчас: окно может переходить через полночь, как у ночного. */
export function packageAvailableAt(pack: ClubPackage, now: number): boolean {
  if (!pack.availableFrom || !pack.availableTo) return true;
  const minute = clubMinuteOfDay(now);
  const from = toMinutes(pack.availableFrom);
  const to = toMinutes(pack.availableTo);
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** Сколько минут даёт пакет, если сесть сейчас: «до 08:00» считается до ближайших 08:00. */
export function packageMinutesAt(pack: ClubPackage, now: number): number {
  if (pack.kind === "duration") return pack.durationMinutes ?? 0;
  const left = (toMinutes(pack.endsAt ?? "00:00") - clubMinuteOfDay(now) + 1440) % 1440;
  return left === 0 ? 1440 : left;
}

/** Пакеты времени клуба: «3+2», «Ночь», «День». Цены и часы задаёт сам клуб в настройках. */
@Injectable()
export class ClubPackagesService {
  private readonly memory = new Map<string, ClubPackage[]>();

  constructor(
    private readonly database: DatabaseService,
    private readonly clubs: ClubsService
  ) {}

  async list(clubId: string): Promise<ClubPackage[]> {
    if (!this.database.configured) {
      await this.clubs.findOne(clubId);
      return (this.memory.get(clubId) ?? []).map((pack) => ({ ...pack }));
    }
    const result = await this.database.query<PackageRow>(
      "SELECT id, club_id, name, price, kind, duration_minutes, ends_at, available_from, available_to, zone_ids, active FROM club_packages WHERE club_id = $1 ORDER BY sort_order, id",
      [clubId]
    );
    return result.rows.map((row) => this.mapPackage(row));
  }

  async find(clubId: string, packageId: string): Promise<ClubPackage> {
    const pack = (await this.list(clubId)).find((item) => item.id === packageId);
    if (!pack) throw new NotFoundException("Пакет не найден");
    return pack;
  }

  async replace(clubId: string, packages: UpsertPackageRequest[]): Promise<ClubPackage[]> {
    const zoneIds = new Set((await this.clubs.findZones(clubId)).map((zone) => zone.id));
    const value = this.validate(clubId, packages, zoneIds);
    if (!this.database.configured) {
      this.memory.set(clubId, value);
      return this.list(clubId);
    }
    await this.database.transaction(async (client) => {
      await client.query("DELETE FROM club_packages WHERE club_id = $1", [clubId]);
      for (const [index, pack] of value.entries()) {
        await client.query(
          `INSERT INTO club_packages (id, club_id, name, price, kind, duration_minutes, ends_at, available_from, available_to, zone_ids, active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [pack.id, clubId, pack.name, pack.price, pack.kind, pack.durationMinutes ?? null, pack.endsAt ?? null, pack.availableFrom ?? null, pack.availableTo ?? null, pack.zoneIds, pack.active, index]
        );
      }
    });
    return this.list(clubId);
  }

  private validate(clubId: string, packages: UpsertPackageRequest[], zoneIds: Set<string>): ClubPackage[] {
    if (!Array.isArray(packages)) throw new BadRequestException("Нужен список пакетов");
    if (packages.length > MAX_PACKAGES) throw new BadRequestException(`Не больше ${MAX_PACKAGES} пакетов`);
    const seen = new Set<string>();
    return packages.map((pack) => {
      const id = pack.id?.trim() || randomUUID();
      if (seen.has(id)) throw new BadRequestException("Пакет повторяется");
      seen.add(id);
      const name = pack.name?.trim() ?? "";
      if (!name || name.length > 40) throw new BadRequestException("Название пакета должно быть от 1 до 40 символов");
      if (!Number.isInteger(pack.price) || pack.price < 0 || pack.price > 1_000_000) {
        throw new BadRequestException(`«${name}»: цена должна быть целым числом от 0 до 1 000 000`);
      }
      if (pack.kind !== "duration" && pack.kind !== "until") throw new BadRequestException(`«${name}»: неизвестный вид пакета`);
      if (pack.kind === "duration" && (!Number.isInteger(pack.durationMinutes) || pack.durationMinutes! < 1 || pack.durationMinutes! > MAX_PACKAGE_MINUTES)) {
        throw new BadRequestException(`«${name}»: длительность от 1 минуты до 24 часов`);
      }
      if (pack.kind === "until" && !TIME_PATTERN.test(pack.endsAt ?? "")) throw new BadRequestException(`«${name}»: укажите, до какого времени пакет, например 08:00`);
      const hasFrom = Boolean(pack.availableFrom);
      const hasTo = Boolean(pack.availableTo);
      if (hasFrom !== hasTo) throw new BadRequestException(`«${name}»: укажите оба часа продажи или ни одного`);
      if (hasFrom && (!TIME_PATTERN.test(pack.availableFrom!) || !TIME_PATTERN.test(pack.availableTo!) || pack.availableFrom === pack.availableTo)) {
        throw new BadRequestException(`«${name}»: часы продажи в формате 22:00, начало и конец разные`);
      }
      const zones = [...new Set(Array.isArray(pack.zoneIds) ? pack.zoneIds : [])];
      const unknown = zones.find((zone) => !zoneIds.has(zone));
      if (unknown) throw new BadRequestException(`«${name}»: в клубе нет зоны ${unknown}`);
      return {
        id,
        clubId,
        name,
        price: pack.price,
        kind: pack.kind,
        ...(pack.kind === "duration" ? { durationMinutes: pack.durationMinutes } : { endsAt: pack.endsAt }),
        ...(hasFrom ? { availableFrom: pack.availableFrom, availableTo: pack.availableTo } : {}),
        zoneIds: zones,
        active: pack.active !== false
      };
    });
  }

  private mapPackage(row: PackageRow): ClubPackage {
    return {
      id: row.id,
      clubId: row.club_id,
      name: row.name,
      price: row.price,
      kind: row.kind,
      ...(row.duration_minutes !== null ? { durationMinutes: row.duration_minutes } : {}),
      ...(row.ends_at ? { endsAt: row.ends_at } : {}),
      ...(row.available_from && row.available_to ? { availableFrom: row.available_from, availableTo: row.available_to } : {}),
      zoneIds: row.zone_ids,
      active: row.active
    };
  }
}
