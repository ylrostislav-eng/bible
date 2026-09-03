import {
  BadRequestException,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ROOM_INTRO_TOTAL_MS,
  ROOM_WS_EVENTS,
  ROOM_WS_NAMESPACE,
  ROOM_WS_SERVER_EVENTS,
} from '@bible-arena/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import {
  RoomAnswerMessageDto,
  RoomReadyDto,
  RoomSessionIdDto,
  RoomTargetUserDto,
} from './dto/room-ws.dto';
import { RoomsService } from './rooms.service';

/** How long the reveal stays up before the room auto-advances to the next
 * question — mirrors the 1v1 duel's client-side ~5s auto-advance, but
 * server-driven here since N participants can't be relied on to all click
 * "next" (unlike the duel's "first caller wins" model). */
const ROOM_REVEAL_SECONDS = 5;

/** How long to wait after a disconnect before treating it as actually
 * leaving a still-LOBBY room, rather than just a brief network blip or a
 * quick trip to another tab (navigating away from `/play/room` unmounts
 * `useRoomSocket`, disconnecting the socket immediately — reconnecting
 * within this window, e.g. by navigating back, cancels it). Matches
 * `PresenceService`'s online-status TTL for the same "are they actually
 * still around" reasoning. Only ever does anything for a LOBBY room —
 * `RoomsService.leave` is a no-op once IN_PROGRESS/COMPLETED — so someone
 * who merely drops connection mid-game is unaffected; that's already
 * handled by the per-question auto-timeout. */
const ROOM_DISCONNECT_GRACE_MS = 60_000;

/** How often to sweep for LOBBY rooms nobody ever actually connected to —
 * see `findStaleLobbySessionIds`. A low-frequency background check, not a
 * time-critical one: this only ever catches rooms the disconnect-grace
 * timer structurally can't (see there), so there's no harm in it lagging a
 * few minutes behind. */
const STALE_LOBBY_SWEEP_INTERVAL_MS = 60_000;
/** A LOBBY room with zero connected sockets for this long is treated as
 * abandoned. Comfortably past `ROOM_DISCONNECT_GRACE_MS` so this sweep
 * never races the grace timer for a room someone was genuinely just
 * reconnecting to. */
const STALE_LOBBY_THRESHOLD_MS = 5 * 60_000;

interface AuthedSocket extends Socket {
  data: { userId: string };
}

/**
 * Real-time layer for room lobbies and in-room matches. REST
 * (`RoomsController`) handles creating/browsing/joining a room; everything
 * from that point on — ready-up, kick, ban, start, answering — goes through
 * here, since every one of those needs to push a fresh state to everyone
 * else in the room anyway.
 *
 * Each connected socket gets its own per-viewer `RoomState` (the `you` field
 * and, for the leader, `password` differ per socket) — rather than a single
 * `io.to(room).emit(...)` broadcast, `broadcastState` re-fetches and emits
 * individually to every socket registered for that session. Membership is
 * tracked in `roomSockets` (not socket.io's own room feature) precisely
 * because of that per-viewer payload requirement.
 */
