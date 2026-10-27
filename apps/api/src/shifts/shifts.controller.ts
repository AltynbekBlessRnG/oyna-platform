import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { AuthUser, ClubShift, CloseShiftRequest, OpenShiftRequest } from "@oyna/contracts";
import { ClubAdminGuard } from "../auth/club-admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ShiftsService } from "./shifts.service";

@Controller("admin/clubs/:clubId/shifts")
@UseGuards(ClubAdminGuard)
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(@Param("clubId") clubId: string): Promise<ClubShift[]> {
    return this.shifts.list(clubId);
  }

  @Get("current")
  current(@Param("clubId") clubId: string): Promise<ClubShift | null> {
    return this.shifts.current(clubId);
  }

  @Post()
  open(@Param("clubId") clubId: string, @CurrentUser() admin: AuthUser, @Body() request: OpenShiftRequest): Promise<ClubShift> {
    return this.shifts.open(clubId, request?.openingCash, admin);
  }

  @Post("current/close")
  close(@Param("clubId") clubId: string, @CurrentUser() admin: AuthUser, @Body() request: CloseShiftRequest): Promise<ClubShift> {
    return this.shifts.close(clubId, request?.countedCash, request?.note, admin);
  }
}
