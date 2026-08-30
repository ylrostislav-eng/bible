import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DUEL_QUESTION_COUNT_MIN,
  type ChallengeFriendResponse,
  type CreateDuelResponse,
  type DuelParticipantView,
  type DuelPreviewResponse,
  type DuelState,
  type DuelStateStatus,
  type PendingChallenge,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { ChallengeFriendDto } from './dto/challenge-friend.dto';
import type { CreateDuelDto } from './dto/create-duel.dto';
import type { DuelAnswerDto } from './dto/duel-answer.dto';
import type { JoinDuelDto } from './dto/join-duel.dto';
import type { RespondToChallengeDto } from './dto/respond-to-challenge.dto';
import { toPublicQuestion } from './game.mapper';
import {
  COINS_PER_CORRECT_ANSWER,
  XP_PER_CORRECT_ANSWER,
} from './game.service';
import { generateInviteCode } from './invite-code';
import { QuestionsService, shuffleOptions } from './questions.service';

const WIN_RATING_DELTA = 10;
const LOSS_RATING_DELTA = -5;
/** Overrides win/loss/draw rewards for a participant who got every question
 * wrong — always a penalty, regardless of how the match otherwise went. */
const ZERO_CORRECT_RATING_DELTA = -10;
const CREATE_CODE_ATTEMPTS = 5;

/** Draw reward scales with % correct, not raw score — the number of
 * questions in a duel can vary. Checked in descending order. */
const DRAW_RATING_BY_MIN_PERCENT: { minPercent: number; rating: number }[] = [
  { minPercent: 0.7, rating: 5 },
  { minPercent: 0.5, rating: 4 },
  { minPercent: 0.3, rating: 3 },
  { minPercent: 0.1, rating: 2 },
  { minPercent: 0, rating: 1 },
];

