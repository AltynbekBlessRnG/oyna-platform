import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser, AvailabilitySnapshot, BookingReceipt, BookingStatus, ClubAvailability, ClubSeatMap, ClubZone, CreateBookingRequest, SeatMapSeat } from "@oyna/contracts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../social/notifications.service";
import { createSeats } from "./bookings.data";

interface BookingRow {
  id: string;
  player_name: string;
  club_id: string;
  zone_id: string;
  zone_name: string;
  seat_ids: string[];
  seat_labels: string[];
  start_at: Date | string;
  duration_hours: number;
  total_amount: number;
  status: BookingStatus;
  created_at: Date | string;
  updated_at: Date | string;
  user_id: string;
}

@Injectable()
export class BookingsService {
  private readonly memoryBookings = new Map<string, BookingReceipt & { userId: string; playerPhone: string }>();

  constructor(
    private readonly clubsService: ClubsService,
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService
  ) {}

  findZones(clubId: string): Promise<ClubZone[]> {
    return this.clubsService.findZones(clubId);
  }

  async getAvailability(clubId: string, zoneId: string, startAt: string, durationHours: number): Promise<AvailabilitySnapshot> {
    const zone = await this.findZone(clubId, zoneId);
    this.validateSchedule(startAt, durationHours);
    const reservedSeatIds = new Set(await this.findReservedSeatIds(clubId, zoneId, startAt, durationHours));
    return {
      clubId,
      zoneId,
      startAt,
      durationHours,
      seats: createSeats(zone).map((seat) => reservedSeatIds.has(seat.id) ? { ...seat, status: "occupied" } : seat)
    };
  }

  /**
   * Доступность всего зала на выбранное окно: зона у компьютера своя,
   * поэтому отдельный шаг «выбери тариф» игроку не нужен.
   */
  async getClubAvailability(clubId: string, startAt: string, durationHours: number): Promise<ClubAvailability> {
    this.validateSchedule(startAt, durationHours);
    const zones = await this.clubsService.findZones(clubId);
    const zoneSnapshots = await Promise.all(zones.map(async (zone) => {
      const reservedSeatIds = new Set(await this.findReservedSeatIds(clubId, zone.id, startAt, durationHours));
      return {
        zone,
        seats: createSeats(zone).map((seat) => reservedSeatIds.has(seat.id) ? { ...seat, status: "occupied" as const } : seat)
      };
    }));
    return { clubId, startAt, durationHours, zones: zoneSnapshots };
  }

  /**
   * Живая карта зала: все компьютеры клуба с их состоянием прямо сейчас.
   * Занято — идёт сессия, забронировано — бронь начнётся в ближайшие сутки.
   */
  async getSeatMap(clubId: string): Promise<ClubSeatMap> {
    const zones = await this.clubsService.findZones(clubId);
    const now = Date.now();
    const horizon = now + 24 * 3_600_000;
    const active = (await this.findForClub(clubId)).filter((booking) => {
      if (!["pending", "confirmed"].includes(booking.status)) return false;
      const start = new Date(booking.startAt).getTime();
      return start < horizon && start + booking.durationHours * 3_600_000 > now;
    });
    return {
      clubId,
      generatedAt: new Date(now).toISOString(),
      zones: zones.map((zone) => ({
        zone,
        seats: createSeats(zone).map<SeatMapSeat>((seat) => {
          const booking = active.find((item) => item.seatIds.includes(seat.id));
          if (!booking) return { id: seat.id, label: seat.label, row: seat.row, status: "free" };
          const start = new Date(booking.startAt).getTime();
          const end = new Date(start + booking.durationHours * 3_600_000).toISOString();
          return start <= now
            ? { id: seat.id, label: seat.label, row: seat.row, status: "occupied", occupiedUntil: end }
            : { id: seat.id, label: seat.label, row: seat.row, status: "reserved", reservedFrom: booking.startAt };
        })
      }))
    };
  }

