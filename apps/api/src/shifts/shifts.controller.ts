import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { AuthUser, ClubShift, CloseShiftRequest, OpenShiftRequest } from "@oyna/contracts";
import { ClubAdminGuard, ClubStaffGuard } from "../auth/club-admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ClubAccessService } from "../clubs/club-access.service";
import { ShiftsService } from "./shifts.service";

@Controller("admin/clubs/:clubId/shifts")
@UseGuards(ClubStaffGuard)
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly access: ClubAccessService
  ) {}

  @Get()
  @UseGuards(ClubAdminGuard)
  list(@Param("clubId") clubId: string): Promise<ClubShift[]> {
    return this.shifts.list(clubId);
  }

  @Get("current")
  async current(@Param("clubId") clubId: string, @CurrentUser() user: AuthUser): Promise<ClubShift | null> {
    const shift = await this.shifts.current(clubId);
    return shift && this.forViewer(clubId, user, shift);
  }

  @Post()
  async open(@Param("clubId") clubId: string, @CurrentUser() admin: AuthUser, @Body() request: OpenShiftRequest): Promise<ClubShift> {
    return this.forViewer(clubId, admin, await this.shifts.open(clubId, request?.openingCash, admin));
  }

  @Post("current/close")
  async close(@Param("clubId") clubId: string, @CurrentUser() admin: AuthUser, @Body() request: CloseShiftRequest): Promise<ClubShift> {
    return this.forViewer(clubId, admin, await this.shifts.close(clubId, request?.countedCash, request?.note, admin));
  }

  /** Кассиру — «слепая» смена: без ожидаемых наличных и недостачи, чтобы пересчёт был честным. */
  private async forViewer(clubId: string, user: AuthUser, shift: ClubShift): Promise<ClubShift> {
    if ((await this.access.staffRole(user, clubId)) !== "cashier") return shift;
    const { difference: _difference, ...rest } = shift;
    return {
      ...rest,
      blind: true,
      expectedCash: 0,
      totals: { ...shift.totals, cash: 0 },
      staff: shift.staff.map((person) => ({ ...person, cash: 0 }))
    };
  }
}