function drawRating(percentCorrect: number): number {
  const tier = DRAW_RATING_BY_MIN_PERCENT.find(
    (t) => percentCorrect >= t.minPercent,
  );
  return tier?.rating ?? 1;
}

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

  /** Like `create`, but pre-targeted at a specific friend instead of an open
   * invite code — surfaces on their duel screen as a pending challenge
   * instead of requiring them to be handed a code out of band. The code is
   * still generated as a fallback/share option. */
  async challenge(
    userId: string,
    dto: ChallengeFriendDto,
  ): Promise<ChallengeFriendResponse> {
    if (dto.friendUserId === userId) {
      throw new BadRequestException('Нельзя бросить вызов самому себе');
    }
    const friendship = await this.prisma.friendship.findUnique({
      where: {
        userId_friendId: { userId, friendId: dto.friendUserId },
      },
    });
    if (!friendship) {
      throw new ConflictException('Можно бросить вызов только другу');
    }

    for (let attempt = 0; attempt < CREATE_CODE_ATTEMPTS; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const session = await this.prisma.gameSession.create({
          data: {
            mode: 'DUEL',
            status: 'WAITING_FOR_OPPONENT',
            questionCount: dto.questionCount,
            inviteCode,
            targetUserId: dto.friendUserId,
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
    throw new ConflictException('Не удалось создать вызов, попробуйте ещё раз');
  }

  /** Challenges sent to `userId` that haven't been accepted/declined yet —
   * shown on their duel screen so they don't need the fallback code. */
  async pendingChallenges(userId: string): Promise<PendingChallenge[]> {
    const sessions = await this.prisma.gameSession.findMany({
      where: {
        mode: 'DUEL',
        status: 'WAITING_FOR_OPPONENT',
        targetUserId: userId,
      },
      include: sessionInclude,
      orderBy: { startedAt: 'desc' },
    });

    return sessions.map((session) => ({
      sessionId: session.id,
      fromUserId: session.participants[0]?.userId ?? '',
      fromNickname: session.participants[0]?.user.nickname ?? null,
      questionCount: session.questionCount,
      createdAt: session.startedAt.toISOString(),
    }));
  }

  async respondToChallenge(
    userId: string,
    sessionId: string,
    dto: RespondToChallengeDto,
  ): Promise<{ sessionId: string } | { declined: true }> {
    const session = await this.loadSession(sessionId);
    if (session.targetUserId !== userId) {
      throw new NotFoundException('Вызов не найден');
    }
    if (session.status !== 'WAITING_FOR_OPPONENT') {
      throw new ConflictException('Этот вызов уже обработан');
    }

    if (dto.action === 'DECLINE') {
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: { status: 'ABANDONED', finishedAt: new Date() },
      });
      return { declined: true };
    }

    return this.startDuel(session, userId, dto.questionCount);
  }

  /** Looked up by the joiner right after typing in the code, before they
   * commit — shows the host's chosen question count so it can be lowered
   * (never raised) on the join screen. */
  async preview(inviteCode: string): Promise<DuelPreviewResponse> {
    const session = await this.prisma.gameSession.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: sessionInclude,
    });

    if (!session || session.mode !== 'DUEL') {
      throw new NotFoundException('Дуэль с таким кодом не найдена');
    }
    if (session.status !== 'WAITING_FOR_OPPONENT') {
      throw new ConflictException('Эта дуэль уже началась или завершена');
    }

    return {
      sessionId: session.id,
      hostNickname: session.participants[0]?.user.nickname ?? null,
      questionCount: session.questionCount,
    };
  }

  async join(userId: string, dto: JoinDuelDto): Promise<{ sessionId: string }> {
    const session = await this.prisma.gameSession.findUnique({
      where: { inviteCode: dto.inviteCode.toUpperCase() },
      include: sessionInclude,
    });

    if (!session || session.mode !== 'DUEL') {
      throw new NotFoundException('Дуэль с таким кодом не найдена');
    }
    // A friend-challenge's code is a fallback/share option for its target
    // only — it doesn't turn the challenge into an open invite anyone can
    // join with.
    if (session.targetUserId && session.targetUserId !== userId) {
      throw new ConflictException('Эта дуэль предназначена другому игроку');
    }
    if (session.status !== 'WAITING_FOR_OPPONENT') {
      throw new ConflictException('Эта дуэль уже началась или завершена');
    }
    if (session.participants.some((p) => p.userId === userId)) {
      throw new ConflictException('Нельзя присоединиться к собственной дуэли');
    }

    return this.startDuel(session, userId, dto.questionCount);
  }

  /** Shared by `join` (open code) and `respondToChallenge` (targeted
   * invite) — generates the question set, creates the joiner's participant
   * row, and flips the session to IN_PROGRESS. */
  private async startDuel(
    session: LoadedSession,
    joinerId: string,
    requestedQuestionCount: number | undefined,
  ): Promise<{ sessionId: string }> {
    // The joiner may shrink the host's question count, never grow it —
    // validated here since the host's actual count isn't known client-side
    // until the preview call.
    let questionCount = session.questionCount;
    if (requestedQuestionCount !== undefined) {
      if (
        requestedQuestionCount < DUEL_QUESTION_COUNT_MIN ||
        requestedQuestionCount > session.questionCount
      ) {
        throw new BadRequestException(
          `Количество вопросов должно быть от ${DUEL_QUESTION_COUNT_MIN} до ${session.questionCount}`,
        );
      }
      questionCount = requestedQuestionCount;
    }

    const questions = await this.questionsService.pickRandom({
      count: questionCount,
    });
    const creator = session.participants[0];
    const joiner = await this.prisma.gameParticipant.create({
      data: { sessionId: session.id, userId: joinerId },
    });

    // Shuffled independently per participant, so the two sides see the same
    // question with different option orders — the correct answer can't just
    // be called out to the opponent ("it's C!").
    const answerRows = questions.flatMap((question, index) => {
      const forCreator = shuffleOptions(question);
      const forJoiner = shuffleOptions(question);
      return [
        {
          sessionId: session.id,
          participantId: creator.id,
          questionId: question.id,
          order: index,
          shuffledOptions: forCreator.options,
          shuffledCorrectIndex: forCreator.correctIndex,
        },
        {
          sessionId: session.id,
          participantId: joiner.id,
          questionId: question.id,
          order: index,
          shuffledOptions: forJoiner.options,
          shuffledCorrectIndex: forJoiner.correctIndex,
        },
      ];
    });
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
  ): Promise<void> {
    // Outcome and rating are decided purely by correctness — no bonus for
    // answering fast or for a streak within the match. `streak` is kept as
    // a cosmetic "you're on a roll" indicator only, it no longer affects
    // scoring.
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
      const percentCorrect =
        session.questionCount > 0
          ? participant.correctCount / session.questionCount
          : 0;

      // A participant who got every question wrong always takes the -10
      // penalty, regardless of outcome — this is what keeps a 0/0 draw
      // (both sides all wrong) from being a rating-neutral shrug.
      const ratingDelta =
        percentCorrect === 0
          ? ZERO_CORRECT_RATING_DELTA
          : outcome === 'win'
            ? WIN_RATING_DELTA
            : outcome === 'loss'
              ? LOSS_RATING_DELTA
              : drawRating(percentCorrect);

      const reward = await this.usersService.applyGameRewards(
        participant.userId,
        {
          xpEarned,
          coinsEarned,
          outcome,
          ratingDelta,
          cappedWin: outcome === 'win',
        },
      );

      // Persisted so the completed-duel screen can show exactly what was
      // applied (the daily win cap can zero `ratingDelta` out).
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
      xpEarned: p.xpEarned,
      coinsEarned: p.coinsEarned,
      ratingDelta: p.ratingDelta,
      ratingCapped: p.ratingCapped,
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
      question: toPublicQuestion(myAnswer.question, myAnswer.shuffledOptions),
      secondsRemaining,
      youAnswered,
      opponentAnswered,
      roundResolved,
      reveal: roundResolved
        ? {
            correctIndex: myAnswer.shuffledCorrectIndex,
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
