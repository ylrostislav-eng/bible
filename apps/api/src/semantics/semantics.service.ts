import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SpellIndex,
  normalizeInput,
  resolveInput,
  type ResolvedInput,
} from '@bible-arena/shared';
import { KNOWN_LINKS } from './known-links';

/**
 * Смысловое расстояние между словами — то, чем игра меряет «горячо/холодно».
 *
 * Игрок вправе написать любое русское слово и получить внятное число.
 * Одной мерой это не даётся: у каждой свой слепой угол, и они разные.
 *
 *  * **Смысл** (ConceptNet Numberbatch, CC BY-SA 4.0) — векторы, построенные
 *    на графе знаний. Знают, что Иерусалим город, а овца животное. Но
 *    меряют взаимозаменяемость, поэтому «потоп» от «ковчега» у них далеко:
 *    предмет и событие непохожи, хотя это одна история.
 *  * **Речь** (Navec, MIT, обучен на 145 ГБ русской прозы) — что с чем
 *    стоит рядом в живом языке. Знает про хлеб и нож, про собаку и кость.
 *    Но путается там, где слово многозначно.
 *  * **Сюжет** (сам синодальный текст) — слова одних глав и сцен. Отвечает
 *    за библейскую связь, которой нет ни в одном общем корпусе, и молчит
 *    обо всём, чего в Писании нет.
 *  * **Знание** (`known-links.ts`) — связи, выписанные прямо. У трёх мер
 *    выше общий слепой угол: связь, очевидная любому, но редко выраженная
 *    рядом стоящими словами. Вавилон и башня — одна история для всех, а по
 *    замеру башня стояла на 1219 месте.
 *
 * Словарь лежит в `apps/api/data/semantics-ru.bin.gz` и собирается
 * скриптом `scripts/build-semantics.py`. Он в репозитории: двадцать два
 * мегабайта — небольшая плата за то, что игра работает сразу после
 * `git clone`, без выкачивания моделей.
 *
 * Формат файла:
 *
 *     "BSEM3"                                  подпись
 *     uint32 dims, lemmas, forms, episodes     заголовок
 *     леммы     — uint8 длина + utf8, по убыванию частоты
 *     формы     — uint8 длина + utf8 + uint32 номер леммы
 *     смысл     — lemmas × dims, int8 (единичный вектор × 127)
 *     речь      — то же; нулевой вектор значит «нет в корпусе»
 *     эпизоды   — uint32 сколько слов, затем сами номера лемм
 *
 * Леммы отсортированы по частоте не для красоты: номер в этом списке и
 * есть «расстояние», которое видит игрок, и редкое слово не должно
 * оказываться на втором месте только потому, что оно похоже.
 */

const MAGIC = 'BSEM3';

/**
 * Смягчение при слиянии мест.
 *
 * Без него первое место весило бы вдвое больше второго, и любая случайная
 * перестановка наверху одного списка перекраивала бы весь итог. Шестьдесят
 * — обычное значение для такого слияния: разница между первым и вторым
 * местом остаётся заметной, но перестаёт быть решающей.
 */
const RANK_SMOOTHING = 60;

/**
 * Настройки слияния.
 *
 * Вынесены в параметр не ради гибкости, а ради честного подбора: значения
 * выбираются замером на отведённой для этого половине набора
 * (`CONTROL_DEEP_DEV`), а не на глаз. Игра всегда зовёт `rank` без
 * аргумента и получает эти значения.
 */
export interface FusionTuning {
  /** Насколько весит выписанная руками связь против статистики. */
  statedWeight: number;
  /**
   * Своё смягчение для выписанных связей. У статистики места идут до
   * пятидесяти тысяч, а здесь их десятки, и общее смягчение съедало бы всю
   * разницу между первым и шестым местом списка.
   */
  statedSmoothing: number;
  /**
   * Учитывать ли связи через одну: голубь связан с Ноем, Ной с ковчегом,
   * значит голубь и ковчег тоже связаны — слабее, но связаны. Ноль
   * выключает.
   */
  secondOrderWeight: number;
  /**
   * Насколько весит порядок, расставленный моделью. Ноль — не учитывать,
   * даже если файл есть.
   */
  rerankWeight: number;
}

