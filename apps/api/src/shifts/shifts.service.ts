import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser, ClubShift, ShiftStaffTotals, ShiftTotals } from "@oyna/contracts";
import { randomUUID } from "node:crypto";
import { ClubHallService } from "../clubs/club-hall.service";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";

const MAX_CASH = 100_000_000;

interface ShiftRecord {
  id: string;
  clubId: string;
  openedBy: { id: string; name: string };
  openedAt: string;
  openingCash: number;
  closedBy?: { id: string; name: string };
  closedAt?: string;
  countedCash?: number;
  note?: string;
}

interface ShiftRow {
  id: string;
  club_id: string;
  opened_by: string;
  opened_by_name: string;
  opened_at: Date | string;
  opening_cash: number;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: Date | string | null;
  counted_cash: number | null;
  note: string | null;
}

const SHIFT_COLUMNS = "id, club_id, opened_by, opened_by_name, opened_at, opening_cash, closed_by, closed_by_name, closed_at, counted_cash, note";

/**
 * Смены кассы. Пока смена не открыта, касса не принимает деньги: так у каждого пополнения есть
 * смена, способ оплаты и сотрудник, а при закрытии видно, сколько наличных должно лежать в кассе.
 */
@Injectable()
export class ShiftsService {
  private readonly memory = new Map<string, ShiftRecord>();

  constructor(
    private readonly database: DatabaseService,
    private readonly clubs: ClubsService,
    private readonly hall: ClubHallService
  ) {}

