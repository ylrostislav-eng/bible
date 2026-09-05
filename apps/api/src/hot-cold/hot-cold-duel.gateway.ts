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
  HOT_COLD_DUEL_AWAY_MS,
  HOT_COLD_DUEL_SECONDS_PER_GUESS,
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
  HotColdDuelLookupDto,
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
  /**
   * Отложенная рассылка на момент, когда ушедший считается ушедшим.
   *
   * Без неё кнопка «забрать победу» не появилась бы никогда: состояние
   * рассылается по событию, а «прошло две минуты» — это не событие.
   * Ключ: `${duelId}:${userId}`.
   */
  private readonly awayTimers = new Map<string, NodeJS.Timeout>();
  /**
   * Часы на слово: у каждого игрока свои. Ключ: `${duelId}:${userId}`.
   *
   * Живут здесь, а не в сервисе, потому что это таймеры, а не правила:
   * сервис знает, что слово сгорает, шлюз — когда именно и кому об этом
   * сказать.
   */
  private readonly guessTimers = new Map<string, NodeJS.Timeout>();
  /**
   * Отсчёт «3-2-1» перед началом партии. Ключ: id дуэли.
   *
   * Один на дуэль, а не на игрока: старт общий, и два отсчёта означали бы
   * два разных момента начала у двоих в одной партии.
   */
  private readonly startTimers = new Map<string, NodeJS.Timeout>();
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
    for (const timer of this.awayTimers.values()) clearTimeout(timer);
    this.awayTimers.clear();
    for (const timer of this.guessTimers.values()) clearTimeout(timer);
    this.guessTimers.clear();
    for (const timer of this.startTimers.values()) clearTimeout(timer);
    this.startTimers.clear();
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
      this.scheduleAwayNotice(duelId, socket.data.userId);
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
      this.cancelAwayNotice(dto.duelId, socket.data.userId);
      // Часы пускаем обоим, а не только вошедшему: соперник может сидеть
      // с открытым экраном и молчать, и его слова должны гореть так же.
      const live = await this.duels.getState(dto.duelId, socket.data.userId);
      if (live.status === 'IN_PROGRESS' && live.startsAt) {
        // Идёт отсчёт «3-2-1»: часы на слово заводить рано. Планируем
        // старт — и именно `schedule`, а не «завести заново»: вход
        // повторяется на каждом переподключении, и без этой проверки
        // каждое возвращение вкладки сдвигало бы старт вперёд.
        this.scheduleStart(dto.duelId, Date.parse(live.startsAt));
      } else if (live.status === 'IN_PROGRESS') {
        // ВАЖНО: именно `ensure`, а не «пустить заново». Вход в дуэль
        // случается не только в начале — он повторяется при каждом
        // переподключении сокета: переключил вкладку, свернул приложение,
        // моргнула сеть. Перезапуск часов здесь означал бы, что время
        // обнуляется по желанию, да ещё и у соперника заодно. Ровно этот
        // баг уже был у таймера в «Изучении».
        this.ensureClock(dto.duelId, socket.data.userId);
        if (live.opponent) this.ensureClock(dto.duelId, live.opponent.userId);
      }
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
      // Слово написано — отсчёт с начала. Только если партия ещё идёт и
      // слова ещё есть: иначе часы шли бы у того, кому уже нечем ходить.
      //
      // ВАЖНО: часы перезаводятся ДО отправки состояния. Порядок был
      // обратный, и это давало настоящий баг: в состоянии, посчитанном до
      // перезапуска, лежал **старый** срок, экран дорисовывал остаток от
      // прошлого слова, а на новый срок прыгал только со следующей
      // рассылкой — «время скачет вверх, но не до тридцати». Своя же
      // рассылка ходившего не догоняла: `broadcast` его пропускает.
      if (
        result.state.status === 'IN_PROGRESS' &&
        result.state.guessesLeft > 0
      ) {
        this.startClock(dto.duelId, socket.data.userId);
      } else {
        this.stopClock(dto.duelId, socket.data.userId);
      }
      // Ходившему — сразу и с разбором ввода: он ждёт ответа именно на своё
      // слово, и общая рассылка состояния этого не скажет.
      socket.emit(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, {
        state: await this.duels.getState(dto.duelId, socket.data.userId),
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

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.ready)
  async onReady(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelIdDto, body);
      const state = await this.duels.setReady(dto.duelId, socket.data.userId);
      // Часы здесь не заводятся: сначала отсчёт. Заводит их `beginPlay`,
      // когда отсчёт кончится, — и обоим сразу, чтобы никто не получил
      // лишних секунд за то, что у него быстрее интернет.
      if (state.status === 'IN_PROGRESS' && state.startsAt) {
        this.scheduleStart(dto.duelId, Date.parse(state.startsAt));
      }
      await this.broadcast(dto.duelId);
    });
  }

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.hint)
  async onHint(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelIdDto, body);
      // Часы на слово подсказка не трогает: она общая и берётся в один
      // тап, а останавливать время значило бы дать способ его тянуть.
      await this.duels.requestHint(dto.duelId, socket.data.userId);
      await this.broadcast(dto.duelId);
    });
  }

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.lookup)
  async onLookup(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelLookupDto, body);
      const state = await this.duels.lookup(
        dto.duelId,
        socket.data.userId,
        dto.word,
      );
      // Только себе: поиски личные, и соперник о них не знает — иначе
      // словарь стал бы подглядыванием за чужим ходом мысли.
      socket.emit(HOT_COLD_DUEL_WS_SERVER_EVENTS.state, { state });
    });
  }

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.hintDecline)
  async onHintDecline(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelIdDto, body);
      const { requesterId } = await this.duels.declineHint(
        dto.duelId,
        socket.data.userId,
      );
      // Отказ надо сказать вслух: предложивший иначе видит только, как
      // предложение молча исчезло, и не понимает, отказали ему или
      // случилась ошибка.
      if (requesterId) {
        for (const other of this.duelSockets.get(dto.duelId) ?? []) {
          if (other.data.userId === requesterId) {
            other.emit(HOT_COLD_DUEL_WS_SERVER_EVENTS.hintDeclined, {});
          }
        }
      }
      await this.broadcast(dto.duelId);
    });
  }

  @SubscribeMessage(HOT_COLD_DUEL_WS_EVENTS.claim)
  async onClaim(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    await this.guarded(socket, async () => {
      const dto = await this.parse(HotColdDuelIdDto, body);
      await this.duels.claimWin(dto.duelId, socket.data.userId);
      await this.broadcast(dto.duelId);
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
   * Запланировать начало партии на конец отсчёта.
   *
   * Повторный вызов ничего не сдвигает — и это главное: планирование
   * случается и на «готов», и на каждом входе в дуэль, а вход повторяется
   * при любом переподключении сокета. Ровно этим и был старый баг с
   * таймерами: событие входа принимали за «начали заново».
   */
  private scheduleStart(duelId: string, startsAt: number): void {
    if (this.startTimers.has(duelId)) return;
    const timer = setTimeout(
      () => {
        this.startTimers.delete(duelId);
        void this.beginPlay(duelId);
      },
      Math.max(0, startsAt - Date.now()),
    );
    this.startTimers.set(duelId, timer);
  }

  /** Отсчёт кончился: часы обоим и свежее состояние на экраны. */
  private async beginPlay(duelId: string): Promise<void> {
    try {
      for (const userId of await this.duels.playerIds(duelId)) {
        this.ensureClock(duelId, userId);
      }
      await this.broadcast(duelId);
    } catch (err) {
      this.logger.warn(`не удалось начать партию: ${err}`);
    }
  }

  /**
   * Пустить игроку отсчёт на слово.
   *
   * Часы живут на сервере: браузерным доверять нельзя — достаточно
   * перевести системное время или закрыть вкладку, чтобы они встали.
   * Клиенту уезжает лишь момент, когда слово сгорит, и он рисует по нему
   * обратный отсчёт.
   */
  private startClock(duelId: string, userId: string): void {
    const key = `${duelId}:${userId}`;
    const existing = this.guessTimers.get(key);
    if (existing) clearTimeout(existing);
    this.duels.armDeadline(duelId, userId);
    const timer = setTimeout(
      () => void this.onDeadline(duelId, userId),
      HOT_COLD_DUEL_SECONDS_PER_GUESS * 1000,
    );
    this.guessTimers.set(key, timer);
  }

  /**
   * Пустить часы, только если они ещё не идут.
   *
   * Отличие от `startClock` в одном слове — «ещё», — и в этом слове весь
   * смысл: событие входа повторяется при каждом переподключении, а время
   * на слово должно течь от того момента, когда слово стало нужным, а не
   * от последнего чиха сети.
   */
  private ensureClock(duelId: string, userId: string): void {
    if (this.guessTimers.has(`${duelId}:${userId}`)) return;
    this.startClock(duelId, userId);
  }

  private stopClock(duelId: string, userId: string): void {
    const key = `${duelId}:${userId}`;
    const timer = this.guessTimers.get(key);
    if (timer) clearTimeout(timer);
    this.guessTimers.delete(key);
    this.duels.clearDeadline(duelId, userId);
  }

  /** Время вышло: слово сгорает, и отсчёт идёт заново. */
  private async onDeadline(duelId: string, userId: string): Promise<void> {
    this.guessTimers.delete(`${duelId}:${userId}`);
    try {
      const { burnt, finished } = await this.duels.burnGuess(duelId, userId);
      if (burnt) {
        for (const socket of this.duelSockets.get(duelId) ?? []) {
          if (socket.data.userId === userId) {
            socket.emit(HOT_COLD_DUEL_WS_SERVER_EVENTS.burnt, {});
          }
        }
      }
      if (finished) this.stopClock(duelId, userId);
      else this.startClock(duelId, userId);
      await this.broadcast(duelId);
    } catch (err) {
      this.logger.warn(`часы дуэли сбились: ${err}`);
    }
  }

  /** Разбудить экран соперника ровно тогда, когда ждать уже нечего. */
  private scheduleAwayNotice(duelId: string, userId: string): void {
    const key = `${duelId}:${userId}`;
    const existing = this.awayTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.awayTimers.delete(key);
      void this.broadcast(duelId);
    }, HOT_COLD_DUEL_AWAY_MS);
    this.awayTimers.set(key, timer);
  }

  private cancelAwayNotice(duelId: string, userId: string): void {
    const key = `${duelId}:${userId}`;
    const timer = this.awayTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.awayTimers.delete(key);
    }
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
