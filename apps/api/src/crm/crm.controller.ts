import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import type { AuthUser, BalanceAdjustmentRequest, ClientNote, ClientSegment, ClientSort, ClubAnalytics, ClubClientDetail, ClubClientsResponse } from "@oyna/contracts";
import { ClubAdminGuard } from "../auth/club-admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { CrmService } from "./crm.service";

/** CRM и аналитика владельца клуба. */
@Controller("admin/clubs/:clubId")
@UseGuards(ClubAdminGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get("clients")
  clients(
    @Param("clubId") clubId: string,
    @Query("search") search?: string,
    @Query("segment") segment?: ClientSegment | "risk",
    @Query("sort") sort?: ClientSort
  ): Promise<ClubClientsResponse> {
    return this.crm.listClients(clubId, { search, segment, sort });
  }

  @Get("clients/:userId")
  client(@Param("clubId") clubId: string, @Param("userId") userId: string): Promise<ClubClientDetail> {
    return this.crm.getClient(clubId, userId);
  }

  @Post("clients/:userId/notes")
  addNote(@Param("clubId") clubId: string, @Param("userId") userId: string, @CurrentUser() author: AuthUser, @Body() body: { text: string }): Promise<ClientNote> {
    return this.crm.addNote(clubId, userId, body?.text, author);
  }

  @Delete("clients/:userId/notes/:noteId")
  deleteNote(@Param("clubId") clubId: string, @Param("userId") userId: string, @Param("noteId") noteId: string): Promise<void> {
    return this.crm.deleteNote(clubId, userId, noteId);
  }

  @Put("clients/:userId/tags")
  async setTags(@Param("clubId") clubId: string, @Param("userId") userId: string, @Body() body: { tags: string[] }): Promise<{ tags: string[] }> {
    return { tags: await this.crm.setTags(clubId, userId, body?.tags) };
  }

  @Post("clients/:userId/balance-adjustments")
  async adjust(
    @Param("clubId") clubId: string,
    @Param("userId") userId: string,
    @CurrentUser() author: AuthUser,
    @Body() body: BalanceAdjustmentRequest
  ): Promise<{ balance: number }> {
    return { balance: await this.crm.adjustBalance(clubId, userId, body?.amount, body?.reason, author) };
  }

  @Get("analytics")
  analytics(@Param("clubId") clubId: string, @Query("days", new ParseIntPipe({ optional: true })) days?: number): Promise<ClubAnalytics> {
    return this.crm.analytics(clubId, days ?? 30);
  }
}
