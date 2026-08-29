import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  StartChapterCheckResponse,
  SubmitChapterCheckAnswerResult,
} from '@bible-arena/shared';
import { BIBLE_BOOKS } from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { StartChapterCheckDto } from './dto/start-chapter-check.dto';
import type { SubmitChapterCheckAnswerDto } from './dto/submit-chapter-check-answer.dto';
import { toPublicChapterQuestion } from './learn.mapper';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

@Injectable()
export class LearnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async startCheck(
    userId: string,
    dto: StartChapterCheckDto,
  ): Promise<StartChapterCheckResponse> {
    const book = BIBLE_BOOKS.find((b) => b.id === dto.bookId);
    if (!book) {
      throw new BadRequestException('Unknown book id');
    }
    if (dto.chapter < 1 || dto.chapter > book.chapters) {
      throw new BadRequestException('Chapter out of range for this book');
    }

    const questions = await this.prisma.chapterQuestion.findMany({
      where: { bookId: dto.bookId, chapter: dto.chapter },
    });
    if (questions.length === 0) {
      throw new NotFoundException(
        'Для этой главы пока нет проверочных вопросов',
      );
    }

    const shuffled = shuffle(questions);

    const session = await this.prisma.chapterCheckSession.create({
      data: {
        userId,
        bookId: dto.bookId,
        chapter: dto.chapter,
        totalQuestions: shuffled.length,
        currentQuestionStartedAt: new Date(),
      },
    });

    await this.prisma.chapterCheckAnswer.createMany({
      data: shuffled.map((question, index) => ({
        sessionId: session.id,
        questionId: question.id,
        order: index,
      })),
    });

    return {
      sessionId: session.id,
      bookId: dto.bookId,
      chapter: dto.chapter,
      totalQuestions: shuffled.length,
      questionNumber: 1,
      question: toPublicChapterQuestion(shuffled[0]),
      timeLimitSeconds: session.timeLimitSeconds,
    };
  }

  async submitAnswer(
    userId: string,
    sessionId: string,
    dto: SubmitChapterCheckAnswerDto,
  ): Promise<SubmitChapterCheckAnswerResult> {
    const session = await this.prisma.chapterCheckSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Проверка не найдена');
    }
    if (session.completedAt) {
      throw new ConflictException('Проверка уже завершена');
    }

    const answers = await this.prisma.chapterCheckAnswer.findMany({
      where: { sessionId },
      include: { question: true },
      orderBy: { order: 'asc' },
    });

    const current = answers.find((a) => !a.answered);
    if (!current) {
      throw new ConflictException('Проверка уже завершена');
    }
    if (current.questionId !== dto.questionId) {
      throw new ConflictException('Это не текущий вопрос проверки');
    }

    const startedAt = session.currentQuestionStartedAt ?? session.createdAt;
    const timeTakenMs = Math.max(0, Date.now() - startedAt.getTime());
    const timeExpired = timeTakenMs > session.timeLimitSeconds * 1000;
    const isCorrect =
      !timeExpired &&
      dto.answerIndex !== undefined &&
      dto.answerIndex === current.question.correctIndex;

    await this.prisma.chapterCheckAnswer.update({
      where: { id: current.id },
      data: {
        answered: true,
        selectedIndex: dto.answerIndex ?? null,
        correct: isCorrect,
        timeExpired,
        timeTakenMs,
      },
    });

    const correctCount = await this.prisma.chapterCheckAnswer.count({
      where: { sessionId, correct: true },
    });
    const answeredCount = current.order + 1;
    const finished = answeredCount >= session.totalQuestions;

    if (finished) {
      const rewards = await this.usersService.applyChapterCheckRewards(userId, {
        correctCount,
      });
      await this.prisma.chapterCheckSession.update({
        where: { id: sessionId },
        data: { correctCount, completedAt: new Date() },
      });

      return {
        correct: isCorrect,
        correctIndex: current.question.correctIndex,
        explanation: current.question.explanation,
        timeExpired,
        correctCount,
        questionNumber: answeredCount,
        nextQuestion: null,
        finished: true,
        summary: {
          correctCount,
          totalQuestions: session.totalQuestions,
          ratingEarned: rewards.ratingEarned,
          xpEarned: rewards.xpEarned,
          coinsEarned: rewards.coinsEarned,
          streak: rewards.streak,
        },
      };
    }

    await this.prisma.chapterCheckSession.update({
      where: { id: sessionId },
      data: { currentQuestionStartedAt: new Date() },
    });

    const next = answers[answeredCount];

    return {
      correct: isCorrect,
      correctIndex: current.question.correctIndex,
      explanation: current.question.explanation,
      timeExpired,
      correctCount,
      questionNumber: answeredCount,
      nextQuestion: toPublicChapterQuestion(next.question),
      finished: false,
      summary: null,
    };
  }
}
