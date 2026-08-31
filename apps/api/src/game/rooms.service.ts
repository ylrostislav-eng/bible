import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ROOM_MAX_PARTICIPANTS,
  ROOM_MIN_PARTICIPANTS_FOR_RATING,
  getTitleForRating,
  type BannedUserView,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type RoomParticipantView,
  type RoomState,
  type RoomStateStatus,
  type RoomSummary,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { JoinRoomDto } from './dto/join-room.dto';
import type { RoomAnswerDto } from './dto/room-answer.dto';
import { toPublicQuestion } from './game.mapper';
import {
  COINS_PER_CORRECT_ANSWER,
  XP_PER_CORRECT_ANSWER,
} from './game.service';
import { generateInviteCode } from './invite-code';
import { QuestionsService, shuffleOptions } from './questions.service';
import { generateRoomPassword } from './room-password';

const CREATE_CODE_ATTEMPTS = 5;
const CREATE_PASSWORD_ATTEMPTS = 5;

/** Best rank's reward, scaled by room size — a bigger room's win is worth
 * more, capped so it never dwarfs the effort of a small one. */
const ROOM_TOP_REWARD_CAP = 20;
/** Last place's reward — always a mild penalty, regardless of room size. */
const ROOM_LAST_PENALTY = -5;
/** Overrides the rank-based reward for a participant who got every question
 * wrong — always a real penalty, matching the 1v1 duel's equivalent rule. */
const ROOM_ZERO_CORRECT_RATING_DELTA = -10;

function topReward(participantCount: number): number {
  return Math.min(ROOM_TOP_REWARD_CAP, 10 + Math.floor(participantCount / 2));
}

const roomSessionInclude = {
  participants: {
    include: {
      user: true,
      answers: { include: { question: true }, orderBy: { order: 'asc' } },
    },
    orderBy: { joinedAt: 'asc' },
  },
} satisfies Prisma.GameSessionInclude;

