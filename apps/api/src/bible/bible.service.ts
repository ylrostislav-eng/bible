import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BibleChapterResponse } from '@bible-arena/shared';
import { BIBLE_BOOKS } from '@bible-arena/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BibleService {
  constructor(private readonly prisma: PrismaService) {}

  async getChapter(
    bookId: number,
    chapter: number,
  ): Promise<BibleChapterResponse> {
    const book = BIBLE_BOOKS.find((b) => b.id === bookId);
    if (!book) {
      throw new BadRequestException('Unknown book id');
    }
    if (chapter < 1 || chapter > book.chapters) {
      throw new BadRequestException('Chapter out of range for this book');
    }

    const rows = await this.prisma.bibleVerse.findMany({
      where: { bookId, chapter },
      orderBy: { verse: 'asc' },
    });

    if (rows.length === 0) {
      throw new NotFoundException('Chapter text not found');
    }

    return {
      bookId: book.id,
      bookName: book.name,
      testament: book.testament,
      chapter,
      totalChapters: book.chapters,
      verses: rows.map((row) => ({ verse: row.verse, text: row.text })),
    };
  }
}
