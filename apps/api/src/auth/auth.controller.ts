import { Body, Controller, Post } from "@nestjs/common";
import type { AuthSession, RequestCodeRequest, RequestCodeResponse, VerifyCodeRequest } from "@oyna/contracts";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("request-code")
  requestCode(@Body() request: RequestCodeRequest): Promise<RequestCodeResponse> {
    return this.authService.requestCode(request.phone);
  }

  @Post("verify-code")
  verifyCode(@Body() request: VerifyCodeRequest): Promise<AuthSession> {
    return this.authService.verifyCode(request.challengeId, request.code, request.name);
  }
}

