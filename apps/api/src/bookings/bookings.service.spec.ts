import { ConflictException } from "@nestjs/common";
import type { AuthUser, CreateBookingRequest } from "@oyna/contracts";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { BookingsService } from "./bookings.service";

describe("BookingsService", () => {
  const service = new BookingsService(new ClubsService(), new DatabaseService());
  const user: AuthUser = { id: "user-1", phone: "+77000000000", name: "Арман" };
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

  it("rejects an overlapping booking for the same seat", async () => {
    await expect(service.create({ clubId: "vertex-arena", zoneId: "standard", seatIds: ["vertex-arena-standard-01"], startAt, durationHours: 2, playerName: "Данияр" }, { ...user, id: "user-2" })).rejects.toThrow(ConflictException);
  });

  it("allows the owner to cancel a future booking", async () => {
    const [booking] = await service.findForUser(user.id);
    const cancelled = await service.cancel(booking.id, user.id);
    expect(cancelled.status).toBe("cancelled");
  });
});