  async create(request: CreateBookingRequest, user: AuthUser): Promise<BookingReceipt> {
    const zone = await this.findZone(request.clubId, request.zoneId);
    if (request.seatIds.length === 0) throw new BadRequestException("Select at least one seat");
    const uniqueSeatIds = [...new Set(request.seatIds)];
    if (uniqueSeatIds.length !== request.seatIds.length) throw new BadRequestException("Duplicate seats are not allowed");
    const allSeats = new Map(createSeats(zone).map((seat) => [seat.id, seat]));
    if (uniqueSeatIds.some((seatId) => !allSeats.has(seatId))) throw new BadRequestException("Unknown seat");
    this.validateSchedule(request.startAt, request.durationHours);

    const now = new Date().toISOString();
    const receipt: BookingReceipt = {
      ...request,
      playerName: user.name,
      seatIds: uniqueSeatIds,
      id: this.createId(),
      status: "pending",
      zoneName: zone.name,
      seatLabels: uniqueSeatIds.map((seatId) => allSeats.get(seatId)?.label ?? seatId),
      totalAmount: zone.pricePerHour * request.durationHours * uniqueSeatIds.length,
      createdAt: now,
      updatedAt: now
    };

    if (this.database.configured) return this.createInDatabase(receipt, user);
    const availability = await this.getAvailability(request.clubId, request.zoneId, request.startAt, request.durationHours);
    const availableIds = new Set(availability.seats.filter((seat) => seat.status === "available").map((seat) => seat.id));
    if (uniqueSeatIds.some((seatId) => !availableIds.has(seatId))) throw new ConflictException("One or more seats are no longer available");
    this.memoryBookings.set(receipt.id, { ...receipt, userId: user.id, playerPhone: user.phone });
    return receipt;
  }

  async findOne(id: string): Promise<BookingReceipt> {
    if (!this.database.configured) {
      const booking = this.memoryBookings.get(id);
      if (!booking) throw new NotFoundException("Booking not found");
      return this.stripInternal(booking);
    }
    const result = await this.database.query<BookingRow>("SELECT * FROM bookings WHERE id = $1", [id]);
    if (!result.rows[0]) throw new NotFoundException("Booking not found");
    return this.mapRow(result.rows[0]);
  }

