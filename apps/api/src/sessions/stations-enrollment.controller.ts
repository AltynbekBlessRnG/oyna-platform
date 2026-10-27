import { Body, Controller, HttpCode, Ip, Post } from "@nestjs/common";
import type { EnrollStationRequest, StationCredentials, StationEnrollment } from "@oyna/contracts";
import { SessionsService } from "./sessions.service";

/** Компьютер в зале подключается сам: по коду клуба из кабинета, без входа и без ключа. */
@Controller("stations/enrollment")
export class StationsEnrollmentController {
  constructor(private readonly sessions: SessionsService) {}

  @Post("lookup")
  @HttpCode(200)
  lookup(@Body() request: EnrollStationRequest, @Ip() ip: string): Promise<StationEnrollment> {
    return this.sessions.lookupEnrollment(request?.code, ip);
  }

  @Post()
  enroll(@Body() request: EnrollStationRequest, @Ip() ip: string): Promise<StationCredentials> {
    return this.sessions.enrollStation(request?.code, String(request?.seatId ?? ""), ip);
  }
}
