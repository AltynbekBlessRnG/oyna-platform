import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthSession, AuthUser, RequestCodeResponse } from "@oyna/contracts";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import type { TokenPayload } from "./auth.types";
import { SmsService } from "./sms/sms.service";

/** Сколько живёт код из SMS. */
const CODE_LIFETIME_MS = 10 * 60_000;

interface Challenge {
  phone: string;
  code: string;
  expiresAt: number;
  attempts: number;
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
    private readonly sms: SmsService = new SmsService()
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
    return { challengeId, expiresInSeconds: CODE_LIFETIME_MS / 1000, ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}) };
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