/**
 * Выбрано замером на `CONTROL_DEEP_DEV`, не на глаз. На той половине:
 * медиана 50 → 15, доля попаданий в «горячо» 59% → 70%, а посторонние пары
 * не сдвинулись.
 *
 * Своё смягчение вдесятеро меньше общего, потому что шкалы разные: у
 * статистики места идут до пятидесяти тысяч, а выписанных связей у слова
 * десяток, и общее смягчение стирало разницу между первым и шестым.
 * Больший вес поверх этого не дал ничего — значит, дело было в шкале, а не
 * в том, что знание недооценено.
 */
export const DEFAULT_FUSION: FusionTuning = {
  statedWeight: 1,
  statedSmoothing: 10,
  secondOrderWeight: 1,
  rerankWeight: 1,
};

/** Где искать словарь. Второй путь — для собранного `dist`, из которого
 * до корня репозитория на уровень дальше. */
/**
 * Порядок верха списка, расставленный языковой моделью.
 *
 * Файла может не быть — тогда игра работает ровно как раньше. Он не
 * обязателен и появляется только после `scripts/rerank-with-model.mjs`.
 */
const RERANK_PATHS = [
  join(process.cwd(), 'data/rerank-ru.json.gz'),
  join(process.cwd(), 'apps/api/data/rerank-ru.json.gz'),
  join(__dirname, '../../data/rerank-ru.json.gz'),
  join(__dirname, '../../../data/rerank-ru.json.gz'),
];

const CANDIDATE_PATHS = [
  join(process.cwd(), 'data/semantics-ru.bin.gz'),
  join(process.cwd(), 'apps/api/data/semantics-ru.bin.gz'),
  join(__dirname, '../../data/semantics-ru.bin.gz'),
  join(__dirname, '../../../data/semantics-ru.bin.gz'),
];

export interface SemanticNeighbour {
  word: string;
  /** Место в списке близости: 1 — само загаданное слово. */
  rank: number;
}

/** Полностью отранжированный словарь относительно одного слова. */
export class SemanticRanking {
  constructor(
    private readonly service: SemanticsService,
    /** Номер загаданной леммы. */
    readonly secret: number,
    /** Для каждой леммы — её место, считая от 1. */
    private readonly places: Int32Array,
    /** Леммы в порядке близости. */
    private readonly order: Int32Array,
  ) {}

  /** Место слова, или `null`, если такого слова словарь не знает. */
  rankOf(lemmaIndex: number): number {
    return this.places[lemmaIndex];
  }

  /** Сколько всего слов участвует в ранжировании. */
  get size(): number {
    return this.places.length;
  }

  /**
   * Однокоренное ли слово загаданному.
   *
   * «Свиток» и «свитка» — по словарю разные слова, а по виду одно, и
   * показывать их рядом с ответом нельзя: подсказка становится ответом, а
   * разбор после игры выглядит глупо. Сравниваем начало: у форм одного
   * слова совпадает корень, у «листа» и «рулона» — ничего.
   */
  private sameRoot(word: string): boolean {
    const secret = this.service.lemmaAt(this.secret);
    const needed = Math.min(4, secret.length - 2);
    if (needed <= 0) return word === secret;
    let shared = 0;
    while (
      shared < word.length &&
      shared < secret.length &&
      word[shared] === secret[shared]
    ) {
      shared += 1;
    }
    return shared >= needed;
  }

