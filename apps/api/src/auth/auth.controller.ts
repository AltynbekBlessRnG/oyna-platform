import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from "@nestjs/common";
import type { AuthSession, ChallengeStatusResponse, RequestCodeRequest, RequestCodeResponse, VerifyCodeRequest } from "@oyna/contracts";
import { AuthService, type TelegramUpdate } from "./auth.service";

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

  /** Приложение опрашивает этот адрес, пока игрок подтверждает номер в Telegram. */
  @Get("challenges/:challengeId")
  challengeStatus(@Param("challengeId") challengeId: string, @Query("name") name?: string): Promise<ChallengeStatusResponse> {
    return this.authService.getChallengeStatus(challengeId, name);
  }

  /**
   * Апдейты Telegram. Всегда отвечаем 200: на любой другой код Telegram
   * повторяет доставку по нарастающей и в итоге отключает вебхук.
   */
  @Post("telegram/webhook")
  @HttpCode(200)
  async telegramWebhook(
    @Body() update: TelegramUpdate,
    @Headers("x-telegram-bot-api-secret-token") secret?: string
  ): Promise<{ ok: true }> {
    this.authService.assertWebhookSecret(secret);
    await this.authService.handleTelegramUpdate(update);
    return { ok: true };
  }
}
