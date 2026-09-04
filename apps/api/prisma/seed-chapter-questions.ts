import { PrismaClient } from '@prisma/client';
import { BIBLE_BOOKS } from '@bible-arena/shared';
import { acts } from './chapter-questions/acts';
import { colossians } from './chapter-questions/colossians';
import { ephesians } from './chapter-questions/ephesians';
import { firstCorinthians } from './chapter-questions/first-corinthians';
import { firstJohn } from './chapter-questions/first-john';
import { firstPeter } from './chapter-questions/first-peter';
import { firstThessalonians } from './chapter-questions/first-thessalonians';
import { firstTimothy } from './chapter-questions/first-timothy';
import { galatians } from './chapter-questions/galatians';
import { hebrews } from './chapter-questions/hebrews';
import { james } from './chapter-questions/james';
import { john } from './chapter-questions/john';
import { jude } from './chapter-questions/jude';
import { luke } from './chapter-questions/luke';
import { mark } from './chapter-questions/mark';
import { matthew } from './chapter-questions/matthew';
import { philemon } from './chapter-questions/philemon';
import { philippians } from './chapter-questions/philippians';
import { revelation } from './chapter-questions/revelation';
import { romans } from './chapter-questions/romans';
import { secondCorinthians } from './chapter-questions/second-corinthians';
import { secondJohn } from './chapter-questions/second-john';
import { secondPeter } from './chapter-questions/second-peter';
import { secondThessalonians } from './chapter-questions/second-thessalonians';
import { secondTimothy } from './chapter-questions/second-timothy';
import { thirdJohn } from './chapter-questions/third-john';
import { titus } from './chapter-questions/titus';
import type { BookQuestionSeed } from './chapter-questions/types';
import { reportFailure } from './report-failure';

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
const books: BookQuestionSeed[] = [
  james,
  firstPeter,
  secondPeter,
  firstJohn,
  secondJohn,
  thirdJohn,
  jude,
  romans,
  firstCorinthians,
  secondCorinthians,
  galatians,
  ephesians,
  philippians,
  colossians,
  firstThessalonians,
  secondThessalonians,
  firstTimothy,
  secondTimothy,
  titus,
  philemon,
  hebrews,
  revelation,
  matthew,
  mark,
  luke,
  john,
  acts,
];

function sourceTag(bookId: number): string {
  return `chapter-check:${bookId}`;
}

async function main() {
  const bookIds = books.map((b) => b.bookId);

  await prisma.chapterQuestion.deleteMany({
    where: { bookId: { in: bookIds } },
  });

  // GameAnswer has no cascade to Question (a solo/duel answer shouldn't
  // silently vanish just because someone edited the trivia bank) — but
  // that means re-running this seed after anyone has actually played a
  // chapter-check-sourced question would otherwise fail on the FK. Since
  // these rows are wholly owned by this seed (tagged by `source`), clear
  // the dependent answers first so re-seeding stays idempotent.
  const taggedQuestionIds = (
    await prisma.question.findMany({
      where: { source: { in: bookIds.map(sourceTag) } },
      select: { id: true },
    })
  ).map((q) => q.id);
  await prisma.gameAnswer.deleteMany({
    where: { questionId: { in: taggedQuestionIds } },
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
  .catch(reportFailure)
  .finally(() => prisma.$disconnect());
