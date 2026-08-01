import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClubSummary } from "@oyna/contracts";
import { CLUBS } from "./clubs.data";

@Injectable()
export class ClubsService {
  findAll(): ClubSummary[] {
    return CLUBS;
  }

  findOne(id: string): ClubSummary {
    const club = CLUBS.find((item) => item.id === id);
    if (!club) {
      throw new NotFoundException("Club not found");
    }
    return club;
  }
}

