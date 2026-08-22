import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { ClubsController } from "./clubs/clubs.controller";
import { ClubsService } from "./clubs/clubs.service";
import { BookingsController } from "./bookings/bookings.controller";
import { BookingsService } from "./bookings/bookings.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthGuard } from "./auth/auth.guard";
import { AdminIdentityGuard, ClubAdminGuard, PlatformAdminGuard } from "./auth/club-admin.guard";
import { ClubsAdminController } from "./clubs/clubs.admin.controller";
import { ClubAccessService } from "./clubs/club-access.service";
import { DatabaseService } from "./database/database.service";
import { ConfigModule } from "@nestjs/config";
import { ProfilesController } from "./social/profiles.controller";
import { ProfilesService } from "./social/profiles.service";
import { ChatController } from "./social/chat.controller";
import { ChatService } from "./social/chat.service";
import { TournamentsController } from "./social/tournaments.controller";
import { TournamentsService } from "./social/tournaments.service";
import { NotificationsController } from "./social/notifications.controller";
import { NotificationsService } from "./social/notifications.service";
import { ChatGateway } from "./social/chat.gateway";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] })],
  controllers: [HealthController, ClubsController, ClubsAdminController, BookingsController, AuthController, ProfilesController, ChatController, TournamentsController, NotificationsController],
  providers: [DatabaseService, ClubsService, ClubAccessService, AuthService, AuthGuard, ClubAdminGuard, AdminIdentityGuard, PlatformAdminGuard, BookingsService, ProfilesService, ChatService, ChatGateway, TournamentsService, NotificationsService],
})
export class AppModule {}
