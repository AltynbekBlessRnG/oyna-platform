import { digitsOnly, type SmsProvider } from "./sms-provider";

interface MobizonResponse {
  code: number;
  message?: string;
}

/**
 * Mobizon: POST /service/Message/SendSmsMessage, ключ и формат передаются в query,
 * получатель и текст — в теле формы. Успех — поле `code` равно 0.
 * Документация: https://mobizon.kz/help/api-docs/message
 */
export class MobizonSmsProvider implements SmsProvider {
  readonly name = "mobizon";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.MOBIZON_API_URL ?? "https://api.mobizon.kz",
    private readonly sender = process.env.SMS_SENDER
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const query = new URLSearchParams({ apiKey: this.apiKey, output: "json", api: "v1" });
    const body = new URLSearchParams({ recipient: digitsOnly(phone), text });
    if (this.sender) body.set("from", this.sender);
    const response = await fetch(`${this.baseUrl}/service/Message/SendSmsMessage?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(`Mobizon ответил ${response.status}`);
    const result = (await response.json()) as MobizonResponse;
    if (result.code !== 0) throw new Error(`Mobizon отклонил отправку: код ${result.code}${result.message ? `, ${result.message}` : ""}`);
  }
}
