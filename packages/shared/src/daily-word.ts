/**
 * Слово дня — одно слово в сутки, одинаковое для всех, кто живёт в одном
 * часовом поясе.
 *
 * Зачем оно есть: у приложения не было ни одной причины открыть его
 * сегодня, если сегодня не хочется ни играть, ни читать. Дуэль требует
 * соперника, Alias — компании, проверка главы — настроя на учёбу. Слово дня
 * занимает минуту и работает наоборот: сначала интерес («что это за
 * слово?»), а чтение главы — уже как награда за догадку.
 *
 * Второе, ради чего оно: разговор. Слово у всех одно, поэтому «а ты с какой
 * подсказки угадал?» — это готовый повод написать другу, и он не требует ни
 * от кого быть онлайн одновременно.
 */

import type { AliasCategory, AliasReference, AliasTestament } from './alias';

/** Сколько раз можно ответить, прежде чем слово раскроется. Пять — это
 * достаточно, чтобы перебрать варианты, которые всерьёз приходят в голову,
 * и мало, чтобы угадать перебором. */
export const DAILY_WORD_MAX_ATTEMPTS = 5;

export const DAILY_WORD_HINT_COUNT = 3;

/**
 * Награда за угаданное слово, по числу взятых подсказок. Даже с тремя
 * подсказками награда не нулевая: человек всё равно пришёл, подумал и
 * дочитал до конца — обнулять это значит наказывать за то, что он не знал
 * ответа, хотя игра ровно для этого и сделана.
 *
 * Верхняя ступень (40 XP) примерно равна одной сыгранной соло-партии: слово
 * дня должно ощущаться весомо, но не выгоднее полноценной игры.
 */
export const DAILY_WORD_REWARDS: readonly { xp: number; coins: number }[] = [
  { xp: 40, coins: 20 },
  { xp: 28, coins: 14 },
  { xp: 18, coins: 9 },
  { xp: 10, coins: 5 },
];

export function dailyWordReward(hintsUsed: number): { xp: number; coins: number } {
  const index = Math.min(Math.max(hintsUsed, 0), DAILY_WORD_REWARDS.length - 1);
  return DAILY_WORD_REWARDS[index];
}

/** Что за подсказка открыта. Порядок фиксирован: сначала самая общая. */
export type DailyWordHintKind = 'CATEGORY' | 'SHAPE' | 'REFERENCE';

export interface DailyWordHint {
  kind: DailyWordHintKind;
  /** Готовый текст: «Личность · Ветхий Завет», «7 букв, начинается на В». */
  text: string;
  /** Только у подсказки-ссылки — чтобы из неё можно было открыть главу. */
  reference?: AliasReference | null;
}

export const DAILY_WORD_HINT_LABELS: Record<DailyWordHintKind, string> = {
  CATEGORY: 'Что это за слово',
  SHAPE: 'Сколько букв',
  REFERENCE: 'Где это в Писании',
};

export interface DailyWordState {
  /** Дата, за которую идёт игра, в виде `YYYY-MM-DD` — локальная дата
   * игрока. Клиент показывает её, чтобы не было сомнений, за какой день
   * результат. */
  date: string;
  /** Пояснение к слову — то единственное, что видно с самого начала. */
  gloss: string;
  attemptsUsed: number;
  attemptsLeft: number;
  /** Уже открытые подсказки, по порядку. */
  hints: DailyWordHint[];
  hintsLeft: number;
  /** Награда, которую даст верный ответ прямо сейчас. Показывается до
   * ответа, чтобы цена подсказки была видна заранее, а не постфактум. */
  rewardIfSolvedNow: { xp: number; coins: number };
  solved: boolean;
  /** Игра за этот день закончена: угадал или потратил все попытки. */
  finished: boolean;
  /** Само слово — только после конца игры. До этого сервер его не отдаёт:
   * иначе ответ лежал бы в ответе на первый же запрос. */
  word: string | null;
  category: AliasCategory | null;
  testament: AliasTestament | null;
  reference: AliasReference | null;
  /** Сколько заработано, если слово угадано. */
  earned: { xp: number; coins: number } | null;
}

export interface DailyWordGuessResult {
  correct: boolean;
  state: DailyWordState;
  /** Ответ был почти верным — отличается только регистром, «ё» или
   * дефисом. Считаем такой ответ верным, но говорим об этом: человек
   * угадал, а не «почти угадал», и терять из-за буквы «ё» попытку обидно. */
  normalizedMatch?: boolean;
}

/** Итог дня у друга. Самого слова здесь нет — иначе список друзей стал бы
 * способом узнать ответ, не играя. */
export interface DailyWordFriendResult {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  solved: boolean;
  /** `null`, если ещё не закончил — тогда и результата пока нет. */
  hintsUsed: number | null;
  attemptsUsed: number | null;
}

export interface DailyWordFriendsResponse {
  date: string;
  /** Свой результат идёт отдельно: он всегда есть и всегда первый. */
  me: DailyWordFriendResult;
  friends: DailyWordFriendResult[];
}

/**
 * Приводит ответ к сравнимому виду.
 *
 * Нормализуем ровно то, что человек не считает ошибкой: регистр, «ё»,
 * дефисы, пробелы и знаки препинания внутри составных слов («Мене, текел,
 * фарес», «Города-убежища»). Всё остальное трогать нельзя — иначе «Иоанн»
 * и «Иона» рискуют схлопнуться, а это уже не снисходительность, а
 * засчитанный неверный ответ.
 */
export function normalizeDailyWordGuess(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s\-‑–—.,;:!?'"«»()]/g, '')
    .trim();
}

/** Совпадает ли ответ со словом с точностью до того, что человек ошибкой не
 * считает. */
export function isDailyWordMatch(guess: string, word: string): boolean {
  const normalizedGuess = normalizeDailyWordGuess(guess);
  return normalizedGuess.length > 0 && normalizedGuess === normalizeDailyWordGuess(word);
}

/** Текст для отправки другу. Слова в нём нет намеренно: это приглашение
 * сыграть, а не спойлер. */
export function dailyWordShareText(result: {
  solved: boolean;
  hintsUsed: number;
  attemptsUsed: number;
}): string {
  if (!result.solved) return 'Слово дня сегодня меня победило 🤷';
  const hints =
    result.hintsUsed === 0
      ? 'без подсказок'
      : `с ${result.hintsUsed} ${result.hintsUsed === 1 ? 'подсказкой' : 'подсказками'}`;
  const attempts =
    result.attemptsUsed === 1 ? 'с первой попытки' : `с ${result.attemptsUsed}-й попытки`;
  return `Слово дня — угадал ${attempts}, ${hints}`;
}
