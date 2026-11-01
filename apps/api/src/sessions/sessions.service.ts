import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  UnauthorizedException
} from "@nestjs/common";
import type {
  AuthUser,
  ClubSeatMap,
  ClubStation,
  ClubOrder,
  ClubZone,
  CreateOrderRequest,
  PlaySession,
  PaymentMethod,
  PlaySessionEndReason,
  StationCommand,
  StationCommandResult,
  StationCredentials,
  StationEnrollment,
  StationEnrollmentCode,
  StationLoginCode,
  StationState,
  TopUpResult
} from "@oyna/contracts";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { AuthService, GUEST_PHONE_PREFIX } from "../auth/auth.service";
import { createSeats } from "../bookings/bookings.data";
import { BookingsService, type SeatReservation } from "../bookings/bookings.service";
import { ClubHallService } from "../clubs/club-hall.service";
import { ClubPackagesService, packageAvailableAt, packageMinutesAt } from "../clubs/club-packages.service";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { ShiftsService } from "../shifts/shifts.service";

const MAX_SESSION_MINUTES = 12 * 60;
const LOGIN_CODE_TTL_MS = 2 * 60_000;
const SWEEP_INTERVAL_MS = 15_000;
const CLAIM_ATTEMPTS_PER_MINUTE = 10;
const MAX_TOP_UP = 1_000_000;
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "kaspi", "card"];
const ENROLLMENT_CODE_TTL_MS = 24 * 60 * 60_000;
// Без 0/O, 1/I/L: код читают с экрана кабинета и набирают руками на каждом компьютере.
const ENROLLMENT_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ENROLLMENT_FAILURES_PER_10_MIN = 10;

type Player = Pick<AuthUser, "id" | "name"> & { phone?: string };

interface StationRecord {
  id: string;
  clubId: string;
  seatId: string;
  name: string;
  tokenHash: string;
  lastSeenAt?: string;
  createdAt: string;
}

interface StationRow {
  id: string;
  club_id: string;
  seat_id: string;
  name: string;
  token_hash: string;
  last_seen_at: Date | string | null;
  created_at: Date | string;
}

/** Сессия вместе с потолком времени, который выбрали при запуске: нужен, чтобы пополнение не продлило её сверх него. */
type StoredSession = PlaySession & { limitMinutes?: number };

interface SessionRow {
  id: string;
  club_id: string;
  seat_id: string;
  seat_label: string;
  zone_id: string;
  zone_name: string;
  user_id: string;
  player_name: string;
  player_phone_tail: string | null;
  price_per_hour: number;
  started_at: Date | string;
  ends_at: Date | string;
  status: PlaySession["status"];
  ended_at: Date | string | null;
  end_reason: PlaySessionEndReason | null;
  charged: number | null;
  limit_minutes: number | null;
  package_id: string | null;
  package_name: string | null;
  package_price: number | null;
}

interface ResolvedSeat {
  zone: ClubZone;
  seatId: string;
  seatLabel: string;
}

/** `null` — компьютер удалён или ключ сменён: старое подключение надо разорвать. */
export type StationListener = (stationId: string, state: StationState | null) => void;
/** Доставка команды компьютеру; `true`, если он подтвердил получение. Регистрирует шлюз компьютеров. */
export type StationCommandSender = (stationId: string, command: StationCommand) => Promise<boolean>;

const SESSION_COLUMNS =
  "id, club_id, seat_id, seat_label, zone_id, zone_name, user_id, player_name, player_phone_tail, price_per_hour, started_at, ends_at, status, ended_at, end_reason, charged, limit_minutes, package_id, package_name, package_price";

/**
 * Компьютеры с клиентом Vence и игровые сессии за ними.
 * Время оплачивается с клубного баланса: сессия идёт, пока его хватает, и списывается по факту при завершении.
 */
