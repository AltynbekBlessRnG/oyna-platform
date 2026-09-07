import { phonesMatch, normalizePhone } from "./phone.util";

describe("нормализация номера из Telegram", () => {
  it("приводит казахстанские форматы к одному виду", () => {
    expect(normalizePhone("+7 701 234 56 78")).toBe("77012345678");
    expect(normalizePhone("87012345678")).toBe("77012345678");
    expect(normalizePhone("7012345678")).toBe("77012345678");
  });

  it("считает один и тот же номер совпавшим в любой записи", () => {
    expect(phonesMatch("+77012345678", "8 701 234 56 78")).toBe(true);
    expect(phonesMatch("+77012345678", "7012345678")).toBe(true);
  });

  it("не пропускает чужой номер", () => {
    expect(phonesMatch("+77012345678", "+77019999999")).toBe(false);
    expect(phonesMatch("+77012345678", "")).toBe(false);
  });
});
