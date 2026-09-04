/**
 * Проверка, ради которой всё и затевалось: снисходительность к ответу не
 * должна начать засчитывать ответ за чужое слово. Гоняем по всему банку.
 */
import { PrismaClient } from '@prisma/client';
import {
  isDailyWordInflection,
  isDailyWordMatch,
  normalizeDailyWordGuess,
} from '@bible-arena/shared';

const prisma = new PrismaClient();

async function main() {
  const words = await prisma.aliasWord.findMany({
    select: { word: true, accepts: true },
  });
  const known = new Set(words.map((w) => normalizeDailyWordGuess(w.word)));

  const accepted = (
    guess: string,
    target: { word: string; accepts: string[] },
  ): boolean => {
    const variants = [target.word, ...target.accepts];
    if (variants.some((v) => isDailyWordMatch(guess, v))) return true;
    if (known.has(normalizeDailyWordGuess(guess))) return false;
    return variants.some((v) => isDailyWordInflection(guess, v));
  };

  const collisions: string[] = [];
  let checked = 0;

  for (const target of words) {
    for (const variant of target.accepts) {
      checked += 1;
      for (const other of words) {
        if (other.word === target.word) continue;
        if (!accepted(variant, other)) continue;
        // Пересечение безобидно, когда слова про одно и то же: «Исаака»
        // подходит и «Исааку», и «Жертвоприношению Исаака», и в обоих
        // случаях человек думает про Исаака. Беда — когда вариант одного
        // слова засчитывается за смыслово другое, никак с ним не связанное.
        const a = normalizeDailyWordGuess(target.word);
        const b = normalizeDailyWordGuess(other.word);
        if (!a.includes(b) && !b.includes(a)) {
          collisions.push(
            `«${variant}» (вариант для «${target.word}») засчитан за «${other.word}»`,
          );
        }
      }
    }
  }

  // Каждое слово должно засчитываться само за себя и в родительном падеже.
  const selfFailures: string[] = [];
  const inflectionMisses: string[] = [];
  for (const w of words) {
    if (!accepted(w.word, w)) selfFailures.push(w.word);
    const inflected = `${w.word}а`;
    if (
      !known.has(normalizeDailyWordGuess(inflected)) &&
      !accepted(inflected, w)
    ) {
      inflectionMisses.push(w.word);
    }
  }

  console.log(`Проверено вариантов: ${checked} против ${words.length} слов`);
  console.log(`Слов не засчитывают сами себя: ${selfFailures.length}`);
  console.log(`Не приняли форму с окончанием: ${inflectionMisses.length}`);
  console.log(`Пересечений между словами: ${collisions.length}`);
  if (collisions.length > 0) {
    console.log('\nПЕРЕСЕЧЕНИЯ:');
    collisions.slice(0, 30).forEach((c) => console.log('  ' + c));
  }
  if (selfFailures.length > 0)
    console.log('\nНЕ УЗНАЮТ СЕБЯ: ' + selfFailures.join(', '));

  await prisma.$disconnect();
  process.exit(collisions.length === 0 && selfFailures.length === 0 ? 0 : 1);
}

void main();
