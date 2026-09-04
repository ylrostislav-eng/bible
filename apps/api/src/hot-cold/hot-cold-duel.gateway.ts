import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  HOT_COLD_DUEL_WS_EVENTS,
  HOT_COLD_DUEL_WS_NAMESPACE,
  HOT_COLD_DUEL_WS_SERVER_EVENTS,
} from '@bible-arena/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt-payload.interface';
import { isAllowedWsOrigin } from '../config/ws-cors.util';
import {
  HotColdDuelGuessDto,
  HotColdDuelIdDto,
} from './dto/hot-cold-duel-ws.dto';
import { HotColdDuelService } from './hot-cold-duel.service';

/** Как часто закрывать дуэли, которые уже никому не нужны. */
const SWEEP_INTERVAL_MS = 5 * 60_000;

interface AuthedSocket extends Socket {
  data: { userId: string };
}

/**
 * Живой слой дуэли «горячо-холодно».
 *
 * Сокет здесь не роскошь, а суть режима. Всё напряжение в том, что число
 * противника меняется прямо у тебя на глазах: ты стоял спокойно на
 * четырёхстах, и вдруг у него загорается 12. Опрос раз в две секунды дал
 * бы то же самое с задержкой — но именно задержка и убивает ощущение
 * гонки.
 *
 * Состояние отправляется **каждому сокету своё**: у одного игрока в нём
 * его собственные слова, у другого — только числа. Общий
 * `io.to(room).emit` здесь был бы дырой размером с игру, поэтому его тут
 * нет и быть не должно.
 */
@WebSocketGateway({
  namespace: HOT_COLD_DUEL_WS_NAMESPACE,
  cors: { origin: true, credentials: true },
})
export class HotColdDuelGateway
  implements OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(HotColdDuelGateway.name);
  /** Кто сидит в какой дуэли: id дуэли → сокеты. */
  private readonly duelSockets = new Map<string, Set<AuthedSocket>>();
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly jwtService: JwtService,
    private readonly duels: HotColdDuelService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private async sweep(): Promise<void> {
    try {
      const closed = await this.duels.sweepStale();
      if (closed > 0) this.logger.log(`Закрыто брошенных дуэлей: ${closed}`);
    } catch (err) {
      this.logger.error(`уборка дуэлей не удалась: ${err}`);
    }
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    if (
      !isAllowedWsOrigin(socket.handshake.headers.origin, this.configService)
    ) {
      socket.disconnect(true);
      return;
    }
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
    for (const [duelId, sockets] of this.duelSockets) {
      if (!sockets.delete(socket)) continue;
      if (sockets.size === 0) this.duelSockets.delete(duelId);
      // Отметка «на связи» снимается сразу, без отсрочки: она ничего не
      // решает в игре — только говорит сопернику, тут ли ты ещё. Врать об
      // этом минуту хуже, чем показать «отошёл» и через секунду вернуть.
      this.duels.setOnline(duelId, socket.data.userId, false);
      void this.broadcast(duelId);
    }
  }

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.join)
  async onJoin(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelIdDto, body);
      // Право смотреть проверяет сервис: он бросит, если игрок не участник,
      // и до подписки на обновления дело не дойдёт.
      await this.duels.getState(dto.duelId, socket.data.userId);

      const set = this.duelSockets.get(dto.duelId) ?? new Set<AuthedSocket>();
      set.add(socket);
      this.duelSockets.set(dto.duelId, set);
      this.duels.setOnline(dto.duelId, socket.data.userId, true);
      await this.broadcast(dto.duelId);
    });
  }

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.guess)
  async onGuess(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelGuessDto, body);
      const result = await this.duels.guess(
        dto.duelId,
        socket.data.userId,
        dto.guess,
      );
      // Ходившему — сразу и с разбором ввода: он ждёт ответа именно на своё
      // слово, и общая рассылка состояния этого не скажет.
      socket.emit(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, {
        state: result.state,
        rank: result.rank,
        understood: result.understood,
        repeat: result.repeat,
      });
      await this.broadcast(dto.duelId, socket);
      // Сопернику — короткий сигнал «он сходил», чтобы подсветить число, а
      // не перерисовывать экран целиком.
      this.toOthers(
        dto.duelId,
        socket,
        HOT_COLD_DUEL_WS_SERVER_EVENTS.opponentMoved,
        {
          rank: result.rank,
        },
      );
    });
  }

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.surrender)
  async onSurrender(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelIdDto, body);
      await this.duels.surrender(dto.duelId, socket.data.userId);
      await this.broadcast(dto.duelId);
    });
  }

  /**
   * Разослать состояние всем, кто смотрит эту дуэль, — каждому своё.
   *
   * `except` пропускает сокет, которому состояние уже ушло ответом на его
   * же ход: две одинаковые перерисовки подряд заметны глазом.
   */
  private async broadcast(
    duelId: string,
    except?: AuthedSocket,
  ): Promise<void> {
    const sockets = this.duelSockets.get(duelId);
    if (!sockets) return;
    for (const socket of sockets) {
      if (socket === except) continue;
      try {
        const state = await this.duels.getState(duelId, socket.data.userId);
        socket.emit(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, { state });
      } catch (err) {
        this.logger.warn(`не удалось отправить состояние дуэли: ${err}`);
      }
    }
  }

  private toOthers(
    duelId: string,
    except: AuthedSocket,
    event: string,
    payload: unknown,
  ): void {
    for (const socket of this.duelSockets.get(duelId) ?? []) {
      if (socket !== except) socket.emit(event, payload);
    }
  }

  private extractToken(socket: Socket): string | undefined {
    const authToken = socket.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const header = socket.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return undefined;
  }

  /** Разбор и проверка входящего сообщения: с той стороны — что угодно. */
  private async parse<T extends object>(
    cls: new () => T,
    body: unknown,
  ): Promise<T> {
    const dto = plainToInstance(cls, body ?? {});
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) throw new Error('Некорректное сообщение');
    return dto;
  }

  private async guarded(
    socket: AuthedSocket,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      socket.emit(HOT_COLD_DUEL_WS_SERVER_EVENTS.error, {
        message: err instanceof Error ? err.message : 'Ошибка',
      });
    }
  }
}
