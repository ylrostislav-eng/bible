import { PrismaClient } from '@prisma/client';
import { BIBLE_BOOKS } from '@bible-arena/shared';
import { james } from './chapter-questions/james';
import type { BookQuestionSeed } from './chapter-questions/types';

const prisma = new PrismaClient();

/**
 * Comprehension questions tied to a specific chapter, used by the
 * "Проверка" button in the reader — one module per book (see
 * `chapter-questions/`). Each question is seeded twice: into
 * `ChapterQuestion` (the per-chapter check) and into `Question` (the
 * free-form trivia bank used by solo games and duels, tagged with
 * `source: "chapter-check:<bookId>"` so re-running this script only ever
 * touches rows it created, never the hand-written trivia bank from
 * `seed.ts`).
 */
const books: BookQuestionSeed[] = [james];

function sourceTag(bookId: number): string {
  return `chapter-check:${bookId}`;
}

async function main() {
  const bookIds = books.map((b) => b.bookId);

  await prisma.chapterQuestion.deleteMany({
    where: { bookId: { in: bookIds } },
  });
  await prisma.question.deleteMany({
    where: { source: { in: bookIds.map(sourceTag) } },
  });

  let totalQuestions = 0;

  for (const book of books) {
    const meta = BIBLE_BOOKS.find((b) => b.id === book.bookId);
    if (!meta) {
      throw new Error(
        `Unknown bookId ${book.bookId} in chapter-questions seed`,
      );
    }

    await prisma.chapterQuestion.createMany({
      data: book.questions.map((q) => ({
        bookId: book.bookId,
        chapter: q.chapter,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      })),
    });

    await prisma.question.createMany({
      data: book.questions.map((q) => ({
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        testament: meta.testament,
        book: meta.name,
        chapter: q.chapter,
        verses: q.verses,
        topic: meta.name,
        difficulty: 'MEDIUM',
        status: 'APPROVED',
        source: sourceTag(book.bookId),
      })),
    });

    totalQuestions += book.questions.length;
  }

  console.log(
    `Seeded ${totalQuestions} chapter questions (into ChapterQuestion and the solo/duel Question bank) for ${books.length} book(s): ${books
      .map((b) => BIBLE_BOOKS.find((meta) => meta.id === b.bookId)?.name)
      .join(', ')}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
