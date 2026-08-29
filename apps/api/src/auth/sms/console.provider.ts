import { Logger } from "@nestjs/common";
import type { SmsProvider } from "./sms-provider";

/** Печатает код в лог: годится только для разработки и контролируемой демонстрации. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";
  private readonly logger = new Logger("SMS");

  async send(phone: string, text: string): Promise<void> {
    this.logger.log(`${phone}: ${text}`);
  }
}
