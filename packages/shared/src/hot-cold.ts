/**
 * «Горячо-холодно» — угадать слово дня, идя на тепло.
 *
 * Правила короткие: игрок пишет любое русское слово, игра отвечает, какое
 * место это слово занимает по близости к загаданному. Первое место — сам
 * ответ. Попытки не ограничены, счётом служит их число: чем меньше
 * понадобилось, тем лучше.
 *
 * Число мест — величина непривычная, поэтому рядом с ним всегда стоит
 * словесная оценка. Игроку важно не «две тысячи триста семьдесят», а
 * «тепло»: разница между 300 и 700 ничего не решает, а разница между
 * «тепло» и «ледяное» решает всё.
 */

/** На сколько ступеней делится тепло. Порядок — от ответа к самому далёкому. */
export type HotColdBand = 'FOUND' | 'HOT' | 'WARM' | 'COLD' | 'ICE';

/**
 * Границы ступеней в местах.
 *
 * Взяты не с потолка: на замере из 142 пар девять из десяти слов, которые
 * человек назовёт связанными, укладываются в первые триста мест, и почти
 * все — в первые две тысячи. Заведомо посторонние слова начинаются за
 * десятью тысячами. То есть ступени описывают, где на самом деле проходят
 * границы человеческого «связано».
 */
export const HOT_COLD_BAND_LIMITS: Record<Exclude<HotColdBand, 'ICE'>, number> = {
  FOUND: 1,
  HOT: 300,
  WARM: 2000,
  COLD: 10_000,
};

export const HOT_COLD_BAND_LABELS: Record<HotColdBand, string> = {
  FOUND: 'Это оно',
  HOT: 'Горячо',
  WARM: 'Тепло',
  COLD: 'Холодно',
  ICE: 'Совсем не туда',
};

/** Ступень тепла по месту в списке. */
export function hotColdBand(rank: number): HotColdBand {
  if (rank <= HOT_COLD_BAND_LIMITS.FOUND) return 'FOUND';
  if (rank <= HOT_COLD_BAND_LIMITS.HOT) return 'HOT';
  if (rank <= HOT_COLD_BAND_LIMITS.WARM) return 'WARM';
  if (rank <= HOT_COLD_BAND_LIMITS.COLD) return 'COLD';
  return 'ICE';
}

/**
 * Насколько заполнить полоску, от 0 до 1.
 *
 * Шкала логарифмическая, и иначе нельзя: между сотым и двухсотым местом
 * для игрока пропасть, между двадцатитысячным и двадцать первым — ничего.
 * На линейной шкале вся игра происходила бы в первом проценте полоски.
 */
export function hotColdHeat(rank: number): number {
  if (rank <= 1) return 1;
  const scale = Math.log(HOT_COLD_BAND_LIMITS.COLD * 3);
  return Math.max(0, 1 - Math.log(rank) / scale);
}

/** Сколько подсказок можно взять за день. */
export const HOT_COLD_HINT_COUNT = 3;

/**
 * Подсказка открывает слово вдвое ближе лучшего найденного — приём из
 * оригинальной игры, и он честнее фиксированного места: пока игрок далеко,
 * подсказка тащит его к теме, а когда он уже рядом, она не выдаёт ответ.
 */
export const HOT_COLD_HINT_DIVISOR = 2;

/** Ближе этого места подсказка слово не откроет — иначе она и есть ответ. */
export const HOT_COLD_HINT_FLOOR = 3;

/**
 * Куда бьёт подсказка, взятая до первой догадки.
 *
 * «Вдвое ближе лучшего» здесь не работает: лучшего ещё нет, а половина
 * словаря — это его середина, то есть случайное слово. Проверка вживую
 * показала ровно это: первой подсказкой открывалось «взимать» на
 * двадцать шестой тысяче, и толку от неё не было никакого.
 *
 * Пятисотое место — уже тема, но ещё не ответ: по замеру там кончаются
 * слова, которые человек назовёт связанными.
 */
export const HOT_COLD_HINT_FIRST = 500;

/**
 * Подсказка называет только слово из этой части словаря.
 *
 * Словарь отсортирован по частоте, поэтому «первые пятнадцать тысяч» — это
 * обиходный русский язык. Дальше идут редкости и транслитерации: живая
 * проверка открыла подсказкой «фонтейн» на двадцать восьмой тысяче, и она
 * не помогла бы никому — подсказка полезна тем, что называет то, о чём
 * человек мог подумать сам.
 */
export const HOT_COLD_HINT_COMMON_LIMIT = 15_000;

