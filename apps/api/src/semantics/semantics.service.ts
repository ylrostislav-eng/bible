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
 * Смысловая близость слов — то, чем игра меряет «горячо/холодно».
 *
 * За каждым словом стоит вектор из 300 чисел; близкие по смыслу слова
 * смотрят в одну сторону, и «далеко» считается арифметикой, а не списком
 * заранее прописанных синонимов. Поэтому игра понимает любое слово, а не
 * только предусмотренные нами.
 *
 * Словарь лежит в `apps/api/data/semantics-ru.bin` и собирается скриптом
 * `scripts/build-semantics.py` из ConceptNet Numberbatch (CC BY-SA 4.0).
 * Он в репозитории: пятнадцать мегабайт — небольшая плата за то, что игра
 * работает сразу после `git clone`, без выкачивания моделей.
 *
 * Формат файла:
 *
 *     "BSEM1"                        подпись
 *     uint32 dims, lemmas, forms     заголовок
 *     леммы     — uint8 длина + utf8, по убыванию частоты
 *     формы     — uint8 длина + utf8 + uint32 номер леммы
 *     векторы   — lemmas × dims, int8 (единичный вектор × 127)
 *
 * Леммы отсортированы по частоте не для красоты: номер в этом списке и
 * есть «расстояние», которое видит игрок, и редкое слово не должно
 * оказываться на втором месте только потому, что оно похоже.
 */

const MAGIC = 'BSEM1';

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
  private vectors: Int8Array = new Int8Array(0);
  private norms: Float64Array = new Float64Array(0);
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
    let offset = 17;

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

    const expected = offset + lemmaCount * this.dims;
    if (buffer.length !== expected) {
      throw new Error(`ожидалось ${expected} байт, а в файле ${buffer.length}`);
    }
    // Копия, а не вид на буфер: `readFileSync` возвращает Buffer из общего
    // пула, и держать на него ссылку означает удерживать чужую память.
    this.vectors = new Int8Array(lemmaCount * this.dims);
    this.vectors.set(
      new Int8Array(
        buffer.buffer,
        buffer.byteOffset + offset,
        lemmaCount * this.dims,
      ),
    );

    this.norms = new Float64Array(lemmaCount);
    for (let i = 0; i < lemmaCount; i += 1) {
      let sum = 0;
      const base = i * this.dims;
      for (let d = 0; d < this.dims; d += 1) sum += this.vectors[base + d] ** 2;
      this.norms[i] = Math.sqrt(sum) || 1;
    }

    // Поиск ближайшего написания строим по леммам: подставлять игроку
    // «ковчегами» вместо «ковчега» незачем, а лемм вчетверо меньше, значит
    // и индекс вчетверо легче.
    this.spell = new SpellIndex(this.lemmas);
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
   * Ранжирует весь словарь относительно загаданного слова.
   *
   * Считается один раз на слово (около ста миллисекунд на сорок тысяч
   * слов) — дальше каждая догадка стоит одного обращения к массиву.
   */
  rank(lemmaIndex: number): SemanticRanking {
    const count = this.lemmas.length;
    const scores = new Float64Array(count);
    const base = lemmaIndex * this.dims;
    for (let j = 0; j < count; j += 1) {
      let dot = 0;
      const other = j * this.dims;
      for (let d = 0; d < this.dims; d += 1)
        dot += this.vectors[base + d] * this.vectors[other + d];
      scores[j] = dot / (this.norms[lemmaIndex] * this.norms[j]);
    }

    const order = new Int32Array(count);
    for (let j = 0; j < count; j += 1) order[j] = j;
    // Сортируем индексы, а не пары: при сорока тысячах слов это заметно
    // дешевле, чем создавать столько же объектов.
    const sorted = Array.from(order).sort((a, b) => scores[b] - scores[a]);
    const places = new Int32Array(count);
    for (let position = 0; position < count; position += 1) {
      order[position] = sorted[position];
      places[sorted[position]] = position + 1;
    }

    return new SemanticRanking(this, lemmaIndex, places, order);
  }
}