  /**
   * Слово, стоящее примерно на этом месте, — для подсказки.
   *
   * «Примерно» здесь по делу: точное место может быть уже названо игроком
   * или оказаться однокоренным ответу, и тогда подсказка либо не
   * подскажет ничего, либо выдаст всё. Ищем от заданного места в обе
   * стороны, ближе к загаданному — в первую очередь.
   */
  wordAt(
    rank: number,
    exclude: ReadonlySet<string>,
    suitable?: (lemmaIndex: number) => boolean,
  ): SemanticNeighbour | null {
    // В `order` первым лежит само загаданное слово, поэтому место `rank`
    // — это позиция `rank - 1`; ниже первой позиции не опускаемся, иначе
    // подсказкой окажется сам ответ.
    const start = Math.min(Math.max(rank - 1, 1), this.order.length - 1);
    // Сначала ищем среди подходящих, и только если таких рядом нет вовсе —
    // среди любых. Иначе редкое слово в нужном месте выигрывало бы у
    // обычного через одну позицию, а подсказка тем и полезна, что называет
    // то, о чём человек мог подумать сам.
    for (const filtered of [true, false]) {
      if (filtered && !suitable) continue;
      for (let step = 0; step < this.order.length; step += 1) {
        for (const at of [start - step, start + step]) {
          if (at < 1 || at >= this.order.length) continue;
          const lemma = this.order[at];
          if (filtered && suitable && !suitable(lemma)) continue;
          const word = this.service.lemmaAt(lemma);
          if (!exclude.has(word) && !this.sameRoot(word)) {
            return { word, rank: at + 1 };
          }
        }
      }
    }
    return null;
  }

  /** Ближайшие слова — подсказки и «а вот что было рядом» после игры. */
  closest(count: number): SemanticNeighbour[] {
    const result: SemanticNeighbour[] = [];
    for (let i = 1; i < this.order.length && result.length < count; i += 1) {
      const word = this.service.lemmaAt(this.order[i]);
      // Однокоренные пропускаем: «свитка» рядом со «свитком» — не разбор,
      // а описка, и выглядит так, будто игра не понимает, что показывает.
      if (this.sameRoot(word)) continue;
      result.push({ word, rank: i + 1 });
    }
    return result;
  }
}

@Injectable()
export class SemanticsService implements OnModuleInit {
  private readonly logger = new Logger(SemanticsService.name);

  private dims = 0;
  private lemmas: string[] = [];
  /** Смысл: похожесть по графу знаний. */
  private meaning: Int8Array = new Int8Array(0);
  private meaningNorms: Float64Array = new Float64Array(0);
  /** Речь: сочетаемость по корпусу. Нулевая длина — слова нет в корпусе. */
  private usage: Int8Array = new Int8Array(0);
  private usageNorms: Float64Array = new Float64Array(0);
  /** Слова каждого эпизода подряд; границы — в `episodeStart`. */
  private episodeWords: Int32Array = new Int32Array(0);
  private episodeStart: Int32Array = new Int32Array(1);
  /** То же наизнанку: эпизоды каждого слова, границы — в `wordStart`. */
  private wordEpisodes: Int32Array = new Int32Array(0);
  private wordStart: Int32Array = new Int32Array(1);
  /** В скольких эпизодах встречается слово. */
  private episodeCount: Int32Array = new Int32Array(0);
  /** Любое написание — слово или его форма — к номеру леммы. */
  private readonly index = new Map<string, number>();
  /**
   * Выписанные вручную связи — см. `known-links.ts`. Для каждого слова
   * список соседей по убыванию близости, уже в обе стороны.
   */
  private readonly known = new Map<number, number[]>();
  /** Связи через одну: соседи соседей, которых нет среди прямых. */
  private readonly knownSecond = new Map<number, number[]>();
  /** Верх списка в порядке модели: слово → номера лемм по близости. */
  private readonly reranked = new Map<number, number[]>();
  private spell: SpellIndex | null = null;
  private failure: string | null = null;