  async findForUser(userId: string): Promise<BookingReceipt[]> {
    if (!this.database.configured) {
      return [...this.memoryBookings.values()].filter((booking) => booking.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((booking) => this.stripInternal(booking));
    }
    const result = await this.database.query<BookingRow>("SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async findForClub(clubId: string): Promise<BookingReceipt[]> {
    await this.clubsService.findOne(clubId);
    if (!this.database.configured) {
      return [...this.memoryBookings.values()].filter((booking) => booking.clubId === clubId).sort((a, b) => a.startAt.localeCompare(b.startAt)).map((booking) => this.stripInternal(booking));
    }
    const result = await this.database.query<BookingRow>("SELECT * FROM bookings WHERE club_id = $1 ORDER BY start_at ASC", [clubId]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async cancel(id: string, userId: string): Promise<BookingReceipt> {
    if (!this.database.configured) {
      const booking = this.memoryBookings.get(id);
      if (!booking) throw new NotFoundException("Booking not found");
      if (booking.userId !== userId) throw new ForbiddenException("This booking belongs to another user");
      if (!this.canCancel(booking)) throw new ConflictException("Booking can no longer be cancelled");
      const updated = { ...booking, status: "cancelled" as const, updatedAt: new Date().toISOString() };
      this.memoryBookings.set(id, updated);
      return this.stripInternal(updated);
    }
    const result = await this.database.query<BookingRow>(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'confirmed') AND start_at > NOW()
       RETURNING *`,
      [id, userId]
    );
    if (!result.rows[0]) throw new ConflictException("Booking cannot be cancelled");
    return this.mapRow(result.rows[0]);
  }

  async updateStatus(clubId: string, id: string, status: Extract<BookingStatus, "confirmed" | "cancelled" | "completed">): Promise<BookingReceipt> {
    if (!["confirmed", "cancelled", "completed"].includes(status)) throw new BadRequestException("Unsupported booking status");
    if (!this.database.configured) {
      const booking = this.memoryBookings.get(id);
      if (!booking || booking.clubId !== clubId) throw new NotFoundException("Booking not found");
      const updated = { ...booking, status, updatedAt: new Date().toISOString() };
      this.memoryBookings.set(id, updated);
      const receipt = this.stripInternal(updated);
      await this.notifyPlayer(booking.userId, receipt);
      return receipt;
    }
    const result = await this.database.query<BookingRow>(
      "UPDATE bookings SET status = $3, updated_at = NOW() WHERE id = $1 AND club_id = $2 RETURNING *",
      [id, clubId, status]
    );
    if (!result.rows[0]) throw new NotFoundException("Booking not found");
    const updated = this.mapRow(result.rows[0]);
    await this.notifyPlayer(result.rows[0].user_id, updated);
    return updated;
  }

  /** Игрок узнаёт решение клуба сразу: запись в центре уведомлений плюс push на зарегистрированные устройства. */
  private async notifyPlayer(userId: string, booking: BookingReceipt): Promise<void> {
    const titles: Record<string, string> = {
      confirmed: "Бронь подтверждена",
      cancelled: "Бронь отклонена",
      completed: "Визит завершён"
    };
    const title = titles[booking.status];
    if (!title) return;
    const club = await this.clubsService.findOne(booking.clubId).catch(() => undefined);
    const start = new Date(booking.startAt);
    const when = `${start.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
    const body = `${club?.name ?? "Клуб"} · ${booking.zoneName} · ${when} · места ${booking.seatLabels.join(", ")}`;
    await this.notifications.create(userId, { type: "booking_status", title, body, href: `/bookings?id=${booking.id}` });
  }

  private async createInDatabase(receipt: BookingReceipt, user: AuthUser): Promise<BookingReceipt> {
    return this.database.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${receipt.clubId}:${receipt.zoneId}`]);
      const conflict = await client.query(
        `SELECT id FROM bookings
         WHERE club_id = $1 AND zone_id = $2 AND status IN ('pending', 'confirmed')
           AND seat_ids && $3::text[]
           AND start_at < $4::timestamptz + ($5 * INTERVAL '1 hour')
           AND start_at + (duration_hours * INTERVAL '1 hour') > $4::timestamptz
         LIMIT 1`,
        [receipt.clubId, receipt.zoneId, receipt.seatIds, receipt.startAt, receipt.durationHours]
      );
      if (conflict.rowCount) throw new ConflictException("One or more seats are no longer available");
      return this.insertBooking(client, receipt, user);
    });
  }

  private async insertBooking(client: PoolClient, receipt: BookingReceipt, user: AuthUser): Promise<BookingReceipt> {
    const result = await client.query<BookingRow>(
      `INSERT INTO bookings
       (id, user_id, player_phone, player_name, club_id, zone_id, zone_name, seat_ids, seat_labels, start_at, duration_hours, total_amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [receipt.id, user.id, user.phone, user.name, receipt.clubId, receipt.zoneId, receipt.zoneName, receipt.seatIds, receipt.seatLabels, receipt.startAt, receipt.durationHours, receipt.totalAmount, receipt.status]
    );
    return this.mapRow(result.rows[0]);
  }

  private async findReservedSeatIds(clubId: string, zoneId: string, startAt: string, durationHours: number): Promise<string[]> {
    if (!this.database.configured) {
      return [...this.memoryBookings.values()]
        .filter((booking) => booking.clubId === clubId && booking.zoneId === zoneId && ["pending", "confirmed"].includes(booking.status) && this.overlaps(booking, startAt, durationHours))
        .flatMap((booking) => booking.seatIds);
    }
    const result = await this.database.query<{ seat_ids: string[] }>(
      `SELECT seat_ids FROM bookings
       WHERE club_id = $1 AND zone_id = $2 AND status IN ('pending', 'confirmed')
         AND start_at < $3::timestamptz + ($4 * INTERVAL '1 hour')
         AND start_at + (duration_hours * INTERVAL '1 hour') > $3::timestamptz`,
      [clubId, zoneId, startAt, durationHours]
    );
    return result.rows.flatMap((row) => row.seat_ids);
  }

  private findZone(clubId: string, zoneId: string): Promise<ClubZone> {
    return this.clubsService.findZone(clubId, zoneId);
  }

  private validateSchedule(startAt: string, durationHours: number): void {
    if (Number.isNaN(Date.parse(startAt))) throw new BadRequestException("Invalid start date");
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 12) throw new BadRequestException("Duration must be between 1 and 12 hours");
  }

  private canCancel(booking: BookingReceipt): boolean {
    return ["pending", "confirmed"].includes(booking.status) && new Date(booking.startAt).getTime() > Date.now();
  }

  private overlaps(booking: BookingReceipt, startAt: string, durationHours: number): boolean {
    const requestedStart = new Date(startAt).getTime();
    const requestedEnd = requestedStart + durationHours * 3_600_000;
    const bookingStart = new Date(booking.startAt).getTime();
    const bookingEnd = bookingStart + booking.durationHours * 3_600_000;
    return requestedStart < bookingEnd && requestedEnd > bookingStart;
  }

  /** Внутренние поля временного хранилища не должны уезжать клиенту: в SQL-режиме их отсекает mapRow. */
  private stripInternal(booking: BookingReceipt & { userId: string; playerPhone: string }): BookingReceipt {
    const { userId: _userId, playerPhone: _playerPhone, ...receipt } = booking;
    return receipt;
  }

  private mapRow(row: BookingRow): BookingReceipt {
    return {
      id: row.id,
      playerName: row.player_name,
      clubId: row.club_id,
      zoneId: row.zone_id,
      zoneName: row.zone_name,
      seatIds: row.seat_ids,
      seatLabels: row.seat_labels,
      startAt: new Date(row.start_at).toISOString(),
      durationHours: row.duration_hours,
      totalAmount: row.total_amount,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  private createId(): string {
    return `OY-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  }
}
