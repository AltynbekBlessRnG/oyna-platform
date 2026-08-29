/**
 * Канал доставки кода входа. Реализации живут рядом: console для разработки,
 * mobizon и smsc — операторы, работающие по Казахстану.
 */
export interface SmsProvider {
  readonly name: string;
  send(phone: string, text: string): Promise<void>;
}

/** Номер в формате, который ждут операторы: только цифры, без плюса. */
export function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}
