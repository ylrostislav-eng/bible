import type { ChapterCheckQuestion } from '@bible-arena/shared';
import type { ChapterQuestion } from '@prisma/client';

export function toPublicChapterQuestion(
  question: ChapterQuestion,
): ChapterCheckQuestion {
  return {
    id: question.id,
    text: question.text,
    options: question.options,
  };
}
