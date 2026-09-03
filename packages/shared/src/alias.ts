/**
 * Библейский Alias — настольная игра на объяснение слов, где телефон это
 * колода, таймер и табло, а всё остальное происходит между людьми в
 * комнате.
 *
 * Ключевое проектное решение, от которого зависит здесь всё: **игра для
 * одной компании и одного телефона**. Alias — игра голосом; убери речь, и
 * это уже письменные шарады, другая игра. Поэтому здесь нет ни сокетов, ни
 * синхронизации: партия целиком живёт на устройстве ведущего, а сервер
 * нужен только чтобы выдать колоду и запомнить результат.
 *
 * Полный дизайн-документ (правила, экраны, спорные ситуации) —
 * `docs/alias.md`.
 */

import { BIBLE_BOOKS } from './bible';

export const ALIAS_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type AliasDifficulty = (typeof ALIAS_DIFFICULTIES)[number];

export const ALIAS_DIFFICULTY_LABELS: Record<AliasDifficulty, string> = {
  EASY: 'Легко',
  MEDIUM: 'Средне',
  HARD: 'Сложно',
};

/** Подписи выбраны так, чтобы никого не обидеть в смешанной компании:
 * уровень описывает слово, а не игрока. */
export const ALIAS_DIFFICULTY_HINTS: Record<AliasDifficulty, string> = {
  EASY: 'Знают все',
  MEDIUM: 'Читал Библию',
  HARD: 'Для своих',
};

export const ALIAS_CATEGORIES = [
  'PERSON',
  'PLACE',
  'EVENT',
  'OBJECT',
  'CONCEPT',
  'PARABLE',
  'IDIOM',
] as const;
export type AliasCategory = (typeof ALIAS_CATEGORIES)[number];

export const ALIAS_CATEGORY_LABELS: Record<AliasCategory, string> = {
  PERSON: 'Личности',
  PLACE: 'Места',
  EVENT: 'События',
  OBJECT: 'Предметы',
  CONCEPT: 'Понятия',
  PARABLE: 'Притчи',
  IDIOM: 'Крылатые слова',
};

/**
 * Подсказки под категориями на экране настройки. `IDIOM` объясняется
 * подробнее остальных намеренно: это единственная категория, которую
 * компания без библейского опыта возьмёт первой, и её надо продать —
 * «вы это уже знаете» работает лучше, чем «попробуйте».
 */
export const ALIAS_CATEGORY_HINTS: Record<AliasCategory, string> = {
  PERSON: 'Кто это',
  PLACE: 'Где это было',
  EVENT: 'Что произошло',
  OBJECT: 'Вещи и предметы',
  CONCEPT: 'Слова и смыслы',
  PARABLE: 'Истории Иисуса',
  IDIOM: 'Выражения, которые вы говорите каждый день',
};

/** К какому Завету относится слово. `BOTH` — для сквозных понятий вроде
 * «завет» или «пророк», которые нельзя честно отнести к одному. */
export const ALIAS_TESTAMENTS = ['OLD', 'NEW', 'BOTH'] as const;
export type AliasTestament = (typeof ALIAS_TESTAMENTS)[number];

// ---- настройки партии ----

export const ALIAS_ROUND_SECONDS_OPTIONS = [30, 45, 60, 90] as const;
export const ALIAS_TARGET_SCORE_OPTIONS = [20, 30, 50] as const;
export const ALIAS_MIN_TEAMS = 2;
export const ALIAS_MAX_TEAMS = 6;

export interface AliasSettings {
  roundSeconds: number;
  /** Сколько очков нужно для победы. Круг всегда доигрывается до конца —
   * иначе первый ход даёт преимущество, и это все замечают. */
  targetScore: number;
  /** Штраф за пропуск. 0 — для компаний, где важнее темп, чем счёт. */
  skipPenalty: 0 | 1;
  /** Последнее слово после сигнала: угадали +1, нет −1. Лучший финальный
   * удар в игре, поэтому включено по умолчанию. */
  lastWordAfterBell: boolean;
  /** `null` — смешанная колода из всех трёх уровней. */
  difficulty: AliasDifficulty | null;
  categories: AliasCategory[];
  testaments: AliasTestament[];
  soundEnabled: boolean;
}

/**
 * Экран настройки открывается уже заполненным: никто не хочет настраивать
 * вечеринку, пока шесть человек смотрят в телефон. Это разница между
 * «начали» и «а давайте потом».
 */
export const ALIAS_DEFAULT_SETTINGS: AliasSettings = {
  roundSeconds: 60,
  targetScore: 30,
  skipPenalty: 1,
  lastWordAfterBell: true,
  difficulty: null,
  categories: [...ALIAS_CATEGORIES],
  testaments: [...ALIAS_TESTAMENTS],
  soundEnabled: true,
};

/** Готовые имена команд, чтобы не заставлять никого печатать. Меняются
 * нажатием — но по умолчанию уже осмысленные и с характером. */
export const ALIAS_TEAM_NAMES = [
  'Львы Иуды',
  'Соль земли',
  'Рыбаки',
  'Иерихонские трубы',
  'Светильники',
  'Ковчег',
] as const;

