import type { StationLoginCode, StationState } from "@oyna/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { StationConfig } from "./config";

export type Link = "connecting" | "online" | "offline" | "rejected";

/**
 * Связь с сервером клуба. Пока связи нет, экран держится на последнем известном состоянии:
 * игрока не выкидывают из-за сети, а свободный компьютер так и остаётся заблокированным.
 */
export function useStation(config: StationConfig) {
  const [state, setState] = useState<StationState | null>(null);
  const [link, setLink] = useState<Link>("connecting");
  const [rejection, setRejection] = useState<string>();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const base = config.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
    const socket = io(`${base}/stations`, { auth: { stationId: config.stationId, token: config.token }, transports: ["websocket"] });
    socketRef.current = socket;
    let rejected = false;
    socket.on("connect", () => setLink("online"));
    socket.on("disconnect", () => !rejected && setLink("offline"));
    socket.on("connect_error", () => !rejected && setLink("offline"));
    socket.on("auth:error", ({ message }: { message: string }) => {
      rejected = true;
      setRejection(message);
      setLink("rejected");
      socket.disconnect();
    });
    socket.on("state", (next: StationState) => setState(next));
    const heartbeat = setInterval(() => socket.connected && socket.emit("heartbeat"), 30_000);
    return () => {
      clearInterval(heartbeat);
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

/** Текущее время, обновляется раз в `step` мс: для таймеров на экране. */
export function useNow(step = 1_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), step);
    return () => clearInterval(timer);
  }, [step]);
  return now;
}
