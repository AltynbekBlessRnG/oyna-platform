import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { ClubsController } from "./clubs/clubs.controller";
import { ClubsService } from "./clubs/clubs.service";
import { BookingsController } from "./bookings/bookings.controller";
import { BookingsService } from "./bookings/bookings.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthGuard } from "./auth/auth.guard";
import { AdminGuard } from "./auth/admin.guard";
import { DatabaseService } from "./database/database.service";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] })],
  controllers: [HealthController, ClubsController, BookingsController, AuthController],
  providers: [DatabaseService, ClubsService, AuthService, AuthGuard, AdminGuard, BookingsService],
})
export class AppModule {}
