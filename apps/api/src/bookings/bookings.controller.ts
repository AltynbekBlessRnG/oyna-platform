import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthUser, AvailabilitySnapshot, BookingReceipt, ClubZone, CreateBookingRequest, UpdateBookingStatusRequest } from "@oyna/contracts";
import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { BookingsService } from "./bookings.service";

@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get("clubs/:clubId/zones")
  findZones(@Param("clubId") clubId: string): ClubZone[] {
    return this.bookingsService.findZones(clubId);
  }

  @Get("clubs/:clubId/availability")
  getAvailability(
    @Param("clubId") clubId: string,
    @Query("zoneId") zoneId: string,
    @Query("startAt") startAt: string,
    @Query("durationHours", ParseIntPipe) durationHours: number
  ): Promise<AvailabilitySnapshot> {
    return this.bookingsService.getAvailability(clubId, zoneId, startAt, durationHours);
  }

  @Post("bookings")
  @UseGuards(AuthGuard)
  create(@Body() request: CreateBookingRequest, @CurrentUser() user: AuthUser): Promise<BookingReceipt> {
    return this.bookingsService.create(request, user);
  }

  @Get("bookings")
  @UseGuards(AuthGuard)
  findMine(@CurrentUser() user: AuthUser): Promise<BookingReceipt[]> {
    return this.bookingsService.findForUser(user.id);
  }

  @Get("bookings/:id")
  @UseGuards(AuthGuard)
  async findOne(@Param("id") id: string, @CurrentUser() user: AuthUser): Promise<BookingReceipt> {
    const booking = await this.bookingsService.findOne(id);
    const mine = await this.bookingsService.findForUser(user.id);
    if (!mine.some((item) => item.id === booking.id)) throw new ForbiddenException("Booking belongs to another user");
    return booking;
  }

  @Patch("bookings/:id/cancel")
  @UseGuards(AuthGuard)
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser): Promise<BookingReceipt> {
    return this.bookingsService.cancel(id, user.id);
  }

  @Get("admin/clubs/:clubId/bookings")
  @UseGuards(AdminGuard)
  findForClub(@Param("clubId") clubId: string): Promise<BookingReceipt[]> {
    return this.bookingsService.findForClub(clubId);
  }

  @Patch("admin/bookings/:id/status")
  @UseGuards(AdminGuard)
  updateStatus(@Param("id") id: string, @Body() request: UpdateBookingStatusRequest): Promise<BookingReceipt> {
    return this.bookingsService.updateStatus(id, request.status);
  }
}
