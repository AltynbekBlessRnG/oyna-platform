import type { AuthUser } from "@oyna/contracts";
import { AuthService } from "../auth/auth.service";
import { TelegramService } from "../auth/telegram/telegram.service";
import { ClubAccessService } from "../clubs/club-access.service";
import { ClubHallService } from "../clubs/club-hall.service";
import { CLUB_CATALOG } from "../clubs/clubs.data";
import { ClubsService } from "../clubs/clubs.service";
import { DatabaseService } from "../database/database.service";
import { PgliteDatabase } from "../database/pglite.testing";
import { ShiftsService } from "../shifts/shifts.service";
import { OwnerAlertsService } from "./owner-alerts.service";

/** Telegram без сети: складываем сообщения, чтобы проверить, кому и что ушло. */
class FakeTelegram extends TelegramService {
  readonly sent: { chatId: string; text: string }[] = [];
  override get configured(): boolean {
    return true;
  }
  override async sendText(chatId: string, text: string): Promise<boolean> {
    this.sent.push({ chatId, text });
    return true;
  }
  override async requestNotifyContact(chatId: string): Promise<boolean> {
    this.sent.push({ chatId, text: "contact?" });
    return true;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("Owner alerts in Telegram", () => {
  let database: DatabaseService;
  let telegram: FakeTelegram;
  let alerts: OwnerAlertsService;
  let auth: AuthService;
  let shifts: ShiftsService;
  let access: ClubAccessService;
  const clubId = "vertex-arena";

  beforeEach(async () => {
    database = await PgliteDatabase.create();
    const clubs = new ClubsService(database);
    await clubs.upsertCatalog(CLUB_CATALOG);
    telegram = new FakeTelegram();
    alerts = new OwnerAlertsService(database, telegram);
    auth = new AuthService(database, undefined, telegram, alerts);
    access = new ClubAccessService(database, clubs, auth);
    shifts = new ShiftsService(database, clubs, new ClubHallService(database, clubs), alerts);
  }, 120_000);

  afterEach(() => database.onModuleDestroy?.());

  it("links a chat when the owner shares his own number and reports a shortage only to owners", async () => {
    const owner = await access.addMember(clubId, { phone: "+77015551001", name: "Владелец" });
    await access.addMember(clubId, { phone: "+77015551002", name: "Дана", role: "cashier" });

    await auth.handleTelegramUpdate({ message: { chat: { id: 501 }, from: { id: 9 }, text: "/start notify" } } as never);
    await auth.handleTelegramUpdate({ message: { chat: { id: 501 }, from: { id: 9 }, contact: { user_id: 9, phone_number: "77015551001" } } } as never);
    await auth.handleTelegramUpdate({ message: { chat: { id: 502 }, from: { id: 10 }, contact: { user_id: 10, phone_number: "+7 701 555 1002" } } } as never);
    expect(await alerts.isLinked(owner.phone)).toBe(true);

    const cashier: AuthUser = { id: "c", phone: "+77015551002", name: "Дана", role: "club_admin" };
    await shifts.open(clubId, 1000, cashier);
    await shifts.close(clubId, 500, "  мелочь  ", cashier);
    await flush();

    const toOwner = telegram.sent.filter((message) => message.chatId === "501").map((message) => message.text);
    expect(toOwner.some((text) => text.includes("смена открыта"))).toBe(true);
    const closed = toOwner.find((text) => text.includes("смена закрыта"));
    expect(closed).toContain("Недостача 500 ₸");
    expect(closed).toContain("Комментарий: мелочь");
    // Кассиру в его чат приходит только подтверждение подключения, но не отчёты по кассе.
    expect(telegram.sent.filter((message) => message.chatId === "502" && message.text.includes("смена"))).toEqual([]);
  });
});
