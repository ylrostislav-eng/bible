/**
 * Что изменила модель.
 *
 * Запуск: `pnpm --filter @bible-arena/api semantics:rerank`
 *
 * Файл `data/rerank-ru.json.gz` появляется после
 * `scripts/rerank-with-model.mjs` и переставляет верх списка. Вопрос, ради
 * которого написан этот отчёт, — переставляет ли он его **в лучшую
 * сторону**. Ответить на него взглядом на игру нельзя: числа станут
 * другими в любом случае, и «другое» легко принять за «лучшее».
 *
 * Поэтому здесь считается одно и то же расстояние дважды — с моделью и
 * без неё (`rerankWeight: 0`), — и печатаются две вещи:
 *
 *  1. **Контрольные пары.** Это ответ. Если модель полезна, связанные
 *     слова после неё стоят ближе; если она шумит — дальше. Пары написаны
 *     задолго до того, как модель появилась, и она их не видела.
 *  2. **Кто куда переехал.** Это не оценка, а способ понять, что модель
 *     вообще делает: какие слова она подняла и какие уронила. Читать
 *     глазами и спрашивать себя, согласен ли ты с ней.
 *
 * Замер идёт только по тем загаданным словам, которые в файле есть.
 * Прогон на пяти словах меряется по пяти — это мало для вывода, но
 * достаточно, чтобы решить, стоит ли ждать все 259.
 */
import { CONTROL } from './control-pairs';
import { CONTROL_DEEP } from './control-pairs-2';
import { RELATED, type Pair } from './benchmark-pairs';
import { DEFAULT_FUSION, SemanticsService } from './semantics.service';

const HOT = 300;
const WARM = 2000;

/** Без модели: та же настройка, но её голос ничего не весит. */
const WITHOUT_MODEL = { ...DEFAULT_FUSION, rerankWeight: 0 };

interface Moved {
  secret: string;
  guess: string;
  before: number;
  after: number;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function share(values: number[], limit: number): string {
  if (values.length === 0) return '—';
  const hits = values.filter((value) => value <= limit).length;
  return `${Math.round((hits / values.length) * 100)}%`;
}

function line(label: string, ranks: number[]): string {
  return [
    label.padEnd(14),
    String(median(ranks)).padStart(8),
    share(ranks, HOT).padStart(9),
    share(ranks, WARM).padStart(8),
    String(ranks.length > 0 ? Math.max(...ranks) : '—').padStart(9),
  ].join('');
}

function main(): void {
  const service = new SemanticsService();
  service.onModuleInit();

  const touched = service.rerankedWords();
  if (touched.length === 0) {
    console.log(
      '\nФайла с порядком от модели нет — мерить нечего.\n' +
        'Сначала: node scripts/rerank-with-model.mjs --limit 5\n',
    );
    return;
  }

  console.log(`\nМодель переставила слов: ${touched.length}`);
  console.log(`  ${touched.slice(0, 20).join(', ')}`);
  if (touched.length > 20) console.log(`  …и ещё ${touched.length - 20}`);

  // Все пары, какие есть, — но только про эти загаданные слова.
  const inScope = new Set(touched);
  const pairs: Pair[] = [
    ...CONTROL,
    ...CONTROL_DEEP,
    ...Object.values(RELATED).flat(),
  ].filter((pair) => inScope.has(pair.secret));

  const before: number[] = [];
  const after: number[] = [];
  const moved: Moved[] = [];

  // Ранжирование стоит около ста миллисекунд, поэтому считаем его один раз
  // на загаданное слово, а не на пару.
  const cache = new Map<
    string,
    {
      with: ReturnType<SemanticsService['rank']>;
      without: ReturnType<SemanticsService['rank']>;
    }
  >();

  for (const { secret, guess } of pairs) {
    const s = service.lookup(secret);
    const g = service.lookup(guess);
    if (s === null || g === null) continue;
    let ranking = cache.get(secret);
    if (!ranking) {
      ranking = {
        with: service.rank(s, DEFAULT_FUSION),
        without: service.rank(s, WITHOUT_MODEL),
      };
      cache.set(secret, ranking);
    }
    const wasAt = ranking.without.rankOf(g);
    const nowAt = ranking.with.rankOf(g);
    if (wasAt === null || nowAt === null) continue;
    before.push(wasAt);
    after.push(nowAt);
    if (wasAt !== nowAt)
      moved.push({ secret, guess, before: wasAt, after: nowAt });
  }

  console.log(`\nКОНТРОЛЬНЫЕ ПАРЫ ПРО ЭТИ СЛОВА: ${before.length}\n`);
  if (before.length === 0) {
    console.log(
      '  Ни одной пары про эти слова не написано — судить не по чему.\n' +
        '  Прогоните больше слов или допишите пары в control-pairs-2.ts.\n',
    );
  } else {
    console.log(
      `${''.padEnd(14)}${'медиана'.padStart(8)}${'горячо'.padStart(9)}${'тепло'.padStart(8)}${'худшее'.padStart(9)}`,
    );
    console.log(line('без модели', before));
    console.log(line('с моделью', after));

    const diff = median(after) - median(before);
    const verdict =
      diff < 0
        ? 'Модель помогает: связанные слова стали ближе.'
        : diff > 0
          ? 'Модель мешает: связанные слова отъехали. Гнать все 259 не стоит.'
          : 'Модель ничего не изменила на этих парах.';
    console.log(`\n${verdict}`);
  }

  moved.sort((a, b) => a.after - b.after || a.before - b.before);
  const up = moved.filter((m) => m.after < m.before).slice(0, 15);
  const down = moved.filter((m) => m.after > m.before);
  down.sort((a, b) => b.after - b.before - (a.after - a.before));

  console.log('\nКОГО МОДЕЛЬ ПОДНЯЛА\n');
  console.log(
    `${'загадано'.padEnd(16)}${'слово'.padEnd(18)}${'было'.padStart(8)}${'стало'.padStart(8)}`,
  );
  for (const m of up) {
    console.log(
      `${m.secret.padEnd(16)}${m.guess.padEnd(18)}${String(m.before).padStart(8)}${String(m.after).padStart(8)}`,
    );
  }
  if (up.length === 0) console.log('  никого');

  console.log('\nКОГО УРОНИЛА (тут и видно, где она врёт)\n');
  console.log(
    `${'загадано'.padEnd(16)}${'слово'.padEnd(18)}${'было'.padStart(8)}${'стало'.padStart(8)}`,
  );
  for (const m of down.slice(0, 15)) {
    console.log(
      `${m.secret.padEnd(16)}${m.guess.padEnd(18)}${String(m.before).padStart(8)}${String(m.after).padStart(8)}`,
    );
  }
  if (down.length === 0) console.log('  никого');

  // Верх списка глазами: даже без единой контрольной пары видно, кого
  // модель считает ближайшим к загаданному, и с этим можно спорить.
  console.log('\nПЕРВАЯ ДЕСЯТКА ПО КАЖДОМУ СЛОВУ\n');
  for (const secret of touched.slice(0, 10)) {
    const s = service.lookup(secret);
    if (s === null) continue;
    const ranking = cache.get(secret) ?? {
      with: service.rank(s, DEFAULT_FUSION),
      without: service.rank(s, WITHOUT_MODEL),
    };
    const top = (r: ReturnType<SemanticsService['rank']>): string =>
      r
        .closest(10)
        .map((n) => n.word)
        .join(', ');
    console.log(`${secret}`);
    console.log(`  без модели: ${top(ranking.without)}`);
    console.log(`  с моделью:  ${top(ranking.with)}`);
  }
  console.log();
}

main();
