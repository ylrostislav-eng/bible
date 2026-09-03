import { Injectable, NotFoundException } from '@nestjs/common';
import type { Difficulty, Testament } from '@bible-arena/shared';
import type { Prisma, Question } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Shuffles one question's options and remaps `correctIndex` to match, so
 * the answer position can't be memorized (or, in a duel, called out to the
 * opponent) across attempts. */
export function shuffleOptions(question: Question): {
  options: string[];
  correctIndex: number;
} {
  const order = shuffle(question.options.map((_, i) => i));
  return {
    options: order.map((i) => question.options[i]),
    correctIndex: order.indexOf(question.correctIndex),
  };
}

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Total approved questions available for `pickRandom` — used to reject a
   * requested count up front (duel/room creation) rather than silently
   * handing back fewer questions than the players agreed on once the match
   * actually starts. */
  async countAvailable(): Promise<number> {
    return this.prisma.question.count({ where: { status: 'APPROVED' } });
  }

  async pickRandom(params: {
    count: number;
    testament?: Testament;
    difficulty?: Difficulty;
  }): Promise<Question[]> {
    const where: Prisma.QuestionWhereInput = {
      status: 'APPROVED',
      ...(params.testament && { testament: params.testament }),
      ...(params.difficulty && { difficulty: params.difficulty }),
    };

    const candidates = await this.prisma.question.findMany({ where });
    if (candidates.length === 0) {
      throw new NotFoundException('Не найдено вопросов по заданным критериям');
    }

    return shuffle(candidates).slice(
      0,
      Math.min(params.count, candidates.length),
    );
  }

  async markUsed(questionIds: string[]): Promise<void> {
    await this.prisma.question.updateMany({
      where: { id: { in: questionIds } },
      data: { usageCount: { increment: 1 } },
    });
  }

  async markMistake(questionId: string): Promise<void> {
    await this.prisma.question.update({
      where: { id: questionId },
      data: { errorCount: { increment: 1 } },
    });
  }
}
