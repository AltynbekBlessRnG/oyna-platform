import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser, ClubAccount, ClubOrder, ClubOrderLine, CreateOrderRequest, MenuItem } from "@oyna/contracts";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ClubsService } from "./clubs.service";
import { CLUB_CATALOG } from "./clubs.data";

interface MenuRow {
  id: string;
  club_id: string;
  category: MenuItem["category"];
  name: string;
  description: string;
  price: number;
  available: boolean;
}

interface OrderRow {
  id: string;
  club_id: string;
  seat_label: string;
  lines: ClubOrderLine[];
  total: number;
  status: ClubOrder["status"];
  comment: string | null;
  created_at: Date | string;
}

interface AccountRow {
  club_id: string;
  nickname: string;
  balance: number;
  bonus_points: number;
  hours_played: number;
  created_at: Date | string;
}

/** Бар и клубные аккаунты игроков: заказ еды с места и своя карточка в каждом клубе. */
@Injectable()
export class ClubHallService {
  private readonly memoryOrders = new Map<string, ClubOrder & { userId: string }>();
  private readonly memoryAccounts = new Map<string, ClubAccount>();

  constructor(
    private readonly database: DatabaseService,
    private readonly clubs: ClubsService
  ) {}

  async findMenu(clubId: string): Promise<MenuItem[]> {
    await this.clubs.findOne(clubId);
    if (!this.database.configured) {
      return (CLUB_CATALOG.find((entry) => entry.club.id === clubId)?.menu ?? []).map((item) => ({ ...item, clubId, available: item.available ?? true }));
    }
    const result = await this.database.query<MenuRow>(
      "SELECT id, club_id, category, name, description, price, available FROM club_menu_items WHERE club_id = $1 ORDER BY sort_order, name",
      [clubId]
    );
    return result.rows.map((row) => this.mapMenuItem(row));
  }

  async createOrder(clubId: string, user: AuthUser, request: CreateOrderRequest): Promise<ClubOrder> {
    const menu = await this.findMenu(clubId);
    const seatLabel = request.seatLabel?.trim() ?? "";
    if (!seatLabel || seatLabel.length > 16) throw new BadRequestException("Укажите номер компьютера, за которым сидите");
    if (!Array.isArray(request.lines) || request.lines.length === 0) throw new BadRequestException("Добавьте хотя бы одну позицию");
    if (request.lines.length > 20) throw new BadRequestException("Не больше 20 позиций в заказе");
    const comment = request.comment?.trim();
    if (comment && comment.length > 200) throw new BadRequestException("Комментарий не длиннее 200 символов");

    const lines: ClubOrderLine[] = request.lines.map((line) => {
      const item = menu.find((entry) => entry.id === line.itemId);
      if (!item) throw new NotFoundException(`Позиция ${line.itemId} не найдена в меню клуба`);
      if (!item.available) throw new BadRequestException(`«${item.name}» сейчас недоступна`);
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
        throw new BadRequestException("Количество должно быть от 1 до 20");
      }
      return { itemId: item.id, name: item.name, price: item.price, quantity: line.quantity };
    });

    const order: ClubOrder = {
      id: randomUUID(),
      clubId,
      seatLabel,
      lines,
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      status: "new",
      ...(comment ? { comment } : {}),
      createdAt: new Date().toISOString()
    };
    if (!this.database.configured) {
      this.memoryOrders.set(order.id, { ...order, userId: user.id });
      return order;
    }
    await this.database.query(
      "INSERT INTO club_orders (id, club_id, user_id, seat_label, lines, total, status, comment) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)",
      [order.id, clubId, user.id, order.seatLabel, JSON.stringify(order.lines), order.total, order.status, comment ?? null]
    );
    return order;
  }

  async findMyOrders(clubId: string, userId: string): Promise<ClubOrder[]> {
    if (!this.database.configured) {
      return [...this.memoryOrders.values()]
        .filter((order) => order.clubId === clubId && order.userId === userId)
        .map(({ userId: _owner, ...order }) => order)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    const result = await this.database.query<OrderRow>(
      "SELECT id, club_id, seat_label, lines, total, status, comment, created_at FROM club_orders WHERE club_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20",
      [clubId, userId]
    );
    return result.rows.map((row) => this.mapOrder(row));
  }

  /** Клубный аккаунт заводится при первом обращении: у игрока свой ник и бонусы в каждом клубе. */
  async getAccount(clubId: string, user: AuthUser): Promise<ClubAccount> {
    const club = await this.clubs.findOne(clubId);
    if (!this.database.configured) {
      const key = `${clubId}:${user.id}`;
      const existing = this.memoryAccounts.get(key);
      if (existing) return existing;
      const account: ClubAccount = {
        clubId,
        clubName: club.name,
        nickname: user.name,
        balance: 0,
        bonusPoints: 0,
        hoursPlayed: 0,
        joinedAt: new Date().toISOString()
      };
      this.memoryAccounts.set(key, account);
      return account;
    }
    await this.database.query(
      "INSERT INTO club_accounts (club_id, user_id, nickname) VALUES ($1, $2, $3) ON CONFLICT (club_id, user_id) DO NOTHING",
      [clubId, user.id, user.name]
    );
    const result = await this.database.query<AccountRow>(
      `SELECT a.club_id, a.nickname, a.balance, a.bonus_points, a.created_at,
              COALESCE((SELECT SUM(b.duration_hours) FROM bookings b
                        WHERE b.club_id = a.club_id AND b.user_id = a.user_id AND b.status IN ('confirmed', 'completed')), 0) AS hours_played
       FROM club_accounts a WHERE a.club_id = $1 AND a.user_id = $2`,
      [clubId, user.id]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Клубный аккаунт не найден");
    return { ...this.mapAccount(row), clubName: club.name };
  }

  async renameAccount(clubId: string, user: AuthUser, nickname: string): Promise<ClubAccount> {
    const value = nickname?.trim() ?? "";
    if (value.length < 2 || value.length > 32) throw new BadRequestException("Ник должен быть от 2 до 32 символов");
    const account = await this.getAccount(clubId, user);
    if (!this.database.configured) {
      const updated = { ...account, nickname: value };
      this.memoryAccounts.set(`${clubId}:${user.id}`, updated);
      return updated;
    }
    await this.database.query("UPDATE club_accounts SET nickname = $3 WHERE club_id = $1 AND user_id = $2", [clubId, user.id, value]);
    return { ...account, nickname: value };
  }

  private mapMenuItem(row: MenuRow): MenuItem {
    return { id: row.id, clubId: row.club_id, category: row.category, name: row.name, description: row.description, price: row.price, available: row.available };
  }

  private mapOrder(row: OrderRow): ClubOrder {
    return {
      id: row.id,
      clubId: row.club_id,
      seatLabel: row.seat_label,
      lines: row.lines,
      total: row.total,
      status: row.status,
      ...(row.comment ? { comment: row.comment } : {}),
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  private mapAccount(row: AccountRow): ClubAccount {
    return {
      clubId: row.club_id,
      clubName: "",
      nickname: row.nickname,
      balance: row.balance,
      bonusPoints: row.bonus_points,
      hoursPlayed: Number(row.hours_played),
      joinedAt: new Date(row.created_at).toISOString()
    };
  }
}
