import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { AuthUser, ClaimStationRequest, PlaySession } from "@oyna/contracts";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionsService } from "./sessions.service";

/** Сессии со стороны игрока: сесть за компьютер по коду с экрана, посмотреть и завершить свою. */
@Controller()
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post("sessions/claim")
  claim(@CurrentUser() user: AuthUser, @Body() request: ClaimStationRequest): Promise<PlaySession> {
    return this.sessions.claimStation(user, request?.code, request?.minutes);
  }

  @Get("clubs/:clubId/session")
  current(@Param("clubId") clubId: string, @CurrentUser() user: AuthUser): Promise<PlaySession | null> {
    return this.sessions.findCurrent(clubId, user.id);
  }

  @Post("sessions/:sessionId/end")
  end(@Param("sessionId") sessionId: string, @CurrentUser() user: AuthUser): Promise<PlaySession> {
    return this.sessions.endByPlayer(sessionId, user);
  }
}