  onModuleInit(): void {
    const path = CANDIDATE_PATHS.find((candidate) => existsSync(candidate));
    if (!path) {
      // Не роняем приложение: без словаря не работает одна игра, а не всё
      // остальное. Но говорим об этом громко — молча выключенная игра
      // хуже отсутствующей.
      this.failure = `Словарь смыслов не найден. Искал: ${CANDIDATE_PATHS.join(', ')}`;
      this.logger.error(this.failure);
      return;
    }

    const started = Date.now();
    try {
      // Файл лежит сжатым — см. `scripts/build-semantics.py`.
      this.load(gunzipSync(readFileSync(path)));
    } catch (error) {
      this.failure = `Словарь смыслов не читается: ${(error as Error).message}`;
      this.logger.error(this.failure);
      return;
    }
    this.loadKnownLinks();
    this.loadRerank();
    this.logger.log(
      `Словарь смыслов: ${this.lemmas.length} слов, ${this.index.size} написаний, ` +
        `${this.known.size} со вписанными связями, ${Date.now() - started} мс`,
    );
  }

  private load(buffer: Buffer): void {
    if (buffer.toString('latin1', 0, MAGIC.length) !== MAGIC) {
      throw new Error('неверная подпись файла');
    }
    this.dims = buffer.readUInt32LE(5);
    const lemmaCount = buffer.readUInt32LE(9);
    const formCount = buffer.readUInt32LE(13);
    const episodeCount = buffer.readUInt32LE(17);
    let offset = 21;

    this.lemmas = new Array<string>(lemmaCount);
    for (let i = 0; i < lemmaCount; i += 1) {
      const length = buffer.readUInt8(offset);
      offset += 1;
      const word = buffer.toString('utf8', offset, offset + length);
      offset += length;
      this.lemmas[i] = word;
      this.index.set(word, i);
    }
    for (let i = 0; i < formCount; i += 1) {
      const length = buffer.readUInt8(offset);
      offset += 1;
      const form = buffer.toString('utf8', offset, offset + length);
      offset += length;
      this.index.set(form, buffer.readUInt32LE(offset));
      offset += 4;
    }

    // Копия, а не вид на буфер: `readFileSync` возвращает Buffer из общего
    // пула, и держать на него ссылку означает удерживать чужую память.
    const readVectors = (): Int8Array => {
      const size = lemmaCount * this.dims;
      const copy = new Int8Array(size);
      copy.set(new Int8Array(buffer.buffer, buffer.byteOffset + offset, size));
      offset += size;
      return copy;
    };
    this.meaning = readVectors();
    this.usage = readVectors();

    offset = this.loadEpisodes(buffer, offset, lemmaCount, episodeCount);
    if (buffer.length !== offset) {
      throw new Error(`ожидалось ${offset} байт, а в файле ${buffer.length}`);
    }

    // Длины считаем один раз: дальше косинус — это только скалярное
    // произведение. Нулевая длина у второго набора означает, что слова нет
    // в корпусе речи, и эта мера про него просто молчит.
    const lengths = (vectors: Int8Array): Float64Array => {
      const norms = new Float64Array(lemmaCount);
      for (let i = 0; i < lemmaCount; i += 1) {
        let sum = 0;
        const base = i * this.dims;
        for (let d = 0; d < this.dims; d += 1) sum += vectors[base + d] ** 2;
        norms[i] = Math.sqrt(sum);
      }
      return norms;
    };
    this.meaningNorms = lengths(this.meaning);
    this.usageNorms = lengths(this.usage);

    // Поиск ближайшего написания строим по леммам: подставлять игроку
    // «ковчегами» вместо «ковчега» незачем, а лемм вчетверо меньше, значит
    // и индекс вчетверо легче.
    this.spell = new SpellIndex(this.lemmas);
  }

