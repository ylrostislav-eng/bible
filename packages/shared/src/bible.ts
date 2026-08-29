import type { Testament } from './game';

export interface BibleBook {
  /** Standard canonical book number, 1-66 (Genesis=1 ... Revelation=66) — used
   * to address stored verse text (`BibleVerse.bookId`); stable, don't reuse
   * for display order. */
  id: number;
  /**
   * Display position in the book picker, 1-66. Matches `id` everywhere
   * except the New Testament epistles: the Synodal tradition lists the
   * general epistles (James..Jude) before the Pauline ones (Romans..Hebrews),
   * confirmed against the YouVersion app's own Synodal book list — not the
   * Western order most non-Slavic Bibles use.
   */
  order: number;
  name: string;
  abbr: string;
  testament: Testament;
  chapters: number;
}

/**
 * Standard 66-book Synodal canon. Chapter counts are verified against the
 * actual ingested verse data (see docs/CHANGELOG.md) — do not "correct"
 * these without re-checking against real text.
 */
export const BIBLE_BOOKS: BibleBook[] = [
  { id: 1, order: 1, name: 'Бытие', abbr: 'Быт.', testament: 'OLD', chapters: 50 },
  { id: 2, order: 2, name: 'Исход', abbr: 'Исх.', testament: 'OLD', chapters: 40 },
  { id: 3, order: 3, name: 'Левит', abbr: 'Лев.', testament: 'OLD', chapters: 27 },
  { id: 4, order: 4, name: 'Числа', abbr: 'Чис.', testament: 'OLD', chapters: 36 },
  { id: 5, order: 5, name: 'Второзаконие', abbr: 'Втор.', testament: 'OLD', chapters: 34 },
  { id: 6, order: 6, name: 'Иисуса Навина', abbr: 'Нав.', testament: 'OLD', chapters: 24 },
  { id: 7, order: 7, name: 'Судей', abbr: 'Суд.', testament: 'OLD', chapters: 21 },
  { id: 8, order: 8, name: 'Руфь', abbr: 'Руфь', testament: 'OLD', chapters: 4 },
  { id: 9, order: 9, name: 'Первая книга Царств', abbr: '1 Цар.', testament: 'OLD', chapters: 31 },
  {
    id: 10,
    order: 10,
    name: 'Вторая книга Царств',
    abbr: '2 Цар.',
    testament: 'OLD',
    chapters: 24,
  },
  {
    id: 11,
    order: 11,
    name: 'Третья книга Царств',
    abbr: '3 Цар.',
    testament: 'OLD',
    chapters: 22,
  },
  {
    id: 12,
    order: 12,
    name: 'Четвёртая книга Царств',
    abbr: '4 Цар.',
    testament: 'OLD',
    chapters: 25,
  },
  {
    id: 13,
    order: 13,
    name: 'Первая книга Паралипоменон',
    abbr: '1 Пар.',
    testament: 'OLD',
    chapters: 29,
  },
  {
    id: 14,
    order: 14,
    name: 'Вторая книга Паралипоменон',
    abbr: '2 Пар.',
    testament: 'OLD',
    chapters: 36,
  },
  { id: 15, order: 15, name: 'Ездры', abbr: 'Езд.', testament: 'OLD', chapters: 10 },
  { id: 16, order: 16, name: 'Неемии', abbr: 'Неем.', testament: 'OLD', chapters: 13 },
  { id: 17, order: 17, name: 'Есфирь', abbr: 'Есф.', testament: 'OLD', chapters: 10 },
  { id: 18, order: 18, name: 'Иова', abbr: 'Иов', testament: 'OLD', chapters: 42 },
  { id: 19, order: 19, name: 'Псалтирь', abbr: 'Пс.', testament: 'OLD', chapters: 150 },
  { id: 20, order: 20, name: 'Притчей', abbr: 'Притч.', testament: 'OLD', chapters: 31 },
  { id: 21, order: 21, name: 'Екклесиаста', abbr: 'Еккл.', testament: 'OLD', chapters: 12 },
  { id: 22, order: 22, name: 'Песни Песней', abbr: 'Песн.', testament: 'OLD', chapters: 8 },
  { id: 23, order: 23, name: 'Исаии', abbr: 'Ис.', testament: 'OLD', chapters: 66 },
  { id: 24, order: 24, name: 'Иеремии', abbr: 'Иер.', testament: 'OLD', chapters: 52 },
  { id: 25, order: 25, name: 'Плач Иеремии', abbr: 'Плач', testament: 'OLD', chapters: 5 },
  { id: 26, order: 26, name: 'Иезекииля', abbr: 'Иез.', testament: 'OLD', chapters: 48 },
  { id: 27, order: 27, name: 'Даниила', abbr: 'Дан.', testament: 'OLD', chapters: 12 },
  { id: 28, order: 28, name: 'Осии', abbr: 'Ос.', testament: 'OLD', chapters: 14 },
  { id: 29, order: 29, name: 'Иоиля', abbr: 'Иоил.', testament: 'OLD', chapters: 3 },
  { id: 30, order: 30, name: 'Амоса', abbr: 'Ам.', testament: 'OLD', chapters: 9 },
  { id: 31, order: 31, name: 'Авдия', abbr: 'Авд.', testament: 'OLD', chapters: 1 },
  { id: 32, order: 32, name: 'Ионы', abbr: 'Ион.', testament: 'OLD', chapters: 4 },
  { id: 33, order: 33, name: 'Михея', abbr: 'Мих.', testament: 'OLD', chapters: 7 },
  { id: 34, order: 34, name: 'Наума', abbr: 'Наум', testament: 'OLD', chapters: 3 },
  { id: 35, order: 35, name: 'Аввакума', abbr: 'Авв.', testament: 'OLD', chapters: 3 },
  { id: 36, order: 36, name: 'Софонии', abbr: 'Соф.', testament: 'OLD', chapters: 3 },
  { id: 37, order: 37, name: 'Аггея', abbr: 'Агг.', testament: 'OLD', chapters: 2 },
  { id: 38, order: 38, name: 'Захарии', abbr: 'Зах.', testament: 'OLD', chapters: 14 },
  { id: 39, order: 39, name: 'Малахии', abbr: 'Мал.', testament: 'OLD', chapters: 4 },
  {
    id: 40,
    order: 40,
    name: 'От Матфея святое благовествование',
    abbr: 'Мф.',
    testament: 'NEW',
    chapters: 28,
  },
  {
    id: 41,
    order: 41,
    name: 'От Марка святое благовествование',
    abbr: 'Мк.',
    testament: 'NEW',
    chapters: 16,
  },
  {
    id: 42,
    order: 42,
    name: 'От Луки святое благовествование',
    abbr: 'Лк.',
    testament: 'NEW',
    chapters: 24,
  },
  {
    id: 43,
    order: 43,
    name: 'От Иоанна святое благовествование',
    abbr: 'Ин.',
    testament: 'NEW',
    chapters: 21,
  },
  {
    id: 44,
    order: 44,
    name: 'Деяния святых Апостолов',
    abbr: 'Деян.',
    testament: 'NEW',
    chapters: 28,
  },
  // Synodal display order from here on: general epistles (James..Jude)
  // before the Pauline ones (Romans..Hebrews) — see the `order` doc comment.
  { id: 59, order: 45, name: 'Послание Иакова', abbr: 'Иак.', testament: 'NEW', chapters: 5 },
  {
    id: 60,
    order: 46,
    name: 'Первое послание Петра',
    abbr: '1 Пет.',
    testament: 'NEW',
    chapters: 5,
  },
  {
    id: 61,
    order: 47,
    name: 'Второе послание Петра',
    abbr: '2 Пет.',
    testament: 'NEW',
    chapters: 3,
  },
  {
    id: 62,
    order: 48,
    name: 'Первое послание Иоанна',
    abbr: '1 Ин.',
    testament: 'NEW',
    chapters: 5,
  },
  {
    id: 63,
    order: 49,
    name: 'Второе послание Иоанна',
    abbr: '2 Ин.',
    testament: 'NEW',
    chapters: 1,
  },
  {
    id: 64,
    order: 50,
    name: 'Третье послание Иоанна',
    abbr: '3 Ин.',
    testament: 'NEW',
    chapters: 1,
  },
  { id: 65, order: 51, name: 'Послание Иуды', abbr: 'Иуд.', testament: 'NEW', chapters: 1 },
  { id: 45, order: 52, name: 'Послание к Римлянам', abbr: 'Рим.', testament: 'NEW', chapters: 16 },
  {
    id: 46,
    order: 53,
    name: 'Первое послание к Коринфянам',
    abbr: '1 Кор.',
    testament: 'NEW',
    chapters: 16,
  },
  {
    id: 47,
    order: 54,
    name: 'Второе послание к Коринфянам',
    abbr: '2 Кор.',
    testament: 'NEW',
    chapters: 13,
  },
  { id: 48, order: 55, name: 'Послание к Галатам', abbr: 'Гал.', testament: 'NEW', chapters: 6 },
  { id: 49, order: 56, name: 'Послание к Ефесянам', abbr: 'Еф.', testament: 'NEW', chapters: 6 },
  {
    id: 50,
    order: 57,
    name: 'Послание к Филиппийцам',
    abbr: 'Флп.',
    testament: 'NEW',
    chapters: 4,
  },
  {
    id: 51,
    order: 58,
    name: 'Послание к Колоссянам',
    abbr: 'Кол.',
    testament: 'NEW',
    chapters: 4,
  },
  {
    id: 52,
    order: 59,
    name: 'Первое послание к Фессалоникийцам',
    abbr: '1 Фес.',
    testament: 'NEW',
    chapters: 5,
  },
  {
    id: 53,
    order: 60,
    name: 'Второе послание к Фессалоникийцам',
    abbr: '2 Фес.',
    testament: 'NEW',
    chapters: 3,
  },
  {
    id: 54,
    order: 61,
    name: 'Первое послание к Тимофею',
    abbr: '1 Тим.',
    testament: 'NEW',
    chapters: 6,
  },
  {
    id: 55,
    order: 62,
    name: 'Второе послание к Тимофею',
    abbr: '2 Тим.',
    testament: 'NEW',
    chapters: 4,
  },
  { id: 56, order: 63, name: 'Послание к Титу', abbr: 'Тит.', testament: 'NEW', chapters: 3 },
  { id: 57, order: 64, name: 'Послание к Филимону', abbr: 'Флм.', testament: 'NEW', chapters: 1 },
  { id: 58, order: 65, name: 'Послание к Евреям', abbr: 'Евр.', testament: 'NEW', chapters: 13 },
  {
    id: 66,
    order: 66,
    name: 'Откровение Иоанна Богослова',
    abbr: 'Откр.',
    testament: 'NEW',
    chapters: 22,
  },
];

export interface BibleVerseText {
  verse: number;
  text: string;
}

export interface BibleChapterResponse {
  bookId: number;
  bookName: string;
  testament: Testament;
  chapter: number;
  totalChapters: number;
  verses: BibleVerseText[];
}
