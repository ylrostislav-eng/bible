import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SpellIndex,
  normalizeInput,
  resolveInput,
  type ResolvedInput,
} from '@bible-arena/shared';

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
 *
 * Словарь лежит в `apps/api/data/semantics-ru.bin` и собирается скриптом
 * `scripts/build-semantics.py`. Он в репозитории: тридцать мегабайт —
 * небольшая плата за то, что игра работает сразу после `git clone`, без
 * выкачивания моделей.
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

/** Где искать словарь. Второй путь — для собранного `dist`, из которого
 * до корня репозитория на уровень дальше. */
const CANDIDATE_PATHS = [
  join(process.cwd(), 'data/semantics-ru.bin'),
  join(process.cwd(), 'apps/api/data/semantics-ru.bin'),
  join(__dirname, '../../data/semantics-ru.bin'),
  join(__dirname, '../../../data/semantics-ru.bin'),
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

  /** Ближайшие слова — подсказки и «а вот что было рядом» после игры. */
  closest(count: number): SemanticNeighbour[] {
    const result: SemanticNeighbour[] = [];
    for (let i = 1; i <= count && i < this.order.length; i += 1) {
      result.push({ word: this.service.lemmaAt(this.order[i]), rank: i + 1 });
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
      this.load(readFileSync(path));
    } catch (error) {
      this.failure = `Словарь смыслов не читается: ${(error as Error).message}`;
      this.logger.error(this.failure);
      return;
    }
    this.logger.log(
      `Словарь смыслов: ${this.lemmas.length} слов, ${this.index.size} написаний, ${Date.now() - started} мс`,
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
  rank(lemmaIndex: number): SemanticRanking {
    const count = this.lemmas.length;
    const sense = this.closeness(this.meaning, this.meaningNorms, lemmaIndex);
    const byMeaning = placesOf(sense);
    const spoken = this.closeness(this.usage, this.usageNorms, lemmaIndex);
    const bySpeech = placesOf(spoken);
    const story = this.association(lemmaIndex);
    const byStory = placesOf(story);

    const fused = new Float64Array(count);
    for (let j = 0; j < count; j += 1) {
      // Мера, которая про это слово ничего не знает, молчит, а не голосует
      // за «далеко». Иначе половина словаря делила бы один и тот же хвост,
      // и «стул» подтягивался бы к «ковчегу» просто за компанию.
      if (sense[j] >= 0) fused[j] += 1 / (RANK_SMOOTHING + byMeaning[j]);
      if (spoken[j] >= 0) fused[j] += 1 / (RANK_SMOOTHING + bySpeech[j]);
      if (story[j] > 0) fused[j] += 1 / (RANK_SMOOTHING + byStory[j]);
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
