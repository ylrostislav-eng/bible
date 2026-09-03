import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  GameQuestion,
  StartSoloGameResponse,
  SubmitAnswerResult,
} from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { StartSoloGameDto } from './dto/start-solo-game.dto';
import type { SubmitAnswerDto } from './dto/submit-answer.dto';
import { toPublicQuestion } from './game.mapper';
import { QuestionsService, shuffleOptions } from './questions.service';

export const XP_PER_CORRECT_ANSWER = 5;
export const COINS_PER_CORRECT_ANSWER = 2;
export const SCORE_PER_CORRECT_ANSWER = 10;

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly usersService: UsersService,
  ) {}

  async startSolo(
    userId: string,
    dto: StartSoloGameDto,
  ): Promise<StartSoloGameResponse> {
    const questions = await this.questionsService.pickRandom({
      count: dto.questionCount,
      testament: dto.testament,
      difficulty: dto.difficulty,
    });

    const session = await this.prisma.gameSession.create({
      data: {
        mode: 'SOLO',
        questionCount: questions.length,
        participants: { create: { userId } },
      },
      include: { participants: true },
    });
    const participant = session.participants[0];

    const shuffledPerQuestion = questions.map((question) => ({
      question,
      ...shuffleOptions(question),
    }));

    await this.prisma.gameAnswer.createMany({
      data: shuffledPerQuestion.map((item, index) => ({
        sessionId: session.id,
        participantId: participant.id,
        questionId: item.question.id,
        order: index,
        shuffledOptions: item.options,
        shuffledCorrectIndex: item.correctIndex,
      })),
    });

    await this.questionsService.markUsed(questions.map((q) => q.id));

    return {
      sessionId: session.id,
      totalQuestions: questions.length,
      questionNumber: 1,
      question: toPublicQuestion(
        shuffledPerQuestion[0].question,
        shuffledPerQuestion[0].options,
      ),
    };
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: SubmitAnswerDto,
  ): Promise<SubmitAnswerResult> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: {
            answers: { include: { question: true }, orderBy: { order: 'asc' } },
          },
        },
      },
    });

    if (!session || session.mode !== 'SOLO') {
      throw new NotFoundException('Игровая сессия не найдена');
    }
    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new NotFoundException('Игровая сессия не найдена');
    }
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Игра уже завершена');
    }

    const currentAnswer = participant.answers.find(
      (answer) => answer.answeredAt === null,
    );
    if (!currentAnswer) {
      throw new ConflictException('На все вопросы уже дан ответ');
    }
    if (currentAnswer.questionId !== dto.questionId) {
      throw new ConflictException('Это не текущий вопрос сессии');
    }

    const { question } = currentAnswer;
    const isCorrect = dto.answerIndex === currentAnswer.shuffledCorrectIndex;

    await this.prisma.gameAnswer.update({
      where: { id: currentAnswer.id },
      data: {
        selectedIndex: dto.answerIndex,
        isCorrect,
        answeredAt: new Date(),
        timeTakenMs: dto.timeTakenMs,
      },
    });

    if (!isCorrect) {
      await this.questionsService.markMistake(question.id);
    }

    const questionNumber = currentAnswer.order + 1;
    const correctCount = participant.correctCount + (isCorrect ? 1 : 0);
    const finished = questionNumber >= session.questionCount;

    let nextQuestion: GameQuestion | null = null;
    if (!finished) {
      const next = participant.answers.find(
        (answer) => answer.order === questionNumber,
      );
      nextQuestion = next
        ? toPublicQuestion(next.question, next.shuffledOptions)
        : null;
    }

    const result: SubmitAnswerResult = {
      correct: isCorrect,
      correctIndex: currentAnswer.shuffledCorrectIndex,
      explanation: question.explanation,
      book: question.book,
      chapter: question.chapter,
      verses: question.verses,
      correctCount,
      totalQuestions: session.questionCount,
      finished,
      questionNumber,
      nextQuestion,
    };

    const scoreIncrement = isCorrect ? SCORE_PER_CORRECT_ANSWER : 0;

    if (!finished) {
      await this.prisma.gameParticipant.update({
        where: { id: participant.id },
        data: { correctCount, score: { increment: scoreIncrement } },
      });
      return result;
    }

    const xpEarned = correctCount * XP_PER_CORRECT_ANSWER;
    const coinsEarned = correctCount * COINS_PER_CORRECT_ANSWER;

    await this.prisma.$transaction([
      this.prisma.gameParticipant.update({
        where: { id: participant.id },
        data: {
          correctCount,
          score: { increment: scoreIncrement },
          xpEarned,
          coinsEarned,
        },
      }),
      this.prisma.gameSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      }),
    ]);

    const { user, leveledUp, streak } =
      await this.usersService.applyGameRewards(userId, {
        xpEarned,
        coinsEarned,
      });

    return {
      ...result,
      summary: {
        sessionId: session.id,
        totalQuestions: session.questionCount,
        correctCount,
        score: participant.score + scoreIncrement,
        xpEarned,
        coinsEarned,
        leveledUp,
        level: user.level,
        streak,
      },
    };
  }
}
