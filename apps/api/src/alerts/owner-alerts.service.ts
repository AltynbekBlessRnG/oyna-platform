import { Injectable, Logger } from "@nestjs/common";
import type { BookingReceipt, ClubShift } from "@oyna/contracts";
import { TelegramService } from "../auth/telegram/telegram.service";
import { DatabaseService } from "../database/database.service";

/**
 * Сообщения владельцам клуба в Telegram: закрытие смены с недостачей, пропавший компьютер, новая бронь.
 *
 * Пишем только тем, кто сам поделился номером с ботом (при входе в кабинет или кнопкой
 * «Подключить Telegram»): бот не может первым написать человеку, который его не запускал.
 * Сбой Telegram никогда не ломает кассу — уведомление просто теряется с записью в журнал.
 */
@Injectable()
export class OwnerAlertsService {
  private readonly logger = new Logger(OwnerAlertsService.name);
  private readonly memoryChats = new Map<string, string>();

  constructor(
    private readonly database: DatabaseService,
    private readonly telegram: TelegramService
  ) {}

  /** Запоминает чат: номер подтверждён самим Telegram, поэтому ему можно доверять. */
  async rememberChat(phone: string, chatId: string): Promise<void> {
    if (!this.database.configured) {
      this.memoryChats.set(phone, chatId);
      return;
    }
    await this.database.query(
      `INSERT INTO telegram_chats (phone, chat_id, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (phone) DO UPDATE SET chat_id = EXCLUDED.chat_id, updated_at = NOW()`,
      [phone, chatId]
    );
  }

  async isLinked(phone: string): Promise<boolean> {
    return Boolean(await this.chatFor(phone));
  }

  /** Владельцам (роль admin) клуба. Возвращает, скольким ушло сообщение. */
  async notifyOwners(clubId: string, text: string): Promise<number> {
    try {
      const chats = await this.ownerChats(clubId);
      const sent = await Promise.all(chats.map((chatId) => this.telegram.sendText(chatId, text)));
      return sent.filter(Boolean).length;
    } catch (error) {
      this.logger.warn(`Уведомление клубу ${clubId} не отправлено: ${error instanceof Error ? error.message : error}`);
      return 0;
    }
  }

  // ---------- Тексты уведомлений ----------

  shiftOpened(clubId: string, clubName: string, shift: ClubShift): void {
    void this.notifyOwners(clubId, `🟢 ${clubName}: смена открыта\n${shift.openedBy.name}, в кассе ${money(shift.openingCash)}`);
  }

  shiftClosed(clubId: string, clubName: string, shift: ClubShift): void {
    const { totals } = shift;
    const lines = [
      `🔒 ${clubName}: смена закрыта`,
      `Закрыл(а): ${shift.closedBy?.name ?? "—"}`,
      `Принято: наличные ${money(totals.cash)}, Kaspi ${money(totals.kaspi)}, карта ${money(totals.card)}`,
      `В кассе должно быть ${money(shift.expectedCash)}, пересчитано ${money(shift.countedCash ?? 0)}`
    ];
    const difference = shift.difference ?? 0;
    lines.push(difference < 0 ? `⚠️ Недостача ${money(-difference)}` : difference > 0 ? `Излишек ${money(difference)}` : "✅ Касса сходится");
    if (shift.note) lines.push(`Комментарий: ${shift.note}`);
    void this.notifyOwners(clubId, lines.join("\n"));
  }

  bookingCreated(clubName: string, booking: BookingReceipt): void {
    const seats = booking.seatLabels?.join(", ") ?? "";
    void this.notifyOwners(
      booking.clubId,
      `📅 ${clubName}: новая бронь из приложения\n${booking.playerName}, ${booking.zoneName} ${seats}\n${clubTime(booking.startAt)}, ${booking.durationHours} ч — подтвердите в кабинете`
    );
  }

  stationLost(clubId: string, clubName: string, seatLabel: string, playerName: string): void {
    void this.notifyOwners(clubId, `🔴 ${clubName}: место ${seatLabel} не отвечает, а за ним идёт сессия (${playerName}). Время продолжает идти — проверьте компьютер.`);
  }

  private async chatFor(phone: string): Promise<string | undefined> {
    if (!this.database.configured) return this.memoryChats.get(phone);
    const result = await this.database.query<{ chat_id: string }>("SELECT chat_id FROM telegram_chats WHERE phone = $1", [phone]);
    return result.rows[0]?.chat_id;
  }

  private async ownerChats(clubId: string): Promise<string[]> {
    if (!this.database.configured) return [];
    const result = await this.database.query<{ chat_id: string }>(
      `SELECT DISTINCT t.chat_id FROM club_memberships m
       JOIN users u ON u.id = m.user_id
       JOIN telegram_chats t ON t.phone = u.phone
       WHERE m.club_id = $1 AND m.role = 'admin'`,
      [clubId]
    );
    return result.rows.map((row) => row.chat_id);
  }
}

const money = (value: number): string => `${value.toLocaleString("ru-RU").replace(/\u00a0/g, " ")} ₸`;

/** Время клуба — Алматы, UTC+5. */
function clubTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
