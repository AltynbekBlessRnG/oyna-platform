import { Injectable, Logger } from "@nestjs/common";

/**
 * Подтверждение номера через Telegram вместо SMS.
 *
 * Игрок открывает бота по ссылке, жмёт «Поделиться номером» — и Telegram сам
 * отдаёт нам проверенный номер. Это не только бесплатно: код из SMS можно
 * переслать или перехватить, а чужой контакт из Telegram отправить нельзя.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  get botToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  }

  get botUsername(): string {
    return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";
  }

  get configured(): boolean {
    return Boolean(this.botToken && this.botUsername);
  }

  /** Ссылка, по которой бот узнаёт, какую именно сессию входа подтверждают. */
  buildStartUrl(challengeId: string): string | undefined {
    return this.configured ? `https://t.me/${this.botUsername}?start=otp_${challengeId}` : undefined;
  }

  async sendText(chatId: string, text: string): Promise<boolean> {
    return this.send({ chat_id: chatId, text });
  }

  async requestPhoneContact(chatId: string, phone: string): Promise<boolean> {
    return this.send({
      chat_id: chatId,
      text: `Подтверди номер для входа в Zen.\n\nВ приложении указан номер: ${phone}\n\nНажми кнопку ниже — Telegram отправит твой номер сам.`,
      reply_markup: {
        keyboard: [[{ text: "Поделиться номером", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    });
  }

  private async send(payload: Record<string, unknown>): Promise<boolean> {
    if (!this.configured) return false;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        this.logger.warn(`sendMessage вернул ${response.status}: ${await response.text().catch(() => "")}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`Telegram недоступен: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }
}
