import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthSession, AuthUser, RequestCodeResponse } from "@oyna/contracts";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import type { TokenPayload } from "./auth.types";

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

  constructor(private readonly database: DatabaseService) {}

  requestCode(rawPhone: string): RequestCodeResponse {
    const phone = this.normalizePhone(rawPhone);
    const challengeId = randomUUID();
    const code = process.env.NODE_ENV === "production" ? String(randomInt(1000, 10000)) : "0000";
    this.challenges.set(challengeId, { phone, code, expiresAt: Date.now() + 5 * 60_000, attempts: 0 });
    // Explicit console delivery is suitable only for a controlled pilot environment.
    if (process.env.OTP_PROVIDER === "console") console.info(`[OTP] ${phone}: ${code}`);
    return { challengeId, expiresInSeconds: 300, ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}) };
  }

  async verifyCode(challengeId: string, code: string, name?: string): Promise<AuthSession> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAt < Date.now()) throw new UnauthorizedException("Code expired");
    challenge.attempts += 1;
    if (challenge.attempts > 5 || challenge.code !== code) throw new UnauthorizedException("Invalid code");
    this.challenges.delete(challengeId);
    const user = await this.upsertUser(challenge.phone, name?.trim() || "Игрок OYNA");
    return { accessToken: this.signToken(user), user };
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
