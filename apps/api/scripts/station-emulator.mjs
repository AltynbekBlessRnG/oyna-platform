#!/usr/bin/env node
// Эмулятор клиента Zen на компьютере в зале: подключается к API как настоящий ПК,
// показывает экран блокировки с кодом входа и отсчёт идущей сессии.
//
//   pnpm --filter @oyna/api station -- --station <id> --token <ключ> [--api http://localhost:4000]
//
// id и ключ выдаёт POST /api/admin/clubs/:clubId/stations. Также читаются
// переменные ZEN_API_URL, ZEN_STATION_ID, ZEN_STATION_TOKEN.
//
// Команды в терминале: end — завершить сессию с компьютера, code — новый код, quit — выход.
import { createInterface } from "node:readline";
import { io } from "socket.io-client";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key.startsWith("--")) args.set(key.slice(2), process.argv[i + 1]), (i += 1);
}
const apiUrl = (args.get("api") ?? process.env.ZEN_API_URL ?? "http://localhost:4000").replace(/\/api\/?$/, "");
const stationId = args.get("station") ?? process.env.ZEN_STATION_ID;
const token = args.get("token") ?? process.env.ZEN_STATION_TOKEN;
if (!stationId || !token) {
  console.error("Нужны --station и --token (или ZEN_STATION_ID и ZEN_STATION_TOKEN)");
  process.exit(1);
}

const socket = io(`${apiUrl}/stations`, { auth: { stationId, token }, transports: ["websocket"] });
let state = null;
let codeTimer;
let tickTimer;

const time = (iso) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const left = (iso) => {
  const minutes = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} мин`;
};

async function showLockScreen() {
  clearTimeout(codeTimer);
  const { code, expiresAt } = await socket.emitWithAck("login-code");
  console.log(`\n🔒 ${state.station.name} заблокирован. Код входа: ${code} (до ${time(expiresAt)})`);
  console.log("   Введите его в приложении Zen: POST /api/sessions/claim {\"code\":\"" + code + "\"}");
  // Обновляем код чуть раньше, чем он истечёт.
  codeTimer = setTimeout(() => void showLockScreen(), Math.max(5_000, Date.parse(expiresAt) - Date.now() - 10_000));
}

function render() {
  clearInterval(tickTimer);
  const session = state.session;
  if (!session) return void showLockScreen().catch((error) => console.error("Не удалось получить код:", error.message));
  clearTimeout(codeTimer);
  // Гостя без имени касса заводит как «Игрок Zen»; на экране ПК его узнают по хвосту номера, как в кабинете.
  const player = session.playerName === "Игрок Zen" && session.playerPhoneTail ? `Гость ··${session.playerPhoneTail}` : session.playerName;
  const print = () => console.log(`🎮 ${state.station.name}: играет ${player}, зона «${session.zoneName}», осталось ${left(session.endsAt)} (до ${time(session.endsAt)})`);
  print();
  tickTimer = setInterval(print, 60_000);
}

socket.on("connect", () => console.log(`✓ подключён к ${apiUrl}`));
socket.on("disconnect", (reason) => console.log(`✗ связь потеряна: ${reason}`));
socket.on("auth:error", ({ message }) => {
  console.error(`✗ ${message}`);
  process.exit(1);
});
socket.on("state", (next) => {
  state = next;
  render();
});
setInterval(() => socket.connected && socket.emit("heartbeat"), 30_000).unref();

createInterface({ input: process.stdin }).on("line", async (line) => {
  const command = line.trim();
  if (command === "quit") process.exit(0);
  if (command === "code" && state && !state.session) await showLockScreen();
  if (command === "end") {
    state = await socket.emitWithAck("session:end");
    console.log("Сессия завершена с компьютера");
    render();
  }
});
