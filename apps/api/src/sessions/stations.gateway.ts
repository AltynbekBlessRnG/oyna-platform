import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConnectedSocket, type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { StationLoginCode, StationState } from "@oyna/contracts";
import type { Server, Socket } from "socket.io";
import { SessionsService } from "./sessions.service";

type StationSocket = Socket & { data: { stationId?: string } };

/**
 * Канал «сервер ↔ компьютер в зале». Клиент подключается с id и ключом компьютера,
 * получает `state` при подключении и при каждом изменении своей сессии.
 *
 * От клиента: `login-code` — код для экрана блокировки, `session:end` — игрок
 * завершил сессию на компьютере, `heartbeat` — клиент жив.
 */
@WebSocketGateway({ namespace: "stations", cors: { origin: true } })
export class StationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(StationsGateway.name);
  @WebSocketServer() server: Server;
  private unsubscribe?: () => void;

  constructor(private readonly sessions: SessionsService) {}

  afterInit(): void {
    this.unsubscribe = this.sessions.onStationChange((stationId, state) => {
      if (state) {
        this.server.to(this.room(stationId)).emit("state", state);
        return;
      }
      this.server.to(this.room(stationId)).emit("auth:error", { message: "Компьютер отключён от клуба или его ключ сменён" });
      this.server.in(this.room(stationId)).disconnectSockets(true);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  async handleConnection(client: StationSocket): Promise<void> {
    try {
      const auth = client.handshake.auth as { stationId?: unknown; token?: unknown };
      const station = await this.sessions.authenticateStation(String(auth.stationId ?? ""), String(auth.token ?? ""));
      client.data.stationId = station.id;
      // Второе подключение того же компьютера вытесняет первое: онлайн-статус считается по одному сокету.
      for (const socket of await this.server.in(this.room(station.id)).fetchSockets()) socket.disconnect(true);
      await client.join(this.room(station.id));
      await this.sessions.setStationOnline(station.id, true);
      client.emit("state", await this.sessions.getStationState(station.id));
    } catch (error) {
      this.logger.warn(`Компьютер не подключён: ${String(error)}`);
      client.emit("auth:error", { message: "Неверный id компьютера или ключ" });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: StationSocket): Promise<void> {
    const stationId = client.data.stationId;
    if (!stationId) return;
    const others = await this.server.in(this.room(stationId)).fetchSockets();
    if (others.length === 0) await this.sessions.setStationOnline(stationId, false);
  }

  @SubscribeMessage("login-code")
  loginCode(@ConnectedSocket() client: StationSocket): Promise<StationLoginCode> {
    return this.sessions.issueLoginCode(this.stationOf(client));
  }

  @SubscribeMessage("session:end")
  async endSession(@ConnectedSocket() client: StationSocket): Promise<StationState> {
    const stationId = this.stationOf(client);
    await this.sessions.endFromStation(stationId);
    return this.sessions.getStationState(stationId);
  }

  @SubscribeMessage("heartbeat")
  async heartbeat(@ConnectedSocket() client: StationSocket): Promise<{ ok: true }> {
    await this.sessions.touchStation(this.stationOf(client));
    return { ok: true };
  }

  private stationOf(client: StationSocket): string {
    if (!client.data.stationId) throw new Error("Компьютер не авторизован");
    return client.data.stationId;
  }

  private room(stationId: string): string {
    return `station:${stationId}`;
  }
}