/**
 * Каким должно быть загаданное слово, чтобы игра была игрой.
 *
 * Живая проверка выдала словом дня «зилота» — слово, которого никто не
 * назовёт и вокруг которого у словаря почти нет связей. Годится либо
 * обиходное русское слово, либо такое, которое в Писании встречается
 * по-настоящему часто: «Пилат» по общерусской частотности редок, но в
 * тексте он всюду, и его знают все. Одного условия мало — первое выкинуло
 * бы Пилата, второе впустило бы зилота.
 */
export const HOT_COLD_SECRET_COMMON_LIMIT = 20_000;
export const HOT_COLD_SECRET_MIN_EPISODES = 30;

/**
 * Сколько жалоб «должно быть ближе» игрок может оставить за день.
 *
 * Ограничение не против злого умысла, а против бесполезного шума: если
 * человек отметил двадцать слов, он уже не показывает промах, а перебирает
 * список. Настоящих несогласий за партию бывает одно-два.
 */
export const HOT_COLD_FEEDBACK_LIMIT = 8;

/** Одна догадка в списке. */
export interface HotColdGuess {
  /** Слово так, как его понял разбор ввода. */
  word: string;
  /** Место по близости: 1 — загаданное слово. */
  rank: number;
  /** Открыто подсказкой, а не угадано. */
  revealed?: boolean;
  /** Игрок отметил, что слово должно стоять ближе. */
  disputed?: boolean;
}

export interface HotColdState {
  /** Локальная дата игрока, `ГГГГ-ММ-ДД`. */
  date: string;
  /** Догадки по возрастанию места — ближайшая сверху. */
  guesses: HotColdGuess[];
  /** Сколько слов участвует в ранжировании: знаменатель для «места». */
  vocabulary: number;
  hintsLeft: number;
  /** Сколько ещё раз можно сказать «должно быть ближе». */
  disputesLeft: number;
  solved: boolean;
  finished: boolean;
  /** Награда, если угадать прямо сейчас. */
  rewardIfSolvedNow: HotColdReward;
  /** Появляется только в конце: до этого ответ клиенту не уезжает. */
  word: string | null;
  gloss: string | null;
  /** Десятка ближайших слов — разбор после игры. */
  closest: HotColdGuess[] | null;
  earned: HotColdReward | null;
}

export interface HotColdReward {
  xp: number;
  coins: number;
}

export interface HotColdGuessResult {
  state: HotColdState;
  /** Место только что введённого слова, `null` — если слово не опознано. */
  rank: number | null;
  /** Что пришлось починить во вводе: раскладку или опечатку. */
  fix: 'none' | 'layout' | 'typo';
  /** Как игра поняла ввод — показывается, если пришлось чинить. */
  understood: string | null;
  /** Это слово уже называли. */
  repeat: boolean;
}

/**
 * Награда за день.
 *
 * Считается по числу догадок, а не по времени: время в такой игре мерить
 * нечестно — человек может отложить телефон на середине и вернуться через
 * час, и это не значит, что он играл хуже.
 */
const REWARD_STEPS: { upTo: number; xp: number; coins: number }[] = [
  { upTo: 10, xp: 60, coins: 30 },
  { upTo: 25, xp: 45, coins: 22 },
  { upTo: 50, xp: 32, coins: 16 },
  { upTo: 100, xp: 22, coins: 11 },
  { upTo: Infinity, xp: 14, coins: 7 },
];

/** Каждая подсказка забирает четверть награды. */
const HINT_PENALTY = 0.25;

export function hotColdReward(guessCount: number, hintsUsed: number): HotColdReward {
  const step =
    REWARD_STEPS.find((candidate) => guessCount <= candidate.upTo) ??
    REWARD_STEPS[REWARD_STEPS.length - 1];
  const share = Math.max(0, 1 - HINT_PENALTY * hintsUsed);
  return {
    xp: Math.max(1, Math.round(step.xp * share)),
    coins: Math.max(1, Math.round(step.coins * share)),
  };
}

/** «12 попыток», «3 попытки», «1 попытка». */
export function hotColdAttemptsLabel(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return `${count} попытка`;
  if (ones >= 2 && ones <= 4 && (tens < 10 || tens >= 20)) return `${count} попытки`;
  return `${count} попыток`;
}

/** Строка, которой игрок хвастается друзьям. */
export function hotColdShareText(input: {
  solved: boolean;
  guessCount: number;
  hintsUsed: number;
}): string {
  const attempts = hotColdAttemptsLabel(input.guessCount);
  if (!input.solved) return `Горячо-холодно: сегодня не поддалось — ${attempts}`;
  const hints = input.hintsUsed > 0 ? `, подсказок ${input.hintsUsed}` : '';
  return `Горячо-холодно: ${attempts}${hints}`;
}
