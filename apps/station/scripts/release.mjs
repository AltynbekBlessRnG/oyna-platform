#!/usr/bin/env node
// Выпуск новой версии Zen для компьютеров клубов: подписывает собранный Zen.exe и загружает на сервер.
//
//   node scripts/release.mjs [--api https://oyna-api.onrender.com] [--exe путь/к/zen-station.exe]
//
// Версия берётся из src-tauri/Cargo.toml — поднимите её перед сборкой, иначе компьютеры не обновятся.
// Закрытый ключ: ~/.config/zen/station-release.pem (или ZEN_RELEASE_KEY). В репозиторий и на сервер он
// не попадает никогда: открытая половина вшита в src-tauri/src/update.rs.
// Доступ к серверу: ZEN_ADMIN_TOKEN (токен владельца платформы) или ZEN_ADMIN_KEY (ключ кабинета).
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const api = (args.get("api") ?? "https://oyna-api.onrender.com").replace(/\/+$/, "").replace(/\/api$/, "");
const exe = args.get("exe") ?? join(here, "../src-tauri/target/x86_64-pc-windows-msvc/release/zen-station.exe");
const version = readFileSync(join(here, "../src-tauri/Cargo.toml"), "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const keyPath = process.env.ZEN_RELEASE_KEY ?? join(homedir(), ".config/zen/station-release.pem");

if (!version) throw new Error("Не нашёл версию в Cargo.toml");
const binary = readFileSync(exe);
const sha256 = createHash("sha256").update(binary).digest("hex");
const signature = sign(null, Buffer.from(`zen-station:${version}:${sha256}`), createPrivateKey(readFileSync(keyPath))).toString("hex");

const headers = { "Content-Type": "application/octet-stream" };
if (process.env.ZEN_ADMIN_TOKEN) headers.Authorization = `Bearer ${process.env.ZEN_ADMIN_TOKEN}`;
else if (process.env.ZEN_ADMIN_KEY) headers["x-club-admin-key"] = process.env.ZEN_ADMIN_KEY;
else throw new Error("Задайте ZEN_ADMIN_TOKEN или ZEN_ADMIN_KEY");

const response = await fetch(`${api}/api/admin/station-releases?version=${version}&signature=${signature}`, { method: "POST", headers, body: binary });
const body = await response.text();
if (!response.ok) throw new Error(`Сервер отказал (${response.status}): ${body}`);
console.log(`Выпущена версия ${version}: ${(binary.length / 1024 / 1024).toFixed(1)} МБ, sha256 ${sha256.slice(0, 12)}…`);
