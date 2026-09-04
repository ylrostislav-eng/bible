/**
 * Замер расстояний: насколько словарь на самом деле хорош.
 *
 * Запуск: `pnpm --filter @bible-arena/api semantics:report`
 *
 * Печатает не примеры, а распределение — по областям и целиком, вместе со
 * списком худших случаев. Смотреть надо именно на худшие: средним по
 * больнице довольны все, а игру портят те десять процентов, где число не
 * совпало с человеческим ощущением.
 *
 * Пороги взяты из того, как число читается игроком:
 *   до 300      — «горячо», сразу видно, что мысль верная;
 *   до 2000     — «тепло», направление угадано;
 *   до 10 000   — «холодно», но не бессмыслица;
 *   дальше      — «ледяное», связи не видно.
 */
import { RELATED, UNRELATED, type Pair } from './benchmark-pairs';
import { SemanticsService } from './semantics.service';

const HOT = 300;
const WARM = 2000;
const COLD = 10_000;

interface Measured extends Pair {
  rank: number | null;
}

function measure(service: SemanticsService, list: Pair[]): Measured[] {
  // Ранжирование стоит около ста миллисекунд, поэтому считаем его один раз
  // на загаданное слово, а не на пару.
  const cache = new Map<number, ReturnType<SemanticsService['rank']>>();
  return list.map(({ secret, guess }) => {
    const s = service.lookup(secret);
    const g = service.lookup(guess);
    if (s === null || g === null) return { secret, guess, rank: null };
    let ranking = cache.get(s);
    if (!ranking) {
      ranking = service.rank(s);
      cache.set(s, ranking);
    }
    return { secret, guess, rank: ranking.rankOf(g) };
  });
}

function share(values: number[], limit: number): string {
  const hit = values.filter((v) => v <= limit).length;
  return `${((hit / values.length) * 100).toFixed(0)}%`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function main(): void {
  const service = new SemanticsService();
  service.onModuleInit();
  if (!service.ready) {
    console.error(service.problem);
    process.exit(1);
  }

  const all: Measured[] = [];
  const missing: Measured[] = [];

  console.log('\nСВЯЗАННЫЕ ПАРЫ — чем меньше, тем лучше\n');
  console.log(
    `${'область'.padEnd(22)}${'пар'.padStart(5)}${'медиана'.padStart(9)}` +
      `${'горячо'.padStart(8)}${'тепло'.padStart(7)}${'холодно'.padStart(9)}`,
  );
  for (const [area, list] of Object.entries(RELATED)) {
    const measured = measure(service, list);
    all.push(...measured);
    missing.push(...measured.filter((m) => m.rank === null));
    const ranks = measured.flatMap((m) => (m.rank === null ? [] : [m.rank]));
    console.log(
      `${area.padEnd(22)}${String(ranks.length).padStart(5)}` +
        `${String(median(ranks)).padStart(9)}` +
        `${share(ranks, HOT).padStart(8)}${share(ranks, WARM).padStart(7)}` +
        `${share(ranks, COLD).padStart(9)}`,
    );
  }

  const ranks = all.flatMap((m) => (m.rank === null ? [] : [m.rank]));
  console.log(
    `\n${'ВСЕГО'.padEnd(22)}${String(ranks.length).padStart(5)}` +
      `${String(median(ranks)).padStart(9)}` +
      `${share(ranks, HOT).padStart(8)}${share(ranks, WARM).padStart(7)}` +
      `${share(ranks, COLD).padStart(9)}`,
  );

  console.log('\nХУДШИЕ СЛУЧАИ — здесь игрок решит, что игра его не поняла\n');
  const worst = all
    .filter((m): m is Measured & { rank: number } => m.rank !== null)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 15);
  for (const { secret, guess, rank } of worst) {
    console.log(
      `  ${`${secret} → ${guess}`.padEnd(32)}${String(rank).padStart(7)}`,
    );
  }

  if (missing.length > 0) {
    console.log('\nНЕТ В СЛОВАРЕ — игра ответит «не знаю такого слова»\n');
    for (const { secret, guess } of missing) {
      console.log(`  ${secret} → ${guess}`);
    }
  }

  console.log('\nДАЛЁКИЕ ПАРЫ — чем больше, тем лучше\n');
  const far = measure(service, UNRELATED);
  const farRanks = far.flatMap((m) => (m.rank === null ? [] : [m.rank]));
  console.log(`  медиана ${median(farRanks)}`);
  console.log(
    `  дальше ${COLD}: ${share(farRanks, Number.MAX_SAFE_INTEGER)} — ` +
      `${(100 - Number(share(farRanks, COLD).replace('%', ''))).toFixed(0)}%`,
  );
  const tooClose = far
    .filter((m): m is Measured & { rank: number } => m.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);
  console.log('\n  ближе всех подобрались:');
  for (const { secret, guess, rank } of tooClose) {
    console.log(
      `    ${`${secret} → ${guess}`.padEnd(32)}${String(rank).padStart(7)}`,
    );
  }
  console.log();
}

main();
