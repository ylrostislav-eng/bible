import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ALIAS_CATEGORY_LABELS,
  ALIAS_DIFFICULTY_LABELS,
  BIBLE_BOOKS,
  CONTENT_ACCEPTS_MAX,
  CONTENT_DUPLICATE_OPTION_MESSAGE,
  CONTENT_EMPTY_OPTION_MESSAGE,
  CONTENT_EXPLANATION_MAX,
  CONTENT_GLOSS_MAX,
  CONTENT_OPTION_MAX,
  CONTENT_REF_INCOMPLETE_MESSAGE,
  CONTENT_TEXT_MAX,
  CONTENT_WORD_MAX,
  DIFFICULTY_NAMES,
  QUESTION_OPTIONS_COUNT,
  type AliasWordContent,
  type AliasWordPatch,
  type ChapterQuestionContent,
  type ChapterQuestionPatch,
  type ContentItem,
  type ContentKind,
  type ContentListResponse,
  type ContentRow,
  type GameQuestionContent,
  type GameQuestionPatch,
} from '@bible-arena/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Столько строк отдаём в списке: на телефоне больше и не пролистывают, а
 * кому нужен конкретный вопрос — у того есть поиск. */
const PAGE_SIZE = 40;

/**
 * Правка содержимого игры: вопросы, ответы, слова.
 *
 * ## Что здесь важнее всего
 *
 * **Проверять то, что ломает игру, а не то, что некрасиво.** Вопрос с
 * тремя вариантами вместо четырёх или с `correctIndex`, показывающим в
 * пустоту, — это партия, которая не доигрывается; опечатка в пояснении —
 * нет. Поэтому проверок ровно четыре вида: четыре непустых варианта, без
 * повторов, верный ответ внутри списка, непустой текст.
 *
 * **Правка приходит частями.** Клиент шлёт только изменённые поля, а не
 * карточку целиком: две вкладки, открытые на одном вопросе, иначе затирали
 * бы работу друг друга целиком, а так — только по тому полю, которое
 * правили оба.
 *
 * **Что изменилось — в журнал словами.** «Правка вопроса» не отвечает ни
 * на один вопрос через месяц; «текст, вариант 2, верный ответ» — отвечает.
 */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- список ----

  async list(params: {
    kind: ContentKind;
    query: string;
    bookId?: number;
    chapter?: number;
  }): Promise<ContentListResponse> {
    const query = params.query.trim();

    if (params.kind === 'GAME_QUESTION') {
      const where: Prisma.QuestionWhereInput = query
        ? {
            OR: [
              { text: { contains: query, mode: 'insensitive' } },
              { book: { contains: query, mode: 'insensitive' } },
              { topic: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {};
      const [rows, total] = await Promise.all([
        this.prisma.question.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: PAGE_SIZE + 1,
        }),
        this.prisma.question.count({ where }),
      ]);
      return this.page(
        rows.map((q): ContentRow => ({
          id: q.id,
          kind: 'GAME_QUESTION',
          title: q.text,
          subtitle: [
            q.book,
            q.chapter ? `гл. ${q.chapter}` : null,
            DIFFICULTY_NAMES[q.difficulty],
            q.errorCount > 0 ? `ошибок ${q.errorCount}/${q.usageCount}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          draft: q.status === 'DRAFT',
        })),
        total,
      );
    }

    if (params.kind === 'CHAPTER_QUESTION') {
      const where: Prisma.ChapterQuestionWhereInput = {
        ...(query ? { text: { contains: query, mode: 'insensitive' } } : {}),
        ...(params.bookId ? { bookId: params.bookId } : {}),
        ...(params.chapter ? { chapter: params.chapter } : {}),
      };
      const [rows, total] = await Promise.all([
        this.prisma.chapterQuestion.findMany({
          where,
          orderBy: [{ bookId: 'asc' }, { chapter: 'asc' }, { id: 'asc' }],
          take: PAGE_SIZE + 1,
        }),
        this.prisma.chapterQuestion.count({ where }),
      ]);
      return this.page(
        rows.map((q): ContentRow => ({
          id: q.id,
          kind: 'CHAPTER_QUESTION',
          title: q.text,
          subtitle: `${bookName(q.bookId)} ${q.chapter}`,
          draft: false,
        })),
        total,
      );
    }

    const where: Prisma.AliasWordWhereInput = query
      ? {
          OR: [
            { word: { contains: query, mode: 'insensitive' } },
            { gloss: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.aliasWord.findMany({
        where,
        orderBy: { word: 'asc' },
        take: PAGE_SIZE + 1,
      }),
      this.prisma.aliasWord.count({ where }),
    ]);
    return this.page(
      rows.map((w): ContentRow => ({
        id: w.id,
        kind: 'ALIAS_WORD',
        title: w.word,
        // Подписи по-русски: строку списка читают глазами, а
        // `MEDIUM · PERSON · OLD` читается только тем, кто помнит
        // перечисления базы наизусть.
        subtitle: [
          ALIAS_DIFFICULTY_LABELS[w.difficulty],
          ALIAS_CATEGORY_LABELS[w.category],
          w.testament === 'OLD'
            ? 'Ветхий'
            : w.testament === 'NEW'
              ? 'Новый'
              : 'Оба завета',
        ].join(' · '),
        draft: false,
      })),
      total,
    );
  }

  // ---- одна карточка ----

  async item(kind: ContentKind, id: string): Promise<ContentItem> {
    if (kind === 'GAME_QUESTION') {
      const q = await this.prisma.question.findUnique({ where: { id } });
      if (!q) throw new NotFoundException('Вопрос не найден');
      return {
        kind: 'GAME_QUESTION',
        id: q.id,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        testament: q.testament,
        book: q.book,
        chapter: q.chapter,
        verses: q.verses,
        topic: q.topic,
        difficulty: q.difficulty,
        draft: q.status === 'DRAFT',
        usageCount: q.usageCount,
        errorCount: q.errorCount,
        updatedAt: q.updatedAt.toISOString(),
      } satisfies GameQuestionContent;
    }

    if (kind === 'CHAPTER_QUESTION') {
      const q = await this.prisma.chapterQuestion.findUnique({ where: { id } });
      if (!q) throw new NotFoundException('Вопрос не найден');
      return {
        kind: 'CHAPTER_QUESTION',
        id: q.id,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        bookId: q.bookId,
        chapter: q.chapter,
        updatedAt: q.updatedAt.toISOString(),
      } satisfies ChapterQuestionContent;
    }

    const w = await this.prisma.aliasWord.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('Слово не найдено');
    return {
      kind: 'ALIAS_WORD',
      id: w.id,
      word: w.word,
      gloss: w.gloss,
      accepts: w.accepts,
      difficulty: w.difficulty,
      category: w.category,
      testament: w.testament,
      refBookId: w.refBookId,
      refChapter: w.refChapter,
      refVerse: w.refVerse,
      updatedAt: w.updatedAt.toISOString(),
    } satisfies AliasWordContent;
  }

  // ---- правка ----

  /**
   * Возвращает обновлённую карточку и список изменённых полей — второе
   * нужно журналу. Считать «что изменилось» здесь, а не в вызывающем
   * коде: только здесь рядом лежат и старое значение, и новое.
   */
  async update(
    kind: ContentKind,
    id: string,
    patch: GameQuestionPatch | ChapterQuestionPatch | AliasWordPatch,
  ): Promise<{ item: ContentItem; changed: string[] }> {
    const before = await this.item(kind, id);

    if (kind === 'GAME_QUESTION') {
      const p = patch as GameQuestionPatch;
      const current = before as GameQuestionContent;
      // Завет у вопроса — только два: «BOTH» есть у слов Alias и в
      // вопросе означал бы завет, которого в перечислении базы нет.
      if (p.testament && !['OLD', 'NEW'].includes(p.testament)) {
        throw new BadRequestException('У вопроса завет — Ветхий или Новый');
      }
      const options = p.options ?? current.options;
      const correctIndex = p.correctIndex ?? current.correctIndex;
      this.assertQuestionShape(
        p.text ?? current.text,
        options,
        correctIndex,
        p.explanation,
      );

      await this.prisma.question.update({
        where: { id },
        data: {
          text: p.text?.trim(),
          options: p.options ? options.map((o) => o.trim()) : undefined,
          correctIndex: p.correctIndex,
          explanation: p.explanation?.trim(),
          testament: p.testament,
          book: p.book?.trim(),
          chapter: p.chapter,
          verses:
            p.verses === undefined ? undefined : (p.verses?.trim() ?? null),
          topic: p.topic === undefined ? undefined : (p.topic?.trim() ?? null),
          difficulty: p.difficulty,
          status:
            p.draft === undefined ? undefined : p.draft ? 'DRAFT' : 'APPROVED',
        },
      });
    } else if (kind === 'CHAPTER_QUESTION') {
      const p = patch as ChapterQuestionPatch;
      const current = before as ChapterQuestionContent;
      const options = p.options ?? current.options;
      const correctIndex = p.correctIndex ?? current.correctIndex;
      this.assertQuestionShape(
        p.text ?? current.text,
        options,
        correctIndex,
        p.explanation,
      );
      if (p.bookId !== undefined) this.assertBook(p.bookId);

      await this.prisma.chapterQuestion.update({
        where: { id },
        data: {
          text: p.text?.trim(),
          options: p.options ? options.map((o) => o.trim()) : undefined,
          correctIndex: p.correctIndex,
          explanation: p.explanation?.trim(),
          bookId: p.bookId,
          chapter: p.chapter,
        },
      });
    } else {
      const p = patch as AliasWordPatch;
      const current = before as AliasWordContent;
      this.assertWordShape({
        word: p.word ?? current.word,
        gloss: p.gloss ?? current.gloss,
        accepts: p.accepts ?? current.accepts,
        refBookId: p.refBookId === undefined ? current.refBookId : p.refBookId,
        refChapter:
          p.refChapter === undefined ? current.refChapter : p.refChapter,
        refVerse: p.refVerse === undefined ? current.refVerse : p.refVerse,
      });

      try {
        await this.prisma.aliasWord.update({
          where: { id },
          data: {
            word: p.word?.trim(),
            gloss: p.gloss?.trim(),
            accepts: p.accepts?.map((a) => a.trim()).filter(Boolean),
            difficulty: p.difficulty,
            category: p.category,
            testament: p.testament,
            refBookId: p.refBookId,
            refChapter: p.refChapter,
            refVerse: p.refVerse,
          },
        });
      } catch (error) {
        // Слово уникально в базе; без этой ветки правящий получил бы сырую
        // ошибку ограничения вместо внятного «такое слово уже есть».
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Такое слово уже есть в колоде');
        }
        throw error;
      }
    }

    const item = await this.item(kind, id);
    return { item, changed: changedFields(before, item) };
  }

  async create(
    kind: ContentKind,
    patch: GameQuestionPatch | ChapterQuestionPatch | AliasWordPatch,
  ): Promise<ContentItem> {
    if (kind === 'GAME_QUESTION') {
      const p = patch as GameQuestionPatch;
      const options = p.options ?? [];
      this.assertQuestionShape(
        p.text ?? '',
        options,
        p.correctIndex ?? 0,
        p.explanation,
      );
      if (!p.book?.trim()) {
        throw new BadRequestException('Укажите книгу');
      }
      const created = await this.prisma.question.create({
        data: {
          text: (p.text ?? '').trim(),
          options: options.map((o) => o.trim()),
          correctIndex: p.correctIndex ?? 0,
          explanation: (p.explanation ?? '').trim(),
          testament: p.testament ?? 'OLD',
          book: p.book.trim(),
          chapter: p.chapter ?? null,
          verses: p.verses?.trim() ?? null,
          topic: p.topic?.trim() ?? null,
          difficulty: p.difficulty ?? 'MEDIUM',
          // Новый вопрос заводится черновиком: он ещё никем не прочитан, а
          // попасть в чужую партию с опечаткой — хуже, чем полежать до
          // проверки. Публикуется одним переключателем в той же форме.
          status: 'DRAFT',
        },
      });
      return this.item(kind, created.id);
    }

    if (kind === 'CHAPTER_QUESTION') {
      const p = patch as ChapterQuestionPatch;
      const options = p.options ?? [];
      this.assertQuestionShape(
        p.text ?? '',
        options,
        p.correctIndex ?? 0,
        p.explanation,
      );
      this.assertBook(p.bookId ?? 0);
      if (!p.chapter || p.chapter < 1) {
        throw new BadRequestException('Укажите главу');
      }
      const created = await this.prisma.chapterQuestion.create({
        data: {
          text: (p.text ?? '').trim(),
          options: options.map((o) => o.trim()),
          correctIndex: p.correctIndex ?? 0,
          explanation: (p.explanation ?? '').trim(),
          bookId: p.bookId!,
          chapter: p.chapter,
        },
      });
      return this.item(kind, created.id);
    }

    const p = patch as AliasWordPatch;
    this.assertWordShape({
      word: p.word ?? '',
      gloss: p.gloss ?? '',
      accepts: p.accepts ?? [],
      refBookId: p.refBookId ?? null,
      refChapter: p.refChapter ?? null,
      refVerse: p.refVerse ?? null,
    });
    try {
      const created = await this.prisma.aliasWord.create({
        data: {
          word: (p.word ?? '').trim(),
          gloss: (p.gloss ?? '').trim(),
          accepts: (p.accepts ?? []).map((a) => a.trim()).filter(Boolean),
          difficulty: p.difficulty ?? 'MEDIUM',
          category: p.category ?? 'CONCEPT',
          testament: p.testament ?? 'BOTH',
          refBookId: p.refBookId ?? null,
          refChapter: p.refChapter ?? null,
          refVerse: p.refVerse ?? null,
        },
      });
      return this.item(kind, created.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Такое слово уже есть в колоде');
      }
      throw error;
    }
  }

  /**
   * Удаление — необратимое, поэтому доступно только гейм-мастеру (охрана
   * на маршруте). Вопрос игры при этом лучше не удалять, а отправить в
   * черновик: на него уже ссылаются ответы сыгранных партий, и вместе с
   * ним исчезнет кусок чужой истории. Черновик из выдачи исключён — тот же
   * итог без потерь.
   */
  async remove(kind: ContentKind, id: string): Promise<{ title: string }> {
    const item = await this.item(kind, id);
    const title = item.kind === 'ALIAS_WORD' ? item.word : item.text;

    if (kind === 'GAME_QUESTION') {
      await this.prisma.question.update({
        where: { id },
        data: { status: 'DRAFT' },
      });
      return { title };
    }
    if (kind === 'CHAPTER_QUESTION') {
      await this.prisma.chapterQuestion.delete({ where: { id } });
      return { title };
    }
    await this.prisma.aliasWord.delete({ where: { id } });
    return { title };
  }

  // ---- проверки ----

  private assertQuestionShape(
    text: string,
    options: string[],
    correctIndex: number,
    explanation?: string,
  ): void {
    if (
      explanation !== undefined &&
      explanation.length > CONTENT_EXPLANATION_MAX
    ) {
      throw new BadRequestException('Слишком длинное пояснение');
    }
    if (!text.trim())
      throw new BadRequestException('Вопрос не может быть пустым');
    if (text.length > CONTENT_TEXT_MAX) {
      throw new BadRequestException('Слишком длинный вопрос');
    }
    if (options.length !== QUESTION_OPTIONS_COUNT) {
      throw new BadRequestException(
        `Вариантов должно быть ровно ${QUESTION_OPTIONS_COUNT}`,
      );
    }
    const trimmed = options.map((o) => o.trim());
    if (trimmed.some((o) => !o)) {
      throw new BadRequestException(CONTENT_EMPTY_OPTION_MESSAGE);
    }
    if (trimmed.some((o) => o.length > CONTENT_OPTION_MAX)) {
      throw new BadRequestException('Слишком длинный вариант ответа');
    }
    // Сравнение без регистра: «Моисей» и «моисей» — один и тот же вариант
    // для игрока, и выбор между ними был бы лотереей.
    const lowered = trimmed.map((o) => o.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      throw new BadRequestException(CONTENT_DUPLICATE_OPTION_MESSAGE);
    }
    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= QUESTION_OPTIONS_COUNT
    ) {
      throw new BadRequestException('Отметьте верный вариант');
    }
  }

  private assertWordShape(word: {
    word: string;
    gloss: string;
    accepts: string[];
    refBookId: number | null;
    refChapter: number | null;
    refVerse: number | null;
  }): void {
    if (!word.word.trim())
      throw new BadRequestException('Слово не может быть пустым');
    if (word.word.length > CONTENT_WORD_MAX) {
      throw new BadRequestException('Слишком длинное слово');
    }
    if (!word.gloss.trim()) {
      throw new BadRequestException('Нужно пояснение — по нему угадывают');
    }
    if (word.gloss.length > CONTENT_GLOSS_MAX) {
      throw new BadRequestException('Слишком длинное пояснение');
    }
    if (word.accepts.length > CONTENT_ACCEPTS_MAX) {
      throw new BadRequestException('Слишком много принимаемых вариантов');
    }

    // Место в Писании — либо целиком, либо никак: половина ссылки не
    // ведёт никуда, а переход в читалку строится по всем трём числам.
    const parts = [word.refBookId, word.refChapter, word.refVerse];
    const filled = parts.filter((p) => p !== null && p !== undefined).length;
    if (filled !== 0 && filled !== 3) {
      throw new BadRequestException(CONTENT_REF_INCOMPLETE_MESSAGE);
    }
    if (word.refBookId !== null) this.assertBook(word.refBookId);
  }

  private assertBook(bookId: number): void {
    if (!BIBLE_BOOKS.some((b) => b.id === bookId)) {
      throw new BadRequestException('Такой книги нет');
    }
  }

  private page(rows: ContentRow[], total: number): ContentListResponse {
    return {
      items: rows.slice(0, PAGE_SIZE),
      truncated: rows.length > PAGE_SIZE,
      total,
    };
  }
}

function bookName(bookId: number): string {
  return BIBLE_BOOKS.find((b) => b.id === bookId)?.name ?? `книга ${bookId}`;
}

/**
 * Что именно поменялось — человеческими словами для журнала.
 *
 * Сравниваются готовые карточки «до» и «после», а не присланная правка: в
 * правке может лежать то же значение, что и было (клиент прислал поле, не
 * меняя его), и запись «правил текст» оказалась бы неправдой.
 */
function changedFields(before: ContentItem, after: ContentItem): string[] {
  const names: Record<string, string> = {
    text: 'текст',
    options: 'варианты',
    correctIndex: 'верный ответ',
    explanation: 'пояснение',
    testament: 'завет',
    book: 'книга',
    chapter: 'глава',
    bookId: 'книга',
    verses: 'стихи',
    topic: 'тема',
    difficulty: 'сложность',
    draft: 'черновик',
    word: 'слово',
    gloss: 'пояснение',
    accepts: 'принимаемые ответы',
    category: 'вид',
    refBookId: 'место в Писании',
    refChapter: 'место в Писании',
    refVerse: 'место в Писании',
  };

  const changed = new Set<string>();
  for (const key of Object.keys(names)) {
    const a = (before as unknown as Record<string, unknown>)[key];
    const b = (after as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.add(names[key]);
  }
  return [...changed];
}
