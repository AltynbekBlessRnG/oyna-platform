import { OwnerAlertsService } from "../alerts/owner-alerts.service";
import { TelegramService } from "../auth/telegram/telegram.service";
import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import type {
  AddClubMemberRequest,
  AuthUser,
  ClubAdminView,
  ClubMember,
  ClubPackage,
  ClubSummary,
  ClubZone,
  HallLayout,
  ManagedClub,
  SaveHallLayoutRequest,
  UpdateClubRequest,
  UpsertPackageRequest,
  UpsertZoneRequest, CreateClubRequest } from "@oyna/contracts";
import { AdminIdentityGuard, ClubAdminGuard, ClubStaffGuard, PlatformAdminGuard } from "../auth/club-admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ClubAccessService } from "./club-access.service";
import { ClubPackagesService } from "./club-packages.service";
import { HallLayoutService } from "./hall-layout.service";
import { CLUB_CATALOG, type ClubCatalogEntry } from "./clubs.data";
import { ClubsService } from "./clubs.service";

@Controller("admin")
export class ClubsAdminController {
  constructor(
    private readonly clubs: ClubsService,
    private readonly access: ClubAccessService,
    private readonly packages: ClubPackagesService,
    private readonly layouts: HallLayoutService,
    private readonly alerts: OwnerAlertsService,
    private readonly telegram: TelegramService
  ) {}

  /** Подключён ли Telegram для уведомлений и ссылка на бота, чтобы подключить. */
  @Get("me/telegram")
  @UseGuards(AdminIdentityGuard)
  async telegramStatus(@CurrentUser() user: AuthUser): Promise<{ linked: boolean; url?: string }> {
    return { linked: await this.alerts.isLinked(user.phone), ...(this.telegram.notifyUrl ? { url: this.telegram.notifyUrl } : {}) };
  }

  /** Клубы, доступные текущему сотруднику: кабинет выбирает активный клуб из этого списка. */
  @Get("me/clubs")
  @UseGuards(AdminIdentityGuard)
  managedClubs(@CurrentUser() user: AuthUser): Promise<ManagedClub[]> {
    return this.access.listManagedClubs(user);
  }

  /** Владелец платформы заводит клуб и сразу даёт доступ его владельцу по номеру телефона. */
  @Post("clubs")
  @UseGuards(PlatformAdminGuard)
  async createClub(@Body() request: CreateClubRequest): Promise<ManagedClub> {
    if (!request?.ownerPhone || request.ownerPhone.replace(/\D/g, "").length < 10) throw new BadRequestException("Укажите телефон владельца клуба");
    const id = await this.clubs.createClub(request);
    await this.access.addMember(id, { phone: request.ownerPhone, name: request.ownerName?.trim() || "Владелец клуба", role: "admin" });
    const club = await this.clubs.findOne(id);
    return { id, name: club.name, city: club.city, role: "admin" };
  }

  /** Кто вошёл в кабинет: кабинет показывает владельцу платформы раздел «Новый клуб». */
  @Get("me")
  @UseGuards(AdminIdentityGuard)
  me(@CurrentUser() user: AuthUser): { role: AuthUser["role"]; name: string } {
    return { role: user.role, name: user.name };
  }

  /** Загрузка каталога клубов владельцем платформы: нужна там, где нет прямого доступа к базе. */
  @Post("catalog")
  @UseGuards(PlatformAdminGuard)
  async seedCatalog(@Body() request: { catalog?: ClubCatalogEntry[] }): Promise<{ clubIds: string[] }> {
    return { clubIds: await this.clubs.upsertCatalog(request?.catalog ?? CLUB_CATALOG) };
  }

  @Get("clubs/:clubId")
  @UseGuards(ClubStaffGuard)
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

  @Get("clubs/:clubId/packages")
  @UseGuards(ClubStaffGuard)
  listPackages(@Param("clubId") clubId: string): Promise<ClubPackage[]> {
    return this.packages.list(clubId);
  }

  @Put("clubs/:clubId/packages")
  @UseGuards(ClubAdminGuard)
  replacePackages(@Param("clubId") clubId: string, @Body() request: { packages: UpsertPackageRequest[] }): Promise<ClubPackage[]> {
    return this.packages.replace(clubId, request?.packages);
  }

  @Get("clubs/:clubId/layout")
  @UseGuards(ClubStaffGuard)
  layout(@Param("clubId") clubId: string): Promise<HallLayout | null> {
    return this.layouts.find(clubId);
  }

  @Put("clubs/:clubId/layout")
  @UseGuards(ClubAdminGuard)
  saveLayout(@Param("clubId") clubId: string, @Body() request: SaveHallLayoutRequest): Promise<HallLayout> {
    return this.layouts.save(clubId, request);
  }

  @Get("clubs/:clubId/members")
  @UseGuards(ClubAdminGuard)
  members(@Param("clubId") clubId: string): Promise<ClubMember[]> {
    return this.access.listMembers(clubId);
  }

  @Post("clubs/:clubId/members")
  @UseGuards(ClubAdminGuard)
  addMember(@Param("clubId") clubId: string, @Body() request: AddClubMemberRequest): Promise<ClubMember> {
    return this.access.addMember(clubId, request);
  }

  @Delete("clubs/:clubId/members/:userId")
  @UseGuards(ClubAdminGuard)
  removeMember(@Param("clubId") clubId: string, @Param("userId") userId: string): Promise<void> {
    return this.access.removeMember(clubId, userId);
  }
}
