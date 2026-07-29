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
import { QuestionsService } from './questions.service';

const XP_PER_CORRECT_ANSWER = 5;
const COINS_PER_CORRECT_ANSWER = 2;
const SCORE_PER_CORRECT_ANSWER = 10;

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
        userId,
        questionCount: questions.length,
        answers: {
          create: questions.map((question, index) => ({
            questionId: question.id,
            order: index,
          })),
        },
      },
    });

    await this.questionsService.markUsed(questions.map((q) => q.id));

    return {
      sessionId: session.id,
      totalQuestions: questions.length,
      questionNumber: 1,
      question: toPublicQuestion(questions[0]),
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
        answers: { include: { question: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Игровая сессия не найдена');
    }
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Игра уже завершена');
    }

    const currentAnswer = session.answers.find(
      (answer) => answer.answeredAt === null,
    );
    if (!currentAnswer) {
      throw new ConflictException('На все вопросы уже дан ответ');
    }
    if (currentAnswer.questionId !== dto.questionId) {
      throw new ConflictException('Это не текущий вопрос сессии');
    }

    const { question } = currentAnswer;
    const isCorrect = dto.answerIndex === question.correctIndex;

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
    const correctCount = session.correctCount + (isCorrect ? 1 : 0);
    const finished = questionNumber >= session.questionCount;

    let nextQuestion: GameQuestion | null = null;
    if (!finished) {
      const next = session.answers.find(
        (answer) => answer.order === questionNumber,
      );
      nextQuestion = next ? toPublicQuestion(next.question) : null;
    }

    const result: SubmitAnswerResult = {
      correct: isCorrect,
      correctIndex: question.correctIndex,
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

    if (!finished) {
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          correctCount,
          score: { increment: isCorrect ? SCORE_PER_CORRECT_ANSWER : 0 },
        },
      });
      return result;
    }

    const xpEarned = correctCount * XP_PER_CORRECT_ANSWER;
    const coinsEarned = correctCount * COINS_PER_CORRECT_ANSWER;

    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        correctCount,
        score: { increment: isCorrect ? SCORE_PER_CORRECT_ANSWER : 0 },
        status: 'COMPLETED',
        finishedAt: new Date(),
        xpEarned,
        coinsEarned,
      },
    });

    const { user, leveledUp } = await this.usersService.applyGameRewards(
      userId,
      {
        xpEarned,
        coinsEarned,
      },
    );

    return {
      ...result,
      summary: {
        sessionId: session.id,
        totalQuestions: session.questionCount,
        correctCount,
        score: session.score + (isCorrect ? SCORE_PER_CORRECT_ANSWER : 0),
        xpEarned,
        coinsEarned,
        leveledUp,
        level: user.level,
      },
    };
  }
}
