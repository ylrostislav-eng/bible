import type { AliasCategory, AliasDifficulty, AliasTestament } from './alias';
import type { Difficulty, Testament } from './game';

/**
 * Правка содержимого игры: вопросы, ответы, слова.
 *
 * ## Зачем это вообще
 *
 * Вопросов больше тысячи, и часть из них неизбежно с изъяном: опечатка,
 * два одинаковых варианта, неверно отмеченный правильный ответ, ссылка не
 * на тот стих. Раньше починить такое можно было только правкой в базе
 * руками — то есть на практике никогда: тот, кто видит ошибку, играет с
 * телефона, а не сидит в `psql`.
 *
 * Поэтому правка живёт в двух местах сразу, и это не дублирование:
 *
 *  - **на месте** — карандаш прямо у вопроса в партии и у слова в Alias.
 *    Ловится там же, где замечено, пока помнится, что не так;
 *  - **в управлении** — поиск по всему банку, когда правится не то, что
 *    попалось, а то, что искали.
 *
 * ## Три вида и почему они разные
 *
 * `GAME_QUESTION` — общий банк для соло, дуэлей и комнат: у него есть
 * сложность, завет, тема и статус (черновик не выдаётся игрокам).
 * `CHAPTER_QUESTION` — вопросы к конкретной главе в «Изучении»: у них нет
 * сложности, зато есть жёсткая привязка к книге и главе.
 * `ALIAS_WORD` — слово для Alias, «Слова дня» и «Горячо-холодно»: у него
 * не варианты, а пояснение и список принимаемых ответов.
 *
 * Свести их в один тип не выйдет — у них разные поля и разные проверки, а
 * общий тип с половиной необязательных полей означает, что проверять их
 * придётся по виду, то есть тем же разветвлением, только спрятанным.
 */

export const CONTENT_KINDS = ['GAME_QUESTION', 'CHAPTER_QUESTION', 'ALIAS_WORD'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  GAME_QUESTION: 'Вопросы игры',
  CHAPTER_QUESTION: 'Вопросы к главам',
  ALIAS_WORD: 'Слова',
};

export const CONTENT_KIND_HINTS: Record<ContentKind, string> = {
  GAME_QUESTION: 'Соло, дуэли и комнаты',
  CHAPTER_QUESTION: 'Проверка главы в «Изучении»',
  ALIAS_WORD: 'Alias, «Слово дня», «Горячо-холодно»',
};

/** Строка списка: столько, чтобы узнать нужное, и не столько, чтобы
 * тащить весь банк на телефон. */
export interface ContentRow {
  id: string;
  kind: ContentKind;
  /** Первая строка: сам вопрос или слово. */
  title: string;
  /** Вторая строка: место в Писании, сложность, пометки. */
  subtitle: string;
  /** Черновик — не выдаётся игрокам (есть только у вопросов игры). */
  draft: boolean;
}

export interface ContentListResponse {
  items: ContentRow[];
  /** Показаны не все — уточните поиск. */
  truncated: boolean;
  /** Сколько всего подходит под запрос: правящему полезно знать, десять
   * это строк или тысяча. */
  total: number;
}

export interface GameQuestionContent {
  kind: 'GAME_QUESTION';
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  testament: Testament;
  book: string;
  chapter: number | null;
  verses: string | null;
  topic: string | null;
  difficulty: Difficulty;
  draft: boolean;
  /** Сколько раз вопрос показывали и сколько раз на него ошиблись —
   * лучший признак того, что с формулировкой что-то не так. */
  usageCount: number;
  errorCount: number;
  updatedAt: string;
}

export interface ChapterQuestionContent {
  kind: 'CHAPTER_QUESTION';
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  bookId: number;
  chapter: number;
  updatedAt: string;
}

export interface AliasWordContent {
  kind: 'ALIAS_WORD';
  id: string;
  word: string;
  gloss: string;
  accepts: string[];
  difficulty: AliasDifficulty;
  category: AliasCategory;
  testament: AliasTestament;
  refBookId: number | null;
  refChapter: number | null;
  refVerse: number | null;
  updatedAt: string;
}

export type ContentItem = GameQuestionContent | ChapterQuestionContent | AliasWordContent;

/** Что можно послать на сохранение. Все поля необязательны: правят обычно
 * одно, и слать всю карточку целиком значит затирать чужую правку,
 * сделанную минуту назад в соседней вкладке. */
export interface GameQuestionPatch {
  text?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  testament?: Testament;
  book?: string;
  chapter?: number | null;
  verses?: string | null;
  topic?: string | null;
  difficulty?: Difficulty;
  draft?: boolean;
}

export interface ChapterQuestionPatch {
  text?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  bookId?: number;
  chapter?: number;
}

export interface AliasWordPatch {
  word?: string;
  gloss?: string;
  accepts?: string[];
  difficulty?: AliasDifficulty;
  category?: AliasCategory;
  testament?: AliasTestament;
  refBookId?: number | null;
  refChapter?: number | null;
  refVerse?: number | null;
}

/** Сколько вариантов у вопроса. Ровно четыре и в игре, и в проверке главы:
 * число зашито в подсчёт очков и в вёрстку, поэтому правка не должна уметь
 * его менять. */
export const QUESTION_OPTIONS_COUNT = 4;

export const CONTENT_TEXT_MAX = 500;
export const CONTENT_OPTION_MAX = 200;
export const CONTENT_EXPLANATION_MAX = 1000;
export const CONTENT_WORD_MAX = 60;
export const CONTENT_GLOSS_MAX = 300;
export const CONTENT_ACCEPTS_MAX = 10;

/** Ответы вопроса не должны повторяться: два одинаковых варианта — самая
 * частая беда в банке, и правка обязана её ловить, а не создавать. */
export const CONTENT_DUPLICATE_OPTION_MESSAGE = 'Варианты ответа не должны повторяться';
export const CONTENT_EMPTY_OPTION_MESSAGE = 'Все четыре варианта заполнены';
export const CONTENT_REF_INCOMPLETE_MESSAGE =
  'Место в Писании заполняется целиком: книга, глава и стих — или ничего';
