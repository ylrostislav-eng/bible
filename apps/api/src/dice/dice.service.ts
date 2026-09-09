import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DICE_DEFAULT_TARGET,
  DICE_TARGET_OPTIONS,
  DiceRuleError,
  applyDiceAction,
  availableDiceActions,
  createDiceGame,
  joinDiceGame,
  type DiceAction,
  type DiceEvent,
  type DiceGameState,
  type DiceStepResult,
  type DiceValue,
} from '@bible-arena/shared';
import type { Prisma } from '@prisma/client';
import { AdminRegistry } from '../auth/admin-registry.service';
import { StaffNameMask } from '../auth/staff-name-mask.service';
import { generateInviteCode } from '../game/invite-code';
import { PrismaService } from '../prisma/prisma.service';
import { rollDice } from './dice-rng';

/** Партия без единого действия столько времени считается брошенной. */
const DICE_ABANDON_MS = 10 * 60_000;

/** Ожидание соперника, за которое никто не пришёл. */
const DICE_WAITING_ABANDON_MS = 15 * 60_000;

@Injectable()
export class DiceService {
  private readonly logger = new Logger(DiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffNames: StaffNameMask,
    private readonly admins: AdminRegistry,
  ) {}

  /**
   * Создаёт партию и сажает за стол создателя.
   *
   * `openToMatchmaking` разделяет два разных намерения: «жду конкретного
   * друга по ссылке» и «жду кого угодно». Их путали в комнатах, и это
   * кончалось незнакомцем в партии, которую звали друга сыграть.
   */
  async create(
    userId: string,
    params: {
      targetScore?: number;
      turnTimeLimit?: number | null;
      openToMatchmaking?: boolean;
    },
  ) {
    const targetScore = this.validTarget(params.targetScore);
    const state = createDiceGame({
      // `matchId` в состоянии заполняется после вставки: до неё
      // идентификатора ещё нет, а выдумывать свой значит завести второй
      // источник правды.
      matchId: '',
      players: [userId],
      targetScore,
    });

    const match = await this.prisma.diceMatch.create({
      data: {
        inviteCode: generateInviteCode(),
        targetScore,
        turnTimeLimit: params.turnTimeLimit ?? null,
        openToMatchmaking: params.openToMatchmaking ?? false,
        state: state as unknown as Prisma.InputJsonValue,
        players: { create: { userId, seat: 0 } },
      },
    });

    await this.prisma.diceMatch.update({
      where: { id: match.id },
      data: {
        state: {
          ...state,
          matchId: match.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return this.view(match.id, userId);
  }

  /**
   * Сажает второго игрока за стол.
   *
   * Условие `status: 'WAITING'` внутри `updateMany` — то же, чем в этом
   * проекте лечили двойной вход в дуэль: двое, нажавшие «войти»
   * одновременно, иначе оба становятся вторым игроком, и партия остаётся
   * с тремя за столом.
   */
  async join(userId: string, matchId: string) {
    const match = await this.load(matchId);

    if (match.players.some((player) => player.userId === userId)) {
      // Уже за столом — это не ошибка, а возвращение: экран открывают
      // повторно, ссылку жмут дважды.
      return this.view(matchId, userId);
    }

    const state = this.stateOf(match);
    if (state.players.length >= 2) {
      throw new BadRequestException('За этим столом уже двое');
    }

    const step = joinDiceGame({ ...state, matchId }, userId);
    const claimed = await this.prisma.diceMatch.updateMany({
      where: { id: matchId, status: 'WAITING' },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        lastActionAt: new Date(),
        state: step.state as unknown as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('Эту партию уже начали без вас');
    }

    await this.prisma.diceMatchPlayer.create({
      data: { matchId, userId, seat: 1 },
    });

    return this.view(matchId, userId, step.events);
  }

  /** Партия по коду приглашения — для ссылки `?startapp=dice_<код>`. */
  async byInviteCode(userId: string, code: string) {
    const match = await this.prisma.diceMatch.findUnique({
      where: { inviteCode: code.toUpperCase() },
      select: { id: true },
    });
    if (!match) throw new NotFoundException('Такой партии нет');
    return this.join(userId, match.id);
  }

  /**
   * Подбор соперника: сажает в чужую ждущую партию или заводит свою.
   *
   * Сначала ищем чужую — иначе двое, нажавшие одновременно, создадут две
   * пустые партии и будут ждать друг друга в разных комнатах.
   */
  async findOpponent(userId: string, targetScore?: number) {
    const target = this.validTarget(targetScore);
    const waiting = await this.prisma.diceMatch.findFirst({
      where: {
        status: 'WAITING',
        openToMatchmaking: true,
        targetScore: target,
        players: { none: { userId } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (waiting) {
      try {
        return await this.join(userId, waiting.id);
      } catch {
        // Кто-то успел сесть первым — заводим свою, а не отказываем.
      }
    }

    return this.create(userId, {
      targetScore: target,
      openToMatchmaking: true,
    });
  }

  /**
   * Применяет действие игрока.
   *
   * Здесь сходится всё, что защищает партию: правила проверяет движок, а
   * сервис — что это тот игрок, что партия та, что бросок сделан **тут**,
   * а не прислан клиентом, и что повторный запрос не сыграет второй раз.
   */
  async act(
    userId: string,
    matchId: string,
    action: DiceAction,
    /**
     * Идентификатор действия от клиента.
     *
     * Сеть теряет ответы, а игрок жмёт ещё раз — и без этого второй
     * запрос бросает кости заново, стирая уже выпавшее. Тот же
     * идентификатор возвращает результат первого раза, не меняя партии.
     */
    actionId?: string,
  ) {
    const match = await this.load(matchId);
    if (!match.players.some((player) => player.userId === userId)) {
      throw new ForbiddenException('Вы не за этим столом');
    }

    if (actionId && match.lastActionId === actionId) {
      return this.view(matchId, userId);
    }

    const state = this.stateOf(match);

    // Кости бросает сервер, и только здесь. Клиент присылает «бросаю», а
    // не «мне выпало»: иначе игра сводится к правке одного числа в
    // консоли браузера.
    const roll =
      action.type === 'ROLL' ? rollDice(state.availableDice) : undefined;

    let step: DiceStepResult;
    try {
      step = applyDiceAction(state, userId, action, roll);
    } catch (error) {
      if (error instanceof DiceRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.diceMatch.update({
        where: { id: matchId },
        data: {
          // Состояние — обычный объект, но Prisma принимает только свой
          // `InputJsonValue`; приведение здесь, а не в типе состояния,
          // чтобы правила игры не зависели от того, чем их хранят.
          state: step.state as unknown as Prisma.InputJsonValue,
          status: step.state.status === 'FINISHED' ? 'FINISHED' : 'IN_PROGRESS',
          winnerId: step.state.winnerId,
          finishedAt: step.state.status === 'FINISHED' ? new Date() : null,
          lastActionAt: new Date(),
          lastActionId: actionId ?? null,
        },
      });

      if (roll) {
        // Журнал бросков — не для игры, а для разбора: «мне десять
        // бросков не шло единиц» проверяется выборкой, а не верой.
        await tx.diceRoll.create({
          data: {
            matchId,
            userId,
            turnNumber: state.turnNumber,
            rollNumber: state.rollNumber + 1,
            dice: roll,
          },
        });
      }

      await this.applyStats(tx, matchId, step.events, step.state);
    });

    return this.view(matchId, userId, step.events);
  }

  /** Счётчики итогов партии: Bust, Hot Dice, лучший ход, финальный счёт. */
  private async applyStats(
    tx: Prisma.TransactionClient,
    matchId: string,
    events: DiceEvent[],
    state: DiceGameState,
  ) {
    for (const event of events) {
      if (event.type === 'BUST') {
        await tx.diceMatchPlayer.updateMany({
          where: { matchId, userId: event.playerId },
          data: { bustCount: { increment: 1 } },
        });
      }
      if (event.type === 'HOT_DICE') {
        await tx.diceMatchPlayer.updateMany({
          where: { matchId, userId: event.playerId },
          data: { hotDiceCount: { increment: 1 } },
        });
      }
      if (event.type === 'TURN_ENDED' && event.bankedScore > 0) {
        const player = state.players.find(
          (candidate) => candidate.userId === event.playerId,
        );
        await tx.diceMatchPlayer.updateMany({
          where: { matchId, userId: event.playerId },
          data: { score: player?.score ?? 0 },
        });
        // Лучший ход обновляется только вверх, поэтому отдельным запросом
        // с условием, а не чтением-записью.
        await tx.diceMatchPlayer.updateMany({
          where: {
            matchId,
            userId: event.playerId,
            bestTurn: { lt: event.bankedScore },
          },
          data: { bestTurn: event.bankedScore },
        });
      }
    }
  }

  /** Состояние партии глазами конкретного игрока. */
  async view(matchId: string, userId: string, events: DiceEvent[] = []) {
    const match = await this.load(matchId);
    const state = this.stateOf(match);

    const names = await this.prisma.user.findMany({
      where: { id: { in: match.players.map((player) => player.userId) } },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        telegramId: true,
        lampFlame: true,
        lampVessel: true,
        lampGlow: true,
      },
    });
    const byId = new Map(names.map((user) => [user.id, user]));

    return {
      matchId,
      inviteCode: match.inviteCode,
      targetScore: match.targetScore,
      turnTimeLimit: match.turnTimeLimit,
      status: state.status,
      phase: state.phase,
      currentPlayerId: state.currentPlayerId,
      youId: userId,
      turnScore: state.turnScore,
      dice: state.dice,
      selected: state.selected,
      availableDice: state.availableDice,
      turnNumber: state.turnNumber,
      rollNumber: state.rollNumber,
      winnerId: state.winnerId,
      actions: availableDiceActions(state, userId),
      players: match.players
        .sort((a, b) => a.seat - b.seat)
        .map((player) => {
          const user = byId.get(player.userId);
          return {
            userId: player.userId,
            // Скрытое имя не покидает сервер и здесь: за столом сидит
            // тот же человек, что и в списках.
            nickname: user
              ? this.staffNames.nickname(player.userId, user.nickname)
              : null,
            role: user
              ? this.admins.roleOf(user.telegramId.toString())
              : ('PLAYER' as const),
            avatarUrl: user?.avatarUrl ?? null,
            lamp: {
              flame: user?.lampFlame ?? null,
              vessel: user?.lampVessel ?? null,
              glow: user?.lampGlow ?? null,
            },
            score:
              state.players.find((p) => p.userId === player.userId)?.score ?? 0,
            bustCount: player.bustCount,
            hotDiceCount: player.hotDiceCount,
            bestTurn: player.bestTurn,
          };
        }),
      events,
    };
  }

  /** Партия, в которую игрок может вернуться после закрытия приложения. */
  async activeFor(userId: string) {
    const match = await this.prisma.diceMatch.findFirst({
      where: {
        players: { some: { userId } },
        status: { in: ['WAITING', 'IN_PROGRESS'] },
      },
      orderBy: { lastActionAt: 'desc' },
      select: { id: true },
    });
    return match ? this.view(match.id, userId) : null;
  }

  /** Сколько человек прямо сейчас ищет соперника — для счётчика на экране. */
  async waitingOpponents(userId: string): Promise<{ total: number }> {
    const total = await this.prisma.diceMatch.count({
      where: {
        status: 'WAITING',
        openToMatchmaking: true,
        players: { none: { userId } },
      },
    });
    return { total };
  }

  /**
   * Убирает партии, которые уже никому не нужны.
   *
   * Порог с запасом на человека, а не на технику: над решением «рискнуть
   * или забрать» думают долго, и обрывать партию за минуту молчания —
   * значит наказывать за раздумье.
   */
  async sweepAbandoned(): Promise<number> {
    const now = Date.now();
    const result = await this.prisma.diceMatch.updateMany({
      where: {
        OR: [
          {
            status: 'IN_PROGRESS',
            lastActionAt: { lt: new Date(now - DICE_ABANDON_MS) },
          },
          {
            status: 'WAITING',
            createdAt: { lt: new Date(now - DICE_WAITING_ABANDON_MS) },
          },
        ],
      },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(`Закрыто брошенных партий в кости: ${result.count}`);
    }
    return result.count;
  }

  private validTarget(value: number | undefined): number {
    if (value === undefined) return DICE_DEFAULT_TARGET;
    if (
      !DICE_TARGET_OPTIONS.includes(
        value as (typeof DICE_TARGET_OPTIONS)[number],
      )
    ) {
      throw new BadRequestException('Такой цели у партии быть не может');
    }
    return value;
  }

  private async load(matchId: string) {
    const match = await this.prisma.diceMatch.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    if (!match) throw new NotFoundException('Партия не найдена');
    return match;
  }

  /** Состояние из JSON. Идентификатор берётся из строки, а не из JSON:
   * так они не могут разойтись. */
  private stateOf(match: {
    id: string;
    state: Prisma.JsonValue;
  }): DiceGameState {
    return {
      ...(match.state as unknown as DiceGameState),
      matchId: match.id,
    };
  }
}

export type DiceMatchView = Awaited<ReturnType<DiceService['view']>>;
export type { DiceValue };
