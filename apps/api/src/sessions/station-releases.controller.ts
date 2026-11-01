import { BadRequestException, Controller, NotFoundException, Get, Header, Param, Post, Query, Req, StreamableFile, UseGuards } from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import type { StationRelease } from "@oyna/contracts";
import { PlatformAdminGuard } from "../auth/club-admin.guard";
import { MAX_RELEASE_BYTES, StationReleasesService } from "./station-releases.service";

@Controller()
export class StationReleasesController {
  constructor(private readonly releases: StationReleasesService) {}

  /** Компьютеры спрашивают это раз в 30 минут; `null` — выпусков ещё не было. */
  @Get("stations/release")
  latest(): Promise<StationRelease | null> {
    return this.releases.latest();
  }

  /**
   * Установщик для кабинета: свежий Zen под именем Zen-Setup.exe. По имени файла программа
   * понимает, что её запустили для установки, — админу клуба нужен только этот файл.
   */
  @Get("stations/setup")
  @Header("Content-Type", "application/octet-stream")
  @Header("Content-Disposition", 'attachment; filename="Zen-Setup.exe"')
  async setup(): Promise<StreamableFile> {
    const release = await this.releases.latest();
    if (!release) throw new NotFoundException("Программа для компьютеров ещё не выпущена");
    return new StreamableFile(await this.releases.binary(release.version));
  }

  @Get("stations/release/:version/Zen.exe")
  @Header("Content-Type", "application/octet-stream")
  async download(@Param("version") version: string): Promise<StreamableFile> {
    return new StreamableFile(await this.releases.binary(version));
  }

  /**
   * Выпуск новой версии: `apps/station/scripts/release.mjs` присылает подписанный Zen.exe.
   * Тело читаем сами и только после проверки прав: общий парсер на 50 МБ дал бы любому
   * анониму забить память сервера.
   */
  @Post("admin/station-releases")
  @UseGuards(PlatformAdminGuard)
  async publish(@Query("version") version: string, @Query("signature") signature: string, @Req() request: IncomingMessage): Promise<StationRelease> {
    return this.releases.publish(version, signature, await readBody(request));
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_RELEASE_BYTES) throw new BadRequestException("Файл больше 50 МБ");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
