import { BadRequestException } from '@nestjs/common';
import { ContentService } from './content.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Проверки правки содержимого.
 *
 * Смысл этих проверок — не в аккуратности, а в том, что вопрос с тремя
 * вариантами или с верным ответом, показывающим в пустоту, ломает партию
 * у игрока, который к правке отношения не имеет. Поэтому каждое правило
 * проверяется по отдельности: в живой правке они складываются, и
 * сломанное легко спрятать за исправным.
 */
describe('Правка содержимого: что не пропускаем', () => {
  const QUESTION = {
    id: 'q1',
    text: 'Кто вывел народ из Египта?',
    options: ['Моисей', 'Аарон', 'Иисус Навин', 'Самуил'],
    correctIndex: 0,
    explanation: 'Исх. 12',
    testament: 'OLD' as const,
    book: 'Исход',
    chapter: 12,
    verses: null,
    topic: null,
    difficulty: 'MEDIUM' as const,
    status: 'APPROVED' as const,
    usageCount: 0,
    errorCount: 0,
    updatedAt: new Date(),
  };

  const WORD = {
    id: 'w1',
    word: 'Аарон',
    gloss: 'Брат Моисея',
    accepts: [],
    difficulty: 'MEDIUM' as const,
    category: 'PERSON' as const,
    testament: 'OLD' as const,
    refBookId: 2,
    refChapter: 28,
    refVerse: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function serviceWith() {
    const updates: unknown[] = [];
    const prisma = {
      question: {
        findUnique: jest.fn(() => Promise.resolve(QUESTION)),
        update: jest.fn((args: unknown) => {
          updates.push(args);
          return Promise.resolve(QUESTION);
        }),
      },
      chapterQuestion: {
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
      aliasWord: {
        findUnique: jest.fn(() => Promise.resolve(WORD)),
        update: jest.fn((args: unknown) => {
          updates.push(args);
          return Promise.resolve(WORD);
        }),
      },
    } as unknown as PrismaService;

    return { service: new ContentService(prisma), updates };
  }

  it('не пропускает три варианта вместо четырёх', async () => {
    const { service, updates } = serviceWith();
    await expect(
      service.update('GAME_QUESTION', 'q1', { options: ['а', 'б', 'в'] }),
    ).rejects.toThrow(BadRequestException);
    expect(updates).toHaveLength(0);
  });

  it('не пропускает пустой вариант', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('GAME_QUESTION', 'q1', { options: ['а', '  ', 'в', 'г'] }),
    ).rejects.toThrow(/Все четыре варианта/);
  });

  it('не пропускает повтор вариантов — даже в другом регистре', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('GAME_QUESTION', 'q1', {
        options: ['Моисей', 'моисей', 'в', 'г'],
      }),
    ).rejects.toThrow(/не должны повторяться/);
  });

  it('не пропускает пустой текст вопроса', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('GAME_QUESTION', 'q1', { text: '   ' }),
    ).rejects.toThrow(/пустым/);
  });

  it('не пропускает верный ответ за пределами списка', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('GAME_QUESTION', 'q1', { correctIndex: 7 }),
    ).rejects.toThrow(/верный вариант/);
  });

  it('не даёт вопросу завет «оба» — он бывает только у слов', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('GAME_QUESTION', 'q1', {
        testament: 'BOTH' as never,
      }),
    ).rejects.toThrow(/Ветхий или Новый/);
  });

  it('пропускает нормальную правку и пишет её в базу', async () => {
    const { service, updates } = serviceWith();
    await service.update('GAME_QUESTION', 'q1', { text: 'Новый текст?' });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ data: { text: 'Новый текст?' } });
  });

  it('говорит журналу, что именно изменилось', async () => {
    const prismaUpdated = {
      ...QUESTION,
      text: 'Новый текст?',
      correctIndex: 2,
    };
    const prisma = {
      question: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(QUESTION)
          .mockResolvedValue(prismaUpdated),
        update: jest.fn(() => Promise.resolve(prismaUpdated)),
      },
    } as unknown as PrismaService;

    const { changed } = await new ContentService(prisma).update(
      'GAME_QUESTION',
      'q1',
      { text: 'Новый текст?', correctIndex: 2 },
    );
    expect(changed).toEqual(expect.arrayContaining(['текст', 'верный ответ']));
  });

  it('не пропускает половину ссылки на Писание у слова', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('ALIAS_WORD', 'w1', { refChapter: null }),
    ).rejects.toThrow(/целиком/);
  });

  it('пустую ссылку целиком — пропускает', async () => {
    const { service, updates } = serviceWith();
    await service.update('ALIAS_WORD', 'w1', {
      refBookId: null,
      refChapter: null,
      refVerse: null,
    });
    expect(updates).toHaveLength(1);
  });

  it('не пропускает слово без пояснения — по нему угадывают', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('ALIAS_WORD', 'w1', { gloss: '   ' }),
    ).rejects.toThrow(/пояснение/);
  });

  it('не пропускает несуществующую книгу', async () => {
    const { service } = serviceWith();
    await expect(
      service.update('ALIAS_WORD', 'w1', { refBookId: 99 }),
    ).rejects.toThrow(/книги нет/);
  });
});