@WebSocketGateway({
  namespace: ROOM_WS_NAMESPACE,
  cors: { origin: true, credentials: true },
})
export class RoomsGateway
  implements OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(RoomsGateway.name);
  private readonly roomSockets = new Map<string, Set<AuthedSocket>>();
  private readonly questionTimers = new Map<string, NodeJS.Timeout>();
  private readonly advanceTimers = new Map<string, NodeJS.Timeout>();
  /** Key: `${sessionId}:${userId}`. See `ROOM_DISCONNECT_GRACE_MS`. */
  private readonly disconnectGraceTimers = new Map<string, NodeJS.Timeout>();
  private staleLobbySweepInterval?: NodeJS.Timeout;

  constructor(
    private readonly jwtService: JwtService,
    private readonly roomsService: RoomsService,
  ) {}

  onModuleInit(): void {
    this.staleLobbySweepInterval = setInterval(
      () => void this.sweepStaleLobbies(),
      STALE_LOBBY_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.staleLobbySweepInterval)
      clearInterval(this.staleLobbySweepInterval);
  }

  /** See `findStaleLobbySessionIds`/`abandonStaleLobby` — cleans up LOBBY
   * rooms nobody ever actually connected to, which nothing else in the
   * lifecycle ever gets a chance to notice. */
  private async sweepStaleLobbies(): Promise<void> {
    try {
      const staleIds = await this.roomsService.findStaleLobbySessionIds(
        STALE_LOBBY_THRESHOLD_MS,
        [...this.roomSockets.keys()],
      );
      for (const sessionId of staleIds) {
        const closed = await this.roomsService.abandonStaleLobby(sessionId);
        // No live sockets by construction (that's what made it "stale"),
        // but broadcasting is cheap and correct either way — covers the
        // rare case where someone connected in the gap between the query
        // above and this update.
        if (closed)
          this.closeRoom(sessionId, 'Комната закрыта — никто не подключился');
      }
    } catch (err) {
      this.logger.error(`stale-lobby sweep failed: ${err}`);
    }
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      socket.data = { userId: payload.sub };
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: AuthedSocket): void {
    for (const [sessionId, sockets] of this.roomSockets) {
      if (!sockets.delete(socket)) continue;
      if (sockets.size === 0) this.roomSockets.delete(sessionId);
      this.scheduleDisconnectGrace(sessionId, socket.data.userId);
    }
  }

  private scheduleDisconnectGrace(sessionId: string, userId: string): void {
    const key = `${sessionId}:${userId}`;
    const existing = this.disconnectGraceTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(
      () => void this.onDisconnectGraceExpired(sessionId, userId),
      ROOM_DISCONNECT_GRACE_MS,
    );
    this.disconnectGraceTimers.set(key, timer);
  }

  private cancelDisconnectGrace(sessionId: string, userId: string): void {
    const key = `${sessionId}:${userId}`;
    const timer = this.disconnectGraceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.disconnectGraceTimers.delete(key);
    }
  }

  /** Fires once the grace window has passed with no reconnect — treats the
   * disconnect as an actual "Покинуть комнату"/"Закрыть комнату", exactly
   * like the explicit UI action does (leadership transfer if others remain,
   * close if they were alone). A no-op if the room has since started/ended,
   * or if the user reconnected (here or on another device/tab) in the
   * meantime. */
  private async onDisconnectGraceExpired(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    this.disconnectGraceTimers.delete(`${sessionId}:${userId}`);
    const sockets = this.roomSockets.get(sessionId);
    const stillConnected =
      sockets && [...sockets].some((s) => s.data.userId === userId);
    if (stillConnected) return;
    try {
      const result = await this.roomsService.leave(userId, sessionId);
      await this.notifyLeft(sessionId, result === null);
    } catch (err) {
      // Already left some other way (kicked, explicit leave, room deleted)
      // — nothing left to clean up.
      this.logger.debug(
        `disconnect-grace leave skipped for ${userId}/${sessionId}: ${err}`,
      );
    }
  }

  @SubscribeMessage(ROOM_WS_EVENTS.enter)
  async onEnter(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() rawBody: unknown,
  ): Promise<void> {
    try {
      const body = await this.validateWsBody(RoomSessionIdDto, rawBody);
      // Validates membership before registering — getState throws for
      // anyone who isn't actually a participant of this room (e.g. kicked
      // or banned while they had no live connection to receive the
      // `kicked`/`banned` event, then came back). Deliberately not routed
      // through `guarded()`: a plain `room:error` here would leave the
      // client stuck on its "connecting" spinner forever, since no
      // `RoomState` ever arrives to replace it — `room:unavailable` tells
      // it to give up and bail out instead.
      await this.roomsService.getState(socket.data.userId, body.sessionId);
      this.register(body.sessionId, socket);
      // A reconnect within the grace window (e.g. navigating back to
      // `/play/room`, or a brief network blip) cancels the pending
      // disconnect-triggered leave — see `ROOM_DISCONNECT_GRACE_MS`.
      this.cancelDisconnectGrace(body.sessionId, socket.data.userId);
      await this.broadcastState(body.sessionId);
    } catch (err) {
      socket.emit(ROOM_WS_SERVER_EVENTS.unavailable, {
        message: err instanceof Error ? err.message : 'Комната недоступна',
      });
    }
  }

  @SubscribeMessage(ROOM_WS_EVENTS.leave)
  async onLeave(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() rawBody: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const body = await this.validateWsBody(RoomSessionIdDto, rawBody);
      const result = await this.roomsService.leave(
        socket.data.userId,
        body.sessionId,
      );
      this.unregister(body.sessionId, socket);
      await this.notifyLeft(body.sessionId, result === null);
    });
  }

  /** Pushes the outcome of a `RoomsService.leave()` call to whoever's still
   * connected — called from `onLeave` above, and from `RoomsController.leave`
   * for a leave triggered outside this room's own socket (e.g. accepting a
   * different invite/challenge elsewhere prompts leaving the current room
   * first, from a screen that was never connected to *this* room's socket). */
  async notifyLeft(sessionId: string, closed: boolean): Promise<void> {
    if (closed) {
      this.closeRoom(sessionId, 'Лидер закрыл комнату');
    } else {
      await this.broadcastState(sessionId);
    }
  }

  @SubscribeMessage(ROOM_WS_EVENTS.ready)
  async onReady(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() rawBody: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const body = await this.validateWsBody(RoomReadyDto, rawBody);
      await this.roomsService.setReady(
        socket.data.userId,
        body.sessionId,
        body.ready,
      );
      await this.broadcastState(body.sessionId);
    });
  }

  @SubscribeMessage(ROOM_WS_EVENTS.kick)
  async onKick(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() rawBody: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const body = await this.validateWsBody(RoomTargetUserDto, rawBody);
      await this.roomsService.kick(
        socket.data.userId,
        body.sessionId,
        body.userId,
      );
      this.removeUser(
        body.sessionId,
        body.userId,
        ROOM_WS_SERVER_EVENTS.kicked,
      );
      await this.broadcastState(body.sessionId);
    });
  }

  @SubscribeMessage(ROOM_WS_EVENTS.ban)
  async onBan(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() rawBody: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const body = await this.validateWsBody(RoomTargetUserDto, rawBody);
      await this.roomsService.ban(
        socket.data.userId,
        body.sessionId,
        body.userId,
      );
      this.removeUser(
        body.sessionId,
        body.userId,
        ROOM_WS_SERVER_EVENTS.banned,
      );
      await this.broadcastState(body.sessionId);
    });
  }

  @SubscribeMessage(ROOM_WS_EVENTS.start)
  async onStart(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() rawBody: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const body = await this.validateWsBody(RoomSessionIdDto, rawBody);
      const state = await this.roomsService.start(
        socket.data.userId,
        body.sessionId,
      );
      await this.broadcastState(body.sessionId);
      // Question 1's real `currentQuestionStartedAt` (see `RoomsService.start`)
      // is itself delayed by the same countdown the client shows instead of
      // question 1 — pad the auto-timeout by the same amount, or it would
      // fire `ROOM_INTRO_TOTAL_MS` too early relative to when the question
      // actually became answerable, silently shrinking everyone's real
      // answering window.
      this.scheduleQuestionTimer(
        body.sessionId,
        state.timeLimitSeconds,
        ROOM_INTRO_TOTAL_MS,
      );
    });
  }

  @SubscribeMessage(ROOM_WS_EVENTS.answer)
  async onAnswer(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() rawBody: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const body = await this.validateWsBody(RoomAnswerMessageDto, rawBody);
      const state = await this.roomsService.submitAnswer(
        socket.data.userId,
        body.sessionId,
        { questionId: body.questionId, answerIndex: body.answerIndex },
      );
      await this.broadcastState(body.sessionId);
      if (state.roundResolved) {
        this.clearQuestionTimer(body.sessionId);
        this.scheduleAdvanceTimer(body.sessionId);
      }
    });
  }

  // ---- room/socket bookkeeping ----

  private register(sessionId: string, socket: AuthedSocket): void {
    let sockets = this.roomSockets.get(sessionId);
    if (!sockets) {
      sockets = new Set();
      this.roomSockets.set(sessionId, sockets);
    }
    sockets.add(socket);
  }

  private unregister(sessionId: string, socket: AuthedSocket): void {
    const sockets = this.roomSockets.get(sessionId);
    sockets?.delete(socket);
    if (sockets?.size === 0) this.roomSockets.delete(sessionId);
  }

  private removeUser(sessionId: string, userId: string, event: string): void {
    const sockets = this.roomSockets.get(sessionId);
    if (!sockets) return;
    for (const socket of sockets) {
      if (socket.data.userId === userId) {
        socket.emit(event);
        sockets.delete(socket);
      }
    }
  }

  private closeRoom(sessionId: string, message: string): void {
    const sockets = this.roomSockets.get(sessionId);
    if (sockets) {
      for (const socket of sockets) {
        socket.emit(ROOM_WS_SERVER_EVENTS.error, { message });
      }
    }
    this.roomSockets.delete(sessionId);
    this.clearTimers(sessionId);
  }

  /** Re-fetches and pushes a fresh, per-viewer `RoomState` to every socket
   * currently registered for this session. A socket that no longer
   * corresponds to a participant (already left/kicked) is dropped instead
   * of breaking the broadcast for everyone else. */
  private async broadcastState(sessionId: string): Promise<void> {
    const sockets = this.roomSockets.get(sessionId);
    if (!sockets) return;
    for (const socket of sockets) {
      try {
        const state = await this.roomsService.getState(
          socket.data.userId,
          sessionId,
        );
        socket.emit(ROOM_WS_SERVER_EVENTS.state, state);
      } catch {
        sockets.delete(socket);
      }
    }
  }

  // ---- pacing timers ----

  private scheduleQuestionTimer(
    sessionId: string,
    timeLimitSeconds: number,
    extraDelayMs = 0,
  ): void {
    this.clearQuestionTimer(sessionId);
    const timer = setTimeout(
      () => void this.onQuestionTimeout(sessionId),
      extraDelayMs + timeLimitSeconds * 1000 + 250,
    );
    this.questionTimers.set(sessionId, timer);
  }

  private clearQuestionTimer(sessionId: string): void {
    const timer = this.questionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.questionTimers.delete(sessionId);
    }
  }

  private scheduleAdvanceTimer(sessionId: string): void {
    this.clearAdvanceTimer(sessionId);
    const timer = setTimeout(
      () => void this.onAdvanceTimeout(sessionId),
      ROOM_REVEAL_SECONDS * 1000,
    );
    this.advanceTimers.set(sessionId, timer);
  }

  private clearAdvanceTimer(sessionId: string): void {
    const timer = this.advanceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.advanceTimers.delete(sessionId);
    }
  }

  private clearTimers(sessionId: string): void {
    this.clearQuestionTimer(sessionId);
    this.clearAdvanceTimer(sessionId);
  }

  private async onQuestionTimeout(sessionId: string): Promise<void> {
    try {
      await this.roomsService.forceMissUnanswered(sessionId);
      await this.broadcastState(sessionId);
      this.scheduleAdvanceTimer(sessionId);
    } catch (err) {
      this.logger.warn(`question timeout failed for ${sessionId}: ${err}`);
    }
  }

  private async onAdvanceTimeout(sessionId: string): Promise<void> {
    try {
      const { state, finished } = await this.roomsService.advance(sessionId);
      await this.broadcastState(sessionId);
      if (finished) {
        this.clearTimers(sessionId);
      } else {
        this.scheduleQuestionTimer(sessionId, state.timeLimitSeconds);
      }
    } catch (err) {
      this.logger.warn(`advance failed for ${sessionId}: ${err}`);
    }
  }

  // ---- misc ----

  private extractToken(socket: Socket): string | undefined {
    const authToken = socket.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const header = socket.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return undefined;
  }

  private async guarded(
    socket: AuthedSocket,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      socket.emit(ROOM_WS_SERVER_EVENTS.error, {
        message: err instanceof Error ? err.message : 'Ошибка',
      });
    }
  }

  /** WebSocket messages skip Nest's HTTP `ValidationPipe` entirely (it's
   * only wired into the HTTP pipeline in `main.ts`), so every handler above
   * validates its own body against a proper DTO instead of trusting the
   * client-asserted TypeScript type — a malformed or malicious payload
   * (missing field, wrong type, an out-of-range `answerIndex`) used to reach
   * `RoomsService` calls unchecked. Thrown errors are plain `Error`s so
   * they read the same as any other failure to `guarded()`/`onEnter`'s own
   * catch, rather than surfacing as Nest's WS-specific exception format. */
  private async validateWsBody<T extends object>(
    cls: new () => T,
    raw: unknown,
  ): Promise<T> {
    const instance = plainToInstance(cls, raw ?? {});
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw new BadRequestException('Некорректные данные запроса');
    }
    return instance;
  }
}
