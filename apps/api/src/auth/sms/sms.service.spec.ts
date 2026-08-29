import { ServiceUnavailableException } from "@nestjs/common";
import { SmsService } from "./sms.service";

describe("SmsService", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("uses the console channel while no operator is configured", () => {
    process.env.OTP_PROVIDER = "console";
    expect(new SmsService().providerName).toBe("console");
  });

  it("falls back to the console channel when the operator key is missing", () => {
    process.env.OTP_PROVIDER = "mobizon";
    delete process.env.MOBIZON_API_KEY;
    expect(new SmsService().providerName).toBe("console");
  });

  it("selects the operator once its credentials are present", () => {
    process.env.OTP_PROVIDER = "mobizon";
    process.env.MOBIZON_API_KEY = "test-key";
    expect(new SmsService().providerName).toBe("mobizon");

    process.env.OTP_PROVIDER = "smsc";
    process.env.SMSC_LOGIN = "login";
    process.env.SMSC_PASSWORD = "password";
    expect(new SmsService().providerName).toBe("smsc");
  });

  it("reports a delivery failure instead of leaving the caller waiting for a code", async () => {
    process.env.OTP_PROVIDER = "mobizon";
    process.env.MOBIZON_API_KEY = "test-key";
    const service = new SmsService();
    const failing = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("сеть недоступна"));
    await expect(service.sendCode("+77000000000", "1234")).rejects.toThrow(ServiceUnavailableException);
    failing.mockRestore();
  });
});
