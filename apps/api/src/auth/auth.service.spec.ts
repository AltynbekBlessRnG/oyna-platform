import { HttpStatus } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const service = new AuthService(new DatabaseService());

  it("verifies the development code and signs a session", async () => {
    const challenge = await service.requestCode("+7 700 000 00 00");
    const session = await service.verifyCode(challenge.challengeId, "0000", "Арман");
    expect(session.user.phone).toBe("+77000000000");
    expect(service.verifyToken(session.accessToken)).toEqual(session.user);
  });

  it("does not send a second code to the same number within a minute", async () => {
    await service.requestCode("+77010000001");
    await expect(service.requestCode("+77010000001")).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it("keeps the throttle per number", async () => {
    await expect(service.requestCode("+77010000002")).resolves.toMatchObject({ expiresInSeconds: 600 });
  });
});

describe("подтверждение номера через Telegram", () => {
  const service = new AuthService(new DatabaseService());
  const telegram = service["telegram"];
  const chat = { id: 555 };

  beforeAll(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_BOT_USERNAME = "zen_club_bot";
    // Настоящий Telegram в тестах не дёргаем: важно, что и кому мы отправили.
    jest.spyOn(telegram, "sendText").mockResolvedValue(true);
    jest.spyOn(telegram, "requestPhoneContact").mockResolvedValue(true);
  });

  it("отдаёт ссылку на бота вместе с кодом", async () => {
    const challenge = await service.requestCode("+77020000001");
    expect(challenge.telegramBotUrl).toBe(`https://t.me/zen_club_bot?start=otp_${challenge.challengeId}`);
  });

  it("пускает игрока, когда Telegram прислал тот же номер", async () => {
    const challenge = await service.requestCode("+77020000002");
    await service.handleTelegramUpdate({ message: { text: `/start otp_${challenge.challengeId}`, chat, from: { id: 555 } } });
    expect(telegram.requestPhoneContact).toHaveBeenCalledWith("555", "+77020000002");

    await expect(service.getChallengeStatus(challenge.challengeId)).resolves.toMatchObject({ status: "pending" });

    await service.handleTelegramUpdate({ message: { chat, from: { id: 555 }, contact: { phone_number: "87020000002", user_id: 555 } } });
    const status = await service.getChallengeStatus(challenge.challengeId, "Арман");
    expect(status.status).toBe("verified");
    expect(status.session?.user.phone).toBe("+77020000002");
  });

  it("закрывает сессию после входа, второй раз по ней не пустит", async () => {
    const challenge = await service.requestCode("+77020000003");
    await service.handleTelegramUpdate({ message: { text: `/start otp_${challenge.challengeId}`, chat, from: { id: 555 } } });
    await service.handleTelegramUpdate({ message: { chat, from: { id: 555 }, contact: { phone_number: "+77020000003", user_id: 555 } } });
    await expect(service.getChallengeStatus(challenge.challengeId)).resolves.toMatchObject({ status: "verified" });
    await expect(service.getChallengeStatus(challenge.challengeId)).resolves.toEqual({ status: "pending" });
  });

  it("не подтверждает номер, отличный от введённого в приложении", async () => {
    const challenge = await service.requestCode("+77020000004");
    await service.handleTelegramUpdate({ message: { text: `/start otp_${challenge.challengeId}`, chat, from: { id: 555 } } });
    await service.handleTelegramUpdate({ message: { chat, from: { id: 555 }, contact: { phone_number: "+77019999999", user_id: 555 } } });
    await expect(service.getChallengeStatus(challenge.challengeId)).resolves.toEqual({ status: "pending" });
  });

  it("не принимает пересланный чужой контакт", async () => {
    const challenge = await service.requestCode("+77020000005");
    await service.handleTelegramUpdate({ message: { text: `/start otp_${challenge.challengeId}`, chat, from: { id: 555 } } });
    await service.handleTelegramUpdate({ message: { chat, from: { id: 555 }, contact: { phone_number: "+77020000005", user_id: 999 } } });
    await expect(service.getChallengeStatus(challenge.challengeId)).resolves.toEqual({ status: "pending" });
  });

  it("отбивает вебхук без секрета", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
    expect(() => service.assertWebhookSecret("s3cret")).not.toThrow();
    expect(() => service.assertWebhookSecret("wrong")).toThrow();
    expect(() => service.assertWebhookSecret(undefined)).toThrow();
  });
});
