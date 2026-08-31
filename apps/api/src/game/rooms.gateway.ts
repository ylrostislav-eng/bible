import { Logger } from '@nestjs/common';
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
  ROOM_WS_EVENTS,
  ROOM_WS_NAMESPACE,
  ROOM_WS_SERVER_EVENTS,
  type RoomAnswerInput,
} from '@bible-arena/shared';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { RoomsService } from './rooms.service';

/** How long the reveal stays up before the room auto-advances to the next
 * question — mirrors the 1v1 duel's client-side ~5s auto-advance, but
 * server-driven here since N participants can't be relied on to all click
 * "next" (unlike the duel's "first caller wins" model). */
const ROOM_REVEAL_SECONDS = 5;

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
export class RoomsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(RoomsGateway.name);
  private readonly roomSockets = new Map<string, Set<AuthedSocket>>();
  private readonly questionTimers = new Map<string, NodeJS.Timeout>();
  private readonly advanceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly roomsService: RoomsService,
  ) {}

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
      sockets.delete(socket);
      if (sockets.size === 0) this.roomSockets.delete(sessionId);
    }
  }

  @SubscribeMessage(ROOM_WS_EVENTS.enter)
  async onEnter(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { sessionId: string },
  ): Promise<void> {
    try {
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
    @MessageBody() body: { sessionId: string },
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const result = await this.roomsService.leave(
        socket.data.userId,
        body.sessionId,
      );
      this.unregister(body.sessionId, socket);
      if (result === null) {
        this.closeRoom(body.sessionId, 'Лидер закрыл комнату');
      } else {
        await this.broadcastState(body.sessionId);
      }
    });
  }

  @SubscribeMessage(ROOM_WS_EVENTS.ready)
  async onReady(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { sessionId: string; ready: boolean },
  ): Promise<void> {
    await this.guarded(socket, async () => {
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
    @MessageBody() body: { sessionId: string; userId: string },
  ): Promise<void> {
    await this.guarded(socket, async () => {
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
    @MessageBody() body: { sessionId: string; userId: string },
  ): Promise<void> {
    await this.guarded(socket, async () => {
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
    @MessageBody() body: { sessionId: string },
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const state = await this.roomsService.start(
        socket.data.userId,
        body.sessionId,
      );
      await this.broadcastState(body.sessionId);
      this.scheduleQuestionTimer(body.sessionId, state.timeLimitSeconds);
    });
  }

  @SubscribeMessage(ROOM_WS_EVENTS.answer)
  async onAnswer(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { sessionId: string } & RoomAnswerInput,
  ): Promise<void> {
    await this.guarded(socket, async () => {
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
  ): void {
    this.clearQuestionTimer(sessionId);
    const timer = setTimeout(
      () => void this.onQuestionTimeout(sessionId),
      timeLimitSeconds * 1000 + 250,
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
}
