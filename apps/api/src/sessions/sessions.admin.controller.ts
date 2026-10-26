import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { AuthUser, ClubStation, PlaySession, RegisterStationRequest, StartSessionRequest, StationCredentials, TopUpRequest, TopUpResult } from "@oyna/contracts";
import { ClubAdminGuard } from "../auth/club-admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionsService } from "./sessions.service";

/** Касса клуба: компьютеры с клиентом Zen, сессии игроков и пополнение баланса. */
@Controller("admin/clubs/:clubId")
@UseGuards(ClubAdminGuard)
export class SessionsAdminController {
  constructor(private readonly sessions: SessionsService) {}

  @Get("stations")
  stations(@Param("clubId") clubId: string): Promise<ClubStation[]> {
    return this.sessions.listStations(clubId);
  }

  @Post("stations")
  registerStation(@Param("clubId") clubId: string, @Body() request: RegisterStationRequest): Promise<StationCredentials> {
    return this.sessions.registerStation(clubId, request?.seatId, request?.name);
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
    return this.sessions.startForPlayer(clubId, request?.seatId, request?.phone ?? "", request?.minutes);
  }

  @Post("sessions/:sessionId/end")
  endSession(@Param("clubId") clubId: string, @Param("sessionId") sessionId: string): Promise<PlaySession> {
    return this.sessions.endByClub(clubId, sessionId);
  }

  @Post("top-ups")
  topUp(@Param("clubId") clubId: string, @CurrentUser() admin: AuthUser, @Body() request: TopUpRequest): Promise<TopUpResult> {
    return this.sessions.topUp(clubId, request?.phone ?? "", request?.amount, admin);
  }
}
