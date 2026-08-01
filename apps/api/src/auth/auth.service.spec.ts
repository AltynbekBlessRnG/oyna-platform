import { AuthService } from "./auth.service";
import { DatabaseService } from "../database/database.service";

describe("AuthService", () => {
  const service = new AuthService(new DatabaseService());

  it("verifies the development code and signs a session", async () => {
    const challenge = service.requestCode("+7 700 000 00 00");
    const session = await service.verifyCode(challenge.challengeId, "0000", "Арман");
    expect(session.user.phone).toBe("+77000000000");
    expect(service.verifyToken(session.accessToken)).toEqual(session.user);
  });
});

