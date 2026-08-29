import { digitsOnly, type SmsProvider } from "./sms-provider";

interface SmscResponse {
  id?: number;
  error?: string;
  error_code?: number;
}

/**
 * SMSC: GET/POST /sys/send.php, `fmt=3` переключает ответ на JSON.
 * Ошибка приходит полями `error` и `error_code`.
 * Документация: https://smsc.kz/api/http/send/
 */
export class SmscSmsProvider implements SmsProvider {
  readonly name = "smsc";

  constructor(
    private readonly login: string,
    private readonly password: string,
    private readonly baseUrl = process.env.SMSC_API_URL ?? "https://smsc.kz",
    private readonly sender = process.env.SMS_SENDER
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const body = new URLSearchParams({
      login: this.login,
      psw: this.password,
      phones: digitsOnly(phone),
      mes: text,
      fmt: "3",
      charset: "utf-8"
    });
    if (this.sender) body.set("sender", this.sender);
    const response = await fetch(`${this.baseUrl}/sys/send.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(`SMSC ответил ${response.status}`);
    const result = (await response.json()) as SmscResponse;
    if (result.error) throw new Error(`SMSC отклонил отправку: ${result.error}${result.error_code ? ` (код ${result.error_code})` : ""}`);
  }
}
