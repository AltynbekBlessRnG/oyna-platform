import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConsoleSmsProvider } from "./console.provider";
import { MobizonSmsProvider } from "./mobizon.provider";
import type { SmsProvider } from "./sms-provider";
import { SmscSmsProvider } from "./smsc.provider";

/**
 * Доставка кодов входа. Провайдер выбирается переменной `OTP_PROVIDER`;
 * если ключи оператора не заданы, сервис честно падает на console вместо тихой
 * неудачи — так сразу видно, что настоящие SMS ещё не подключены.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: SmsProvider = this.select();

  get providerName(): string {
    return this.provider.name;
  }

  async sendCode(phone: string, code: string): Promise<void> {
    try {
      await this.provider.send(phone, `OYNA: код ${code}. Никому его не сообщайте.`);
    } catch (error) {
      this.logger.error(`Не удалось отправить код через ${this.provider.name}: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException("Не удалось отправить код. Попробуйте ещё раз через минуту.");
    }
  }

  private select(): SmsProvider {
    const requested = (process.env.OTP_PROVIDER ?? "console").toLowerCase();
    if (requested === "mobizon") {
      const apiKey = process.env.MOBIZON_API_KEY;
      if (apiKey) return new MobizonSmsProvider(apiKey);
      this.logger.warn("OTP_PROVIDER=mobizon, но MOBIZON_API_KEY не задан — коды остаются в логах");
    }
    if (requested === "smsc") {
      const login = process.env.SMSC_LOGIN;
      const password = process.env.SMSC_PASSWORD;
      if (login && password) return new SmscSmsProvider(login, password);
      this.logger.warn("OTP_PROVIDER=smsc, но SMSC_LOGIN или SMSC_PASSWORD не заданы — коды остаются в логах");
    }
    return new ConsoleSmsProvider();
  }
}
