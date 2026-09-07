/**
 * Telegram отдаёт номер как придётся: `+7 701…`, `8701…`, иногда без кода страны.
 * Сравнивать надо по цифрам, иначе верный номер не совпадёт сам с собой.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

export function phonesMatch(appPhone: string, telegramPhone: string): boolean {
  const left = normalizePhone(appPhone);
  return left.length > 0 && left === normalizePhone(telegramPhone);
}