type LoadedRoom = Prisma.GameSessionGetPayload<{
  include: typeof roomSessionInclude;
}>;
type LoadedRoomParticipant = LoadedRoom['participants'][number];
type LoadedRoomAnswer = LoadedRoomParticipant['answers'][number];

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly usersService: UsersService,
  ) {}

  async create(
    userId: string,
    dto: CreateRoomDto,
  ): Promise<CreateRoomResponse> {
    const maxParticipants = Math.min(
      dto.maxParticipants ?? ROOM_MAX_PARTICIPANTS,
      ROOM_MAX_PARTICIPANTS,
    );

    let password: string | null = null;
    if (dto.visibility === 'PRIVATE') {
      password = await this.generateUniquePassword();
    }

    for (let attempt = 0; attempt < CREATE_CODE_ATTEMPTS; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const session = await this.prisma.gameSession.create({
          data: {
            mode: 'ROOM',
            status: 'LOBBY',
            questionCount: dto.questionCount,
            inviteCode,
            roomName: dto.roomName ?? null,
            visibility: dto.visibility,
            password,
            leaderId: userId,
            maxParticipants,
            participants: { create: { userId, isLeader: true } },
          },
        });
        return { sessionId: session.id, inviteCode, password };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Не удалось создать комнату, попробуйте ещё раз',
    );
  }

  /** Generates a password that doesn't collide with any other currently
   * joinable PRIVATE room's password — retried like the invite code, but
   * checked at the application level since a password isn't itself a unique
   * lookup key (the invite code is). */
  private async generateUniquePassword(): Promise<string> {
    for (let attempt = 0; attempt < CREATE_PASSWORD_ATTEMPTS; attempt++) {
      const password = generateRoomPassword();
      const collision = await this.prisma.gameSession.findFirst({
        where: {
          mode: 'ROOM',
          visibility: 'PRIVATE',
          status: { in: ['LOBBY', 'IN_PROGRESS'] },
          password,
        },
        select: { id: true },
      });
      if (!collision) return password;
    }
    return generateRoomPassword();
  }

  /** Public, joinable (not full) rooms still accepting players. */
  async listPublic(): Promise<RoomSummary[]> {
    const sessions = await this.prisma.gameSession.findMany({
      where: { mode: 'ROOM', status: 'LOBBY', visibility: 'PUBLIC' },
      include: { participants: { include: { user: true } } },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });

    return sessions
      .filter(
        (s) =>
          s.participants.length < (s.maxParticipants ?? ROOM_MAX_PARTICIPANTS),
      )
      .map((s) => ({
        sessionId: s.id,
        inviteCode: s.inviteCode ?? '',
        roomName: s.roomName,
        leaderNickname:
          s.participants.find((p) => p.userId === s.leaderId)?.user.nickname ??
          null,
        participantCount: s.participants.length,
        maxParticipants: s.maxParticipants ?? ROOM_MAX_PARTICIPANTS,
        questionCount: s.questionCount,
      }));
  }

  async join(userId: string, dto: JoinRoomDto): Promise<JoinRoomResponse> {
    const session = await this.prisma.gameSession.findUnique({
      where: { inviteCode: dto.inviteCode.toUpperCase() },
      include: roomSessionInclude,
    });

    if (!session || session.mode !== 'ROOM') {
      throw new NotFoundException('Комната с таким кодом не найдена');
    }
    if (session.status !== 'LOBBY') {
      throw new ConflictException('Эта комната уже началась или завершена');
    }
    if (session.participants.some((p) => p.userId === userId)) {
      throw new ConflictException('Вы уже в этой комнате');
    }
    if (
      session.participants.length >=
      (session.maxParticipants ?? ROOM_MAX_PARTICIPANTS)
    ) {
      throw new ConflictException('Комната заполнена');
    }
    if (session.visibility === 'PRIVATE') {
      if (!dto.password || dto.password.toUpperCase() !== session.password) {
        throw new BadRequestException('Неверный пароль комнаты');
      }
    }
    if (session.leaderId) {
      const ban = await this.prisma.roomBan.findUnique({
        where: {
          leaderId_bannedUserId: {
            leaderId: session.leaderId,
            bannedUserId: userId,
          },
        },
      });
      if (ban) {
        throw new ForbiddenException(
          'Лидер этой комнаты заблокировал вас в своих комнатах',
        );
      }
    }

    await this.prisma.gameParticipant.create({
      data: { sessionId: session.id, userId },
    });

    return { sessionId: session.id };
  }

  async getState(userId: string, sessionId: string): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireParticipant(session, userId);
    return this.buildState(session, userId);
  }

  async setReady(
    userId: string,
    sessionId: string,
    ready: boolean,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    const participant = this.requireParticipant(session, userId);
    if (session.status !== 'LOBBY') {
      throw new ConflictException('Комната уже начала игру');
    }

    await this.prisma.gameParticipant.update({
      where: { id: participant.id },
      data: { isReady: ready },
    });

    return this.buildState(await this.loadSession(sessionId), userId);
  }

  /** Leader-only. Only meaningful in LOBBY — a running or finished room has
   * no server-side "leave" concept, same as the 1v1 duel: a participant who
   * disappears simply stops answering and their misses auto-resolve via the
   * per-question timer. */
  async kick(
    leaderId: string,
    sessionId: string,
    targetUserId: string,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireLeader(session, leaderId);
    if (targetUserId === leaderId) {
      throw new BadRequestException('Нельзя исключить самого себя');
    }
    if (session.status !== 'LOBBY') {
      throw new ConflictException('Комната уже начала игру');
    }

    const target = session.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw new NotFoundException('Участник не найден в этой комнате');
    }
    await this.prisma.gameParticipant.delete({ where: { id: target.id } });

    return this.buildState(await this.loadSession(sessionId), leaderId);
  }

  /** Kicks (if still present) and permanently blocks the target from
   * joining any future room led by this leader. Independent of `kick` —
   * a leader can ban without the target currently being in this room. */
  async ban(
    leaderId: string,
    sessionId: string,
    targetUserId: string,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireLeader(session, leaderId);
    if (targetUserId === leaderId) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }

    await this.prisma.roomBan.upsert({
      where: {
        leaderId_bannedUserId: { leaderId, bannedUserId: targetUserId },
      },
      create: { leaderId, bannedUserId: targetUserId },
      update: {},
    });

    const target = session.participants.find((p) => p.userId === targetUserId);
    if (target && session.status === 'LOBBY') {
      await this.prisma.gameParticipant.delete({ where: { id: target.id } });
    }

    return this.buildState(await this.loadSession(sessionId), leaderId);
  }

  /** Standalone leader-scoped ban, independent of any specific room — the
   * profile's blacklist screen uses this to pre-emptively block someone who
   * isn't (or isn't yet) sitting in any of this leader's rooms. Idempotent:
   * banning an already-banned user is a no-op, not an error. */
  async banUser(leaderId: string, targetUserId: string): Promise<void> {
    if (targetUserId === leaderId) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }
    await this.prisma.roomBan.upsert({
      where: {
        leaderId_bannedUserId: { leaderId, bannedUserId: targetUserId },
      },
      create: { leaderId, bannedUserId: targetUserId },
      update: {},
    });
  }

  /** Lets the target join this leader's rooms again. Existing rooms are
   * unaffected either way — a ban only ever blocks future joins. */
  async unbanUser(leaderId: string, targetUserId: string): Promise<void> {
    await this.prisma.roomBan.deleteMany({
      where: { leaderId, bannedUserId: targetUserId },
    });
  }

  async listBanned(leaderId: string): Promise<BannedUserView[]> {
    const bans = await this.prisma.roomBan.findMany({
      where: { leaderId },
      include: { bannedUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return bans.map((b) => ({
      userId: b.bannedUser.id,
      nickname: b.bannedUser.nickname,
      avatarUrl: b.bannedUser.avatarUrl,
      level: b.bannedUser.level,
      rating: b.bannedUser.rating,
      title: getTitleForRating(b.bannedUser.rating),
      bannedAt: b.createdAt.toISOString(),
    }));
  }

  /** LOBBY-only. The leader leaving closes the room entirely (no leadership
   * transfer) — simplest behavior for an unspecified edge case, and matches
   * "the leader controls the room" as the room's defining property. */
  async leave(userId: string, sessionId: string): Promise<RoomState | null> {
    const session = await this.loadSession(sessionId);
    const participant = this.requireParticipant(session, userId);
    if (session.status !== 'LOBBY') {
      return this.buildState(session, userId);
    }

    if (session.leaderId === userId) {
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: { status: 'ABANDONED', finishedAt: new Date() },
      });
      return null;
    }

    await this.prisma.gameParticipant.delete({ where: { id: participant.id } });
    return this.buildState(await this.loadSession(sessionId), userId);
  }

  /** Leader-only. Requires every non-leader participant to be ready. */
  async start(leaderId: string, sessionId: string): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    this.requireLeader(session, leaderId);
    if (session.status !== 'LOBBY') {
      throw new ConflictException('Комната уже начала игру');
    }
    if (session.participants.length < 2) {
      throw new ConflictException('Нужен хотя бы ещё один игрок');
    }
    const notReady = session.participants.filter(
      (p) => p.userId !== leaderId && !p.isReady,
    );
    if (notReady.length > 0) {
      throw new ConflictException('Не все игроки готовы');
    }

    const questions = await this.questionsService.pickRandom({
      count: session.questionCount,
    });

    // Shuffled independently per participant, so nobody's option order
    // matches anyone else's — the same anti-callout guarantee as duels.
    const answerRows = questions.flatMap((question, order) =>
      session.participants.map((participant) => {
        const shuffled = shuffleOptions(question);
        return {
          sessionId: session.id,
          participantId: participant.id,
          questionId: question.id,
          order,
          shuffledOptions: shuffled.options,
          shuffledCorrectIndex: shuffled.correctIndex,
        };
      }),
    );
    await this.prisma.gameAnswer.createMany({ data: answerRows });
    await this.questionsService.markUsed(questions.map((q) => q.id));

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: 'IN_PROGRESS',
        questionCount: questions.length,
        currentOrder: 0,
        currentQuestionStartedAt: new Date(),
      },
    });

    return this.buildState(await this.loadSession(sessionId), leaderId);
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: RoomAnswerDto,
  ): Promise<RoomState> {
    const session = await this.loadSession(sessionId);
    const participant = this.requireParticipant(session, userId);
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Игра ещё не началась или уже завершена');
    }

    const currentAnswer = participant.answers.find(
      (a) => a.order === session.currentOrder,
    );
    if (!currentAnswer) {
      throw new NotFoundException('Вопрос не найден');
    }
    if (currentAnswer.answeredAt) {
      throw new ConflictException('Вы уже ответили на этот вопрос');
    }
    if (currentAnswer.questionId !== dto.questionId) {
      throw new ConflictException('Это не текущий вопрос игры');
    }

    const startedAt = session.currentQuestionStartedAt ?? session.startedAt;
    const timeTakenMs = Math.max(0, Date.now() - startedAt.getTime());
    const isCorrect = dto.answerIndex === currentAnswer.shuffledCorrectIndex;

    await this.recordAnswer(
      participant,
      currentAnswer,
      dto.answerIndex,
      isCorrect,
      timeTakenMs,
    );
    if (!isCorrect) {
      await this.questionsService.markMistake(currentAnswer.questionId);
    }

    return this.buildState(await this.loadSession(sessionId), userId);
  }

  /** True once every participant has answered the current question. Used by
   * the gateway to decide whether to cancel the time-limit timer early. */
  async isRoundResolved(sessionId: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    return this.roundResolved(session, session.currentOrder);
  }

  /** Auto-submits a miss for anyone who hasn't answered the current question
   * yet — called by the gateway when the per-question timer fires. */
  async forceMissUnanswered(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (session.status !== 'IN_PROGRESS') return;

    const order = session.currentOrder;
    for (const participant of session.participants) {
      const answer = participant.answers.find((a) => a.order === order);
      if (answer && !answer.answeredAt) {
        await this.recordAnswer(
          participant,
          answer,
          null,
          false,
          session.timeLimitSeconds * 1000,
        );
      }
    }
  }

  /** Moves to the next question, or finishes the room if the round that just
   * resolved was the last one. Returns the resulting state plus whether the
   * room just finished, so the gateway knows whether to keep pacing timers. */
  async advance(
    sessionId: string,
  ): Promise<{ state: RoomState; finished: boolean }> {
    const session = await this.loadSession(sessionId);
    if (session.status !== 'IN_PROGRESS') {
      return {
        state: this.buildState(session, session.leaderId ?? ''),
        finished: true,
      };
    }

    if (session.currentOrder >= session.questionCount - 1) {
      await this.finishSession(sessionId);
      const finished = await this.loadSession(sessionId);
      return {
        state: this.buildState(finished, finished.leaderId ?? ''),
        finished: true,
      };
    }

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        currentOrder: { increment: 1 },
        currentQuestionStartedAt: new Date(),
      },
    });
    const next = await this.loadSession(sessionId);
    return {
      state: this.buildState(next, next.leaderId ?? ''),
      finished: false,
    };
  }

  // ---- internals ----

  private async loadSession(sessionId: string): Promise<LoadedRoom> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: roomSessionInclude,
    });
    if (!session || session.mode !== 'ROOM') {
      throw new NotFoundException('Комната не найдена');
    }
    return session;
  }

  private requireParticipant(
    session: LoadedRoom,
    userId: string,
  ): LoadedRoomParticipant {
    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new NotFoundException('Вы не участник этой комнаты');
    }
    return participant;
  }

  private requireLeader(session: LoadedRoom, userId: string): void {
    if (session.leaderId !== userId) {
      throw new ForbiddenException('Только лидер комнаты может это сделать');
    }
  }

  private roundResolved(session: LoadedRoom, order: number): boolean {
    return session.participants.every((p) =>
      p.answers.some((a) => a.order === order && a.answeredAt !== null),
    );
  }

  private async recordAnswer(
    participant: LoadedRoomParticipant,
    answer: LoadedRoomAnswer,
    selectedIndex: number | null,
    isCorrect: boolean,
    timeTakenMs: number,
  ): Promise<void> {
    const streak = isCorrect ? participant.streak + 1 : 0;
    const scoreDelta = isCorrect ? 1 : 0;

    await this.prisma.$transaction([
      this.prisma.gameAnswer.update({
        where: { id: answer.id },
        data: {
          selectedIndex,
          isCorrect,
          answeredAt: new Date(),
          timeTakenMs,
          scoreDelta,
        },
      }),
      this.prisma.gameParticipant.update({
        where: { id: participant.id },
        data: {
          streak,
          correctCount: { increment: isCorrect ? 1 : 0 },
          score: { increment: scoreDelta },
        },
      }),
    ]);
  }

  private async finishSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (session.status === 'COMPLETED') return;

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });

    const ranked = this.rankParticipants(session.participants);
    const n = ranked.length;
    const competitive = n >= ROOM_MIN_PARTICIPANTS_FOR_RATING;

    for (let rank = 0; rank < ranked.length; rank++) {
      const participant = ranked[rank];
      const xpEarned = participant.correctCount * XP_PER_CORRECT_ANSWER;
      const coinsEarned = participant.correctCount * COINS_PER_CORRECT_ANSWER;

      let ratingDelta = 0;
      if (competitive) {
        if (participant.correctCount === 0) {
          ratingDelta = ROOM_ZERO_CORRECT_RATING_DELTA;
        } else {
          // rank 0 (best) -> percentile 1; rank n-1 (worst) -> percentile 0.
          const percentile = n > 1 ? (n - 1 - rank) / (n - 1) : 1;
          ratingDelta = Math.round(
            ROOM_LAST_PENALTY + percentile * (topReward(n) - ROOM_LAST_PENALTY),
          );
        }
      }

      const reward = await this.usersService.applyRoomRewards(
        participant.userId,
        {
          xpEarned,
          coinsEarned,
          ratingDelta,
        },
      );

      await this.prisma.gameParticipant.update({
        where: { id: participant.id },
        data: {
          xpEarned,
          coinsEarned,
          ratingDelta: reward.ratingDelta,
          ratingCapped: reward.ratingCapped,
        },
      });
    }
  }

  /** Best to worst: higher score first, then more correct answers, then
   * whoever joined the room earliest — a stable, deterministic order. */
  private rankParticipants(
    participants: LoadedRoomParticipant[],
  ): LoadedRoomParticipant[] {
    return [...participants].sort(
      (a, b) =>
        b.score - a.score ||
        b.correctCount - a.correctCount ||
        a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
  }

  private toParticipantView(
    p: LoadedRoomParticipant,
    leaderId: string | null,
  ): RoomParticipantView {
    return {
      userId: p.userId,
      nickname: p.user.nickname,
      avatarUrl: p.user.avatarUrl,
      isLeader: p.userId === leaderId,
      isReady: p.isReady,
      correctCount: p.correctCount,
      score: p.score,
      streak: p.streak,
      xpEarned: p.xpEarned,
      coinsEarned: p.coinsEarned,
      ratingDelta: p.ratingDelta,
      ratingCapped: p.ratingCapped,
    };
  }

  private buildState(session: LoadedRoom, userId: string): RoomState {
    const me = session.participants.find((p) => p.userId === userId) ?? null;
    const participants = session.participants.map((p) =>
      this.toParticipantView(p, session.leaderId),
    );

    const base: RoomState = {
      sessionId: session.id,
      status: session.status as RoomStateStatus,
      roomName: session.roomName,
      visibility: session.visibility,
      inviteCode: session.inviteCode,
      password: session.leaderId === userId ? session.password : null,
      questionCount: session.questionCount,
      maxParticipants: session.maxParticipants ?? ROOM_MAX_PARTICIPANTS,
      timeLimitSeconds: session.timeLimitSeconds,
      you: me
        ? this.toParticipantView(me, session.leaderId)
        : {
            userId,
            nickname: null,
            avatarUrl: null,
            isLeader: false,
            isReady: false,
            correctCount: 0,
            score: 0,
            streak: 0,
            xpEarned: 0,
            coinsEarned: 0,
            ratingDelta: 0,
            ratingCapped: false,
          },
      leaderId: session.leaderId ?? '',
      participants,
      questionNumber: null,
      question: null,
      secondsRemaining: null,
      answeredUserIds: [],
      roundResolved: false,
      reveal: null,
      finalRanking: null,
    };

    if (session.status === 'LOBBY') {
      return base;
    }

    if (session.status === 'COMPLETED') {
      return {
        ...base,
        finalRanking: this.rankParticipants(session.participants).map((p) =>
          this.toParticipantView(p, session.leaderId),
        ),
      };
    }

    const order = session.currentOrder;
    const myAnswer = me?.answers.find((a) => a.order === order);
    if (!myAnswer) {
      return base;
    }

    const answeredUserIds = session.participants
      .filter((p) =>
        p.answers.some((a) => a.order === order && a.answeredAt !== null),
      )
      .map((p) => p.userId);
    const roundResolved = this.roundResolved(session, order);

    const startedAt = session.currentQuestionStartedAt ?? session.startedAt;
    const secondsRemaining = Math.max(
      0,
      session.timeLimitSeconds -
        Math.floor((Date.now() - startedAt.getTime()) / 1000),
    );

    return {
      ...base,
      questionNumber: order + 1,
      question: toPublicQuestion(myAnswer.question, myAnswer.shuffledOptions),
      secondsRemaining,
      answeredUserIds,
      roundResolved,
      reveal: roundResolved
        ? {
            correctIndex: myAnswer.shuffledCorrectIndex,
            explanation: myAnswer.question.explanation,
            book: myAnswer.question.book,
            chapter: myAnswer.question.chapter,
            verses: myAnswer.question.verses,
            answers: session.participants.map((p) => {
              const a = p.answers.find((x) => x.order === order);
              return {
                userId: p.userId,
                selectedIndex: a?.selectedIndex ?? null,
                isCorrect: a?.isCorrect ?? null,
                scoreDelta: a?.scoreDelta ?? 0,
              };
            }),
          }
        : null,
    };
  }
}