/** Цвета команд на табло — из палитры приложения, различимы и при
 * дальтонизме (различаются светлотой, а не только тоном). */
export const ALIAS_TEAM_COLORS = [
  '#e8b04b',
  '#7dd3fc',
  '#34d399',
  '#f87171',
  '#c4b5fd',
  '#fbbf24',
] as const;

// ---- обмен с сервером ----

/**
 * Ссылка на место в Писании — разобранная, а не строкой.
 *
 * Строку «Быт 12:1» нельзя ни проверить, ни открыть: опечатка в сокращении
 * проходит незамеченной, а нажать на неё некуда. Разобранная ссылка и
 * проверяется на существование стиха при заливке банка, и превращается в
 * переход прямо в главу — а это и есть весь смысл: человек пришёл поиграть,
 * а ушёл читать.
 */
export interface AliasReference {
  /** Канонический номер книги, 1-66 — тот же, что у `BibleVerse.bookId`. */
  bookId: number;
  chapter: number;
  verse: number;
  /** Готовая подпись вроде «Быт. 12:1» — собирается сервером, чтобы клиент
   * не хранил у себя вторую копию списка книг. */
  label: string;
}

export interface AliasWordView {
  id: string;
  word: string;
  difficulty: AliasDifficulty;
  category: AliasCategory;
  /** Одна строка «что это». Показывается только на разборе раунда и только
   * по нажатию — компания ждёт следующего раунда, и абзац тут читать не
   * будут. */
  gloss: string;
  /** Место, если оно однозначно. `null` у сквозных слов («завет»,
   * «покаяние»): одной честной ссылки у них нет, а выдуманная хуже пустой. */
  reference: AliasReference | null;
}

/**
 * Колода запрашивается один раз на всю партию и дальше живёт в памяти
 * устройства. Это не оптимизация, а требование места: играют в гостях, на
 * даче, в лагере — там, где связь пропадает ровно тогда, когда компания
 * наконец разыгралась. Игра, которая на середине раунда ждёт сеть, — это
 * игра, в которую больше не сядут.
 */
export const ALIAS_DECK_DEFAULT_COUNT = 150;
export const ALIAS_DECK_MAX_COUNT = 400;

/** Ниже этого числа партия превращается в повторение одних и тех же слов,
 * и экран настройки честно об этом предупреждает, а не выдаёт огрызок
 * молча. */
export const ALIAS_MIN_COMFORTABLE_DECK = 40;

export interface AliasDeckRequest {
  count: number;
  difficulty?: AliasDifficulty | null;
  categories?: AliasCategory[];
  testaments?: AliasTestament[];
}

export interface AliasDeckResponse {
  words: AliasWordView[];
  /** Сколько слов вообще подходит под выбранные фильтры — чтобы экран
   * настройки мог честно сказать «в этой колоде всего 40 слов», а не
   * выдавать короткую партию молча. */
  available: number;
  /** Сколько слов в выданной колоде игрок ещё не видел. Меньше длины
   * колоды — значит, банк по этим фильтрам почти исчерпан и пошёл второй
   * круг; экран может предложить снять фильтр. */
  fresh: number;
}

/** Ответ экрана настройки на вопрос «сколько тут вообще слов»: считается
 * до начала партии, пока фильтры ещё крутят. */
export interface AliasAvailabilityResponse {
  available: number;
}

/** Итог партии. Команды — просто имена: почти все за столом гости без
 * аккаунтов, и требовать регистрации от шести человек ради одной партии
 * значит её не начать. К аккаунту привязан только владелец телефона. */
export interface AliasTeamResult {
  name: string;
  score: number;
}

export interface AliasMatchInput {
  teams: AliasTeamResult[];
  roundsPlayed: number;
  settings: AliasSettings;
}

export interface AliasMatchView {
  id: string;
  teams: AliasTeamResult[];
  winnerName: string | null;
  roundsPlayed: number;
  playedAt: string;
}

/** Итог одного слова в раунде — то, что переключается на экране разбора. */
export interface AliasRoundEntry {
  wordId: string;
  word: string;
  guessed: boolean;
}

/**
 * Собирает подпись ссылки («Быт. 12:1»). Возвращает `null`, если такой
 * книги нет: молчаливо подставить неверное имя книги в приложении о Библии
 * — худшее из возможных решений.
 */
export function formatAliasReference(
  bookId: number,
  chapter: number,
  verse: number,
): string | null {
  const book = BIBLE_BOOKS.find((item) => item.id === bookId);
  if (!book) return null;
  return `${book.abbr} ${chapter}:${verse}`;
}

/** Очки за раунд с учётом штрафа за пропуск. Одна функция на клиент и
 * сервер, чтобы табло и сохранённый результат не могли разойтись. */
export function aliasRoundScore(entries: AliasRoundEntry[], skipPenalty: 0 | 1): number {
  let score = 0;
  for (const entry of entries) {
    score += entry.guessed ? 1 : -skipPenalty;
  }
  return score;
}
