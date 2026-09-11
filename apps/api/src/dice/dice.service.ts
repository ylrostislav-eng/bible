import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import {
  DICE_BOT_ID,
  DICE_BOT_LEVELS,
  DICE_DEFAULT_TARGET,
  DICE_OPPONENTS,
  DICE_TARGET_OPTIONS,
  DiceRuleError,
  applyDiceAction,
  availableDiceActions,
  chooseDiceBotAction,
  createDiceGame,
  joinDiceGame,
  timeoutDiceTurn,
  type DiceAction,
  type DiceBotLevel,
  type DiceEvent,
  type DiceGameState,
  type DiceMatchView,
  type DiceProgress,
  type DiceStepResult,
  type DiceValue,
} from '@bible-arena/shared';
import type { Prisma } from '@prisma/client';
import { AdminRegistry } from '../auth/admin-registry.service';
import { StaffNameMask } from '../auth/staff-name-mask.service';
import { ContactPolicyService } from '../contact/contact-policy.service';
import { generateInviteCode } from '../game/invite-code';
import { PrismaService } from '../prisma/prisma.service';
import { rollDice } from './dice-rng';

type Match = Prisma.DiceMatchGetPayload<{ include: { players: true } }>;
type Tx = Prisma.TransactionClient;
type CreateParams = {
  targetScore?: number;
  turnTimeLimit?: number | null;
  openToMatchmaking?: boolean;
  botDifficulty?: DiceBotLevel;
};
const json = (value: unknown) => value as Prisma.InputJsonValue;
const INTRO_MS = 2800;
const HANDOFF_MS = 1500;
/** Паузы длиннее шага polling: игрок успевает увидеть каждое решение,
 * однако партия не превращается в ожидание анимаций. */
const BOT_ROLL_STEP_MS = 2400;
const BOT_DECISION_STEP_MS = 2100;
const activeStatuses = ['WAITING', 'IN_PROGRESS'] as const;

@Injectable()
export class DiceService {
  private readonly logger = new Logger(DiceService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffNames: StaffNameMask,
    private readonly admins: AdminRegistry,
    private readonly contacts: ContactPolicyService,
  ) {}

