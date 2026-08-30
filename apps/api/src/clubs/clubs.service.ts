import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { ClubStatus, ClubSummary, ClubZone, UpdateClubRequest, UpsertZoneRequest } from "@oyna/contracts";
import { DatabaseService } from "../database/database.service";
import { type ClubCatalogEntry, CLUB_CATALOG } from "./clubs.data";

interface ClubRow {
  id: string;
  name: string;
  address: string;
  city: string;
  status: ClubStatus;
  tags: string[];
  equipment: string;
  accent: string;
  phone: string | null;
  opening_hours: string | null;
  rating: string;
  review_count: number;
  distance_km: string;
  price_from: string | null;
  total_seats: string;
  busy_seats: string;
}

interface ZoneRow {
  club_id: string;
  id: string;
  name: string;
  description: string;
  price_per_hour: number;
  seat_count: number;
}

const CLUB_SELECT = `
  SELECT c.id, c.name, c.address, c.city, c.status, c.tags, c.equipment, c.accent, c.phone, c.opening_hours,
         c.rating, c.review_count, c.distance_km,
         (SELECT MIN(z.price_per_hour) FROM club_zones z WHERE z.club_id = c.id) AS price_from,
         COALESCE((SELECT SUM(z.seat_count) FROM club_zones z WHERE z.club_id = c.id), 0) AS total_seats,
         COALESCE((SELECT SUM(CARDINALITY(b.seat_ids)) FROM bookings b
                   WHERE b.club_id = c.id AND b.status IN ('pending', 'confirmed')
                     AND b.start_at <= NOW() AND b.start_at + (b.duration_hours * INTERVAL '1 hour') > NOW()), 0) AS busy_seats
  FROM clubs c`;

const ZONE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

@Injectable()
export class ClubsService {
  /** Каталог для режима без базы: правки администратора живут до перезапуска процесса. */
  private readonly memory = new Map<string, ClubCatalogEntry>(
    CLUB_CATALOG.map((entry) => [entry.club.id, { club: { ...entry.club }, zones: entry.zones.map((zone) => ({ ...zone })) }])
  );

  constructor(private readonly database: DatabaseService) {}

  async findAll(): Promise<ClubSummary[]> {
    if (!this.database.configured) return [...this.memory.values()].map((entry) => this.fromMemory(entry));
    const result = await this.database.query<ClubRow>(`${CLUB_SELECT} WHERE c.published ORDER BY c.name`);
    return result.rows.map((row) => this.mapClub(row));
  }

  async findOne(id: string): Promise<ClubSummary> {
    if (!this.database.configured) {
      const entry = this.memory.get(id);
      if (!entry) throw new NotFoundException("Club not found");
      return this.fromMemory(entry);
    }
    const result = await this.database.query<ClubRow>(`${CLUB_SELECT} WHERE c.id = $1`, [id]);
    if (!result.rows[0]) throw new NotFoundException("Club not found");
    return this.mapClub(result.rows[0]);
  }

  async findZones(clubId: string): Promise<ClubZone[]> {
    if (!this.database.configured) {
      const entry = this.memory.get(clubId);
      if (!entry) throw new NotFoundException("Club not found");
      return entry.zones.map((zone) => ({ ...zone, clubId }));
    }
    await this.findOne(clubId);
    const result = await this.database.query<ZoneRow>(
      "SELECT club_id, id, name, description, price_per_hour, seat_count FROM club_zones WHERE club_id = $1 ORDER BY sort_order, id",
      [clubId]
    );
    return result.rows.map((row) => this.mapZone(row));
  }

  async findZone(clubId: string, zoneId: string): Promise<ClubZone> {
    const zone = (await this.findZones(clubId)).find((item) => item.id === zoneId);
    if (!zone) throw new NotFoundException("Zone not found");
    return zone;
  }

