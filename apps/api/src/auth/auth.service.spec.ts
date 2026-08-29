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
    await expect(service.requestCode("+77010000002")).resolves.toMatchObject({ expiresInSeconds: 300 });
  });
});
