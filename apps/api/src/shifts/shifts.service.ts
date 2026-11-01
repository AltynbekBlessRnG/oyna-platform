import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { AuthUser, ClubShift, ShiftStaffTotals, ShiftTotals } from "@oyna/contracts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { OwnerAlertsService } from "../alerts/owner-alerts.service";
import { ClubHallService } from "../clubs/club-hall.service";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";

const MAX_CASH = 100_000_000;
const EMPTY_TOTALS: ShiftTotals = { cash: 0, kaspi: 0, card: 0, topUpCount: 0, adjustments: 0, adjustmentCount: 0, playCharged: 0, barOrders: 0, barTotal: 0 };

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
    private readonly hall: ClubHallService,
    @Optional() private readonly alerts?: OwnerAlertsService
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
    const shift = await this.withTotals(record);
    if (this.alerts) this.alerts.shiftOpened(clubId, (await this.clubs.findOne(clubId)).name, shift);
    return shift;
  }

  async close(clubId: string, countedCash: number, note: string | undefined, admin: AuthUser): Promise<ClubShift> {
    this.assertCash(countedCash, "Пересчитанные наличные");
    const text = note?.trim() || undefined;
    if (text && text.length > 500) throw new BadRequestException("Комментарий не длиннее 500 символов");
    const open = await this.findOpen(clubId);
    if (!open) throw new NotFoundException("Открытой смены нет");
    const closed: ShiftRecord = { ...open, closedBy: { id: admin.id, name: admin.name }, closedAt: new Date().toISOString(), countedCash, ...(text ? { note: text } : {}) };
    if (!this.database.configured) this.memory.set(open.id, closed);
    else {
      // Строка смены блокируется на время UPDATE: пополнения, которые держат её через lockOpen,
      // либо успевают до закрытия, либо после него получают отказ.
      const result = await this.database.query(
        "UPDATE club_shifts SET closed_by = $2, closed_by_name = $3, closed_at = $4, counted_cash = $5, note = $6 WHERE id = $1 AND closed_at IS NULL",
        [open.id, admin.id, admin.name, closed.closedAt, countedCash, text ?? null]
      );
      if (result.rowCount === 0) throw new ConflictException("Смену уже закрыл другой сотрудник: обновите страницу");
    }
    const shift = await this.withTotals(closed);
    if (this.alerts) this.alerts.shiftClosed(clubId, (await this.clubs.findOne(clubId)).name, shift);
    return shift;
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
    return this.withTotalsMany(records);
  }

  /** Смена, к которой относится пополнение. Без открытой смены касса деньги не принимает. */
  async requireOpen(clubId: string): Promise<string> {
    const open = await this.findOpen(clubId);
    if (!open) throw new ConflictException("Откройте смену: без неё касса не принимает деньги");
    return open.id;
  }

  /** То же, что requireOpen, но держит строку смены до конца транзакции, чтобы её не закрыли посреди пополнения. */
  async lockOpen(clubId: string, client: PoolClient): Promise<string> {
    const result = await client.query<{ id: string }>("SELECT id FROM club_shifts WHERE club_id = $1 AND closed_at IS NULL FOR SHARE", [clubId]);
    if (!result.rows[0]) throw new ConflictException("Откройте смену: без неё касса не принимает деньги");
    return result.rows[0].id;
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
    return (await this.withTotalsMany([shift]))[0];
  }

  private async withTotalsMany(shifts: ShiftRecord[]): Promise<ClubShift[]> {
    if (shifts.length === 0) return [];
    const computed = this.database.configured ? await this.storedTotals(shifts) : new Map(shifts.map((shift) => [shift.id, this.memoryTotals(shift)]));
    return shifts.map((shift) => {
      const { totals, staff } = computed.get(shift.id) ?? { totals: EMPTY_TOTALS, staff: [] };
      const expectedCash = shift.openingCash + totals.cash;
      return {
        ...shift,
        totals,
        expectedCash,
        ...(shift.countedCash !== undefined ? { difference: shift.countedCash - expectedCash } : {}),
        staff
      };
    });
  }

  /** Четыре запроса на любое число смен: деньги и сотрудники по shift_id, игра и бар — по окну смены. */
  private async storedTotals(shifts: ShiftRecord[]): Promise<Map<string, { totals: ShiftTotals; staff: ShiftStaffTotals[] }>> {
    const ids = shifts.map((shift) => shift.id);
    const [money, play, bar, people] = await Promise.all([
      this.database.query<{ shift_id: string; cash: string; kaspi: string; card: string; top_up_count: string; adjustments: string; adjustment_count: string }>(
        `SELECT shift_id,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'top_up' AND payment_method = 'cash'), 0) AS cash,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'top_up' AND payment_method = 'kaspi'), 0) AS kaspi,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'top_up' AND payment_method = 'card'), 0) AS card,
                COUNT(*) FILTER (WHERE kind = 'top_up') AS top_up_count,
                COALESCE(SUM(amount) FILTER (WHERE kind = 'adjustment'), 0) AS adjustments,
                COUNT(*) FILTER (WHERE kind = 'adjustment') AS adjustment_count
         FROM club_balance_transactions WHERE shift_id = ANY($1) GROUP BY shift_id`,
        [ids]
      ),
      this.database.query<{ id: string; charged: string }>(
        `SELECT s.id, COALESCE(SUM(p.charged), 0) AS charged
         FROM club_shifts s
         LEFT JOIN play_sessions p ON p.club_id = s.club_id AND p.status = 'ended' AND p.ended_at >= s.opened_at AND p.ended_at < COALESCE(s.closed_at, NOW())
         WHERE s.id = ANY($1) GROUP BY s.id`,
        [ids]
      ),
      this.database.query<{ id: string; orders: string; total: string }>(
        `SELECT s.id, COUNT(o.id) AS orders, COALESCE(SUM(o.total), 0) AS total
         FROM club_shifts s
         LEFT JOIN club_orders o ON o.club_id = s.club_id AND o.status = 'delivered' AND o.updated_at >= s.opened_at AND o.updated_at < COALESCE(s.closed_at, NOW())
         WHERE s.id = ANY($1) GROUP BY s.id`,
        [ids]
      ),
      this.database.query<{ shift_id: string; created_by: string | null; name: string | null; cash: string; kaspi: string; card: string; top_up_count: string }>(
        `SELECT t.shift_id, t.created_by, COALESCE(MAX(t.created_by_name), MAX(u.name)) AS name,
                COALESCE(SUM(t.amount) FILTER (WHERE t.payment_method = 'cash'), 0) AS cash,
                COALESCE(SUM(t.amount) FILTER (WHERE t.payment_method = 'kaspi'), 0) AS kaspi,
                COALESCE(SUM(t.amount) FILTER (WHERE t.payment_method = 'card'), 0) AS card,
                COUNT(*) AS top_up_count
         FROM club_balance_transactions t LEFT JOIN users u ON u.id = t.created_by
         WHERE t.shift_id = ANY($1) AND t.kind = 'top_up'
         GROUP BY t.shift_id, t.created_by
         ORDER BY COUNT(*) DESC`,
        [ids]
      )
    ]);
    const byId = new Map(shifts.map((shift) => [shift.id, shift]));
    const result = new Map<string, { totals: ShiftTotals; staff: ShiftStaffTotals[] }>(shifts.map((shift) => [shift.id, { totals: { ...EMPTY_TOTALS }, staff: [] }]));
    for (const row of money.rows) {
      Object.assign(result.get(row.shift_id)!.totals, {
        cash: Number(row.cash),
        kaspi: Number(row.kaspi),
        card: Number(row.card),
        topUpCount: Number(row.top_up_count),
        adjustments: Number(row.adjustments),
        adjustmentCount: Number(row.adjustment_count)
      });
    }
    for (const row of play.rows) result.get(row.id)!.totals.playCharged = Number(row.charged);
    for (const row of bar.rows) Object.assign(result.get(row.id)!.totals, { barOrders: Number(row.orders), barTotal: Number(row.total) });
    for (const row of people.rows) {
      result.get(row.shift_id)!.staff.push({
        userId: row.created_by ?? "",
        name: this.staffName(row.created_by, row.name, byId.get(row.shift_id)!),
        cash: Number(row.cash),
        kaspi: Number(row.kaspi),
        card: Number(row.card),
        topUpCount: Number(row.top_up_count)
      });
    }
    return result;
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