@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionsService.name);
  private readonly memoryStations = new Map<string, StationRecord>();
  private readonly memorySessions = new Map<string, StoredSession>();
  /** Коды входа живут две минуты, поэтому им хватает памяти процесса. */
  private readonly loginCodes = new Map<string, { stationId: string; expiresAt: number }>();
  private readonly claimAttempts = new Map<string, number[]>();
  private readonly memoryEnrollment = new Map<string, { clubId: string; expiresAt: number }>();
  private readonly enrollmentFailures = new Map<string, number[]>();
  private readonly connected = new Set<string>();
  private readonly listeners = new Set<StationListener>();
  private commandSender?: StationCommandSender;
  private sweeper?: NodeJS.Timeout;

  constructor(
    private readonly database: DatabaseService,
    private readonly clubs: ClubsService,
    private readonly hall: ClubHallService,
    private readonly auth: AuthService,
    private readonly bookings: BookingsService,
    private readonly shifts: ShiftsService,
    private readonly packages: ClubPackagesService
  ) {
    bookings.useSessionOccupancy(async (clubId, from, to) =>
      (await this.listActive(clubId)).filter((session) => Date.parse(session.startedAt) < to && Date.parse(session.endsAt) > from).map((session) => session.seatId)
    );
  }

  onModuleInit(): void {
    this.sweeper = setInterval(() => {
      this.expireDue().catch((error: unknown) => this.logger.error(`Не удалось завершить истёкшие сессии: ${String(error)}`));
    }, SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  /** Клиент на компьютере узнаёт о каждом изменении своей сессии. */
  onStationChange(listener: StationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  useCommandSender(sender: StationCommandSender): void {
    this.commandSender = sender;
  }

  // ---------- Компьютеры ----------

  /** Сообщение, перезагрузка или выключение одного компьютера из кабинета. */
  async sendCommand(clubId: string, stationId: string, command: StationCommand): Promise<StationCommandResult> {
    const normalized = this.normalizeCommand(command);
    const record = await this.findStationRecord(stationId);
    if (!record || record.clubId !== clubId) throw new NotFoundException("Компьютер не найден");
    const seat = (await this.seatIndex(clubId)).get(record.seatId);
    if (!this.connected.has(record.id)) throw new ConflictException("Компьютер не на связи: команда не дойдёт");
    return { stationId: record.id, seatLabel: seat?.seatLabel ?? "—", delivered: await this.deliver(record.id, normalized) };
  }

  /** Перезагрузить или выключить все свободные компьютеры: тех, за кем играют, не трогаем. */
  async sendCommandToFree(clubId: string, command: StationCommand): Promise<StationCommandResult[]> {
    const normalized = this.normalizeCommand(command);
    if (normalized.type === "message") throw new BadRequestException("Сообщение отправляется одному компьютеру");
    const [records, seats, active] = await Promise.all([this.findStationRecords(clubId), this.seatIndex(clubId), this.listActive(clubId)]);
    const busy = new Set(active.map((session) => session.seatId));
    const targets = records.filter((record) => this.connected.has(record.id) && !busy.has(record.seatId));
    return Promise.all(
      targets.map(async (record) => ({ stationId: record.id, seatLabel: seats.get(record.seatId)?.seatLabel ?? "—", delivered: await this.deliver(record.id, normalized) }))
    );
  }

  private normalizeCommand(command: StationCommand): StationCommand {
    if (!command || !["message", "restart", "shutdown"].includes(command.type)) throw new BadRequestException("Команда: message, restart или shutdown");
    if (command.type !== "message") return { type: command.type };
    const text = String(command.text ?? "").trim();
    if (!text || text.length > 200) throw new BadRequestException("Сообщение от 1 до 200 символов");
    return { type: "message", text };
  }

  private async deliver(stationId: string, command: StationCommand): Promise<boolean> {
    if (!this.commandSender) return false;
    try {
      return await this.commandSender(stationId, command);
    } catch (error) {
      this.logger.warn(`Команда ${command.type} компьютеру ${stationId} не дошла: ${String(error)}`);
      return false;
    }
  }

  async listStations(clubId: string): Promise<ClubStation[]> {
    const records = await this.findStationRecords(clubId);
    const seats = await this.seatIndex(clubId);
    return records.map((record) => this.toStation(record, seats.get(record.seatId)));
  }

  async registerStation(clubId: string, seatId: string, name?: string): Promise<StationCredentials> {
    const seat = await this.resolveSeat(clubId, seatId);
    const label = name?.trim() || `ПК ${seat.seatLabel}`;
    if (label.length > 40) throw new BadRequestException("Название компьютера не длиннее 40 символов");
    const token = this.createToken();
    const record: StationRecord = { id: randomUUID(), clubId, seatId: seat.seatId, name: label, tokenHash: this.hashToken(token), createdAt: new Date().toISOString() };
    if (!this.database.configured) {
      if ([...this.memoryStations.values()].some((station) => station.seatId === seat.seatId)) throw this.seatTaken();
      this.memoryStations.set(record.id, record);
    } else {
      try {
        await this.database.query("INSERT INTO club_stations (id, club_id, seat_id, name, token_hash) VALUES ($1, $2, $3, $4, $5)", [
          record.id,
          clubId,
          record.seatId,
          record.name,
          record.tokenHash
        ]);
      } catch (error) {
        if (this.isUniqueViolation(error)) throw this.seatTaken();
        throw error;
      }
    }
    return { station: this.toStation(record, seat), token };
  }

  /** Новый ключ, если старый потерян или утёк: прежний сразу перестаёт работать. */
  async rotateStationToken(clubId: string, stationId: string): Promise<StationCredentials> {
    const record = await this.findStationRecord(stationId);
    if (!record || record.clubId !== clubId) throw new NotFoundException("Компьютер не найден");
    const token = this.createToken();
    const updated = { ...record, tokenHash: this.hashToken(token) };
    if (!this.database.configured) this.memoryStations.set(record.id, updated);
    else await this.database.query("UPDATE club_stations SET token_hash = $2 WHERE id = $1", [record.id, updated.tokenHash]);
    this.revoke(record.id);
    const seats = await this.seatIndex(clubId);
    return { station: this.toStation(updated, seats.get(record.seatId)), token };
  }

  async removeStation(clubId: string, stationId: string): Promise<void> {
    const record = await this.findStationRecord(stationId);
    if (!record || record.clubId !== clubId) throw new NotFoundException("Компьютер не найден");
    if (await this.findActiveBySeat(record.seatId)) throw new ConflictException("За компьютером идёт сессия: сначала завершите её");
    if (!this.database.configured) this.memoryStations.delete(record.id);
    else await this.database.query("DELETE FROM club_stations WHERE id = $1", [record.id]);
    this.revoke(record.id);
    for (const [code, entry] of this.loginCodes) if (entry.stationId === record.id) this.loginCodes.delete(code);
  }

  // ---------- Подключение компьютеров по коду клуба ----------

  /** Новый код клуба на сутки; прежний сразу перестаёт работать. */
  async issueEnrollmentCode(clubId: string, now = Date.now()): Promise<StationEnrollmentCode> {
    await this.clubs.findOne(clubId);
    const raw = Array.from({ length: 8 }, () => ENROLLMENT_ALPHABET[randomInt(ENROLLMENT_ALPHABET.length)]).join("");
    const expiresAt = now + ENROLLMENT_CODE_TTL_MS;
    const codeHash = this.hashToken(raw);
    if (!this.database.configured) {
      for (const [hash, entry] of this.memoryEnrollment) if (entry.clubId === clubId || entry.expiresAt <= now) this.memoryEnrollment.delete(hash);
      this.memoryEnrollment.set(codeHash, { clubId, expiresAt });
    } else {
      await this.database.query("DELETE FROM station_enrollment_codes WHERE club_id = $1 OR expires_at < NOW()", [clubId]);
      await this.database.query("INSERT INTO station_enrollment_codes (code_hash, club_id, expires_at) VALUES ($1, $2, $3)", [
        codeHash,
        clubId,
        new Date(expiresAt).toISOString()
      ]);
    }
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: new Date(expiresAt).toISOString() };
  }

  /** Компьютер ввёл код клуба: показываем, какой это клуб и какие места есть. */
  async lookupEnrollment(code: string, requester: string, now = Date.now()): Promise<StationEnrollment> {
    const clubId = await this.resolveEnrollment(code, requester, now);
    const [club, seats, stations] = await Promise.all([this.clubs.findOne(clubId), this.seatIndex(clubId), this.findStationRecords(clubId)]);
    const taken = new Set(stations.map((station) => station.seatId));
    return {
      clubName: club.name,
      seats: [...seats.values()].map((seat) => ({ seatId: seat.seatId, label: seat.seatLabel, zoneName: seat.zone.name, taken: taken.has(seat.seatId) }))
    };
  }

  async enrollStation(code: string, seatId: string, requester: string, now = Date.now()): Promise<StationCredentials> {
    const clubId = await this.resolveEnrollment(code, requester, now);
    await this.resolveSeat(clubId, seatId);
    const existing = (await this.findStationRecords(clubId)).find((station) => station.seatId === seatId);
    if (!existing) return this.registerStation(clubId, seatId);
    // Компьютер переустановили или «заморозка» стёрла его ключ: тому же месту — новый ключ.
    if (await this.findActiveBySeat(seatId)) throw new ConflictException("За этим местом идёт сессия: дождитесь её конца");
    return this.rotateStationToken(clubId, existing.id);
  }

  private async resolveEnrollment(code: string, requester: string, now: number): Promise<string> {
    const failures = (this.enrollmentFailures.get(requester) ?? []).filter((at) => at > now - 10 * 60_000);
    if (failures.length >= ENROLLMENT_FAILURES_PER_10_MIN) throw new HttpException("Слишком много неверных кодов: подождите 10 минут", HttpStatus.TOO_MANY_REQUESTS);
    const codeHash = this.hashToken(String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
    let clubId: string | undefined;
    if (!this.database.configured) {
      const entry = this.memoryEnrollment.get(codeHash);
      clubId = entry && entry.expiresAt > now ? entry.clubId : undefined;
    } else {
      const result = await this.database.query<{ club_id: string }>("SELECT club_id FROM station_enrollment_codes WHERE code_hash = $1 AND expires_at > $2", [
        codeHash,
        new Date(now).toISOString()
      ]);
      clubId = result.rows[0]?.club_id;
    }
    if (clubId) return clubId;
    this.enrollmentFailures.set(requester, [...failures, now]);
    // Карта адресов не должна расти бесконечно: выбрасываем тех, у кого все промахи старше 10 минут.
    if (this.enrollmentFailures.size > 1_000) {
      for (const [key, times] of this.enrollmentFailures) if (times.every((at) => at <= now - 10 * 60_000)) this.enrollmentFailures.delete(key);
    }
    throw new UnauthorizedException("Код клуба неверный или устарел: получите новый в кабинете");
  }

  /** Проверка ключа клиента при подключении. */
  async authenticateStation(stationId: string, token: string): Promise<StationRecord> {
    const record = stationId ? await this.findStationRecord(stationId) : undefined;
    if (!record || !token) throw new UnauthorizedException("Неизвестный компьютер");
    const supplied = Buffer.from(this.hashToken(token));
    const expected = Buffer.from(record.tokenHash);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new UnauthorizedException("Неверный ключ компьютера");
    return record;
  }

  async setStationOnline(stationId: string, online: boolean): Promise<void> {
    if (online) this.connected.add(stationId);
    else this.connected.delete(stationId);
    await this.touchStation(stationId);
  }

  async touchStation(stationId: string): Promise<void> {
    const now = new Date().toISOString();
    if (!this.database.configured) {
      const record = this.memoryStations.get(stationId);
      if (record) this.memoryStations.set(stationId, { ...record, lastSeenAt: now });
      return;
    }
    await this.database.query("UPDATE club_stations SET last_seen_at = NOW() WHERE id = $1", [stationId]);
  }

  async getStationState(stationId: string): Promise<StationState> {
    const record = await this.findStationRecord(stationId);
    if (!record) throw new NotFoundException("Компьютер не найден");
    const [seats, club] = await Promise.all([this.seatIndex(record.clubId), this.clubs.findOne(record.clubId)]);
    const seat = seats.get(record.seatId);
    const session = (await this.findActiveBySeat(record.seatId)) ?? null;
    const account = session ? await this.hall.getAccount(record.clubId, { id: session.userId, name: session.playerName }) : undefined;
    return {
      station: this.toStation(record, seat),
      clubName: club.name,
      zone: seat ? { name: seat.zone.name, pricePerHour: seat.zone.pricePerHour } : null,
      session,
      ...(account ? { playerBalance: account.balance } : {}),
      serverTime: new Date().toISOString()
    };
  }

  /** Заказ из бара с экрана компьютера: от имени того, кто сейчас за ним сидит. Оплата — при выдаче, как и из приложения. */
  async orderFromStation(stationId: string, request: Pick<CreateOrderRequest, "lines" | "comment">): Promise<ClubOrder> {
    const record = await this.findStationRecord(stationId);
    const session = record ? await this.findActiveBySeat(record.seatId) : undefined;
    if (!record || !session) throw new ConflictException("Заказать можно только во время сессии");
    const player: AuthUser = { id: session.userId, name: session.playerName, phone: "", role: "player" };
    return this.hall.createOrder(record.clubId, player, { seatLabel: session.seatLabel, lines: request?.lines, ...(request?.comment ? { comment: request.comment } : {}) });
  }

  /** Код для экрана блокировки: игрок вводит или сканирует его в приложении и садится за компьютер. */
  async issueLoginCode(stationId: string, now = Date.now()): Promise<StationLoginCode> {
    for (const [code, entry] of this.loginCodes) if (entry.stationId === stationId || entry.expiresAt <= now) this.loginCodes.delete(code);
    let code: string;
    do code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    while (this.loginCodes.has(code));
    const expiresAt = now + LOGIN_CODE_TTL_MS;
    this.loginCodes.set(code, { stationId, expiresAt });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  // ---------- Сессии ----------

  /** Игрок вводит код с экрана компьютера: так сервер знает, что он действительно сидит за ним. */
  async claimStation(user: AuthUser, code: string, minutes?: number, now = Date.now()): Promise<PlaySession> {
    this.assertClaimAllowed(user.id, now);
    const entry = this.loginCodes.get(String(code ?? "").trim());
    if (!entry || entry.expiresAt <= now) throw new BadRequestException("Код устарел: возьмите новый с экрана компьютера");
    const record = await this.findStationRecord(entry.stationId);
    if (!record) throw new BadRequestException("Компьютер больше не подключён к клубу");
    const session = await this.start(record.clubId, record.seatId, user, minutes, now);
    this.loginCodes.delete(String(code).trim());
    return session;
  }

  /** Запуск с кассы: администратор садит игрока за компьютер по номеру телефона. */
  /**
   * Посадка с кассы. С телефоном — постоянный игрок с балансом; без телефона — гость, который
   * обязательно платит сразу. Оплата `payment` сначала пополняет баланс, потом начинается сессия;
   * если сесть не вышло (место заняли, пакет не продаётся), деньги гостя сразу сторнируются,
   * а у игрока с телефоном остаются на балансе.
   */
  async startForPlayer(
    clubId: string,
    seatId: string,
    phone: string | undefined,
    minutes?: number,
    packageId?: string,
    payment?: { amount: number; method?: PaymentMethod },
    admin?: AuthUser
  ): Promise<PlaySession> {
    const guest = !phone?.trim();
    if (payment) {
      if (!Number.isInteger(payment.amount) || payment.amount < 1 || payment.amount > MAX_TOP_UP) throw new BadRequestException(`Оплата от 1 до ${MAX_TOP_UP} ₸`);
      if (payment.method !== undefined && !PAYMENT_METHODS.includes(payment.method)) throw new BadRequestException("Способ оплаты: наличные, Kaspi или карта");
      if (!admin) throw new BadRequestException("Оплату принимает сотрудник кассы");
    }
    if (guest && !payment) throw new BadRequestException("Гость без телефона садится только с оплатой");
    if (!payment) return this.start(clubId, seatId, await this.auth.ensureUser(phone!, "Игрок Vence"), minutes, Date.now(), packageId);

    await this.resolveSeat(clubId, seatId);
    await this.shifts.requireOpen(clubId);
    const player = guest ? await this.auth.createGuest() : await this.auth.ensureUser(phone!, "Игрок Vence");
    const method = payment.method ?? "cash";
    await this.credit(clubId, player, payment.amount, admin!, method);
    try {
      return await this.start(clubId, seatId, player, minutes, Date.now(), packageId);
    } catch (error) {
      if (guest) await this.credit(clubId, player, -payment.amount, admin!, method);
      throw error;
    }
  }

  /** Без пакета сессия идёт, пока хватает баланса; с пакетом его цена списывается сразу, а время задаёт пакет. */
  async start(clubId: string, seatId: string, player: Player, minutes?: number, now = Date.now(), packageId?: string): Promise<PlaySession> {
    const seat = await this.resolveSeat(clubId, seatId);
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_SESSION_MINUTES)) {
      throw new BadRequestException(`Время сессии от 1 до ${MAX_SESSION_MINUTES} минут`);
    }
    if (packageId && minutes !== undefined) throw new BadRequestException("Выберите либо пакет, либо время");
    const pack = packageId ? await this.packages.find(clubId, packageId) : undefined;
    if (pack) {
      if (!pack.active) throw new BadRequestException(`Пакет «${pack.name}» сейчас выключен`);
      if (pack.zoneIds.length > 0 && !pack.zoneIds.includes(seat.zone.id)) throw new BadRequestException(`Пакет «${pack.name}» не действует в зоне ${seat.zone.name}`);
      if (!packageAvailableAt(pack, now)) throw new BadRequestException(`Пакет «${pack.name}» продаётся с ${pack.availableFrom} до ${pack.availableTo}`);
    }
    const packMinutes = pack ? packageMinutesAt(pack, now) : undefined;
    const reservations = await this.foreignReservations(clubId, seat.seatId, player.id, now);
    if (reservations.some((reservation) => reservation.start <= now)) throw new ConflictException("Место сейчас забронировано другим игроком");
    const bookingLimit = this.minutesUntilBooking(reservations, now);
    if (bookingLimit !== undefined && bookingLimit < 1) throw new ConflictException("Через минуту на этом месте начинается чужая бронь");
    // Пакет не обрезаем бронью: игрок заплатил за всё время, поэтому лучше отказать сразу.
    if (pack && packMinutes !== undefined && bookingLimit !== undefined && bookingLimit < packMinutes) {
      throw new ConflictException(`Пакет «${pack.name}» не помещается: через ${bookingLimit} мин на этом месте чужая бронь`);
    }
    const effectiveLimit = this.minLimit(minutes, bookingLimit);
    const sessionEndsAt = (balance: number): string =>
      pack && packMinutes !== undefined ? new Date(now + packMinutes * 60_000).toISOString() : this.endsAt(now, seat.zone.pricePerHour, balance, effectiveLimit);
    const base = {
      id: randomUUID(),
      clubId,
      seatId: seat.seatId,
      seatLabel: seat.seatLabel,
      zoneId: seat.zone.id,
      zoneName: seat.zone.name,
      userId: player.id,
      playerName: player.name,
      ...(player.phone && !player.phone.startsWith(GUEST_PHONE_PREFIX) ? { playerPhoneTail: player.phone.replace(/\D/g, "").slice(-4) } : {}),
      pricePerHour: seat.zone.pricePerHour,
      startedAt: new Date(now).toISOString(),
      status: "active" as const,
      ...(minutes ? { limitMinutes: minutes } : {}),
      ...(pack ? { packageId: pack.id, packageName: pack.name, packagePrice: pack.price } : {})
    };
    const packageCharge = { kind: "session" as const, refId: base.id };

    let session: StoredSession;
    if (!this.database.configured) {
      const active = [...this.memorySessions.values()].filter((item) => item.status === "active");
      if (active.some((item) => item.seatId === seat.seatId)) throw new ConflictException("Компьютер уже занят");
      if (active.some((item) => item.clubId === clubId && item.userId === player.id)) throw new ConflictException("У игрока уже идёт сессия в этом клубе");
      const { balance } = await this.hall.getAccount(clubId, player);
      session = { ...base, endsAt: sessionEndsAt(balance) };
      if (pack && pack.price > 0) await this.hall.changeBalance(clubId, player, -pack.price, packageCharge);
      this.memorySessions.set(session.id, session);
    } else {
      session = await this.database.transaction(async (client) => {
        // Занятость проверяем раньше баланса, чтобы касса видела настоящую причину отказа.
        // Гонку двух одновременных запусков всё равно ловят уникальные индексы ниже.
        const busy = await client.query<{ seat_id: string }>(
          "SELECT seat_id FROM play_sessions WHERE status = 'active' AND (seat_id = $1 OR (club_id = $2 AND user_id = $3))",
          [seat.seatId, clubId, player.id]
        );
        if (busy.rows.some((row) => row.seat_id === seat.seatId)) throw new ConflictException("Компьютер уже занят");
        if (busy.rows.length > 0) throw new ConflictException("У игрока уже идёт сессия в этом клубе");
        const balance = await this.lockBalance(client, clubId, player);
        if (pack && balance < pack.price) throw new BadRequestException(`На балансе ${balance} ₸, а пакет «${pack.name}» стоит ${pack.price} ₸`);
        const created: StoredSession = { ...base, endsAt: sessionEndsAt(balance) };
        try {
          await client.query(
            `INSERT INTO play_sessions (id, club_id, seat_id, seat_label, zone_id, zone_name, user_id, player_name, player_phone_tail, price_per_hour, started_at, ends_at, status, limit_minutes, package_id, package_name, package_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', $13, $14, $15, $16)`,
            [created.id, clubId, created.seatId, created.seatLabel, created.zoneId, created.zoneName, player.id, player.name, created.playerPhoneTail ?? null, created.pricePerHour, created.startedAt, created.endsAt, minutes ?? null, pack?.id ?? null, pack?.name ?? null, pack?.price ?? null]
          );
        } catch (error) {
          if (!this.isUniqueViolation(error)) throw error;
          const constraint = (error as { constraint?: string }).constraint;
          throw new ConflictException(constraint === "play_sessions_active_user_idx" ? "У игрока уже идёт сессия в этом клубе" : "Компьютер уже занят");
        }
        if (pack && pack.price > 0) await this.hall.changeBalance(clubId, player, -pack.price, packageCharge, client);
        return created;
      });
    }
    await this.publish(session.seatId);
    return this.toPublic(session);
  }

  async endByPlayer(sessionId: string, user: AuthUser): Promise<PlaySession> {
    const session = await this.findSession(sessionId);
    if (!session || session.userId !== user.id) throw new NotFoundException("Сессия не найдена");
    return this.end(sessionId, "player");
  }

  async endByClub(clubId: string, sessionId: string): Promise<PlaySession> {
    const session = await this.findSession(sessionId);
    if (!session || session.clubId !== clubId) throw new NotFoundException("Сессия не найдена");
    return this.end(sessionId, "admin");
  }

  /** Игрок нажал «Завершить» на самом компьютере. */
  async endFromStation(stationId: string): Promise<PlaySession | null> {
    const record = await this.findStationRecord(stationId);
    const active = record ? await this.findActiveBySeat(record.seatId) : undefined;
    return active ? this.end(active.id, "station") : null;
  }

  /**
   * Завершение со списанием по факту: поминутно, но не дольше оплаченного времени.
   * Повторный вызов для уже завершённой сессии ничего не списывает.
   */
  async end(sessionId: string, reason: PlaySessionEndReason, now = Date.now()): Promise<PlaySession> {
    let ended: StoredSession;
    if (!this.database.configured) {
      const session = this.memorySessions.get(sessionId);
      if (!session) throw new NotFoundException("Сессия не найдена");
      if (session.status !== "active") return this.toPublic(session);
      const player = { id: session.userId, name: session.playerName };
      const charged = await this.settle(session, now, async (amount) => {
        const { balance } = await this.hall.getAccount(session.clubId, player);
        const due = Math.min(amount, balance);
        if (due > 0) await this.hall.changeBalance(session.clubId, player, -due, { kind: "session", refId: session.id });
        return due;
      });
      ended = { ...session, status: "ended", endedAt: new Date(Math.min(now, Date.parse(session.endsAt))).toISOString(), endReason: reason, charged };
      this.memorySessions.set(sessionId, ended);
    } else {
      const result = await this.database.transaction(async (client) => {
        const found = await client.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM play_sessions WHERE id = $1 FOR UPDATE`, [sessionId]);
        const row = found.rows[0];
        if (!row) throw new NotFoundException("Сессия не найдена");
        const session = this.mapSession(row);
        if (session.status !== "active") return { session, changed: false };
        const player = { id: session.userId, name: session.playerName };
        const charged = await this.settle(session, now, async (amount) => {
          const balance = await this.lockBalance(client, session.clubId, player);
          const due = Math.min(amount, balance);
          if (due > 0) await this.hall.changeBalance(session.clubId, player, -due, { kind: "session", refId: session.id }, client);
          return due;
        });
        const endedAt = new Date(Math.min(now, Date.parse(session.endsAt))).toISOString();
        await client.query("UPDATE play_sessions SET status = 'ended', ended_at = $2, end_reason = $3, charged = $4 WHERE id = $1", [sessionId, endedAt, reason, charged]);
        return { session: { ...session, status: "ended" as const, endedAt, endReason: reason, charged }, changed: true };
      });
      if (!result.changed) return this.toPublic(result.session);
      ended = result.session;
    }
    await this.publish(ended.seatId);
    return this.toPublic(ended);
  }

  /** Сессии, у которых кончилось оплаченное время. Вызывается по таймеру. */
  async expireDue(now = Date.now()): Promise<number> {
    let dueIds: string[];
    if (!this.database.configured) {
      dueIds = [...this.memorySessions.values()].filter((item) => item.status === "active" && Date.parse(item.endsAt) <= now).map((item) => item.id);
    } else {
      const result = await this.database.query<{ id: string }>("SELECT id FROM play_sessions WHERE status = 'active' AND ends_at <= $1", [new Date(now).toISOString()]);
      dueIds = result.rows.map((row) => row.id);
    }
    for (const id of dueIds) await this.end(id, "expired", now);
    return dueIds.length;
  }

  async listActive(clubId: string): Promise<PlaySession[]> {
    if (!this.database.configured) {
      return [...this.memorySessions.values()].filter((item) => item.clubId === clubId && item.status === "active").map((item) => this.toPublic(item));
    }
    const result = await this.database.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM play_sessions WHERE club_id = $1 AND status = 'active' ORDER BY started_at`, [clubId]);
    return result.rows.map((row) => this.toPublic(this.mapSession(row)));
  }

  async findCurrent(clubId: string, userId: string): Promise<PlaySession | null> {
    const active = await this.listActive(clubId);
    return active.find((item) => item.userId === userId) ?? null;
  }

  /**
   * Пополнение с кассы. Если игрок уже сидит за компьютером, его сессия
   * сразу продлевается на новые деньги, но не дальше выбранного при запуске времени.
   */
  async topUp(clubId: string, phone: string, amount: number, admin: AuthUser, method: PaymentMethod = "cash"): Promise<TopUpResult> {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TOP_UP) throw new BadRequestException(`Сумма пополнения от 1 до ${MAX_TOP_UP} ₸`);
    if (!PAYMENT_METHODS.includes(method)) throw new BadRequestException("Способ оплаты: наличные, Kaspi или карта");
    await this.clubs.findOne(clubId);
    await this.shifts.requireOpen(clubId);
    return this.credit(clubId, await this.auth.ensureUser(phone, "Игрок Vence"), amount, admin, method);
  }

  /**
   * Пополнение по месту: игрок говорит «15-й компьютер, плюс 500» — кассиру не нужно знать его номер,
   * сессия и так знает, кто сидит.
   */
  async topUpSession(clubId: string, sessionId: string, amount: number, admin: AuthUser, method: PaymentMethod = "cash"): Promise<TopUpResult> {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_TOP_UP) throw new BadRequestException(`Сумма пополнения от 1 до ${MAX_TOP_UP} ₸`);
    if (!PAYMENT_METHODS.includes(method)) throw new BadRequestException("Способ оплаты: наличные, Kaspi или карта");
    const session = await this.findStoredActive((item) => item.clubId === clubId && item.id === sessionId, "club_id = $1 AND id = $2", [clubId, sessionId]);
    if (!session) throw new NotFoundException("Сессия уже закончилась");
    await this.shifts.requireOpen(clubId);
    return this.credit(clubId, { id: session.userId, name: session.playerName }, amount, admin, method);
  }

  private async credit(clubId: string, player: Pick<AuthUser, "id" | "name">, amount: number, admin: AuthUser, method: PaymentMethod): Promise<TopUpResult> {
    const entry = { kind: "top_up" as const, createdBy: admin.id, createdByName: admin.name, paymentMethod: method };
    // В базе смену держим заблокированной до записи пополнения: если её как раз закрывают,
    // пополнение дождётся закрытия и получит отказ, а не попадёт задним числом в закрытый отчёт.
    const balance = this.database.configured
      ? await this.database.transaction(async (client) =>
          this.hall.changeBalance(clubId, player, amount, { ...entry, shiftId: await this.shifts.lockOpen(clubId, client) }, client)
        )
      : await this.hall.changeBalance(clubId, player, amount, { ...entry, shiftId: await this.shifts.requireOpen(clubId) });
    const session = await this.findStoredActive((item) => item.clubId === clubId && item.userId === player.id, "club_id = $1 AND user_id = $2", [clubId, player.id]);
    // Пакет уже оплачен и кончается в свой час: пополнение остаётся на балансе.
    if (session && !session.packageId) {
      const startedAt = Date.parse(session.startedAt);
      const reservations = await this.foreignReservations(clubId, session.seatId, player.id, Date.now());
      const limit = this.minLimit(session.limitMinutes, this.minutesUntilBooking(reservations, startedAt));
      const endsAt = this.endsAt(startedAt, session.pricePerHour, balance, limit);
      if (endsAt > session.endsAt) {
        if (!this.database.configured) this.memorySessions.set(session.id, { ...session, endsAt });
        else await this.database.query("UPDATE play_sessions SET ends_at = $2 WHERE id = $1 AND status = 'active'", [session.id, endsAt]);
        await this.publish(session.seatId);
      }
    }
    return { clubId, userId: player.id, playerName: player.name, amount, balance };
  }

  /** Карта зала с учётом идущих сессий и того, какие компьютеры на связи. */
  async applyToSeatMap(map: ClubSeatMap): Promise<ClubSeatMap> {
    const [sessions, stations] = await Promise.all([this.listActive(map.clubId), this.findStationRecords(map.clubId)]);
    const bySeat = new Map(sessions.map((session) => [session.seatId, session]));
    const stationBySeat = new Map(stations.map((station) => [station.seatId, station]));
    return {
      ...map,
      zones: map.zones.map((zone) => ({
        ...zone,
        seats: zone.seats.map((seat) => {
          const session = bySeat.get(seat.id);
          const station = stationBySeat.get(seat.id);
          const withStation = station ? { ...seat, stationOnline: this.connected.has(station.id) } : seat;
          if (!session) return withStation;
          const { reservedFrom: _reserved, ...rest } = withStation;
          return { ...rest, status: "occupied" as const, occupiedUntil: session.endsAt };
        })
      }))
    };
  }

  // ---------- Внутреннее ----------

  /** Сколько можно сидеть на этот баланс: поминутно, не дольше 12 часов и выбранного лимита. */
  private endsAt(start: number, pricePerHour: number, balance: number, limitMinutes?: number): string {
    const affordable = pricePerHour === 0 ? MAX_SESSION_MINUTES : Math.floor((Math.max(balance, 0) * 60) / pricePerHour);
    const minutes = Math.min(affordable, limitMinutes ?? MAX_SESSION_MINUTES, MAX_SESSION_MINUTES);
    if (minutes < 1) throw new BadRequestException("Недостаточно средств на балансе: пополните его на кассе");
    return new Date(start + minutes * 60_000).toISOString();
  }

  /** Брони этого места другими игроками: своя бронь игроку не мешает, он по ней и пришёл. */
  private async foreignReservations(clubId: string, seatId: string, userId: string, now: number): Promise<SeatReservation[]> {
    return (await this.bookings.findSeatReservations(clubId, seatId, now)).filter((reservation) => reservation.userId !== userId);
  }

  /** Сколько минут от `from` до ближайшей будущей чужой брони. */
  private minutesUntilBooking(reservations: SeatReservation[], from: number): number | undefined {
    const upcoming = reservations.map((reservation) => reservation.start).filter((start) => start > from);
    return upcoming.length ? Math.floor((Math.min(...upcoming) - from) / 60_000) : undefined;
  }

  private minLimit(...limits: (number | undefined)[]): number | undefined {
    const defined = limits.filter((limit): limit is number => limit !== undefined);
    return defined.length ? Math.min(...defined) : undefined;
  }

  /** Сколько стоила сессия: пакет оплачен при посадке и не пересчитывается, остальное списывает `charge`. */
  private async settle(session: StoredSession, now: number, charge: (amount: number) => Promise<number>): Promise<number> {
    return session.packagePrice !== undefined ? session.packagePrice : charge(this.cost(session, now));
  }

  /** Начатая минута считается целиком, но не дольше оплаченного времени. */
  private cost(session: PlaySession, now: number): number {
    const start = Date.parse(session.startedAt);
    const end = Math.min(now, Date.parse(session.endsAt));
    const minutes = Math.max(0, Math.ceil((end - start) / 60_000));
    return Math.ceil((minutes * session.pricePerHour) / 60);
  }

  private async lockBalance(client: PoolClient, clubId: string, player: Player): Promise<number> {
    await client.query("INSERT INTO club_accounts (club_id, user_id, nickname) VALUES ($1, $2, $3) ON CONFLICT (club_id, user_id) DO NOTHING", [clubId, player.id, player.name]);
    const result = await client.query<{ balance: number }>("SELECT balance FROM club_accounts WHERE club_id = $1 AND user_id = $2 FOR UPDATE", [clubId, player.id]);
    return result.rows[0]?.balance ?? 0;
  }

  private assertClaimAllowed(userId: string, now: number): void {
    const recent = (this.claimAttempts.get(userId) ?? []).filter((at) => at > now - 60_000);
    if (recent.length >= CLAIM_ATTEMPTS_PER_MINUTE) throw new HttpException("Слишком много попыток: подождите минуту", HttpStatus.TOO_MANY_REQUESTS);
    recent.push(now);
    this.claimAttempts.set(userId, recent);
  }

  private async publish(seatId: string): Promise<void> {
    if (this.listeners.size === 0) return;
    try {
      const stationId = await this.findStationIdBySeat(seatId);
      if (!stationId) return;
      const state = await this.getStationState(stationId);
      for (const listener of this.listeners) listener(stationId, state);
    } catch (error) {
      this.logger.error(`Не удалось оповестить компьютер места ${seatId}: ${String(error)}`);
    }
  }

  private revoke(stationId: string): void {
    this.connected.delete(stationId);
    for (const listener of this.listeners) listener(stationId, null);
  }

  private async resolveSeat(clubId: string, seatId: string): Promise<ResolvedSeat> {
    const seat = (await this.seatIndex(clubId)).get(seatId);
    if (!seat) throw new BadRequestException("Такого места нет на карте клуба");
    return seat;
  }

  private async seatIndex(clubId: string): Promise<Map<string, ResolvedSeat>> {
    const zones = await this.clubs.findZones(clubId);
    return new Map(zones.flatMap((zone) => createSeats(zone).map((seat) => [seat.id, { zone, seatId: seat.id, seatLabel: seat.label }] as const)));
  }

  private toStation(record: StationRecord, seat: ResolvedSeat | undefined): ClubStation {
    return {
      id: record.id,
      clubId: record.clubId,
      seatId: record.seatId,
      // Место могло исчезнуть, если клуб уменьшил зону: компьютер остаётся в списке, чтобы его можно было удалить.
      seatLabel: seat?.seatLabel ?? "—",
      zoneId: seat?.zone.id ?? "",
      name: record.name,
      online: this.connected.has(record.id),
      ...(record.lastSeenAt ? { lastSeenAt: record.lastSeenAt } : {}),
      createdAt: record.createdAt
    };
  }

  private async findStationRecords(clubId: string): Promise<StationRecord[]> {
    if (!this.database.configured) return [...this.memoryStations.values()].filter((station) => station.clubId === clubId);
    const result = await this.database.query<StationRow>("SELECT id, club_id, seat_id, name, token_hash, last_seen_at, created_at FROM club_stations WHERE club_id = $1 ORDER BY seat_id", [clubId]);
    return result.rows.map((row) => this.mapStation(row));
  }

  private async findStationRecord(stationId: string): Promise<StationRecord | undefined> {
    if (!this.database.configured) return this.memoryStations.get(stationId);
    const result = await this.database.query<StationRow>("SELECT id, club_id, seat_id, name, token_hash, last_seen_at, created_at FROM club_stations WHERE id = $1", [stationId]);
    return result.rows[0] ? this.mapStation(result.rows[0]) : undefined;
  }

  private async findStationIdBySeat(seatId: string): Promise<string | undefined> {
    if (!this.database.configured) return [...this.memoryStations.values()].find((station) => station.seatId === seatId)?.id;
    const result = await this.database.query<{ id: string }>("SELECT id FROM club_stations WHERE seat_id = $1", [seatId]);
    return result.rows[0]?.id;
  }

  private async findSession(sessionId: string): Promise<StoredSession | undefined> {
    if (!this.database.configured) return this.memorySessions.get(sessionId);
    const result = await this.database.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM play_sessions WHERE id = $1`, [sessionId]);
    return result.rows[0] ? this.mapSession(result.rows[0]) : undefined;
  }

  private async findActiveBySeat(seatId: string): Promise<PlaySession | undefined> {
    const session = await this.findStoredActive((item) => item.seatId === seatId, "seat_id = $1", [seatId]);
    return session ? this.toPublic(session) : undefined;
  }

  private async findStoredActive(match: (session: StoredSession) => boolean, where: string, values: unknown[]): Promise<StoredSession | undefined> {
    if (!this.database.configured) return [...this.memorySessions.values()].find((item) => item.status === "active" && match(item));
    const result = await this.database.query<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM play_sessions WHERE status = 'active' AND ${where}`, values);
    return result.rows[0] ? this.mapSession(result.rows[0]) : undefined;
  }

  private toPublic(session: StoredSession): PlaySession {
    const { limitMinutes: _limit, ...rest } = session;
    return rest;
  }

  private mapStation(row: StationRow): StationRecord {
    return {
      id: row.id,
      clubId: row.club_id,
      seatId: row.seat_id,
      name: row.name,
      tokenHash: row.token_hash,
      ...(row.last_seen_at ? { lastSeenAt: new Date(row.last_seen_at).toISOString() } : {}),
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  private mapSession(row: SessionRow): StoredSession {
    return {
      id: row.id,
      clubId: row.club_id,
      seatId: row.seat_id,
      seatLabel: row.seat_label,
      zoneId: row.zone_id,
      zoneName: row.zone_name,
      userId: row.user_id,
      playerName: row.player_name,
      ...(row.player_phone_tail ? { playerPhoneTail: row.player_phone_tail } : {}),
      pricePerHour: row.price_per_hour,
      startedAt: new Date(row.started_at).toISOString(),
      endsAt: new Date(row.ends_at).toISOString(),
      status: row.status,
      ...(row.ended_at ? { endedAt: new Date(row.ended_at).toISOString() } : {}),
      ...(row.end_reason ? { endReason: row.end_reason } : {}),
      ...(row.charged !== null ? { charged: row.charged } : {}),
      ...(row.limit_minutes !== null ? { limitMinutes: row.limit_minutes } : {}),
      ...(row.package_id ? { packageId: row.package_id, packageName: row.package_name ?? "", packagePrice: row.package_price ?? 0 } : {})
    };
  }

  private createToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("base64url");
  }

  private seatTaken(): ConflictException {
    return new ConflictException("За этим местом уже закреплён компьютер: выпустите для него новый ключ");
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
  }
}