  /**
   * Читает эпизоды Писания и сразу же выворачивает их наизнанку.
   *
   * В файле лежит «какие слова в этом эпизоде» — так его дешевле собрать.
   * Игре нужно и обратное, «в каких эпизодах это слово», причём быстро.
   * Обе таблицы плоские, со списком границ вместо массива массивов:
   * полтора миллиона вхождений в виде отдельных массивов стоили бы на
   * порядок больше памяти и заметного времени на сборку мусора.
   */
  private loadEpisodes(
    buffer: Buffer,
    start: number,
    lemmaCount: number,
    episodeCount: number,
  ): number {
    let offset = start;
    this.episodeStart = new Int32Array(episodeCount + 1);
    let total = 0;
    for (let e = 0; e < episodeCount; e += 1) {
      const size = buffer.readUInt32LE(offset);
      offset += 4 + size * 4;
      total += size;
      this.episodeStart[e + 1] = total;
    }

    this.episodeWords = new Int32Array(total);
    this.episodeCount = new Int32Array(lemmaCount);
    offset = start;
    let written = 0;
    for (let e = 0; e < episodeCount; e += 1) {
      const size = buffer.readUInt32LE(offset);
      offset += 4;
      for (let k = 0; k < size; k += 1) {
        const lemma = buffer.readUInt32LE(offset);
        offset += 4;
        this.episodeWords[written] = lemma;
        written += 1;
        this.episodeCount[lemma] += 1;
      }
    }

    this.wordStart = new Int32Array(lemmaCount + 1);
    for (let i = 0; i < lemmaCount; i += 1) {
      this.wordStart[i + 1] = this.wordStart[i] + this.episodeCount[i];
    }
    this.wordEpisodes = new Int32Array(total);
    const cursor = Int32Array.from(this.wordStart.subarray(0, lemmaCount));
    for (let e = 0; e < episodeCount; e += 1) {
      for (let k = this.episodeStart[e]; k < this.episodeStart[e + 1]; k += 1) {
        const lemma = this.episodeWords[k];
        this.wordEpisodes[cursor[lemma]] = e;
        cursor[lemma] += 1;
      }
    }

    return offset;
  }

  /**
   * Разворачивает выписанные связи в обе стороны.
   *
   * В файле «вавилон → башня» записано один раз; игре нужно и обратное,
   * иначе загаданная башня не знала бы про Вавилон. Порядок в обратную
   * сторону берётся по позиции в исходном списке: чем выше слово стояло у
   * соседа, тем ближе сосед к нему.
   */
  private loadKnownLinks(): void {
    const collected = new Map<number, { at: number; lemma: number }[]>();
    const add = (from: number, to: number, at: number): void => {
      if (from === to) return;
      const list = collected.get(from) ?? [];
      if (!list.some((entry) => entry.lemma === to))
        list.push({ at, lemma: to });
      collected.set(from, list);
    };

    for (const [word, links] of Object.entries(KNOWN_LINKS)) {
      const source = this.lookup(word);
      if (source === null) {
        // Слово, которого нет в словаре, — это опечатка в списке, и
        // молчать о ней нельзя: связь просто не заработает.
        this.logger.warn(`Вписанные связи: нет в словаре слова «${word}»`);
        continue;
      }
      links.forEach((link, at) => {
        const target = this.lookup(link);
        if (target === null) {
          this.logger.warn(
            `Вписанные связи: нет в словаре слова «${link}» (у «${word}»)`,
          );
          return;
        }
        add(source, target, at);
        add(target, source, at);
      });
    }

    for (const [lemma, list] of collected) {
      this.known.set(
        lemma,
        list.sort((a, b) => a.at - b.at).map((entry) => entry.lemma),
      );
    }

    // Второй круг: соседи соседей. Голубь выписан у Ноя, Ной — у ковчега,
    // значит голубь и ковчег тоже связаны. Писать это руками пришлось бы
    // квадратом от числа связей, а вывести — один проход.
    for (const [lemma, direct] of this.known) {
      const seen = new Set<number>(direct);
      seen.add(lemma);
      const second: number[] = [];
      for (const neighbour of direct) {
        for (const far of this.known.get(neighbour) ?? []) {
          if (!seen.has(far)) {
            seen.add(far);
            second.push(far);
          }
        }
      }
      if (second.length > 0) this.knownSecond.set(lemma, second);
    }
  }

