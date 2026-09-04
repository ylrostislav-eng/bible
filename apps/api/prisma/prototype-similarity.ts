/**
 * Прототип меры смысловой близости слов — сердце игры «горячо/холодно».
 *
 * Идея: близость строим на нашем же тексте. Два слова считаются близкими,
 * если встречаются в одних и тех же главах Писания. Это классический
 * дистрибутивный подход, и здесь он уместнее любой внешней модели: игра
 * про Библию, и «близко» должно означать «рядом в этой книге», а не
 * «рядом в русском языке вообще». Никаких внешних сервисов, никаких
 * гигабайтных моделей — только текст, который уже лежит в базе.
 *
 * Это разведка, а не готовый механизм: цель — посмотреть глазами, осмысленны
 * ли соседи, прежде чем строить вокруг этого игру.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Грубый стеммер: срезает самые частые русские окончания. Настоящей
 * лемматизации здесь не нужно — важно, чтобы «Авраам», «Авраама» и
 * «Аврааму» попали в одну корзину, а не чтобы вышла словарная форма.
 */
const ENDINGS = [
  'ического',
  'ическому',
  'ования',
  'ованию',
  'ами',
  'ями',
  'ах',
  'ях',
  'ов',
  'ев',
  'ий',
  'ый',
  'ой',
  'ая',
  'яя',
  'ое',
  'ее',
  'ые',
  'ие',
  'ом',
  'ем',
  'ём',
  'ух',
  'юх',
  'ую',
  'юю',
  'ам',
  'ям',
  'ах',
  'ой',
  'ей',
  'ы',
  'и',
  'а',
  'я',
  'о',
  'е',
  'у',
  'ю',
  'ь',
];

/**
 * Срезает окончания до неподвижной точки.
 *
 * Один проход давал расходящиеся основы для форм одного слова: «Авраам»
 * терял «ам» и становился «авра», а «Авраамом» терял «ом» и застревал на
 * «авраам» — то есть одно имя жило в словаре двумя разными словами. Повтор
 * до стабилизации приводит обе формы к одному.
 */
function stem(word: string): string {
  let w = word.toLowerCase().replace(/ё/g, 'е');
  for (let pass = 0; pass < 3; pass += 1) {
    if (w.length <= 4) break;
    const before = w;
    for (const ending of ENDINGS) {
      if (w.length - ending.length >= 4 && w.endsWith(ending)) {
        w = w.slice(0, w.length - ending.length);
        break;
      }
    }
    if (w === before) break;
  }
  return w;
}

async function main() {
  const verses = await prisma.bibleVerse.findMany({
    select: { bookId: true, chapter: true, text: true },
  });
  console.log(`Стихов: ${verses.length}`);

  // Глава — единица контекста. Стих слишком короток (в нём почти нет
  // совместной встречаемости), книга слишком велика (в Бытии рядом
  // окажется всё со всем).
  const chapterIds = new Map<string, number>();
  const docs: Set<string>[] = [];

  for (const verse of verses) {
    const key = `${verse.bookId}:${verse.chapter}`;
    let index = chapterIds.get(key);
    if (index === undefined) {
      index = docs.length;
      chapterIds.set(key, index);
      docs.push(new Set());
    }
    // Скобки с синодальной нумерацией и служебные пометки — не текст.
    const cleaned = verse.text.replace(/\([^)]*\)/g, ' ');
    for (const raw of cleaned.split(/[^А-Яа-яЁё]+/)) {
      if (raw.length < 3) continue;
      docs[index].add(stem(raw));
    }
  }
  console.log(`Глав: ${docs.length}`);

  // В каких главах встречается каждая основа.
  const postings = new Map<string, number[]>();
  docs.forEach((words, chapterIndex) => {
    for (const word of words) {
      const list = postings.get(word) ?? [];
      list.push(chapterIndex);
      postings.set(word, list);
    }
  });

  const totalChapters = docs.length;
  const MIN_CHAPTERS = 3;
  // Слово, попавшее в четверть всех глав, не различает ничего: «сказать»,
  // «Господь», «сын» стоят везде и всех со всеми роднят.
  const MAX_SHARE = 0.25;

  const vocabulary = [...postings.entries()].filter(
    ([, chapters]) =>
      chapters.length >= MIN_CHAPTERS &&
      chapters.length <= totalChapters * MAX_SHARE,
  );
  console.log(
    `Основ всего: ${postings.size}, в словаре игры: ${vocabulary.length}`,
  );

  // Вектор — разреженный, вес idf: редкая общая глава значит больше, чем
  // частая.
  const vectors = new Map<string, Map<number, number>>();
  const norms = new Map<string, number>();
  for (const [word, chapters] of vocabulary) {
    const idf = Math.log(totalChapters / chapters.length);
    const vector = new Map<number, number>();
    for (const chapter of chapters) vector.set(chapter, idf);
    vectors.set(word, vector);
    norms.set(
      word,
      Math.sqrt([...vector.values()].reduce((sum, v) => sum + v * v, 0)),
    );
  }

  function similarity(a: string, b: string): number {
    const va = vectors.get(a);
    const vb = vectors.get(b);
    if (!va || !vb) return 0;
    const [small, large] = va.size <= vb.size ? [va, vb] : [vb, va];
    let dot = 0;
    for (const [chapter, weight] of small) {
      const other = large.get(chapter);
      if (other !== undefined) dot += weight * other;
    }
    return dot / (norms.get(a)! * norms.get(b)!);
  }

  function nearest(
    target: string,
    count = 15,
  ): { word: string; score: number }[] {
    const key = stem(target);
    if (!vectors.has(key)) return [];
    const scored: { word: string; score: number }[] = [];
    for (const [word] of vectors) {
      if (word === key) continue;
      const score = similarity(key, word);
      if (score > 0) scored.push({ word, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count);
  }

  const probes = [
    'Авраам',
    'ковчег',
    'любовь',
    'Иерусалим',
    'жертва',
    'притча',
    'Голиаф',
    'закваска',
  ];
  for (const probe of probes) {
    const result = nearest(probe);
    console.log(`\n${probe} (основа «${stem(probe)}»):`);
    if (result.length === 0) {
      console.log('  нет в словаре');
      continue;
    }
    console.log(
      '  ' + result.map((r) => `${r.word}:${r.score.toFixed(2)}`).join('  '),
    );
  }

  await prisma.$disconnect();
}

void main();
