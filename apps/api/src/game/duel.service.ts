import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateDuelResponse,
  DuelParticipantView,
  DuelState,
  DuelStateStatus,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { CreateDuelDto } from './dto/create-duel.dto';
import type { DuelAnswerDto } from './dto/duel-answer.dto';
import type { JoinDuelDto } from './dto/join-duel.dto';
import { toPublicQuestion } from './game.mapper';
import {
  COINS_PER_CORRECT_ANSWER,
  XP_PER_CORRECT_ANSWER,
} from './game.service';
import { generateInviteCode } from './invite-code';
import { QuestionsService } from './questions.service';

const BASE_POINTS = 10;
const MAX_SPEED_BONUS = 10;
const STREAK_BONUS_PER_STEP = 2;
const MAX_STREAK_BONUS_STEPS = 5;
const WIN_RATING_DELTA = 15;
const LOSS_RATING_DELTA = -10;
const CREATE_CODE_ATTEMPTS = 5;

const sessionInclude = {
  participants: {
    include: {
      user: true,
      answers: { include: { question: true }, orderBy: { order: 'asc' } },
    },
  },
} satisfies Prisma.GameSessionInclude;

type LoadedSession = Prisma.GameSessionGetPayload<{
  include: typeof sessionInclude;
}>;
type LoadedParticipant = LoadedSession['participants'][number];
type LoadedAnswer = LoadedParticipant['answers'][number];

