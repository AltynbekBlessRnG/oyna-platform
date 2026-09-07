import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthSession, AuthUser, ChallengeStatusResponse, RequestCodeResponse } from "@oyna/contracts";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import type { TokenPayload } from "./auth.types";
import { SmsService } from "./sms/sms.service";
import { phonesMatch } from "./telegram/phone.util";
import { TelegramService } from "./telegram/telegram.service";

/** Сколько живёт код из SMS. */
const CODE_LIFETIME_MS = 10 * 60_000;

export interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    from?: { id?: number };
    contact?: { phone_number?: string; user_id?: number };
  };
}

interface Challenge {
  phone: string;
  code: string;
  expiresAt: number;
  attempts: number;
  telegramChatId?: string;
  verifiedAt?: number;
}

@Injectable()
export class AuthService {
  private readonly challenges = new Map<string, Challenge>();
  private readonly users = new Map<string, AuthUser>();
  private readonly secret = process.env.AUTH_SECRET ?? "oyna-local-development-secret-change-me";

  /** История запросов кода по номеру: защищает от перебора и от лишних платных SMS. */
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly database: DatabaseService,
    private readonly sms: SmsService = new SmsService(),
    private readonly telegram: TelegramService = new TelegramService()
  ) {}

  async requestCode(rawPhone: string): Promise<RequestCodeResponse> {
    const phone = this.normalizePhone(rawPhone);
    await this.assertNotThrottled(phone);
    const challengeId = randomUUID();
    const code = process.env.NODE_ENV === "production" ? String(randomInt(1000, 10000)) : "0000";
    const expiresAt = Date.now() + CODE_LIFETIME_MS;
    if (this.database.configured) {
      await this.database.query("DELETE FROM auth_challenges WHERE expires_at < NOW() - INTERVAL '1 hour'");
      await this.database.query("INSERT INTO auth_challenges (id, phone, code_hash, expires_at) VALUES ($1, $2, $3, $4)", [
        challengeId,
        phone,
        this.hashCode(challengeId, code),
        new Date(expiresAt).toISOString()
      ]);
    } else {
      this.challenges.set(challengeId, { phone, code, expiresAt, attempts: 0 });
    }
    await this.sms.sendCode(phone, code);
    return {
      challengeId,
      expiresInSeconds: CODE_LIFETIME_MS / 1000,
      ...(this.telegram.buildStartUrl(challengeId) ? { telegramBotUrl: this.telegram.buildStartUrl(challengeId) } : {}),
      ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {})
    };
  }

  /** Не чаще одного кода в минуту и не больше пяти в час на номер. */
  private async assertNotThrottled(phone: string): Promise<void> {
    const now = Date.now();
    if (this.database.configured) {
      const result = await this.database.query<{ recent: string; last_at: Date }>(
        `SELECT COUNT(*) AS recent, MAX(created_at) AS last_at FROM auth_challenges
         WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [phone]
      );
      const row = result.rows[0];
      const lastAt = row?.last_at ? new Date(row.last_at).getTime() : 0;
      if (now - lastAt < 60_000) throw new HttpException("Код уже отправлен. Подождите минуту.", HttpStatus.TOO_MANY_REQUESTS);
      if (Number(row?.recent ?? 0) >= 5) throw new HttpException("Слишком много запросов кода. Попробуйте через час.", HttpStatus.TOO_MANY_REQUESTS);
      return;
    }
    const recent = (this.requests.get(phone) ?? []).filter((time) => now - time < 60 * 60_000);
    if (recent.some((time) => now - time < 60_000)) throw new HttpException("Код уже отправлен. Подождите минуту.", HttpStatus.TOO_MANY_REQUESTS);
    if (recent.length >= 5) throw new HttpException("Слишком много запросов кода. Попробуйте через час.", HttpStatus.TOO_MANY_REQUESTS);
    this.requests.set(phone, [...recent, now]);
  }

  async verifyCode(challengeId: string, code: string, name?: string): Promise<AuthSession> {
    const phone = this.database.configured ? await this.consumeStoredChallenge(challengeId, code) : this.consumeMemoryChallenge(challengeId, code);
    const user = await this.upsertUser(phone, name?.trim() || "Игрок Zen");
    return { accessToken: this.signToken(user), user };
  }

  /**
   * Код живёт в базе, а не в памяти процесса: на бесплатном плане Render сервис
   * засыпает и перезапускается, и коды из памяти пропадали прямо между запросом и вводом.
   */
  private async consumeStoredChallenge(challengeId: string, code: string): Promise<string> {
    const result = await this.database.query<{ phone: string; code_hash: string; attempts: number }>(
      "UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1 AND expires_at > NOW() RETURNING phone, code_hash, attempts",
      [challengeId]
    );
    const challenge = result.rows[0];
    if (!challenge) throw new UnauthorizedException("Code expired");
    if (challenge.attempts > 5 || challenge.code_hash !== this.hashCode(challengeId, code)) throw new UnauthorizedException("Invalid code");
    await this.database.query("DELETE FROM auth_challenges WHERE id = $1", [challengeId]);
    return challenge.phone;
  }

  private consumeMemoryChallenge(challengeId: string, code: string): string {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAt < Date.now()) throw new UnauthorizedException("Code expired");
    challenge.attempts += 1;
    if (challenge.attempts > 5 || challenge.code !== code) throw new UnauthorizedException("Invalid code");
    this.challenges.delete(challengeId);
    return challenge.phone;
  }

  /**
   * Опрос сессии, пока игрок ходит в Telegram. Как только номер подтверждён,
   * отдаём токен и закрываем сессию — второй раз по той же ссылке войти нельзя.
   */
  async getChallengeStatus(challengeId: string, name?: string): Promise<ChallengeStatusResponse> {
    const phone = this.database.configured
      ? await this.consumeStoredVerification(challengeId)
      : this.consumeMemoryVerification(challengeId);
    if (!phone) return { status: "pending" };
    const user = await this.upsertUser(phone, name?.trim() || "Игрок Zen");
    return { status: "verified", session: { accessToken: this.signToken(user), user } };
  }

  private async consumeStoredVerification(challengeId: string): Promise<string | undefined> {
    const result = await this.database.query<{ phone: string }>(
      "DELETE FROM auth_challenges WHERE id = $1 AND verified_at IS NOT NULL AND expires_at > NOW() RETURNING phone",
      [challengeId]
    );
    return result.rows[0]?.phone;
  }

  private consumeMemoryVerification(challengeId: string): string | undefined {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || !challenge.verifiedAt || challenge.expiresAt < Date.now()) return undefined;
    this.challenges.delete(challengeId);
    return challenge.phone;
  }

  /** Без секрета вебхук открыт всему интернету: любой мог бы прислать чужой «подтверждённый» контакт. */
  assertWebhookSecret(secret?: string): void {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expected || secret !== expected) throw new UnauthorizedException("Bad webhook secret");
  }

  /**
   * Апдейты бота. Telegram ждёт 200 на всё подряд — иначе он повторяет доставку,
   * поэтому на любую невнятную ситуацию отвечаем игроку текстом, а не ошибкой.
   */
  async handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
    const message = update?.message;
    const chatId = message?.chat?.id?.toString();
    if (!chatId) return;

    const start = message?.text?.trim().match(/^\/start\s+otp_(\S+)$/);
    if (start) {
      const phone = await this.bindChat(start[1], chatId);
      if (!phone) {
        await this.telegram.sendText(chatId, "Сессия входа не найдена или уже закрыта. Вернись в Zen и запроси подтверждение заново.");
        return;
      }
      await this.telegram.requestPhoneContact(chatId, phone);
      return;
    }

    const contact = message?.contact;
    if (!contact) return;

    // Переслать чужой контакт можно, свой — только кнопкой. Отличаем по user_id.
    if (!contact.user_id || contact.user_id !== message?.from?.id) {
      await this.telegram.sendText(chatId, "Нужен твой собственный номер — отправь его кнопкой «Поделиться номером», а не пересланным контактом.");
      return;
    }

    const pending = await this.findPendingByChat(chatId);
    if (!pending) {
      await this.telegram.sendText(chatId, "Активной сессии входа нет. Вернись в Zen и начни вход заново.");
      return;
    }
    if (!phonesMatch(pending.phone, contact.phone_number ?? "")) {
      await this.telegram.sendText(chatId, `Номер из Telegram не совпал с тем, что введён в приложении (${pending.phone}). Введи тот же номер или начни заново.`);
      return;
    }

    await this.markVerified(pending.id);
    await this.telegram.sendText(chatId, "Номер подтверждён. Возвращайся в Zen — вход завершится сам.");
  }

  private async bindChat(challengeId: string, chatId: string): Promise<string | undefined> {
    if (!this.database.configured) {
      const challenge = this.challenges.get(challengeId);
      if (!challenge || challenge.expiresAt < Date.now()) return undefined;
      challenge.telegramChatId = chatId;
      return challenge.phone;
    }
    const result = await this.database.query<{ phone: string }>(
      "UPDATE auth_challenges SET telegram_chat_id = $2 WHERE id = $1 AND expires_at > NOW() RETURNING phone",
      [challengeId, chatId]
    );
    return result.rows[0]?.phone;
  }

  private async findPendingByChat(chatId: string): Promise<{ id: string; phone: string } | undefined> {
    if (!this.database.configured) {
      for (const [id, challenge] of this.challenges) {
        if (challenge.telegramChatId === chatId && !challenge.verifiedAt && challenge.expiresAt > Date.now()) return { id, phone: challenge.phone };
      }
      return undefined;
    }
    const result = await this.database.query<{ id: string; phone: string }>(
      `SELECT id, phone FROM auth_challenges
       WHERE telegram_chat_id = $1 AND verified_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [chatId]
    );
    return result.rows[0];
  }

  private async markVerified(challengeId: string): Promise<void> {
    if (!this.database.configured) {
      const challenge = this.challenges.get(challengeId);
      if (challenge) challenge.verifiedAt = Date.now();
      return;
    }
    await this.database.query("UPDATE auth_challenges SET verified_at = NOW() WHERE id = $1", [challengeId]);
  }

  private hashCode(challengeId: string, code: string): string {
    return createHmac("sha256", this.secret).update(`${challengeId}:${code}`).digest("base64url");
  }

  /** Находит или создаёт пользователя по номеру: нужен для выдачи прав администратора клуба. */
  async ensureUser(rawPhone: string, name?: string): Promise<AuthUser> {
    return this.upsertUser(this.normalizePhone(rawPhone), name?.trim() || "Администратор клуба");
  }

  async grantRole(userId: string, role: AuthUser["role"]): Promise<void> {
    if (!this.database.configured) {
      for (const [phone, user] of this.users) if (user.id === userId) this.users.set(phone, { ...user, role });
      return;
    }
    await this.database.query("UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1", [userId, role]);
  }

  verifyToken(token: string): AuthUser {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) throw new UnauthorizedException("Invalid token");
    const expected = this.signature(encodedPayload);
    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) throw new UnauthorizedException("Invalid token");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) throw new UnauthorizedException("Token expired");
    return { id: payload.id, phone: payload.phone, name: payload.name, role: payload.role ?? "player" };
  }

  private normalizePhone(rawPhone: string): string {
    const digits = rawPhone.replace(/\D/g, "");
    const normalized = digits.startsWith("8") && digits.length === 11 ? `7${digits.slice(1)}` : digits;
    if (!/^7\d{10}$/.test(normalized)) throw new BadRequestException("Use a Kazakhstan phone number");
    return `+${normalized}`;
  }

  private async upsertUser(phone: string, name: string): Promise<AuthUser> {
    if (!this.database.configured) {
      const existing = this.users.get(phone);
      if (existing) return existing;
      const user = { id: randomUUID(), phone, name, role: "player" as const };
      this.users.set(phone, user);
      return user;
    }
    const result = await this.database.query<{ id: string; phone: string; name: string; role: AuthUser["role"] }>(
      `INSERT INTO users (id, phone, name) VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF(users.name, ''), EXCLUDED.name), updated_at = NOW()
       RETURNING id, phone, name, role`,
      [randomUUID(), phone, name]
    );
    return result.rows[0];
  }

  private signToken(user: AuthUser): string {
    const payload: TokenPayload = { ...user, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.signature(encoded)}`;
  }

  private signature(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }
}
