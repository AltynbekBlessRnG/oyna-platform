import { ConflictException, NotFoundException } from "@nestjs/common";
import type { AuthUser, CreateBookingRequest } from "@oyna/contracts";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../social/notifications.service";
import { BookingsService } from "./bookings.service";

describe("BookingsService", () => {
  const database = new DatabaseService();
  const notifications = new NotificationsService(database);
  const service = new BookingsService(new ClubsService(database), database, notifications);
  const user: AuthUser = { id: "user-1", phone: "+77000000000", name: "Арман", role: "player" };
  const startAt = "2030-07-21T18:00:00.000Z";

  it("creates a pending booking and calculates its total", async () => {
    const request: CreateBookingRequest = {
      clubId: "vertex-arena",
      zoneId: "standard",
      seatIds: ["vertex-arena-standard-01", "vertex-arena-standard-02"],
      startAt,
      durationHours: 3,
      playerName: "Ignored client value"
    };
    const booking = await service.create(request, user);
    expect(booking.status).toBe("pending");
    expect(booking.playerName).toBe("Арман");
    expect(booking.totalAmount).toBe(5400);
    expect(booking.seatLabels).toEqual(["01", "02"]);
  });

  it("keeps internal fields out of the club response", async () => {
    const [booking] = await service.findForClub("vertex-arena");
    expect(booking).not.toHaveProperty("userId");
    expect(booking).not.toHaveProperty("playerPhone");
  });

  it("rejects an overlapping booking for the same seat", async () => {
    await expect(service.create({ clubId: "vertex-arena", zoneId: "standard", seatIds: ["vertex-arena-standard-01"], startAt, durationHours: 2, playerName: "Данияр" }, { ...user, id: "user-2" })).rejects.toThrow(ConflictException);
  });

  it("notifies the player when the club confirms the booking", async () => {
    const [booking] = await service.findForUser(user.id);
    const confirmed = await service.updateStatus("vertex-arena", booking.id, "confirmed");
    expect(confirmed.status).toBe("confirmed");
    const [notification] = await notifications.list(user.id);
    expect(notification).toMatchObject({ type: "booking_status", title: "Бронь подтверждена" });
    expect(notification.body).toContain("Vertex Arena");
  });

  it("does not let one club change the booking of another", async () => {
    const [booking] = await service.findForUser(user.id);
    await expect(service.updateStatus("qazaq-cyber", booking.id, "cancelled")).rejects.toThrow(NotFoundException);
  });

  it("allows the owner to cancel a future booking", async () => {
    const [booking] = await service.findForUser(user.id);
    const cancelled = await service.cancel(booking.id, user.id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("marks a seat busy while the session runs and reserved before it starts", async () => {
    const now = Date.now();
    const running: CreateBookingRequest = {
      clubId: "zen-game-club",
      zoneId: "standard",
      seatIds: ["zen-game-club-standard-01"],
      startAt: new Date(now - 3_600_000).toISOString(),
      durationHours: 3,
      playerName: "Игрок"
    };
    const upcoming: CreateBookingRequest = {
      clubId: "zen-game-club",
      zoneId: "standard",
      seatIds: ["zen-game-club-standard-02"],
      startAt: new Date(now + 3 * 3_600_000).toISOString(),
      durationHours: 2,
      playerName: "Игрок"
    };
    await service.create(running, user);
    await service.create(upcoming, user);
    const seatMap = await service.getSeatMap("zen-game-club");
    const seats = seatMap.zones.find((zone) => zone.zone.id === "standard")?.seats ?? [];
    expect(seats.find((seat) => seat.id === "zen-game-club-standard-01")?.status).toBe("occupied");
    expect(seats.find((seat) => seat.id === "zen-game-club-standard-02")?.status).toBe("reserved");
    expect(seats.find((seat) => seat.id === "zen-game-club-standard-03")?.status).toBe("free");
    expect(seatMap.zones.map((zone) => zone.zone.id)).toContain("ps5");
  });
});