@Injectable()
export class DuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly usersService: UsersService,
  ) {}

  async create(
    userId: string,
    dto: CreateDuelDto,
  ): Promise<CreateDuelResponse> {
    for (let attempt = 0; attempt < CREATE_CODE_ATTEMPTS; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const session = await this.prisma.gameSession.create({
          data: {
            mode: 'DUEL',
            status: 'WAITING_FOR_OPPONENT',
            questionCount: dto.questionCount,
            inviteCode,
            participants: { create: { userId } },
          },
        });
        return { sessionId: session.id, inviteCode };
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
    throw new ConflictException('Не удалось создать дуэль, попробуйте ещё раз');
  }

  async join(userId: string, dto: JoinDuelDto): Promise<{ sessionId: string }> {
    const session = await this.prisma.gameSession.findUnique({
      where: { inviteCode: dto.inviteCode.toUpperCase() },
      include: sessionInclude,
    });

    if (!session || session.mode !== 'DUEL') {
      throw new NotFoundException('Дуэль с таким кодом не найдена');
    }
    if (session.status !== 'WAITING_FOR_OPPONENT') {
      throw new ConflictException('Эта дуэль уже началась или завершена');
    }
    if (session.participants.some((p) => p.userId === userId)) {
      throw new ConflictException('Нельзя присоединиться к собственной дуэли');
    }

    const questions = await this.questionsService.pickRandom({
      count: session.questionCount,
    });
    const creator = session.participants[0];
    const joiner = await this.prisma.gameParticipant.create({
      data: { sessionId: session.id, userId },
    });

    const answerRows = questions.flatMap((question, index) => [
      {
        sessionId: session.id,
        participantId: creator.id,
        questionId: question.id,
        order: index,
      },
      {
        sessionId: session.id,
        participantId: joiner.id,
        questionId: question.id,
        order: index,
      },
    ]);
    await this.prisma.gameAnswer.createMany({ data: answerRows });
    await this.questionsService.markUsed(questions.map((q) => q.id));

    await this.prisma.gameSession.update({
      where: { id: session.id },
      data: {
        status: 'IN_PROGRESS',
        questionCount: questions.length,
        currentOrder: 0,
        currentQuestionStartedAt: new Date(),
      },
    });

    return { sessionId: session.id };
  }

  async getState(userId: string, sessionId: string): Promise<DuelState> {
    await this.resolveIfReady(await this.loadSession(sessionId));
    return this.buildState(await this.loadSession(sessionId), userId);
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: DuelAnswerDto,
  ): Promise<DuelState> {
    const session = await this.loadSession(sessionId);
    const participant = this.requireParticipant(session, userId);

    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Дуэль ещё не началась или уже завершена');
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
      throw new ConflictException('Это не текущий вопрос дуэли');
    }

    const startedAt = session.currentQuestionStartedAt ?? session.startedAt;
    const timeTakenMs = Math.max(0, Date.now() - startedAt.getTime());
    const isCorrect = dto.answerIndex === currentAnswer.question.correctIndex;

    await this.recordAnswer(
      participant,
      currentAnswer,
      dto.answerIndex,
      isCorrect,
      timeTakenMs,
      session.timeLimitSeconds,
    );

    if (!isCorrect) {
      await this.questionsService.markMistake(currentAnswer.questionId);
    }

    await this.resolveIfReady(await this.loadSession(sessionId));
    return this.buildState(await this.loadSession(sessionId), userId);
  }

  /** Advances to the next question once both participants have seen the reveal. */
  async advance(userId: string, sessionId: string): Promise<DuelState> {
    const session = await this.loadSession(sessionId);
    this.requireParticipant(session, userId);

    if (session.status === 'IN_PROGRESS') {
      const bothAnswered = session.participants.every((p) =>
        p.answers.some(
          (a) => a.order === session.currentOrder && a.answeredAt !== null,
        ),
      );
      if (bothAnswered && session.currentOrder < session.questionCount - 1) {
        await this.prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            currentOrder: { increment: 1 },
            currentQuestionStartedAt: new Date(),
          },
        });
      }
    }

    return this.buildState(await this.loadSession(sessionId), userId);
  }

  // ---- internals ----

  private async loadSession(sessionId: string): Promise<LoadedSession> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session || session.mode !== 'DUEL') {
      throw new NotFoundException('Дуэль не найдена');
    }
    return session;
  }

  private requireParticipant(
    session: LoadedSession,
    userId: string,
  ): LoadedParticipant {
    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new NotFoundException('Дуэль не найдена');
    }
    return participant;
  }

  private async recordAnswer(
    participant: LoadedParticipant,
    answer: LoadedAnswer,
    selectedIndex: number | null,
    isCorrect: boolean,
    timeTakenMs: number,
    timeLimitSeconds: number,
  ): Promise<void> {
    const streak = isCorrect ? participant.streak + 1 : 0;
    let scoreDelta = 0;
    if (isCorrect) {
      const speedBonus = Math.max(
        0,
        Math.round(
          MAX_SPEED_BONUS * (1 - timeTakenMs / (timeLimitSeconds * 1000)),
        ),
      );
      const streakBonus =
        STREAK_BONUS_PER_STEP * Math.min(streak - 1, MAX_STREAK_BONUS_STEPS);
      scoreDelta = BASE_POINTS + speedBonus + streakBonus;
    }

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

  /** Auto-submits a miss for anyone who hasn't answered once the time limit elapses, and finishes the duel after the last round. */
  private async resolveIfReady(session: LoadedSession): Promise<void> {
    if (session.status !== 'IN_PROGRESS') {
      return;
    }

    const order = session.currentOrder;
    const startedAt = session.currentQuestionStartedAt ?? session.startedAt;
    const timedOut =
      Date.now() - startedAt.getTime() >= session.timeLimitSeconds * 1000;

    const current = session.participants.map((participant) => ({
      participant,
      answer: participant.answers.find((a) => a.order === order),
    }));

    const allAnswered = current.every(({ answer }) => answer?.answeredAt);
    if (!allAnswered && !timedOut) {
      return;
    }

    for (const { participant, answer } of current) {
      if (answer && !answer.answeredAt) {
        await this.recordAnswer(
          participant,
          answer,
          null,
          false,
          session.timeLimitSeconds * 1000,
          session.timeLimitSeconds,
        );
      }
    }

    if (order >= session.questionCount - 1) {
      await this.finishSession(session.id);
    }
  }

  private async finishSession(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (session.status === 'COMPLETED') {
      return;
    }

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });

    const [a, b] = session.participants;
    for (const [participant, opponent] of [
      [a, b],
      [b, a],
    ] as const) {
      const outcome: 'win' | 'loss' | 'draw' =
        participant.score > opponent.score
          ? 'win'
          : participant.score < opponent.score
            ? 'loss'
            : 'draw';
      const xpEarned = participant.correctCount * XP_PER_CORRECT_ANSWER;
      const coinsEarned = participant.correctCount * COINS_PER_CORRECT_ANSWER;

      await this.prisma.gameParticipant.update({
        where: { id: participant.id },
        data: { xpEarned, coinsEarned },
      });

      await this.usersService.applyGameRewards(participant.userId, {
        xpEarned,
        coinsEarned,
        outcome,
        ratingDelta:
          outcome === 'win'
            ? WIN_RATING_DELTA
            : outcome === 'loss'
              ? LOSS_RATING_DELTA
              : 0,
      });
    }
  }

  private buildState(session: LoadedSession, userId: string): DuelState {
    const me = this.requireParticipant(session, userId);
    const opponentParticipant =
      session.participants.find((p) => p.userId !== userId) ?? null;

    const toView = (p: LoadedParticipant): DuelParticipantView => ({
      userId: p.userId,
      nickname: p.user.nickname,
      avatarUrl: p.user.avatarUrl,
      correctCount: p.correctCount,
      score: p.score,
      streak: p.streak,
    });

    const base: DuelState = {
      sessionId: session.id,
      status: session.status as DuelStateStatus,
      inviteCode: session.inviteCode,
      questionCount: session.questionCount,
      timeLimitSeconds: session.timeLimitSeconds,
      you: toView(me),
      opponent: opponentParticipant ? toView(opponentParticipant) : null,
      questionNumber: null,
      question: null,
      secondsRemaining: null,
      youAnswered: false,
      opponentAnswered: false,
      roundResolved: false,
      reveal: null,
      outcome: null,
    };

    if (session.status === 'WAITING_FOR_OPPONENT') {
      return base;
    }

    if (session.status === 'COMPLETED') {
      const outcome: 'win' | 'loss' | 'draw' = !opponentParticipant
        ? 'draw'
        : me.score > opponentParticipant.score
          ? 'win'
          : me.score < opponentParticipant.score
            ? 'loss'
            : 'draw';
      return { ...base, outcome };
    }

    const order = session.currentOrder;
    const myAnswer = me.answers.find((a) => a.order === order);
    const opponentAnswer = opponentParticipant?.answers.find(
      (a) => a.order === order,
    );
    if (!myAnswer) {
      return base;
    }

    const youAnswered = myAnswer.answeredAt !== null;
    const opponentAnswered = opponentAnswer
      ? opponentAnswer.answeredAt !== null
      : false;
    const roundResolved = youAnswered && opponentAnswered;

    const startedAt = session.currentQuestionStartedAt ?? session.startedAt;
    const secondsRemaining = Math.max(
      0,
      session.timeLimitSeconds -
        Math.floor((Date.now() - startedAt.getTime()) / 1000),
    );

    return {
      ...base,
      questionNumber: order + 1,
      question: toPublicQuestion(myAnswer.question),
      secondsRemaining,
      youAnswered,
      opponentAnswered,
      roundResolved,
      reveal: roundResolved
        ? {
            correctIndex: myAnswer.question.correctIndex,
            explanation: myAnswer.question.explanation,
            book: myAnswer.question.book,
            chapter: myAnswer.question.chapter,
            verses: myAnswer.question.verses,
            you: {
              selectedIndex: myAnswer.selectedIndex,
              isCorrect: myAnswer.isCorrect,
              scoreDelta: myAnswer.scoreDelta ?? 0,
            },
            opponent: opponentAnswer
              ? {
                  selectedIndex: opponentAnswer.selectedIndex,
                  isCorrect: opponentAnswer.isCorrect,
                  scoreDelta: opponentAnswer.scoreDelta ?? 0,
                }
              : { selectedIndex: null, isCorrect: null, scoreDelta: 0 },
          }
        : null,
    };
  }
}