  /**
   * Читает порядок, расставленный моделью, если он собран.
   *
   * Его отсутствие — не ошибка: игра работает и без него, просто верх
   * списка остаётся таким, каким его сделали четыре меры. Поэтому здесь
   * `log`, а не `error`.
   */
  private loadRerank(): void {
    const path = RERANK_PATHS.find((candidate) => existsSync(candidate));
    if (!path) {
      this.logger.log(
        'Порядок от модели не найден — работаем на четырёх мерах',
      );
      return;
    }
    try {
      const raw = JSON.parse(
        gunzipSync(readFileSync(path)).toString('utf8'),
      ) as Record<string, string[]>;
      for (const [word, order] of Object.entries(raw)) {
        const secret = this.lookup(word);
        if (secret === null) continue;
        const lemmas: number[] = [];
        for (const near of order) {
          const lemma = this.lookup(near);
          if (lemma !== null && lemma !== secret) lemmas.push(lemma);
        }
        if (lemmas.length > 0) this.reranked.set(secret, lemmas);
      }
      this.logger.log(`Порядок от модели: ${this.reranked.size} слов`);
    } catch (error) {
      // Испорченный файл не должен ронять игру: без него она просто
      // возвращается к четырём мерам.
      this.logger.error(
        `Порядок от модели не читается: ${(error as Error).message}`,
      );
    }
  }

  /** Готов ли словарь. Если нет, игру, которая на нём стоит, надо честно
   * выключить, а не показывать пустой экран. */
  get ready(): boolean {
    return this.lemmas.length > 0;
  }

  /** Почему словарь не готов — для страницы состояния и логов. */
  get problem(): string | null {
    return this.failure;
  }

  lemmaAt(index: number): string {
    return this.lemmas[index];
  }

  /** Сколько слов участвует в ранжировании — знаменатель для «места». */
  get size(): number {
    return this.lemmas.length;
  }

  /**
   * В скольких эпизодах Писания встречается слово.
   *
   * Мера того, насколько слово в Писании «своё»: у «Пилата» эпизодов
   * десятки, у «зилота» — единицы, хотя по общерусской частотности они
   * одинаково редки.
   */
  episodesFor(lemmaIndex: number): number {
    return this.episodeCount[lemmaIndex] ?? 0;
  }

  /** Номер леммы по любому написанию, включая падежные формы. */
  lookup(word: string): number | null {
    const found = this.index.get(normalizeInput(word));
    return found === undefined ? null : found;
  }

  /**
   * Разбирает то, что напечатал игрок: раскладка, опечатки, падеж.
   *
   * Возвращает и найденное слово, и то, что пришлось починить, — чтобы
   * экран мог сказать «понял как „ковчег“», а не молча подменить ввод.
   */
  resolve(raw: string): (ResolvedInput & { lemma: number }) | null {
    const resolved = resolveInput(
      raw,
      (word) => this.index.has(word),
      (word) => this.spell?.findClosest(word) ?? null,
    );
    if (!resolved) return null;
    const lemma = this.index.get(resolved.word);
    if (lemma === undefined) return null;
    return { ...resolved, lemma };
  }

