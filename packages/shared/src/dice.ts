/**
 * «Кости»: подсчёт очков одного броска.
 *
 * Farkle в том варианте, что знаком по Kingdom Come: Deliverance II —
 * правила целиком записаны в `docs/dice.md`. Здесь только арифметика: что
 * можно взять из выпавшего и сколько это стоит. Что с этим делать —
 * рискнуть или забрать — знает движок (`dice-engine.ts`).
 *
 * Модуль чистый и лежит в общем пакете намеренно: цену комбинации должен
 * считать сервер (иначе счёт правится в консоли браузера), но ровно та же
 * цена нужна экрану, чтобы подсветить варианты до нажатия. Две реализации
 * одного правила разошлись бы на первой же правке, и разошлись бы молча.
 */

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export const DICE_COUNT = 6;

/** Цели матча на выбор; первая — обычная быстрая партия. */
export const DICE_TARGET_OPTIONS = [4000, 2000, 3000, 5000] as const;
export const DICE_DEFAULT_TARGET = 4000;

/**
 * Тройка одинаковых. Дальше каждая следующая кость того же значения
 * **удваивает** предыдущий уровень: четыре — вдвое от тройки, пять —
 * вчетверо, шесть — ввосьмеро.
 *
 * Единица выбивается из ряда (1000 против 100 за одиночную) — так в
 * оригинале, и именно она делает «три единицы» событием.
 */
const TRIPLE_POINTS: Record<DiceValue, number> = {
  1: 1000,
  2: 200,
  3: 300,
  4: 400,
  5: 500,
  6: 600,
};

/** Одиночные кости, которые чего-то стоят. Всё остальное в одиночку — ноль. */
const SINGLE_POINTS: Partial<Record<DiceValue, number>> = {
  1: 100,
  5: 50,
};

/** Последовательности. Три пары очков не дают — это записано в ТЗ и
 * отличает наш вариант от других Farkle. */
const STRAIGHTS: Array<{ values: DiceValue[]; points: number; label: string }> = [
  { values: [1, 2, 3, 4, 5, 6], points: 1500, label: '1-2-3-4-5-6' },
  { values: [2, 3, 4, 5, 6], points: 750, label: '2-3-4-5-6' },
  { values: [1, 2, 3, 4, 5], points: 500, label: '1-2-3-4-5' },
];

/** Сколько стоит `count` одинаковых костей значения `value`, или 0. */
export function sameValuePoints(value: DiceValue, count: number): number {
  if (count < 3) return 0;
  // Удвоение на каждую кость сверх тройки: 3 → ×1, 4 → ×2, 5 → ×4, 6 → ×8.
  return TRIPLE_POINTS[value] * 2 ** (count - 3);
}

/** Что вернул разбор броска. */
export interface RollAnalysis {
  /** Ни одна кость и ни одна комбинация не дают очков — ход сгорает. */
  bust: boolean;
  /** Лучшая по очкам раскладка: сколько и какие кости. Подсказка, а не
   * выбор за игрока — выбирает он сам, в этом и стратегия. */
  bestScore: number;
  bestIndexes: number[];
}

/**
 * Сколько очков даёт выбор костей, или `null`, если такой выбор
 * недопустим.
 *
 * `null` — это не «ноль очков», а отказ: выбранные кости должны
 * раскладываться на комбинации **без остатка**. Иначе к честной единице
 * можно было бы прицепить бесполезную двойку и незаметно унести её в
 * отложенные, обокрав самого себя на следующем броске (а при подтасовке —
 * и соперника).
 *
 * Из всех возможных раскладок берётся самая дорогая: четыре пятёрки — это
 * 1000, а не «тройка плюс одиночная» за 550. Игрок выбрал кости, а не
 * способ их посчитать; считать в его пользу — единственное честное
 * прочтение.
 */
export function scoreSelection(
  dice: readonly DiceValue[],
  indexes: readonly number[],
): number | null {
  if (indexes.length === 0) return null;

  const seen = new Set<number>();
  for (const index of indexes) {
    // Индекс приходит от клиента, поэтому проверяется здесь, а не
    // предполагается: за границами броска, дробный или повторённый —
    // отказ, а не молчаливое приведение к чему-нибудь.
    if (!Number.isInteger(index) || index < 0 || index >= dice.length) {
      return null;
    }
    if (seen.has(index)) return null;
    seen.add(index);
  }

  const values = indexes.map((index) => dice[index]);
  const best = bestBreakdown(values);
  return best === null ? null : best;
}

