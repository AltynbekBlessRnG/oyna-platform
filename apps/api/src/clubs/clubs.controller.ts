import { Controller, Get, Param } from "@nestjs/common";
import type { ClubSummary } from "@oyna/contracts";
import { ClubsService } from "./clubs.service";

@Controller("clubs")
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  findAll(): Promise<ClubSummary[]> {
    return this.clubsService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<ClubSummary> {
    return this.clubsService.findOne(id);
  }
}
