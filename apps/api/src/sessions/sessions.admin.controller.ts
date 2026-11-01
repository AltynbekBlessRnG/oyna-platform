import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ClubHallService } from "../clubs/club-hall.service";
import type { AuthUser, ClubOrder, ClubOrderStatus, ClubStation, PlaySession, RegisterStationRequest, StartSessionRequest, StationCommand, StationCommandResult, StationCredentials, StationEnrollmentCode, PaymentMethod, TopUpRequest, TopUpResult } from "@oyna/contracts";
import { ClubAdminGuard } from "../auth/club-admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionsService } from "./sessions.service";

/** Касса клуба: компьютеры с клиентом Zen, сессии игроков и пополнение баланса. */
@Controller("admin/clubs/:clubId")
@UseGuards(ClubAdminGuard)
export class SessionsAdminController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly hall: ClubHallService
  ) {}

  @Get("stations")
  stations(@Param("clubId") clubId: string): Promise<ClubStation[]> {
    return this.sessions.listStations(clubId);
  }

  @Post("stations")
  registerStation(@Param("clubId") clubId: string, @Body() request: RegisterStationRequest): Promise<StationCredentials> {
    return this.sessions.registerStation(clubId, request?.seatId, request?.name);
  }

  /** Код клуба для подключения компьютеров: вводится на каждом ПК вместо id и ключа. */
  @Post("stations/enrollment-code")
  enrollmentCode(@Param("clubId") clubId: string): Promise<StationEnrollmentCode> {
    return this.sessions.issueEnrollmentCode(clubId);
  }

  /** Свободные компьютеры зала разом: перезагрузить или выключить при закрытии клуба. */
  @Post("stations/commands")
  commandFree(@Param("clubId") clubId: string, @Body() command: StationCommand): Promise<StationCommandResult[]> {
    return this.sessions.sendCommandToFree(clubId, command);
  }

  @Post("stations/:stationId/commands")
  command(@Param("clubId") clubId: string, @Param("stationId") stationId: string, @Body() command: StationCommand): Promise<StationCommandResult> {
    return this.sessions.sendCommand(clubId, stationId, command);
  }

  @Post("stations/:stationId/token")
  rotateToken(@Param("clubId") clubId: string, @Param("stationId") stationId: string): Promise<StationCredentials> {
    return this.sessions.rotateStationToken(clubId, stationId);
  }

  @Delete("stations/:stationId")
  removeStation(@Param("clubId") clubId: string, @Param("stationId") stationId: string): Promise<void> {
    return this.sessions.removeStation(clubId, stationId);
  }

  @Get("sessions")
  activeSessions(@Param("clubId") clubId: string): Promise<PlaySession[]> {
    return this.sessions.listActive(clubId);
  }

  @Post("sessions")
  startSession(@Param("clubId") clubId: string, @Body() request: StartSessionRequest): Promise<PlaySession> {
    return this.sessions.startForPlayer(clubId, request?.seatId, request?.phone ?? "", request?.minutes, request?.packageId);
  }

  @Post("sessions/:sessionId/end")
  endSession(@Param("clubId") clubId: string, @Param("sessionId") sessionId: string): Promise<PlaySession> {
    return this.sessions.endByClub(clubId, sessionId);
  }

  @Get("orders")
  openOrders(@Param("clubId") clubId: string): Promise<ClubOrder[]> {
    return this.hall.findOpenOrders(clubId);
  }

  @Post("orders/:orderId/status")
  setOrderStatus(@Param("clubId") clubId: string, @Param("orderId") orderId: string, @Body() request: { status: ClubOrderStatus }): Promise<ClubOrder> {
    return this.hall.setOrderStatus(clubId, orderId, request?.status);
  }

  @Post("sessions/:sessionId/top-ups")
  topUpSession(
    @Param("clubId") clubId: string,
    @Param("sessionId") sessionId: string,
    @CurrentUser() admin: AuthUser,
    @Body() request: { amount: number; method?: PaymentMethod }
  ): Promise<TopUpResult> {
    return this.sessions.topUpSession(clubId, sessionId, request?.amount, admin, request?.method);
  }

  @Post("top-ups")
  topUp(@Param("clubId") clubId: string, @CurrentUser() admin: AuthUser, @Body() request: TopUpRequest): Promise<TopUpResult> {
    return this.sessions.topUp(clubId, request?.phone ?? "", request?.amount, admin, request?.method);
  }
}
