import { Controller, Get } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  getHealth(): { status: "ok"; service: string; storage: "postgresql" | "memory" } {
    return { status: "ok", service: "oyna-api", storage: this.database.configured ? "postgresql" : "memory" };
  }
}