  /** Одна короткая очередь в БД: работает и при двух экземплярах API.
   * Отдельные блокировки пользователей без общего порядка создавали бы
   * взаимное ожидание при одновременном входе друг к другу. */
  private queue<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // PostgreSQL возвращает `void`; Prisma его не десериализует, поэтому
        // приводим служебный результат к поддерживаемому строковому типу.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('dice:matchmaking'))::text AS locked`;
        return work(tx);
      },
      { timeout: 15_000 },
    );
  }

  private active(tx: Tx, userId: string) {
    return tx.diceMatch.findFirst({
      where: {
        players: { some: { userId } },
        status: { in: [...activeStatuses] },
      },
      orderBy: { lastActionAt: 'desc' },
      include: { players: true },
    });
  }

  async create(userId: string, params: CreateParams) {
    const id = await this.queue(async (tx) => {
      const existing = await this.active(tx, userId);
      if (existing) return existing.id;
      if (params.openToMatchmaking) await this.assertPublicSearch(userId);
      return this.createIn(tx, userId, params);
    });
    return this.view(id, userId);
  }

  private async createIn(
    tx: Tx,
    userId: string,
    params: CreateParams,
    rematchOfId?: string,
    targetOpponentId?: string,
  ) {
    const id = randomUUID();
    const bot = params.botDifficulty ?? null;
    const ids = bot
      ? randomInt(2)
        ? [DICE_BOT_ID, userId]
        : [userId, DICE_BOT_ID]
      : [userId];
    const state = createDiceGame({
      matchId: id,
      players: ids,
      targetScore: this.validTarget(params.targetScore),
    });
    const starts = bot ? new Date(Date.now() + INTRO_MS) : null;
    await tx.diceMatch.create({
      data: {
        id,
        inviteCode: generateInviteCode(),
        targetScore: state.targetScore,
        botDifficulty: bot,
        status: state.status,
        state: json(state),
        turnTimeLimit: bot ? null : (params.turnTimeLimit ?? null),
        openToMatchmaking: !bot && (params.openToMatchmaking ?? false),
        startedAt: starts,
        turnStartedAt: starts,
        botActionAt:
          bot && state.currentPlayerId === DICE_BOT_ID ? starts : null,
        rematchOfId,
        targetOpponentId,
        players: { create: { userId, seat: ids.indexOf(userId) } },
      },
    });
    return id;
  }

  async join(userId: string, matchId: string) {
    await this.queue((tx) => this.joinIn(tx, userId, matchId));
    return this.view(matchId, userId);
  }

  private async joinIn(tx: Tx, userId: string, matchId: string) {
    const match = await this.lock(tx, matchId);
    if (match.players.some((p) => p.userId === userId)) return;
    if (match.status !== 'WAITING' || match.botDifficulty)
      throw new BadRequestException('За этот стол уже нельзя сесть');
    if (match.targetOpponentId && match.targetOpponentId !== userId)
      throw new ForbiddenException('Этот реванш предложен другому игроку');
    if (await this.active(tx, userId))
      throw new ConflictException(
        'Сначала завершите или отмените свой текущий стол',
      );
    const host = match.players[0].userId;
    // Проверка в обе стороны: ребёнок тоже не должен входить к незнакомцу
    // по случайно полученному коду. Правила берём у всего приложения.
    await this.contacts.assertCanReach(userId, host);
    await this.contacts.assertCanReach(host, userId);
    const step = joinDiceGame(this.stateOf(match), userId);
    const first = step.state.players[randomInt(2)].userId;
    step.state.currentPlayerId = first;
    step.events = [
      { type: 'GAME_STARTED' },
      { type: 'TURN_STARTED', playerId: first, turnNumber: 1 },
    ];
    const starts = new Date(Date.now() + INTRO_MS);
    await tx.diceMatchPlayer.create({ data: { matchId, userId, seat: 1 } });
    await tx.diceMatch.update({
      where: { id: matchId },
      data: {
        status: 'IN_PROGRESS',
        state: json(step.state),
        version: { increment: 1 },
        startedAt: starts,
        turnStartedAt: starts,
        lastActionAt: new Date(),
        lastEvents: json(step.events),
      },
    });
  }

  async byInviteCode(userId: string, code: string) {
    const match = await this.prisma.diceMatch.findUnique({
      where: { inviteCode: code.toUpperCase() },
      select: { id: true },
    });
    if (!match) throw new NotFoundException('Такой партии нет');
    return this.join(userId, match.id);
  }

  private async assertPublicSearch(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ageBand: true },
    });
    if (user.ageBand === 'CHILD')
      throw new ForbiddenException(
        'В детском режиме можно играть с программой или друзьями',
      );
    await this.contacts.assertCanReach(userId, userId);
  }

  async findOpponent(userId: string, targetScore?: number) {
    await this.assertPublicSearch(userId);
    const target = this.validTarget(targetScore);
    const id = await this.queue(async (tx) => {
      const existing = await this.active(tx, userId);
      if (existing) return existing.id;
      const candidates = await tx.diceMatch.findMany({
        where: {
          status: 'WAITING',
          openToMatchmaking: true,
          botDifficulty: null,
          targetScore: target,
          createdAt: { gt: new Date(Date.now() - 15 * 60_000) },
          players: { none: { userId } },
        },
        orderBy: { createdAt: 'asc' },
        include: { players: true },
        take: 30,
      });
      for (const candidate of candidates) {
        try {
          await this.joinIn(tx, userId, candidate.id);
          return candidate.id;
        } catch (error) {
          if (!(error instanceof ForbiddenException)) throw error;
        }
      }
      return this.createIn(tx, userId, {
        targetScore: target,
        turnTimeLimit: 60,
        openToMatchmaking: true,
      });
    });
    return this.view(id, userId);
  }

  async act(
    userId: string,
    matchId: string,
    action: DiceAction,
    actionId: string = randomUUID(),
    expectedVersion?: number,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const match = await this.lock(tx, matchId);
      this.assertMember(match, userId);
      const payload: DiceAction =
        action.type === 'SELECT'
          ? {
              type: 'SELECT',
              indexes: [...action.indexes].sort((a, b) => a - b),
            }
          : action;
      const previous = await tx.diceMatchAction.findUnique({
        where: { matchId_userId_actionId: { matchId, userId, actionId } },
      });
      if (previous) {
        if (JSON.stringify(previous.payload) !== JSON.stringify(payload))
          throw new ConflictException(
            'Этот запрос уже использован для другого действия',
          );
        return;
      }
      if (match.status !== 'IN_PROGRESS')
        throw new BadRequestException(
          'Партия уже закончена или ещё не началась',
        );
      // Срок проверяется под той же блокировкой, что и действие. Просроченный
      // запрос не может «успеть» между проверкой таймера и сохранением.
      if (this.expired(match)) {
        await this.saveStep(
          tx,
          match,
          timeoutDiceTurn(this.stateOf(match)),
          'server:timer',
          `timeout:${match.version}`,
          { type: 'TIMEOUT' },
        );
        return;
      }
      if (expectedVersion !== undefined && expectedVersion !== match.version)
        throw new ConflictException('Стол уже изменился — обновляем состояние');
      if (
        action.type !== 'RESIGN' &&
        match.turnStartedAt &&
        match.turnStartedAt.getTime() > Date.now()
      )
        throw new BadRequestException('Сейчас начнём — дождитесь отсчёта');
      await this.perform(tx, match, userId, payload, actionId);
    });
    return this.buildView(await this.load(matchId), userId);
  }

  /** «Рискнуть и бросить» — одна транзакция, а не два сетевых запроса.
   * Если связь исчезла между ними, игрок не остаётся в промежуточной фазе. */
  private async perform(
    tx: Tx,
    match: Match,
    userId: string,
    action: DiceAction,
    actionId: string,
  ) {
    let state = this.stateOf(match);
    let step: DiceStepResult;
    let roll: DiceValue[] | undefined;
    try {
      if (action.type === 'CONTINUE') {
        state = applyDiceAction(state, userId, action).state;
        roll = rollDice(state.availableDice);
        step = applyDiceAction(state, userId, { type: 'ROLL' }, roll);
      } else {
        roll =
          action.type === 'ROLL' ? rollDice(state.availableDice) : undefined;
        step = applyDiceAction(state, userId, action, roll);
      }
    } catch (error) {
      if (error instanceof DiceRuleError)
        throw new BadRequestException(error.message);
      throw error;
    }
    await this.saveStep(tx, match, step, userId, actionId, action);
    if (roll)
      await tx.diceRoll.create({
        data: {
          matchId: match.id,
          userId,
          turnNumber: state.turnNumber,
          rollNumber: state.rollNumber + 1,
          dice: roll,
        },
      });
  }

  private async saveStep(
    tx: Tx,
    match: Match,
    step: DiceStepResult,
    userId: string,
    actionId: string,
    payload: unknown,
  ) {
    const state = step.state;
    for (const player of state.players) {
      const old = match.players.find((p) => p.userId === player.userId);
      player.bustCount ??= old?.bustCount ?? 0;
      player.hotDiceCount ??= old?.hotDiceCount ?? 0;
      player.bestTurn ??= old?.bestTurn ?? 0;
      for (const event of step.events) {
        if ('playerId' in event && event.playerId === player.userId) {
          if (event.type === 'BUST') player.bustCount++;
          if (event.type === 'HOT_DICE') player.hotDiceCount++;
          if (event.type === 'TURN_ENDED')
            player.bestTurn = Math.max(player.bestTurn, event.bankedScore);
        }
      }
      if (old)
        await tx.diceMatchPlayer.update({
          where: { id: old.id },
          data: {
            score: player.score,
            bustCount: player.bustCount,
            hotDiceCount: player.hotDiceCount,
            bestTurn: player.bestTurn,
          },
        });
    }
    const changedTurn = state.turnNumber !== this.stateOf(match).turnNumber;
    const active = state.status === 'IN_PROGRESS';
    const now = new Date();
    await tx.diceMatch.update({
      where: { id: match.id },
      data: {
        state: json(state),
        status: state.status,
        version: { increment: 1 },
        lastEvents: json(step.events),
        winnerId: state.winnerId,
        finishedAt: active ? null : now,
        lastActionAt: now,
        lastActionId: actionId,
        turnStartedAt: active
          ? changedTurn
            ? new Date(now.getTime() + HANDOFF_MS)
            : match.turnStartedAt
          : null,
        botActionAt:
          active && state.currentPlayerId === DICE_BOT_ID
            ? new Date(
                now.getTime() +
                  (state.phase === 'SELECTING'
                    ? BOT_ROLL_STEP_MS
                    : BOT_DECISION_STEP_MS),
              )
            : null,
      },
    });
    await tx.diceMatchAction.create({
      data: {
        matchId: match.id,
        userId,
        actionId,
        payload: json(payload),
        version: match.version + 1,
        events: json(step.events),
      },
    });
  }

  private expired(match: Match) {
    return (
      match.status === 'IN_PROGRESS' &&
      match.turnTimeLimit !== null &&
      match.turnStartedAt !== null &&
      Date.now() >= match.turnStartedAt.getTime() + match.turnTimeLimit * 1000
    );
  }

  async advanceDue(matchId: string) {
    await this.prisma.$transaction(async (tx) => {
      const match = await this.lock(tx, matchId);
      if (match.status !== 'IN_PROGRESS') return;
      if (this.expired(match)) {
        await this.saveStep(
          tx,
          match,
          timeoutDiceTurn(this.stateOf(match)),
          'server:timer',
          `timeout:${match.version}`,
          { type: 'TIMEOUT' },
        );
      } else if (
        match.botDifficulty &&
        match.botActionAt &&
        match.botActionAt.getTime() <= Date.now()
      ) {
        const state = this.stateOf(match);
        if (state.currentPlayerId !== DICE_BOT_ID) return;
        await this.perform(
          tx,
          match,
          DICE_BOT_ID,
          chooseDiceBotAction(state, match.botDifficulty as DiceBotLevel),
          `bot:${match.version}`,
        );
      }
    });
  }

  async tick() {
    const due = await this.prisma.diceMatch.findMany({
      where: {
        status: 'IN_PROGRESS',
        OR: [
          { botActionAt: { lte: new Date() } },
          {
            turnTimeLimit: { not: null },
            turnStartedAt: { lte: new Date(Date.now() - 30_000) },
          },
        ],
      },
      select: { id: true },
      take: 100,
    });
    for (const match of due) await this.advanceDue(match.id);
  }

  async view(matchId: string, userId: string): Promise<DiceMatchView> {
    const match = await this.load(matchId);
    this.assertMember(match, userId);
    if (
      this.expired(match) ||
      (match.botActionAt && match.botActionAt.getTime() <= Date.now())
    ) {
      await this.advanceDue(matchId);
      return this.buildView(await this.load(matchId), userId);
    }
    return this.buildView(match, userId);
  }

  private async buildView(
    match: Match,
    userId: string,
  ): Promise<DiceMatchView> {
    this.assertMember(match, userId);
    const state = this.stateOf(match);
    const names = await this.prisma.user.findMany({
      where: { id: { in: match.players.map((p) => p.userId) } },
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
    const level = match.botDifficulty as DiceBotLevel | null;
    return {
      matchId: match.id,
      version: match.version,
      botDifficulty: level,
      serverNow: new Date().toISOString(),
      turnStartedAt: match.turnStartedAt?.toISOString() ?? null,
      turnDeadlineAt:
        match.turnTimeLimit && match.turnStartedAt
          ? new Date(
              match.turnStartedAt.getTime() + match.turnTimeLimit * 1000,
            ).toISOString()
          : null,
      inviteCode: match.inviteCode,
      targetScore: match.targetScore,
      turnTimeLimit: match.turnTimeLimit,
      status: state.status,
      phase: state.phase,
      finishReason: state.finishReason ?? null,
      currentPlayerId: state.currentPlayerId,
      youId: userId,
      turnScore: state.turnScore,
      dice: state.dice,
      selected: state.selected,
      availableDice: state.availableDice,
      turnNumber: state.turnNumber,
      rollNumber: state.rollNumber,
      winnerId: state.winnerId,
      actions:
        match.turnStartedAt && match.turnStartedAt.getTime() > Date.now()
          ? []
          : availableDiceActions(state, userId),
      players: state.players.map((p) => {
        const user = names.find((u) => u.id === p.userId);
        const stats = match.players.find((u) => u.userId === p.userId);
        const isBot = p.userId === DICE_BOT_ID && level !== null;
        return {
          userId: p.userId,
          isBot,
          nickname: isBot
            ? DICE_OPPONENTS[level].name
            : user
              ? this.staffNames.nickname(p.userId, user.nickname)
              : null,
          role: user
            ? this.admins.roleOf(user.telegramId.toString())
            : 'PLAYER',
          avatarUrl: user?.avatarUrl ?? null,
          lamp: {
            flame: user?.lampFlame ?? null,
            vessel: user?.lampVessel ?? null,
            glow: user?.lampGlow ?? null,
          },
          score: p.score,
          bustCount: p.bustCount ?? stats?.bustCount ?? 0,
          hotDiceCount: p.hotDiceCount ?? stats?.hotDiceCount ?? 0,
          bestTurn: p.bestTurn ?? stats?.bestTurn ?? 0,
        };
      }),
      events: match.lastEvents as unknown as DiceEvent[],
    };
  }

  async activeFor(userId: string) {
    const match = await this.active(this.prisma, userId);
    return match ? this.view(match.id, userId) : null;
  }

  async cancel(userId: string, matchId: string) {
    await this.prisma.$transaction(async (tx) => {
      const match = await this.lock(tx, matchId);
      this.assertMember(match, userId);
      if (match.status === 'ABANDONED') return;
      if (match.status !== 'WAITING')
        throw new ConflictException(
          'Соперник уже сел за стол — вернитесь в партию',
        );
      await this.abandon(tx, match);
    });
    return this.buildView(await this.load(matchId), userId);
  }

  async rematch(userId: string, matchId: string) {
    const id = await this.queue(async (tx) => {
      const old = await this.lock(tx, matchId);
      this.assertMember(old, userId);
      if (old.status !== 'FINISHED')
        throw new BadRequestException('Сначала закончите партию');
      const existing = await tx.diceMatch.findUnique({
        where: { rematchOfId: matchId },
      });
      if (existing) {
        await this.joinIn(tx, userId, existing.id);
        return existing.id;
      }
      const active = await this.active(tx, userId);
      if (active)
        throw new ConflictException('У вас уже есть незаконченный стол');
      const other = old.players.find((p) => p.userId !== userId);
      if (other) {
        await this.contacts.assertCanReach(userId, other.userId);
        await this.contacts.assertCanReach(other.userId, userId);
      }
      return this.createIn(
        tx,
        userId,
        {
          targetScore: old.targetScore,
          turnTimeLimit: old.turnTimeLimit,
          botDifficulty:
            (old.botDifficulty as DiceBotLevel | null) ?? undefined,
        },
        matchId,
        other?.userId,
      );
    });
    return this.view(id, userId);
  }

  async progress(userId: string): Promise<DiceProgress> {
    const rows = await this.prisma.diceMatch.findMany({
      where: {
        botDifficulty: { not: null },
        status: 'FINISHED',
        players: { some: { userId } },
      },
      select: { botDifficulty: true, winnerId: true },
    });
    const wins = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const row of rows)
      if (
        row.winnerId === userId &&
        DICE_BOT_LEVELS.includes(row.botDifficulty as DiceBotLevel)
      )
        wins[row.botDifficulty as DiceBotLevel]++;
    return { completed: rows.length, wins };
  }

  async waitingOpponents(userId: string): Promise<{ total: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ageBand: true },
    });
    if (user.ageBand === 'CHILD') return { total: 0 };
    const rows = await this.prisma.diceMatch.findMany({
      where: {
        status: 'WAITING',
        openToMatchmaking: true,
        createdAt: { gt: new Date(Date.now() - 15 * 60_000) },
        players: { none: { userId } },
      },
      include: {
        players: { include: { user: { select: { id: true, ageBand: true } } } },
      },
    });
    const targets = rows.flatMap((r) => r.players.map((p) => p.user));
    const reachable = await this.contacts.reachableAmong(userId, targets);
    return { total: targets.filter((p) => reachable.has(p.id)).length };
  }

  private abandonAfter(match: Match) {
    return match.status === 'WAITING'
      ? 15 * 60_000
      : match.botDifficulty
        ? 7 * 86400_000
        : match.turnTimeLimit
          ? 30 * 60_000
          : 86400_000;
  }
  private async abandon(tx: Tx, match: Match) {
    const state: DiceGameState = {
      ...this.stateOf(match),
      status: 'ABANDONED',
      phase: 'GAME_OVER',
      winnerId: null,
    };
    await this.saveStep(
      tx,
      match,
      { state, events: [{ type: 'GAME_ABANDONED' }] },
      'server:cleanup',
      `abandon:${match.version}`,
      { type: 'ABANDON' },
    );
  }
  async sweepAbandoned(): Promise<number> {
    const candidates = await this.prisma.diceMatch.findMany({
      where: {
        status: { in: [...activeStatuses] },
        lastActionAt: { lt: new Date(Date.now() - 15 * 60_000) },
      },
      include: { players: true },
      take: 200,
      orderBy: { lastActionAt: 'asc' },
    });
    let count = 0;
    for (const candidate of candidates) {
      if (
        Date.now() - candidate.lastActionAt.getTime() <
        this.abandonAfter(candidate)
      )
        continue;
      await this.prisma.$transaction(async (tx) => {
        const match = await this.lock(tx, candidate.id);
        if (
          (match.status === 'WAITING' || match.status === 'IN_PROGRESS') &&
          Date.now() - match.lastActionAt.getTime() >= this.abandonAfter(match)
        ) {
          await this.abandon(tx, match);
          count++;
        }
      });
    }
    if (count) this.logger.log(`Закрыто брошенных партий в кости: ${count}`);
    return count;
  }

  private validTarget(value?: number) {
    if (value === undefined) return DICE_DEFAULT_TARGET;
    if (
      !DICE_TARGET_OPTIONS.includes(
        value as (typeof DICE_TARGET_OPTIONS)[number],
      )
    )
      throw new BadRequestException('Такой цели у партии быть не может');
    return value;
  }
  private assertMember(match: Match, userId: string) {
    if (!match.players.some((p) => p.userId === userId))
      throw new ForbiddenException('Вы не за этим столом');
  }
  private async lock(tx: Tx, id: string): Promise<Match> {
    await tx.$queryRaw`SELECT id FROM dice_matches WHERE id = ${id} FOR UPDATE`;
    const match = await tx.diceMatch.findUnique({
      where: { id },
      include: { players: true },
    });
    if (!match) throw new NotFoundException('Партия не найдена');
    return match;
  }
  private async load(id: string): Promise<Match> {
    const match = await this.prisma.diceMatch.findUnique({
      where: { id },
      include: { players: true },
    });
    if (!match) throw new NotFoundException('Партия не найдена');
    return match;
  }
  private stateOf(match: Match): DiceGameState {
    // Статус строки главнее старого JSON: миграция не оживляет партии,
    // которые прежний уборщик уже закрыл только в индексируемой колонке.
    return {
      ...(match.state as unknown as DiceGameState),
      matchId: match.id,
      status: match.status,
      ...(match.status === 'ABANDONED'
        ? { phase: 'GAME_OVER' as const, winnerId: null }
        : {}),
    };
  }
}

export type { DiceMatchView, DiceValue };
