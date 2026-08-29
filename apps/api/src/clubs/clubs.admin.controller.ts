import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import type {
  AddClubMemberRequest,
  AuthUser,
  ClubAdminView,
  ClubMember,
  ClubSummary,
  ClubZone,
  ManagedClub,
  UpdateClubRequest,
  UpsertZoneRequest
} from "@oyna/contracts";
import { AdminIdentityGuard, ClubAdminGuard, PlatformAdminGuard } from "../auth/club-admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ClubAccessService } from "./club-access.service";
import { CLUB_CATALOG, type ClubCatalogEntry } from "./clubs.data";
import { ClubsService } from "./clubs.service";

@Controller("admin")
export class ClubsAdminController {
  constructor(
    private readonly clubs: ClubsService,
    private readonly access: ClubAccessService
  ) {}

  /** Клубы, доступные текущему сотруднику: кабинет выбирает активный клуб из этого списка. */
  @Get("me/clubs")
  @UseGuards(AdminIdentityGuard)
  managedClubs(@CurrentUser() user: AuthUser): Promise<ManagedClub[]> {
    return this.access.listManagedClubs(user);
  }

  /** Загрузка каталога клубов владельцем платформы: нужна там, где нет прямого доступа к базе. */
  @Post("catalog")
  @UseGuards(PlatformAdminGuard)
  async seedCatalog(@Body() request: { catalog?: ClubCatalogEntry[] }): Promise<{ clubIds: string[] }> {
    return { clubIds: await this.clubs.upsertCatalog(request?.catalog ?? CLUB_CATALOG) };
  }

  @Get("clubs/:clubId")
  @UseGuards(ClubAdminGuard)
  async view(@Param("clubId") clubId: string): Promise<ClubAdminView> {
    const [club, zones] = await Promise.all([this.clubs.findOne(clubId), this.clubs.findZones(clubId)]);
    return { club, zones };
  }

  @Patch("clubs/:clubId")
  @UseGuards(ClubAdminGuard)
  update(@Param("clubId") clubId: string, @Body() request: UpdateClubRequest): Promise<ClubSummary> {
    return this.clubs.update(clubId, request);
  }

  @Put("clubs/:clubId/zones")
  @UseGuards(ClubAdminGuard)
  replaceZones(@Param("clubId") clubId: string, @Body() request: { zones: UpsertZoneRequest[] }): Promise<ClubZone[]> {
    return this.clubs.replaceZones(clubId, request.zones);
  }

  @Get("clubs/:clubId/members")
  @UseGuards(ClubAdminGuard)
  members(@Param("clubId") clubId: string): Promise<ClubMember[]> {
    return this.access.listMembers(clubId);
  }

  @Post("clubs/:clubId/members")
  @UseGuards(PlatformAdminGuard)
  addMember(@Param("clubId") clubId: string, @Body() request: AddClubMemberRequest): Promise<ClubMember> {
    return this.access.addMember(clubId, request);
  }

  @Delete("clubs/:clubId/members/:userId")
  @UseGuards(PlatformAdminGuard)
  removeMember(@Param("clubId") clubId: string, @Param("userId") userId: string): Promise<void> {
    return this.access.removeMember(clubId, userId);
  }
}
