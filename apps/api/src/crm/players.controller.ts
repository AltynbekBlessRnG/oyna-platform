import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type { PlayerSuggestion } from "@oyna/contracts";
import { ClubStaffGuard } from "../auth/club-admin.guard";
import { CrmService } from "./crm.service";

/** Поиск игрока для кассы: доступен и кассиру, в отличие от полной карточки клиента. */
@Controller("admin/clubs/:clubId")
@UseGuards(ClubStaffGuard)
export class PlayersController {
  constructor(private readonly crm: CrmService) {}

  @Get("players")
  search(@Param("clubId") clubId: string, @Query("search") search?: string): Promise<PlayerSuggestion[]> {
    return this.crm.searchPlayers(clubId, search ?? "");
  }
}
