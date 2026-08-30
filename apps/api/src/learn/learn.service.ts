import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChapterCheckQuestion,
  StartChapterCheckResponse,
  SubmitChapterCheckAnswerResult,
} from '@bible-arena/shared';
import { BIBLE_BOOKS } from '@bible-arena/shared';
import type { ChapterQuestion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CHAPTER_CHECK_COOLDOWN_DAYS,
  UsersService,
} from '../users/users.service';
import type { StartChapterCheckDto } from './dto/start-chapter-check.dto';
import type { SubmitChapterCheckAnswerDto } from './dto/submit-chapter-check-answer.dto';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Shuffles one question's options and remaps `correctIndex` to match, so
 * the answer position can't be memorized across attempts. */
function shuffleOptions(question: ChapterQuestion): {
  options: string[];
  correctIndex: number;
} {
  const order = shuffle([0, 1, 2, 3]);
  return {
    options: order.map((i) => question.options[i]),
    correctIndex: order.indexOf(question.correctIndex),
  };
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

    const order = shuffle(questions);
    const shuffledPerQuestion = order.map((question) => ({
      question,
      ...shuffleOptions(question),
    }));

    const session = await this.prisma.chapterCheckSession.create({
      data: {
        userId,
        bookId: dto.bookId,
        chapter: dto.chapter,
        totalQuestions: order.length,
        currentQuestionStartedAt: new Date(),
      },
    });

    await this.prisma.chapterCheckAnswer.createMany({
      data: shuffledPerQuestion.map((item, index) => ({
        sessionId: session.id,
        questionId: item.question.id,
        order: index,
        shuffledOptions: item.options,
        shuffledCorrectIndex: item.correctIndex,
      })),
    });

    return {
      sessionId: session.id,
      bookId: dto.bookId,
      chapter: dto.chapter,
      totalQuestions: order.length,
      questionNumber: 1,
      question: this.toPublicQuestion(
        shuffledPerQuestion[0].question,
        shuffledPerQuestion[0].options,
      ),
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
      dto.answerIndex === current.shuffledCorrectIndex;

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
      const wrongCount = session.totalQuestions - correctCount;
      const awardsPoints = await this.canAwardPoints(
        userId,
        session.bookId,
        session.chapter,
        sessionId,
      );

      const rewards = await this.usersService.applyChapterCheckRewards(userId, {
        correctCount,
        wrongCount,
        awardsPoints,
      });
      await this.prisma.chapterCheckSession.update({
        where: { id: sessionId },
        data: { correctCount, completedAt: new Date(), rewarded: awardsPoints },
      });

      return {
        correct: isCorrect,
        correctIndex: current.shuffledCorrectIndex,
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
          pointsAwarded: awardsPoints,
          streak: rewards.streak,
        },
      };
    }

    const next = answers[answeredCount];

    return {
      correct: isCorrect,
      correctIndex: current.shuffledCorrectIndex,
      explanation: current.question.explanation,
      timeExpired,
      correctCount,
      questionNumber: answeredCount,
      nextQuestion: this.toPublicQuestion(next.question, next.shuffledOptions),
      finished: false,
      summary: null,
    };
  }

  /**
   * Starts the clock for the next question. Deliberately separate from
   * `submitAnswer` — the client calls this only once the user has finished
   * reading the previous question's feedback and is actually looking at the
   * next one, so the timer doesn't burn down while they're still reading.
   */
  async advance(userId: string, sessionId: string): Promise<{ ok: true }> {
    const session = await this.prisma.chapterCheckSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Проверка не найдена');
    }
    if (session.completedAt) {
      throw new ConflictException('Проверка уже завершена');
    }

    await this.prisma.chapterCheckSession.update({
      where: { id: sessionId },
      data: { currentQuestionStartedAt: new Date() },
    });

    return { ok: true };
  }

  /** Points are awarded only if this chapter wasn't already rewarded for
   * this user within the cooldown window — otherwise it's a free replay. */
  private async canAwardPoints(
    userId: string,
    bookId: number,
    chapter: number,
    excludingSessionId: string,
  ): Promise<boolean> {
    const lastRewarded = await this.prisma.chapterCheckSession.findFirst({
      where: {
        userId,
        bookId,
        chapter,
        rewarded: true,
        id: { not: excludingSessionId },
      },
      orderBy: { completedAt: 'desc' },
    });
    if (!lastRewarded?.completedAt) {
      return true;
    }

    const cooldownMs = CHAPTER_CHECK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - lastRewarded.completedAt.getTime() >= cooldownMs;
  }

  private toPublicQuestion(
    question: ChapterQuestion,
    options: string[],
  ): ChapterCheckQuestion {
    return { id: question.id, text: question.text, options };
  }
}