  async update(clubId: string, patch: UpdateClubRequest): Promise<ClubSummary> {
    const value = this.validateClubPatch(patch);
    if (!this.database.configured) {
      const entry = this.memory.get(clubId);
      if (!entry) throw new NotFoundException("Club not found");
      // Незаполненные поля патча не должны стирать текущие значения: в SQL за это отвечает COALESCE.
      const defined = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
      entry.club = { ...entry.club, ...defined };
      return this.fromMemory(entry);
    }
    const result = await this.database.query<{ id: string }>(
      `UPDATE clubs SET
         name = COALESCE($2, name), address = COALESCE($3, address), city = COALESCE($4, city),
         status = COALESCE($5, status), tags = COALESCE($6, tags), equipment = COALESCE($7, equipment),
         accent = COALESCE($8, accent), phone = COALESCE($9, phone), opening_hours = COALESCE($10, opening_hours),
         updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [clubId, value.name, value.address, value.city, value.status, value.tags, value.equipment, value.accent, value.phone, value.openingHours].map(
        (item) => item ?? null
      )
    );
    if (!result.rowCount) throw new NotFoundException("Club not found");
    return this.findOne(clubId);
  }

  /** Полностью заменяет набор зон клуба, защищая места с будущими бронями. */
  async replaceZones(clubId: string, zones: UpsertZoneRequest[]): Promise<ClubZone[]> {
    const value = this.validateZones(zones);
    if (!this.database.configured) {
      const entry = this.memory.get(clubId);
      if (!entry) throw new NotFoundException("Club not found");
      entry.zones = value.map((zone) => ({ ...zone }));
      return entry.zones.map((zone) => ({ ...zone, clubId }));
    }
    await this.findOne(clubId);
    await this.database.transaction(async (client) => {
      const booked = await client.query<{ zone_id: string; max_seat: string }>(
        `SELECT zone_id, MAX(seat_number) AS max_seat FROM (
           SELECT zone_id, (regexp_replace(seat_id, '^.*-', ''))::int AS seat_number
           FROM bookings, UNNEST(seat_ids) AS seat_id
           WHERE club_id = $1 AND status IN ('pending', 'confirmed') AND start_at > NOW()
         ) future GROUP BY zone_id`,
        [clubId]
      );
      for (const row of booked.rows) {
        const zone = value.find((item) => item.id === row.zone_id);
        if (!zone) throw new ConflictException(`Зона ${row.zone_id} занята будущими бронями и не может быть удалена`);
        if (zone.seatCount < Number(row.max_seat)) {
          throw new ConflictException(`В зоне ${row.zone_id} есть бронь на место ${row.max_seat}: нельзя уменьшить количество мест`);
        }
      }
      await client.query("DELETE FROM club_zones WHERE club_id = $1 AND NOT (id = ANY($2::text[]))", [clubId, value.map((zone) => zone.id)]);
      for (const [index, zone] of value.entries()) {
        await client.query(
          `INSERT INTO club_zones (club_id, id, name, description, price_per_hour, seat_count, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (club_id, id) DO UPDATE SET
             name = EXCLUDED.name, description = EXCLUDED.description,
             price_per_hour = EXCLUDED.price_per_hour, seat_count = EXCLUDED.seat_count, sort_order = EXCLUDED.sort_order`,
          [clubId, zone.id, zone.name, zone.description, zone.pricePerHour, zone.seatCount, index]
        );
      }
    });
    return this.findZones(clubId);
  }

  /**
   * Загружает каталог клубов в базу: используется и seed-скриптом, и владельцем платформы
   * через API, когда прямого доступа к базе нет. Идемпотентно: обновляет, ничего не удаляя.
   */
  async upsertCatalog(catalog: ClubCatalogEntry[]): Promise<string[]> {
    if (!this.database.configured) throw new ServiceUnavailableException("Загрузка каталога доступна только с подключённой базой данных");
    if (!Array.isArray(catalog) || catalog.length === 0) throw new BadRequestException("Каталог пуст");
    for (const entry of catalog) {
      if (!entry?.club?.id || !entry.club.name) throw new BadRequestException("У каждого клуба нужны поля club.id и club.name");
      this.validateZones(entry.zones as UpsertZoneRequest[]);
      for (const item of entry.menu ?? []) {
        if (!item?.id || !item.name) throw new BadRequestException("У позиции меню нужны поля id и name");
        if (!["drinks", "food", "snacks", "other"].includes(item.category)) throw new BadRequestException(`Неизвестная категория меню: ${item.category}`);
        if (!Number.isInteger(item.price) || item.price < 0 || item.price > 1_000_000) throw new BadRequestException("Цена позиции меню должна быть целым числом");
      }
    }
    for (const { club, zones } of catalog) {
      await this.database.query(
        `INSERT INTO clubs (id, name, address, city, status, tags, equipment, accent, phone, opening_hours, rating, review_count, distance_km)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, address = EXCLUDED.address, city = EXCLUDED.city, status = EXCLUDED.status,
           tags = EXCLUDED.tags, equipment = EXCLUDED.equipment, accent = EXCLUDED.accent,
           phone = EXCLUDED.phone, opening_hours = EXCLUDED.opening_hours, updated_at = NOW()`,
        [
          club.id,
          club.name,
          club.address ?? "",
          club.city ?? "",
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
        await this.database.query(
          `INSERT INTO club_zones (club_id, id, name, description, price_per_hour, seat_count, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (club_id, id) DO UPDATE SET
             name = EXCLUDED.name, description = EXCLUDED.description,
             price_per_hour = EXCLUDED.price_per_hour, seat_count = EXCLUDED.seat_count, sort_order = EXCLUDED.sort_order`,
          [club.id, zone.id, zone.name, zone.description ?? "", zone.pricePerHour, zone.seatCount, index]
        );
      }
    }
    for (const { club, menu } of catalog) {
      for (const [index, item] of (menu ?? []).entries()) {
        await this.database.query(
          `INSERT INTO club_menu_items (id, club_id, category, name, description, price, available, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             category = EXCLUDED.category, name = EXCLUDED.name, description = EXCLUDED.description,
             price = EXCLUDED.price, available = EXCLUDED.available, sort_order = EXCLUDED.sort_order`,
          [item.id, club.id, item.category, item.name, item.description ?? "", item.price, item.available ?? true, index]
        );
      }
    }
    return catalog.map((entry) => entry.club.id);
  }

  private validateClubPatch(patch: UpdateClubRequest): UpdateClubRequest {
    const text = (value: string | undefined, field: string, max: number): string | undefined => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      if (!trimmed || trimmed.length > max) throw new BadRequestException(`Поле ${field} должно быть от 1 до ${max} символов`);
      return trimmed;
    };
    if (patch.status && !["available", "busy", "offline"].includes(patch.status)) throw new BadRequestException("Unknown club status");
    if (patch.accent && !/^#[0-9a-fA-F]{6}$/.test(patch.accent)) throw new BadRequestException("Цвет клуба должен быть в формате #RRGGBB");
    if (patch.tags && (patch.tags.length > 8 || patch.tags.some((tag) => !tag.trim() || tag.length > 24))) {
      throw new BadRequestException("Не больше 8 тегов, каждый до 24 символов");
    }
    return {
      name: text(patch.name, "name", 80),
      address: text(patch.address, "address", 160),
      city: text(patch.city, "city", 80),
      status: patch.status,
      tags: patch.tags?.map((tag) => tag.trim()),
      equipment: patch.equipment?.trim(),
      accent: patch.accent,
      phone: text(patch.phone, "phone", 32),
      openingHours: text(patch.openingHours, "openingHours", 64)
    };
  }

  private validateZones(zones: UpsertZoneRequest[]): UpsertZoneRequest[] {
    if (!Array.isArray(zones) || zones.length === 0) throw new BadRequestException("Клубу нужна хотя бы одна зона");
    if (zones.length > 20) throw new BadRequestException("Не больше 20 зон");
    const seen = new Set<string>();
    return zones.map((zone) => {
      const id = zone.id?.trim().toLowerCase() ?? "";
      if (!ZONE_ID_PATTERN.test(id)) throw new BadRequestException(`Идентификатор зоны «${zone.id}» должен быть латиницей: a-z, 0-9, дефис`);
      if (seen.has(id)) throw new BadRequestException(`Зона ${id} повторяется`);
      seen.add(id);
      const name = zone.name?.trim() ?? "";
      if (!name || name.length > 60) throw new BadRequestException("Название зоны должно быть от 1 до 60 символов");
      if (!Number.isInteger(zone.pricePerHour) || zone.pricePerHour < 0 || zone.pricePerHour > 100_000) {
        throw new BadRequestException("Цена за час должна быть целым числом от 0 до 100 000");
      }
      if (!Number.isInteger(zone.seatCount) || zone.seatCount < 1 || zone.seatCount > 200) {
        throw new BadRequestException("Количество мест должно быть от 1 до 200");
      }
      return { id, name, description: zone.description?.trim() ?? "", pricePerHour: zone.pricePerHour, seatCount: zone.seatCount };
    });
  }

  private fromMemory(entry: ClubCatalogEntry): ClubSummary {
    const totalSeats = entry.zones.reduce((sum, zone) => sum + zone.seatCount, 0);
    return {
      ...entry.club,
      priceFrom: entry.zones.length ? Math.min(...entry.zones.map((zone) => zone.pricePerHour)) : 0,
      totalSeats,
      availableSeats: totalSeats
    };
  }

  private mapClub(row: ClubRow): ClubSummary {
    const totalSeats = Number(row.total_seats);
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      distanceKm: Number(row.distance_km),
      rating: Number(row.rating),
      reviewCount: row.review_count,
      priceFrom: Number(row.price_from ?? 0),
      availableSeats: Math.max(0, totalSeats - Number(row.busy_seats)),
      totalSeats,
      status: row.status,
      tags: row.tags,
      equipment: row.equipment,
      accent: row.accent,
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.opening_hours ? { openingHours: row.opening_hours } : {})
    };
  }

  private mapZone(row: ZoneRow): ClubZone {
    return { id: row.id, clubId: row.club_id, name: row.name, description: row.description, pricePerHour: row.price_per_hour, seatCount: row.seat_count };
  }
}