  /**
   * Косинус между вектором загаданного слова и всеми остальными.
   *
   * Слово с нулевой длиной вектора в этом наборе отсутствует; такому
   * достаётся −1, чтобы оно ушло в конец списка и не мешалось, а слияние
   * потом вовсе не станет его учитывать.
   */
  private closeness(
    vectors: Int8Array,
    norms: Float64Array,
    lemmaIndex: number,
  ): Float64Array {
    const count = this.lemmas.length;
    const scores = new Float64Array(count);
    if (norms[lemmaIndex] === 0) {
      scores.fill(-1);
      return scores;
    }
    const base = lemmaIndex * this.dims;
    for (let j = 0; j < count; j += 1) {
      if (norms[j] === 0) {
        scores[j] = -1;
        continue;
      }
      let dot = 0;
      const other = j * this.dims;
      for (let d = 0; d < this.dims; d += 1)
        dot += vectors[base + d] * vectors[other + d];
      scores[j] = dot / (norms[lemmaIndex] * norms[j]);
    }
    return scores;
  }

  /**
   * Связанность по Писанию: как часто слова стоят в одних эпизодах.
   *
   * Считается косинус между двоичными векторами присутствия — то есть
   * «сколько эпизодов общих» с поправкой на то, что частому слову общие
   * эпизоды достаются даром. Ноль означает не «далеко», а «в Писании эти
   * слова не встречались вместе ни разу», и слияние обязано различать эти
   * два случая.
   */
  private association(lemmaIndex: number): Float64Array {
    const count = this.lemmas.length;
    const scores = new Float64Array(count);
    const mine = this.episodesOf(lemmaIndex);
    if (mine.length === 0) return scores;

    // Считаем общие эпизоды одним проходом по эпизодам загаданного слова:
    // перебирать пары слов было бы в тысячи раз дороже.
    for (const episode of mine) {
      const start = this.episodeStart[episode];
      const end = this.episodeStart[episode + 1];
      for (let k = start; k < end; k += 1) scores[this.episodeWords[k]] += 1;
    }

    const mineRoot = Math.sqrt(mine.length);
    for (let j = 0; j < count; j += 1) {
      if (scores[j] === 0) continue;
      scores[j] /= mineRoot * Math.sqrt(this.episodeCount[j]);
    }
    return scores;
  }

  /** Номера эпизодов, в которых встречается слово. */
  private episodesOf(lemmaIndex: number): Int32Array {
    const start = this.wordStart[lemmaIndex];
    return this.wordEpisodes.subarray(start, this.wordStart[lemmaIndex + 1]);
  }

  /**
   * Места по вписанным вручную связям, или `null`, если для этого слова
   * ничего не выписано.
   *
   * Отдельная мера, а не поправка к остальным: она знает мало слов, но про
   * них знает точно, и смешивать её с оценками, у которых охват полный,
   * значило бы разбавить единственное, ради чего она есть.
   */
  private stated(lemmaIndex: number, tuning: FusionTuning): Int32Array | null {
    const links = this.known.get(lemmaIndex);
    if (!links) return null;
    const places = new Int32Array(this.lemmas.length);
    // Первое место — само загаданное слово, и это не формальность: у
    // остальных мер оно первое по построению, а здесь его в списке нет, и
    // без этой строки выписанная связь обгоняла бы сам ответ.
    places[lemmaIndex] = 1;
    links.forEach((lemma, at) => {
      places[lemma] = at + 2;
    });
    if (tuning.secondOrderWeight > 0) {
      // Связи через одну идут следом за прямыми и потому весят меньше —
      // отдельного коэффициента им не нужно, место само всё скажет.
      const after = links.length + 2;
      (this.knownSecond.get(lemmaIndex) ?? []).forEach((lemma, at) => {
        if (places[lemma] === 0) places[lemma] = after + at;
      });
    }
    return places;
  }

  /** Загаданные слова, которые модель успела переставить. Для отчёта. */
  rerankedWords(): string[] {
    return [...this.reranked.keys()].map((lemma) => this.lemmas[lemma]);
  }

  /** Места из порядка модели, или `null`, если для слова его нет. */
  private modelOrder(lemmaIndex: number): Int32Array | null {
    const order = this.reranked.get(lemmaIndex);
    if (!order) return null;
    const places = new Int32Array(this.lemmas.length);
    places[lemmaIndex] = 1;
    order.forEach((lemma, at) => {
      if (places[lemma] === 0) places[lemma] = at + 2;
    });
    return places;
  }

