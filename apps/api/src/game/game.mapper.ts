import type { GameQuestion } from '@bible-arena/shared';
import type { Question } from '@prisma/client';

export function toPublicQuestion(
  question: Question,
  options: string[],
): GameQuestion {
  return {
    id: question.id,
    text: question.text,
    options,
    testament: question.testament,
    book: question.book,
    chapter: question.chapter,
    topic: question.topic,
    difficulty: question.difficulty,
  };
}
