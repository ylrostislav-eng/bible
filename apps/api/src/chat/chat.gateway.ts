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
  CHAT_WS_EVENTS,
  CHAT_WS_NAMESPACE,
  CHAT_WS_SERVER_EVENTS,
} from '@bible-arena/shared';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { ChatService } from './chat.service';

interface AuthedSocket extends Socket {
  data: { userId: string };
}

/**
 * Real-time layer for direct messages. REST (`ChatController`) handles
 * fetching conversation lists and paginated history; sending goes through
 * here instead, mirroring `RoomsGateway`'s split — a mutation that needs to
 * push to another live client anyway gets no benefit from also being a REST
 * endpoint.
 *
 * Tracked per-*user* (not per-conversation, unlike `RoomsGateway`'s
 * per-session tracking) since any friend could message you at any time,
 * from anywhere in the app — the app-wide `ChatProvider` keeps one socket
 * open for the whole session, not just while a specific thread is on screen.
 */
@WebSocketGateway({
  namespace: CHAT_WS_NAMESPACE,
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly userSockets = new Map<string, Set<AuthedSocket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
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
      let sockets = this.userSockets.get(payload.sub);
      if (!sockets) {
        sockets = new Set();
        this.userSockets.set(payload.sub, sockets);
      }
      sockets.add(socket);
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: AuthedSocket): void {
    const sockets = this.userSockets.get(socket.data?.userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.userSockets.delete(socket.data.userId);
  }

  @SubscribeMessage(CHAT_WS_EVENTS.send)
  async onSend(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { toUserId: string; body: string },
  ): Promise<void> {
    try {
      const message = await this.chatService.sendMessage(
        socket.data.userId,
        body.toUserId,
        body.body,
      );
      const event = { ...message, toUserId: body.toUserId };
      this.emitToUser(socket.data.userId, event);
      this.emitToUser(body.toUserId, event);
    } catch (err) {
      socket.emit(CHAT_WS_SERVER_EVENTS.error, {
        message:
          err instanceof Error ? err.message : 'Не удалось отправить сообщение',
      });
    }
  }

  private emitToUser(userId: string, payload: unknown): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    for (const socket of sockets) {
      socket.emit(CHAT_WS_SERVER_EVENTS.message, payload);
    }
  }

  private extractToken(socket: Socket): string | undefined {
    const authToken = socket.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const header = socket.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return undefined;
  }
}
