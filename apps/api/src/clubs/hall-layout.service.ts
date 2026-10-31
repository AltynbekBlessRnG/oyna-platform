import { BadRequestException, Injectable } from "@nestjs/common";
import type { HallLayout, HallLayoutItem, HallLayoutItemKind, SaveHallLayoutRequest } from "@oyna/contracts";
import { randomUUID } from "node:crypto";
import { createSeats } from "../bookings/bookings.data";
import { DatabaseService } from "../database/database.service";
import { ClubsService } from "./clubs.service";

interface LayoutRow {
  club_id: string;
  columns: number;
  rows: number;
  items: HallLayoutItem[];
  updated_at: Date | string;
}

const KINDS: HallLayoutItemKind[] = ["seat", "sofa", "console", "billiards", "vr", "bar", "reception", "wc", "entrance", "wall", "label"];
const MAX_ITEMS = 600;

/** Схема зала, нарисованная клубом: по ней кабинет показывает места так, как они стоят в реальности. */
@Injectable()
export class HallLayoutService {
  private readonly memory = new Map<string, HallLayout>();

  constructor(
    private readonly database: DatabaseService,
    private readonly clubs: ClubsService
  ) {}

  /** `null` — клуб схему ещё не рисовал. Места, которых больше нет в зонах, со схемы убираются. */
  async find(clubId: string): Promise<HallLayout | null> {
    const seatIds = await this.seatIds(clubId);
    let layout: HallLayout | null;
    if (!this.database.configured) {
      layout = this.memory.get(clubId) ?? null;
    } else {
      const result = await this.database.query<LayoutRow>("SELECT club_id, columns, rows, items, updated_at FROM club_hall_layouts WHERE club_id = $1", [clubId]);
      const row = result.rows[0];
      layout = row ? { clubId: row.club_id, columns: row.columns, rows: row.rows, items: row.items, updatedAt: new Date(row.updated_at).toISOString() } : null;
    }
    return layout && { ...layout, items: layout.items.filter((item) => item.kind !== "seat" || seatIds.has(item.seatId ?? "")) };
  }

  async save(clubId: string, request: SaveHallLayoutRequest): Promise<HallLayout> {
    const layout = this.validate(clubId, request, await this.seatIds(clubId));
    if (!this.database.configured) {
      this.memory.set(clubId, { ...layout, updatedAt: new Date().toISOString() });
    } else {
      await this.database.query(
        `INSERT INTO club_hall_layouts (club_id, columns, rows, items, updated_at) VALUES ($1, $2, $3, $4::jsonb, NOW())
         ON CONFLICT (club_id) DO UPDATE SET columns = EXCLUDED.columns, rows = EXCLUDED.rows, items = EXCLUDED.items, updated_at = NOW()`,
        [clubId, layout.columns, layout.rows, JSON.stringify(layout.items)]
      );
    }
    return (await this.find(clubId))!;
  }

  private async seatIds(clubId: string): Promise<Set<string>> {
    const zones = await this.clubs.findZones(clubId);
    return new Set(zones.flatMap((zone) => createSeats(zone).map((seat) => seat.id)));
  }

  private validate(clubId: string, request: SaveHallLayoutRequest, seatIds: Set<string>): HallLayout {
    const columns = request?.columns;
    const rows = request?.rows;
    if (!Number.isInteger(columns) || columns < 4 || columns > 80 || !Number.isInteger(rows) || rows < 4 || rows > 60) {
      throw new BadRequestException("Размер схемы: от 4 до 80 клеток в ширину и от 4 до 60 в высоту");
    }
    if (!Array.isArray(request.items) || request.items.length > MAX_ITEMS) throw new BadRequestException(`На схеме не больше ${MAX_ITEMS} элементов`);
    const placedSeats = new Set<string>();
    const items = request.items.map((item): HallLayoutItem => {
      if (!KINDS.includes(item?.kind)) throw new BadRequestException("Неизвестный элемент схемы");
      const { x, y, w, h } = item;
      if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1 || x < 0 || y < 0 || x + w > columns || y + h > rows) {
        throw new BadRequestException("Элемент выходит за границы схемы");
      }
      const label = item.label?.trim();
      if (label && label.length > 40) throw new BadRequestException("Подпись на схеме не длиннее 40 символов");
      if (item.kind === "seat") {
        if (!item.seatId || !seatIds.has(item.seatId)) throw new BadRequestException("На схеме место, которого нет в зонах клуба");
        if (placedSeats.has(item.seatId)) throw new BadRequestException("Одно место поставлено на схему дважды");
        placedSeats.add(item.seatId);
      }
      return {
        id: typeof item.id === "string" && item.id.length <= 64 && item.id ? item.id : randomUUID(),
        kind: item.kind,
        x,
        y,
        w,
        h,
        ...(item.kind === "seat" ? { seatId: item.seatId } : {}),
        ...(label ? { label } : {})
      };
    });
    return { clubId, columns, rows, items };
  }
}
