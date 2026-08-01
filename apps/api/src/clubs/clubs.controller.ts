import { Controller, Get, Param } from "@nestjs/common";
import type { ClubSummary } from "@oyna/contracts";
import { ClubsService } from "./clubs.service";

@Controller("clubs")
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  findAll(): ClubSummary[] {
    return this.clubsService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string): ClubSummary {
    return this.clubsService.findOne(id);
  }
}

