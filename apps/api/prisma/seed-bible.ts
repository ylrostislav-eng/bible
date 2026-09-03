import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RawVerse {
  VerseId: number;
  Text: string;
}
interface RawChapter {
  ChapterId: number;
  Verses: RawVerse[];
}
interface RawBook {
  BookId: number;
  BookName: string;
  Chapters: RawChapter[];
}
interface RawBible {
  Translation: string;
  Books: RawBook[];
}

/**
 * The source gist has a book-labelling bug (BookName is rotated for a
 * range of epistles) but the BookId -> Chapters/Verses content is in the
 * correct canonical order (verified against standard chapter counts for
 * all 66 books). We only use BookId + the actual text; book names/order
 * come from BIBLE_BOOKS in packages/shared, not from this file.
 *
 * Also fixes ~700 spots where a space is missing before a capitalized
 * word (a stripped-marker artifact from the source conversion) — this
 * only inserts whitespace, it never changes any word.
 */
function cleanText(text: string): string {
  return text.replace(/([а-яё])([А-ЯЁ])/g, '$1 $2');
}

async function main() {
  const raw: RawBible = JSON.parse(
    readFileSync(join(__dirname, 'rst.json'), 'utf8'),
  );

  const rows: {
    bookId: number;
    chapter: number;
    verse: number;
    text: string;
  }[] = [];
  for (const book of raw.Books) {
    for (const chapter of book.Chapters) {
      for (const verse of chapter.Verses) {
        rows.push({
          bookId: book.BookId,
          chapter: chapter.ChapterId,
          verse: verse.VerseId,
          text: cleanText(verse.Text),
        });
      }
    }
  }

  // Текст уже на месте — выходим. Иначе `prisma:seed-all` после каждого
  // `git pull` перезаливал бы тридцать тысяч строк только чтобы получить
  // ровно то же самое. Перезалить принудительно: `--force`.
  const force = process.argv.includes('--force');
  const existing = await prisma.bibleVerse.count();
  if (existing === rows.length && !force) {
    console.log(`Текст уже загружен (${existing} стихов) — пропускаем.`);
    return;
  }

  console.log(
    existing > 0
      ? `Parsed ${rows.length} verses. Replacing ${existing} existing bible_verses...`
      : `Parsed ${rows.length} verses. Inserting...`,
  );
  await prisma.bibleVerse.deleteMany({});

  const BATCH_SIZE = 2000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.bibleVerse.createMany({ data: batch });
    console.log(
      `Inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`,
    );
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
