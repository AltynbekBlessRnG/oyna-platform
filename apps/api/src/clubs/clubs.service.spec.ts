import { NotFoundException } from "@nestjs/common";
import { ClubsService } from "./clubs.service";

describe("ClubsService", () => {
  const service = new ClubsService();

  it("returns the club catalog", () => {
    expect(service.findAll()).toHaveLength(3);
  });

  it("throws for an unknown club", () => {
    expect(() => service.findOne("unknown")).toThrow(NotFoundException);
  });
});

