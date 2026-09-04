/**
 * Разбор того, что человек напечатал.
 *
 * В игре, где ответ вводится руками, опечатка — это не редкость, а норма:
 * печатают с телефона, второпях, иногда не глядя. Ответ «не знаю такого
 * слова» на «авраам» с лишней буквой — худшее, что игра может сделать:
 * человек думает, что ошибся он, хотя ошиблись мы.
 *
 * Три слоя, от дешёвого к дорогому:
 *
 *  1. **Приведение к общему виду** — регистр, «ё», лишние пробелы. Это не
 *     опечатки, это разные способы написать одно и то же.
 *  2. **Забытая раскладка** — «fdhffv» вместо «авраам». Случается у всех,
 *     распознаётся однозначно и чинится без догадок.
 *  3. **Поиск ближайшего написания** — одна-две перепутанные буквы. Здесь
 *     уже начинается догадка, поэтому результат обязательно показывается
 *     человеку: «понял как „Авраам“». Молча подменять введённое нельзя —
 *     игрок должен видеть, за что ему начислили расстояние.
 */

/** Латинская раскладка → русская, по расположению клавиш. */
const LAYOUT: Record<string, string> = {
  q: 'й',
  w: 'ц',
  e: 'у',
  r: 'к',
  t: 'е',
  y: 'н',
  u: 'г',
  i: 'ш',
  o: 'щ',
  p: 'з',
  '[': 'х',
  ']': 'ъ',
  a: 'ф',
  s: 'ы',
  d: 'в',
  f: 'а',
  g: 'п',
  h: 'р',
  j: 'о',
  k: 'л',
  l: 'д',
  ';': 'ж',
  "'": 'э',
  z: 'я',
  x: 'ч',
  c: 'с',
  v: 'м',
  b: 'и',
  n: 'т',
  m: 'ь',
  ',': 'б',
  '.': 'ю',
};

/** Приводит к общему виду: нижний регистр, «ё» как «е», один пробел. */
export function normalizeInput(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Переводит текст из латинской раскладки в русскую. Возвращает `null`,
 * если переводить нечего: в строке и так есть кириллица либо нет ни одной
 * знакомой клавиши.
 */
export function fromWrongLayout(value: string): string | null {
  if (/[а-я]/i.test(value)) return null;
  const converted = [...value.toLowerCase()]
    .map((char) => LAYOUT[char] ?? (char === ' ' ? ' ' : ''))
    .join('');
  return converted.length >= 2 ? converted : null;
}

/**
 * Расстояние Дамерау — Левенштейна с ранним выходом.
 *
 * Отличается от обычного Левенштейна тем, что считает перестановку соседних
 * букв («аврааам» → «авраам») одной ошибкой, а не двумя. Для набора с
 * телефона это самая частая опечатка, и считать её двойной значило бы
 * отвергать ровно то, что чаще всего и случается.
 *
 * `limit` обрывает подсчёт, как только стало ясно, что слово далеко: при
 * переборе по словарю это экономит почти всю работу.
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  const rows: number[][] = [
    Array.from({ length: b.length + 1 }, (_, i) => i),
    new Array<number>(b.length + 1).fill(0),
    new Array<number>(b.length + 1).fill(0),
  ];

  let previous = rows[0];
  let beforePrevious: number[] | null = null;

  for (let i = 1; i <= a.length; i += 1) {
    const current = rows[i % 3 === 0 ? 0 : i % 3];
    current[0] = i;
    let rowBest = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      // Перестановка соседних букв.
      if (beforePrevious && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowBest) rowBest = value;
    }

    if (rowBest > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length];
}

/** Пары соседних букв слова — грубый отпечаток написания. */
function bigrams(word: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < word.length - 1; i += 1) result.push(word.slice(i, i + 2));
  return result;
}

/**
 * Индекс для поиска похоже написанных слов.
 *
 * Перебирать сто тысяч слов расстоянием на каждый ввод слишком дорого,
 * поэтому сначала отбираем кандидатов по общим парам букв: у слова с одной
 * опечаткой почти все пары совпадают с исходным, а у постороннего слова —
 * почти ни одной. Дорогой подсчёт расстояния достаётся уже десяткам слов,
 * а не всему словарю.
 */
export class SpellIndex {
  private readonly byBigram = new Map<string, number[]>();
  private readonly words: string[];

  /** Слова передаются в порядке убывания частоты — при равном расстоянии
   * выигрывает то, что человек скорее всего и имел в виду. */
  constructor(words: string[]) {
    this.words = words;
    words.forEach((word, index) => {
      for (const bigram of new Set(bigrams(word))) {
        const list = this.byBigram.get(bigram);
        if (list) list.push(index);
        else this.byBigram.set(bigram, [index]);
      }
    });
  }

  /**
   * Ближайшее по написанию слово, или `null`, если ничего похожего нет.
   * `maxDistance` намеренно мал: две правки — это уже не опечатка, а другое
   * слово, и подставлять его было бы враньём.
   */
  findClosest(input: string, maxDistance = 2): string | null {
    const query = normalizeInput(input);
    if (query.length < 3) return null;

    const counts = new Map<number, number>();
    for (const bigram of new Set(bigrams(query))) {
      for (const index of this.byBigram.get(bigram) ?? []) {
        counts.set(index, (counts.get(index) ?? 0) + 1);
      }
    }

    const needed = Math.max(1, Math.floor((query.length - 1) * 0.5));
    let best: { word: string; distance: number; rank: number } | null = null;

    for (const [index, shared] of counts) {
      if (shared < needed) continue;
      const candidate = this.words[index];
      if (Math.abs(candidate.length - query.length) > maxDistance) continue;

      const distance = editDistance(query, candidate, maxDistance);
      if (distance > maxDistance) continue;
      if (!best || distance < best.distance || (distance === best.distance && index < best.rank)) {
        best = { word: candidate, distance, rank: index };
      }
    }

    return best?.word ?? null;
  }
}

/** Как разобрался ввод: что в итоге ищем и почему. */
export interface ResolvedInput {
  /** Слово, которое пойдёт в игру. */
  word: string;
  /** Что именно пришлось починить — чтобы сказать об этом игроку. */
  fix: 'none' | 'layout' | 'typo';
  /** Исходный ввод, как его напечатали. */
  original: string;
}

/**
 * Разбирает ввод по трём слоям и говорит, что было исправлено.
 *
 * `isKnown` отвечает, есть ли слово в словаре игры, `findClosest` ищет
 * похожее. Возвращает `null`, если слово не опознано вовсе — это честный
 * ответ «такого слова я не знаю», а не молчаливая подмена.
 */
export function resolveInput(
  raw: string,
  isKnown: (word: string) => boolean,
  findClosest: (word: string) => string | null,
): ResolvedInput | null {
  const normalized = normalizeInput(raw);
  if (normalized.length === 0) return null;
  if (isKnown(normalized)) return { word: normalized, fix: 'none', original: raw };

  const layout = fromWrongLayout(normalized);
  if (layout && isKnown(layout)) return { word: layout, fix: 'layout', original: raw };

  const closest = findClosest(layout ?? normalized);
  if (closest) return { word: closest, fix: 'typo', original: raw };

  return null;
}
