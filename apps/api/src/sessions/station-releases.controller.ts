import { Body, Controller, Get, Header, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import type { StationRelease } from "@oyna/contracts";
import { PlatformAdminGuard } from "../auth/club-admin.guard";
import { StationReleasesService } from "./station-releases.service";

@Controller()
export class StationReleasesController {
  constructor(private readonly releases: StationReleasesService) {}

  /** Компьютеры спрашивают это раз в 30 минут; `null` — выпусков ещё не было. */
  @Get("stations/release")
  latest(): Promise<StationRelease | null> {
    return this.releases.latest();
  }

  @Get("stations/release/:version/Zen.exe")
  @Header("Content-Type", "application/octet-stream")
  async download(@Param("version") version: string): Promise<StreamableFile> {
    return new StreamableFile(await this.releases.binary(version));
  }

  /** Выпуск новой версии: `apps/station/scripts/release.mjs` присылает подписанный Zen.exe. */
  @Post("admin/station-releases")
  @UseGuards(PlatformAdminGuard)
  publish(@Query("version") version: string, @Query("signature") signature: string, @Body() binary: Buffer): Promise<StationRelease> {
    return this.releases.publish(version, signature, binary);
  }
}
