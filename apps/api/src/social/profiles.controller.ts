import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthUser, PlayerProfile, UpdateProfileRequest } from "@oyna/contracts";
import { AuthGuard } from "../auth/auth.guard"; import { CurrentUser } from "../auth/current-user.decorator"; import { ProfilesService } from "./profiles.service";
@Controller() export class ProfilesController {
  constructor(private readonly profiles:ProfilesService){}
  @Get("profiles/me") @UseGuards(AuthGuard) me(@CurrentUser()u:AuthUser){return this.profiles.ensure(u)}
  @Get("profiles/:id") @UseGuards(AuthGuard) get(@Param("id")id:string,@CurrentUser()u:AuthUser):Promise<PlayerProfile>{return this.profiles.get(id,u.id)}
  @Patch("profiles/me") @UseGuards(AuthGuard) update(@CurrentUser()u:AuthUser,@Body()b:UpdateProfileRequest){return this.profiles.update(u,b)}
  @Get("integrations/steam/connect") @UseGuards(AuthGuard) steam(@CurrentUser()u:AuthUser){return this.profiles.steamConnectUrl(u.id)}
  @Get("integrations/steam/callback") steamCallback(@Query("state")state:string,@Query()query:Record<string,string>){return this.profiles.completeSteamConnection(state,query)}
  @Post("account/deletion/request") @UseGuards(AuthGuard) remove(@CurrentUser()u:AuthUser){return this.profiles.requestDeletion(u.id)}
  @Delete("account/deletion/request") @UseGuards(AuthGuard) restore(@CurrentUser()u:AuthUser){return this.profiles.cancelDeletion(u.id)}
}
