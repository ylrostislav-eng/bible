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

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

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
