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
 * Печатается три вещи:
 *
 *  1. **Как меняется всё от доверия к модели.** Голос модели смягчается
 *     константой: чем она меньше, тем сильнее модель решает. Крайности
 *     уже видели вживую — при жёстком доверии модель тянет наверх «ноем»
 *     к Адаму, при мягком меняет один слот из пятидесяти. Ответ где-то
 *     между, и выбирать его надо по числам.
 *  2. **Кто куда переехал.** Не оценка, а способ понять, что модель
 *     делает: кого подняла, кого уронила. Читать глазами.
 *  3. **Первая десятка.** Туда лезет мусор, если модели верить слишком
 *     сильно, и это видно сразу, без всяких средних.
 *
 * ## Чем меряем и почему именно этим
 *
 * Считаются только пары из `CONTROL_DEEP_DEV` — половины, отведённой под
 * подбор. Вторая половина (`CONTROL_DEEP_HELD`) сюда не попадает
 * намеренно: подобрав по ней константу, мы получили бы число, которое
 * говорит о нашей памяти, а не о качестве. Она ждёт одного замера в
 * самом конце.
 *
 * Первый набор (`CONTROL`) и пары замера (`RELATED`) печатаются отдельной
 * строкой — для полноты, но подбирать по ним нельзя: первый уже потрачен,
 * а вторые я видел, когда писал связи.
 *
 * Замер идёт только по тем загаданным словам, которые есть в файле.
 * Прогон на пяти словах даёт горстку пар — этого хватит решить, стоит ли
 * гнать все 259, но не хватит, чтобы выбрать константу.
 */
import { CONTROL } from './control-pairs';
import { CONTROL_DEEP_DEV } from './control-pairs-2';
import { RELATED, type Pair } from './benchmark-pairs';
import {
  DEFAULT_FUSION,
  SemanticsService,
  type FusionTuning,
} from './semantics.service';

const HOT = 300;
const WARM = 2000;

/**
 * Насколько верить модели, от «совсем не верить» до «верить как знанию,
 * написанному руками». Смягчение работает наоборот весу: чем меньше
 * число, тем громче голос.
 */
const TRUST: { label: string; tuning: FusionTuning }[] = [
  { label: 'без модели', tuning: { ...DEFAULT_FUSION, rerankWeight: 0 } },
  { label: 'смягчение 60', tuning: { ...DEFAULT_FUSION, rerankSmoothing: 60 } },
  { label: 'смягчение 30', tuning: { ...DEFAULT_FUSION, rerankSmoothing: 30 } },
  { label: 'смягчение 20', tuning: { ...DEFAULT_FUSION, rerankSmoothing: 20 } },
  { label: 'смягчение 10', tuning: { ...DEFAULT_FUSION, rerankSmoothing: 10 } },
];

/** Что сейчас стоит в игре — по нему считается «кто куда переехал». */
const NOW = DEFAULT_FUSION;
const OFF = TRUST[0].tuning;

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

function head(): void {
  console.log(
    `${''.padEnd(14)}${'медиана'.padStart(8)}${'горячо'.padStart(9)}${'тепло'.padStart(8)}${'худшее'.padStart(9)}`,
  );
}

/**
 * Места пар при заданном доверии. Ранжирование стоит около ста
 * миллисекунд, поэтому считается один раз на загаданное слово.
 */
function ranksFor(
  service: SemanticsService,
  pairs: Pair[],
  tuning: FusionTuning,
): number[] {
  const cache = new Map<number, ReturnType<SemanticsService['rank']>>();
  const out: number[] = [];
  for (const { secret, guess } of pairs) {
    const s = service.lookup(secret);
    const g = service.lookup(guess);
    if (s === null || g === null) continue;
    let ranking = cache.get(s);
    if (!ranking) {
      ranking = service.rank(s, tuning);
      cache.set(s, ranking);
    }
    const at = ranking.rankOf(g);
    if (at !== null) out.push(at);
  }
  return out;
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

  const inScope = new Set(touched);
  const dev = CONTROL_DEEP_DEV.filter((pair) => inScope.has(pair.secret));
  const rest = [...CONTROL, ...Object.values(RELATED).flat()].filter((pair) =>
    inScope.has(pair.secret),
  );

  console.log(
    `\nПО ЧЕМУ ПОДБИРАЕМ: CONTROL_DEEP_DEV, пар в деле ${dev.length}`,
  );
  if (dev.length < 10) {
    console.log(
      '  Этого мало для выбора константы — числа ниже читать как намёк,\n' +
        '  а не как ответ. Больше пар появится, когда модель пройдёт\n' +
        '  больше загаданных слов.',
    );
  }
  console.log();
  head();
  for (const { label, tuning } of TRUST) {
    console.log(line(label, ranksFor(service, dev, tuning)));
  }

  console.log(`\nДЛЯ ПОЛНОТЫ (подбирать по этим пар нельзя): ${rest.length}\n`);
  head();
  for (const { label, tuning } of TRUST) {
    console.log(line(label, ranksFor(service, rest, tuning)));
  }

  // Кто переехал — при том доверии, которое стоит в игре сейчас.
  const moved: Moved[] = [];
  const cache = new Map<
    string,
    {
      now: ReturnType<SemanticsService['rank']>;
      off: ReturnType<SemanticsService['rank']>;
    }
  >();
  for (const { secret, guess } of [...dev, ...rest]) {
    const s = service.lookup(secret);
    const g = service.lookup(guess);
    if (s === null || g === null) continue;
    let ranking = cache.get(secret);
    if (!ranking) {
      ranking = { now: service.rank(s, NOW), off: service.rank(s, OFF) };
      cache.set(secret, ranking);
    }
    const was = ranking.off.rankOf(g);
    const is = ranking.now.rankOf(g);
    if (was === null || is === null || was === is) continue;
    moved.push({ secret, guess, before: was, after: is });
  }

  const up = moved.filter((m) => m.after < m.before);
  up.sort((a, b) => b.before - b.after - (a.before - a.after));
  const down = moved.filter((m) => m.after > m.before);
  down.sort((a, b) => b.after - b.before - (a.after - a.before));

  const table = (title: string, rows: Moved[]): void => {
    console.log(`\n${title}\n`);
    console.log(
      `${'загадано'.padEnd(16)}${'слово'.padEnd(18)}${'было'.padStart(8)}${'стало'.padStart(8)}`,
    );
    for (const m of rows.slice(0, 15)) {
      console.log(
        `${m.secret.padEnd(16)}${m.guess.padEnd(18)}${String(m.before).padStart(8)}${String(m.after).padStart(8)}`,
      );
    }
    if (rows.length === 0) console.log('  никого');
  };

  table('КОГО МОДЕЛЬ ПОДНЯЛА', up);
  table('КОГО УРОНИЛА (тут и видно, где она врёт)', down);

  // Верх списка глазами: даже без единой контрольной пары видно, кого
  // модель считает ближайшим к загаданному, и с этим можно спорить.
  console.log('\nПЕРВАЯ ДЕСЯТКА ПО КАЖДОМУ СЛОВУ\n');
  const top = (r: ReturnType<SemanticsService['rank']>): string =>
    r
      .closest(10)
      .map((n) => n.word)
      .join(', ');
  for (const secret of touched.slice(0, 8)) {
    const s = service.lookup(secret);
    if (s === null) continue;
    console.log(`${secret}`);
    for (const { label, tuning } of TRUST) {
      console.log(`  ${label.padEnd(13)}${top(service.rank(s, tuning))}`);
    }
  }
  console.log();
}

main();