  async open(clubId: string, openingCash: number, admin: AuthUser): Promise<ClubShift> {
    this.assertCash(openingCash, "Наличные на начало смены");
    await this.clubs.findOne(clubId);
    const record: ShiftRecord = {
      id: randomUUID(),
      clubId,
      openedBy: { id: admin.id, name: admin.name },
      openedAt: new Date().toISOString(),
      openingCash
    };
    if (!this.database.configured) {
      if ((await this.findOpen(clubId)) !== undefined) throw this.alreadyOpen();
      this.memory.set(record.id, record);
    } else {
      try {
        await this.database.query("INSERT INTO club_shifts (id, club_id, opened_by, opened_by_name, opened_at, opening_cash) VALUES ($1, $2, $3, $4, $5, $6)", [
          record.id,
          clubId,
          admin.id,
          admin.name,
          record.openedAt,
          openingCash
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw this.alreadyOpen();
        throw error;
      }
    }
    return this.withTotals(record);
  }

  async close(clubId: string, countedCash: number, note: string | undefined, admin: AuthUser): Promise<ClubShift> {
    this.assertCash(countedCash, "Пересчитанные наличные");
    const text = note?.trim() || undefined;
    if (text && text.length > 500) throw new BadRequestException("Комментарий не длиннее 500 символов");
    const open = await this.findOpen(clubId);
    if (!open) throw new NotFoundException("Открытой смены нет");
    const closed: ShiftRecord = { ...open, closedBy: { id: admin.id, name: admin.name }, closedAt: new Date().toISOString(), countedCash, ...(text ? { note: text } : {}) };
    if (!this.database.configured) this.memory.set(open.id, closed);
    else
      await this.database.query(
        "UPDATE club_shifts SET closed_by = $2, closed_by_name = $3, closed_at = $4, counted_cash = $5, note = $6 WHERE id = $1 AND closed_at IS NULL",
        [open.id, admin.id, admin.name, closed.closedAt, countedCash, text ?? null]
      );
    return this.withTotals(closed);
  }

  async current(clubId: string): Promise<ClubShift | null> {
    await this.clubs.findOne(clubId);
    const open = await this.findOpen(clubId);
    return open ? this.withTotals(open) : null;
  }

  async list(clubId: string, limit = 30): Promise<ClubShift[]> {
    await this.clubs.findOne(clubId);
    let records: ShiftRecord[];
    if (!this.database.configured) {
      records = [...this.memory.values()].filter((shift) => shift.clubId === clubId).sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, limit);
    } else {
      const result = await this.database.query<ShiftRow>(`SELECT ${SHIFT_COLUMNS} FROM club_shifts WHERE club_id = $1 ORDER BY opened_at DESC LIMIT $2`, [clubId, limit]);
      records = result.rows.map((row) => this.map(row));
    }
    return Promise.all(records.map((record) => this.withTotals(record)));
  }

  /** Смена, к которой относится пополнение. Без открытой смены касса деньги не принимает. */
  async requireOpen(clubId: string): Promise<string> {
    const open = await this.findOpen(clubId);
    if (!open) throw new ConflictException("Откройте смену: без неё касса не принимает деньги");
    return open.id;
  }

  async openShiftId(clubId: string): Promise<string | undefined> {
    return (await this.findOpen(clubId))?.id;
  }

  private async findOpen(clubId: string): Promise<ShiftRecord | undefined> {
    if (!this.database.configured) return [...this.memory.values()].find((shift) => shift.clubId === clubId && !shift.closedAt);
    const result = await this.database.query<ShiftRow>(`SELECT ${SHIFT_COLUMNS} FROM club_shifts WHERE club_id = $1 AND closed_at IS NULL`, [clubId]);
    return result.rows[0] ? this.map(result.rows[0]) : undefined;
  }

  private async withTotals(shift: ShiftRecord): Promise<ClubShift> {
    const { totals, staff } = this.database.configured ? await this.storedTotals(shift) : this.memoryTotals(shift);
    const expectedCash = shift.openingCash + totals.cash;
    return {
      ...shift,
      totals,
      expectedCash,
      ...(shift.countedCash !== undefined ? { difference: shift.countedCash - expectedCash } : {}),
      staff
    };
  }

  private async storedTotals(shift: ShiftRecord): Promise<{ totals: ShiftTotals; staff: ShiftStaffTotals[] }> {
    const until = shift.closedAt ?? new Date().toISOString();
    const [money, play, bar, people] = await Promise.all([
      this.database.query<{ cash: string; kaspi: string; card: string; top_up_count: string; adjustments: string; adjustment_count: string }>(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'top_up' AND payment_method = 'cash'), 0) AS cash,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'top_up' AND payment_method = 'kaspi'), 0) AS kaspi,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'top_up' AND payment_method = 'card'), 0) AS card,
                COUNT(*) FILTER (WHERE kind = 'top_up') AS top_up_count,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'adjustment'), 0) AS adjustments,
                COUNT(*) FILTER (WHERE kind = 'adjustment') AS adjustment_count
         FROM club_balance_transactions WHERE shift_id = $1`,
        [shift.id]
      ),
      this.database.query<{ charged: string }>(
        "SELECT COALESCE(SUM(charged), 0) AS charged FROM play_sessions WHERE club_id = $1 AND status = 'ended' AND ended_at >= $2 AND ended_at < $3",
        [shift.clubId, shift.openedAt, until]
      ),
      this.database.query<{ orders: string; total: string }>(
        "SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS total FROM club_orders WHERE club_id = $1 AND status = 'delivered' AND updated_at >= $2 AND updated_at < $3",
        [shift.clubId, shift.openedAt, until]
      ),
      this.database.query<{ created_by: string | null; name: string | null; cash: string; kaspi: string; card: string; top_up_count: string }>(
        `SELECT t.created_by, COALESCE(MAX(t.created_by_name), MAX(u.name)) AS name,
                COALESCE(SUM(t.amount) FILTER (WHERE t.payment_method = 'cash'), 0) AS cash,
                COALESCE(SUM(t.amount) FILTER (WHERE t.payment_method = 'kaspi'), 0) AS kaspi,
                COALESCE(SUM(t.amount) FILTER (WHERE t.payment_method = 'card'), 0) AS card,
                COUNT(*) AS top_up_count
         FROM club_balance_transactions t LEFT JOIN users u ON u.id = t.created_by
         WHERE t.shift_id = $1 AND t.kind = 'top_up'
         GROUP BY t.created_by
         ORDER BY COUNT(*) DESC`,
        [shift.id]
      )
    ]);
    const row = money.rows[0];
    return {
      totals: {
        cash: Number(row?.cash ?? 0),
        kaspi: Number(row?.kaspi ?? 0),
        card: Number(row?.card ?? 0),
        topUpCount: Number(row?.top_up_count ?? 0),
        adjustments: Number(row?.adjustments ?? 0),
        adjustmentCount: Number(row?.adjustment_count ?? 0),
        playCharged: Number(play.rows[0]?.charged ?? 0),
        barOrders: Number(bar.rows[0]?.orders ?? 0),
        barTotal: Number(bar.rows[0]?.total ?? 0)
      },
      staff: people.rows.map((person) => ({
        userId: person.created_by ?? "",
        name: this.staffName(person.created_by, person.name, shift),
        cash: Number(person.cash),
        kaspi: Number(person.kaspi),
        card: Number(person.card),
        topUpCount: Number(person.top_up_count)
      }))
    };
  }

  private memoryTotals(shift: ShiftRecord): { totals: ShiftTotals; staff: ShiftStaffTotals[] } {
    const entries = this.hall.memoryTransactions.filter((entry) => entry.shiftId === shift.id);
    const topUps = entries.filter((entry) => entry.kind === "top_up");
    const sum = (list: typeof entries, method?: string) => list.filter((entry) => !method || entry.paymentMethod === method).reduce((total, entry) => total + entry.amount, 0);
    const adjustments = entries.filter((entry) => entry.kind === "adjustment");
    const people = new Map<string, typeof entries>();
    for (const entry of topUps) people.set(entry.createdBy ?? "", [...(people.get(entry.createdBy ?? "") ?? []), entry]);
    const names = new Map(topUps.map((entry) => [entry.createdBy ?? "", entry.createdByName ?? null]));
    return {
      totals: {
        cash: sum(topUps, "cash"),
        kaspi: sum(topUps, "kaspi"),
        card: sum(topUps, "card"),
        topUpCount: topUps.length,
        adjustments: sum(adjustments),
        adjustmentCount: adjustments.length,
        playCharged: 0,
        barOrders: 0,
        barTotal: 0
      },
      staff: [...people].map(([userId, list]) => ({
        userId,
        name: this.staffName(userId, names.get(userId) ?? null, shift),
        cash: sum(list, "cash"),
        kaspi: sum(list, "kaspi"),
        card: sum(list, "card"),
        topUpCount: list.length
      }))
    };
  }

  /** Имени сотрудника может не быть в users: например, у пилотного ключа кабинета. */
  private staffName(userId: string | null, name: string | null, shift: ShiftRecord): string {
    if (name) return name;
    if (userId === shift.openedBy.id) return shift.openedBy.name;
    if (userId === shift.closedBy?.id) return shift.closedBy.name;
    return "Сотрудник";
  }

  private assertCash(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 0 || value > MAX_CASH) throw new BadRequestException(`${label}: целое число тенге от 0`);
  }

  private alreadyOpen(): ConflictException {
    return new ConflictException("Смена уже открыта: сначала закройте её");
  }

  private map(row: ShiftRow): ShiftRecord {
    const iso = (value: Date | string) => new Date(value).toISOString();
    return {
      id: row.id,
      clubId: row.club_id,
      openedBy: { id: row.opened_by, name: row.opened_by_name },
      openedAt: iso(row.opened_at),
      openingCash: row.opening_cash,
      ...(row.closed_at ? { closedBy: { id: row.closed_by ?? "", name: row.closed_by_name ?? "" }, closedAt: iso(row.closed_at) } : {}),
      ...(row.counted_cash !== null ? { countedCash: row.counted_cash } : {}),
      ...(row.note ? { note: row.note } : {})
    };
  }
}