/**
 * Лучшая цена набора значений при условии, что использованы все кости.
 * `null` — набор не раскладывается целиком.
 */
function bestBreakdown(values: readonly DiceValue[]): number | null {
  if (values.length === 0) return 0;

  let best: number | null = null;
  const consider = (points: number, rest: DiceValue[]) => {
    const restPoints = bestBreakdown(rest);
    if (restPoints === null) return;
    const total = points + restPoints;
    if (best === null || total > best) best = total;
  };

  // 1. Последовательности — сначала длинные: 1-2-3-4-5-6 стоит дороже, чем
  //    1-2-3-4-5 плюс ничего, а шестёрка в одиночку ничего не стоит.
  for (const straight of STRAIGHTS) {
    const rest = removeOnce(values, straight.values);
    if (rest !== null) consider(straight.points, rest);
  }

  // 2. Одинаковые: от самой длинной группы к тройке. Короткие варианты
  //    тоже нужны — «четыре единицы» иногда выгоднее разобрать иначе, и
  //    пусть решает перебор, а не наша уверенность.
  const counts = countValues(values);
  for (const [value, count] of counts) {
    for (let take = count; take >= 3; take--) {
      const rest = removeOnce(
        values,
        Array.from({ length: take }, () => value),
      );
      if (rest !== null) consider(sameValuePoints(value, take), rest);
    }
  }

  // 3. Одиночные единицы и пятёрки.
  for (const value of [1, 5] as DiceValue[]) {
    const rest = removeOnce(values, [value]);
    if (rest !== null) consider(SINGLE_POINTS[value] ?? 0, rest);
  }

  return best;
}

/** Убирает `wanted` из `values` по одному разу каждое; `null`, если не хватило. */
function removeOnce(
  values: readonly DiceValue[],
  wanted: readonly DiceValue[],
): DiceValue[] | null {
  const rest = [...values];
  for (const value of wanted) {
    const at = rest.indexOf(value);
    if (at === -1) return null;
    rest.splice(at, 1);
  }
  return rest;
}

function countValues(values: readonly DiceValue[]): Array<[DiceValue, number]> {
  const counts = new Map<DiceValue, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()];
}

/**
 * Разбирает бросок: есть ли вообще что брать и какая раскладка самая
 * дорогая.
 *
 * Перебором по всем подмножествам: костей не больше шести, то есть 63
 * варианта — дешевле, чем любая попытка быть умнее и ошибиться на редком
 * случае вроде «четыре пятёрки и две единицы».
 */
export function analyzeRoll(dice: readonly DiceValue[]): RollAnalysis {
  let bestScore = 0;
  let bestIndexes: number[] = [];

  const total = 1 << dice.length;
  for (let mask = 1; mask < total; mask++) {
    const indexes: number[] = [];
    for (let i = 0; i < dice.length; i++) {
      if (mask & (1 << i)) indexes.push(i);
    }
    const points = scoreSelection(dice, indexes);
    if (points !== null && points > bestScore) {
      bestScore = points;
      bestIndexes = indexes;
    }
  }

  return { bust: bestScore === 0, bestScore, bestIndexes };
}

/** Все ли кости броска зачтены — тогда игрок бросает снова все шесть. */
export function isHotDice(dice: readonly DiceValue[], indexes: readonly number[]): boolean {
  return indexes.length === dice.length && scoreSelection(dice, indexes) !== null;
}

/** Человеческое название комбинации — для разбора хода и повтора партии. */
export function describeSelection(dice: readonly DiceValue[], indexes: readonly number[]): string {
  const values = indexes.map((index) => dice[index]).sort((a, b) => a - b);
  for (const straight of STRAIGHTS) {
    if (
      values.length === straight.values.length &&
      straight.values.every((value, at) => values[at] === value)
    ) {
      return straight.label;
    }
  }
  const counts = countValues(values);
  if (counts.length === 1 && values.length >= 3) {
    return `${values.length}×${counts[0][0]}`;
  }
  return values.join('+');
}