  /**
   * Ранжирует весь словарь относительно загаданного слова.
   *
   * Три меры видят разное. **Смысл** знает, что овца — животное, а
   * Иерусалим — город. **Речь** знает, что рядом с хлебом бывает нож.
   * **Сюжет** знает, что ковчег и потоп — одна история. Ни одной из них
   * поодиночке не хватает: по смыслу потоп был на 821 месте, по речи
   * далеко оказывается вода, а сюжет молчит обо всём, чего нет в Писании.
   *
   * Сливаются они по местам, а не по числам. У трёх мер разные шкалы:
   * 0.2 у одной и 0.2 у другой значат совсем разное, и складывать их
   * напрямую — значит незаметно отдать ответ той, у которой разброс шире.
   * Место в списке — величина, одинаковая для всех.
   *
   * Формула — сумма обратных мест: слово поднимается, если стоит высоко
   * хотя бы у одной меры. Поэтому «потоп» оказывается рядом с ковчегом, а
   * «стул», далёкий по всем трём, остаётся в конце.
   *
   * Считается один раз на загаданное слово; дальше каждая догадка стоит
   * одного обращения к массиву.
   */
  rank(
    lemmaIndex: number,
    tuning: FusionTuning = DEFAULT_FUSION,
  ): SemanticRanking {
    const count = this.lemmas.length;
    const sense = this.closeness(this.meaning, this.meaningNorms, lemmaIndex);
    const byMeaning = placesOf(sense);
    const spoken = this.closeness(this.usage, this.usageNorms, lemmaIndex);
    const bySpeech = placesOf(spoken);
    const story = this.association(lemmaIndex);
    const byStory = placesOf(story);
    const stated = this.stated(lemmaIndex, tuning);
    const byModel = this.modelOrder(lemmaIndex);

    const fused = new Float64Array(count);
    for (let j = 0; j < count; j += 1) {
      // Мера, которая про это слово ничего не знает, молчит, а не голосует
      // за «далеко». Иначе половина словаря делила бы один и тот же хвост,
      // и «стул» подтягивался бы к «ковчегу» просто за компанию.
      if (sense[j] >= 0) fused[j] += 1 / (RANK_SMOOTHING + byMeaning[j]);
      if (spoken[j] >= 0) fused[j] += 1 / (RANK_SMOOTHING + bySpeech[j]);
      if (story[j] > 0) fused[j] += 1 / (RANK_SMOOTHING + byStory[j]);
      // Вписанная связь весит как очень высокое место у обычной меры: это
      // не догадка статистики, а знание, и оно должно перевешивать
      // случайное «слов рядом не встречалось».
      if (stated && stated[j] > 0) {
        fused[j] += tuning.statedWeight / (tuning.statedSmoothing + stated[j]);
      }
      // Модель расставляла только верх списка, поэтому её голос слышен
      // ровно там же, а ниже она молчит — как и всякая мера, которая про
      // слово ничего не знает.
      if (byModel && byModel[j] > 0) {
        fused[j] += tuning.rerankWeight / (tuning.statedSmoothing + byModel[j]);
      }
    }

    const places = placesOf(fused);
    const order = new Int32Array(count);
    for (let j = 0; j < count; j += 1) order[places[j] - 1] = j;

    return new SemanticRanking(this, lemmaIndex, places, order);
  }
}

/** Места слов по убыванию оценки: первое место — единица. */
function placesOf(scores: Float64Array): Int32Array {
  const count = scores.length;
  // Сортируем индексы, а не пары: при сорока тысячах слов это заметно
  // дешевле, чем создавать столько же объектов.
  const sorted = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => scores[b] - scores[a],
  );
  const places = new Int32Array(count);
  for (let position = 0; position < count; position += 1) {
    places[sorted[position]] = position + 1;
  }
  return places;
}
