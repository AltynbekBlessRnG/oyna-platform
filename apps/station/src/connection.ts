import type { StationCommand, StationLoginCode, StationState } from "@oyna/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { StationConfig } from "./config";

export type Link = "connecting" | "online" | "offline" | "rejected";

/**
 * Связь с сервером клуба. Пока связи нет, экран держится на последнем известном состоянии:
 * игрока не выкидывают из-за сети, а свободный компьютер так и остаётся заблокированным.
 */
export function useStation(config: StationConfig, onCommand: (command: StationCommand) => void) {
  const [state, setState] = useState<StationState | null>(null);
  const [link, setLink] = useState<Link>("connecting");
  const [rejection, setRejection] = useState<string>();
  const socketRef = useRef<Socket | null>(null);
  // Обработчик меняется при каждой отрисовке; сокет переподключать из-за этого нельзя.
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;

  useEffect(() => {
    const base = config.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
    const socket = io(`${base}/stations`, { auth: { stationId: config.stationId, token: config.token }, transports: ["websocket"] });
    socketRef.current = socket;
    let rejected = false;
    let replaced = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    socket.on("connect", () => setLink("online"));
    socket.on("disconnect", (reason) => {
      if (rejected) return;
      setLink("offline");
      // Сервер сам закрыл связь (рестарт, сбой базы) — socket.io в этом случае не переподключается сам.
      // Не повторяем, только если нас вытеснил другой компьютер с тем же ключом: иначе выбивали бы друг друга.
      if (reason === "io server disconnect" && !replaced) retry = setTimeout(() => socket.connect(), 5_000);
    });
    socket.on("connect_error", () => !rejected && setLink("offline"));
    socket.on("replaced", () => {
      replaced = true;
    });
    socket.on("auth:error", ({ message }: { message: string }) => {
      rejected = true;
      setRejection(message);
      setLink("rejected");
      socket.disconnect();
    });
    socket.on("state", (next: StationState) => {
      syncClock(next.serverTime);
      setState(next);
    });
    // Сначала подтверждаем получение: перезагрузка может не дать ответить потом.
    socket.on("command", (command: StationCommand, ack?: (reply: { ok: true }) => void) => {
      ack?.({ ok: true });
      commandRef.current(command);
    });
    const heartbeat = setInterval(() => socket.connected && socket.emit("heartbeat"), 30_000);
    return () => {
      clearInterval(heartbeat);
      clearTimeout(retry);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [config.apiUrl, config.stationId, config.token]);

  const requestCode = useCallback(async (): Promise<StationLoginCode> => {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error("Нет связи с сервером");
    return (await socket.timeout(10_000).emitWithAck("login-code")) as StationLoginCode;
  }, []);

  const endSession = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error("Нет связи с сервером");
    setState((await socket.timeout(10_000).emitWithAck("session:end")) as StationState);
  }, []);

  return { state, link, rejection, requestCode, endSession };
}

/**
 * Часы сервера, продолженные монотонным таймером браузера. Часы Windows не участвуют: если они
 * спешат или их подкрутили, сессия всё равно кончится тогда же, когда на сервере.
 */
let clockBase: { server: number; monotonic: number } | null = null;

function syncClock(serverTime: string | undefined): void {
  const server = serverTime ? Date.parse(serverTime) : NaN;
  if (Number.isFinite(server)) clockBase = { server, monotonic: performance.now() };
}

export function serverNow(): number {
  return clockBase ? clockBase.server + (performance.now() - clockBase.monotonic) : Date.now();
}

/** Текущее время сервера, обновляется раз в `step` мс: для таймеров на экране. */
export function useNow(step = 1_000): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), step);
    return () => clearInterval(timer);
  }, [step]);
  return now;
}
