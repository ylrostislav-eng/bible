#!/usr/bin/env node
/**
 * Готовит словарь векторов для игры «горячо-холодно».
 *
 * Что делает: скачивает русские векторы fastText (Facebook, лицензия
 * CC BY-SA 3.0), берёт из них самые употребительные слова и складывает в
 * один компактный файл, который читает сервер.
 *
 * Зачем именно так. Полный файл — полтора гигабайта сжатого текста, и
 * держать его в проекте немыслимо. Но слова в нём идут по убыванию
 * частоты, поэтому качать целиком и не нужно: первые полтораста тысяч
 * строк — это весь язык, которым люди пользуются, включая «женщина»,
 * «животное», «город», «предатель». Дальше начинаются опечатки, латиница и
 * мусор, ради которых незачем тянуть остальной гигабайт.
 *
 * Результат — примерно 60 МБ: 120 000 слов по 300 чисел, в половинной
 * точности. Для смысловой близости этой точности хватает с запасом, а файл
 * выходит вчетверо меньше.
 *
 * Запуск (один раз, нужен интернет):
 *   node scripts/build-word-vectors.mjs
 *
 * Файл появится в `apps/api/data/ru-vectors.bin`. В гит он не попадает —
 * см. .gitignore; на сервере скрипт запускается так же, один раз.
 */
import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps/api/data');
const OUT_FILE = join(OUT_DIR, 'ru-vectors.bin');

const SOURCE = 'https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ru.300.vec.gz';

/** Сколько слов оставить. Дальше по частотному списку начинается такой
 * хвост, что каждое следующее слово добавляет больше шума, чем смысла. */
const WORD_LIMIT = 120_000;

/** Сколько чисел в векторе. Задано форматом самого файла — не настройка. */
const DIMENSIONS = 300;

/**
 * Слово годится, если это обычное русское слово: только кириллица, без
 * цифр, дефисов и подчёркиваний. Отбрасываем и однобуквенные, и совсем
 * длинные — в частотном списке такие почти всегда мусор.
 */
function isUsableWord(word) {
  if (word.length < 2 || word.length > 24) return false;
  return /^[а-яё]+$/.test(word);
}

/**
 * Пишет число в формате половинной точности (float16).
 *
 * Векторы нужны только для сравнения направлений, а не для арифметики, так
 * что три знака после запятой — это больше, чем требуется. Зато файл
 * получается вчетверо меньше, и он целиком помещается в память сервера.
 */
function toHalf(value) {
  const buffer = new ArrayBuffer(4);
  new Float32Array(buffer)[0] = value;
  const bits = new Uint32Array(buffer)[0];
  const sign = (bits >>> 16) & 0x8000;
  let exponent = (bits >>> 23) & 0xff;
  let mantissa = bits & 0x7fffff;

  if (exponent === 255) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  exponent = exponent - 127 + 15;
  if (exponent >= 31) return sign | 0x7c00;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa = (mantissa | 0x800000) >>> (1 - exponent);
    return sign | (mantissa >>> 13);
  }
  return sign | (exponent << 10) | (mantissa >>> 13);
}

async function main() {
  if (existsSync(OUT_FILE) && !process.argv.includes('--force')) {
    console.log(`Словарь уже собран: ${OUT_FILE}`);
    console.log('Пересобрать заново: node scripts/build-word-vectors.mjs --force');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  console.log('Качаю русские векторы fastText…');
  console.log('Это полтора гигабайта, но качается не весь файл — только начало.');

  const response = await fetch(SOURCE);
  if (!response.ok || !response.body) {
    throw new Error(
      `Не удалось скачать словарь (${response.status}). ` +
        'Проверьте интернет и попробуйте ещё раз.',
    );
  }

  const words = [];
  const vectors = [];
  let tail = '';
  let lineNumber = 0;
  let bytesRead = 0;

  const gunzip = createGunzip();
  const source = Readable.fromWeb(response.body);
  source.on('data', (chunk) => {
    bytesRead += chunk.length;
  });
  source.pipe(gunzip);

  outer: for await (const chunk of gunzip) {
    tail += chunk.toString('utf8');
    const lines = tail.split('\n');
    tail = lines.pop() ?? '';

    for (const line of lines) {
      lineNumber += 1;
      // Первая строка файла — не слово, а «сколько слов и какая длина
      // вектора».
      if (lineNumber === 1) continue;

      const space = line.indexOf(' ');
      if (space <= 0) continue;
      const word = line.slice(0, space).toLowerCase();
      if (!isUsableWord(word)) continue;

      const parts = line.slice(space + 1).split(' ');
      if (parts.length < DIMENSIONS) continue;

      words.push(word);
      const vector = new Uint16Array(DIMENSIONS);
      for (let i = 0; i < DIMENSIONS; i += 1) vector[i] = toHalf(Number(parts[i]));
      vectors.push(vector);

      if (words.length % 10_000 === 0) {
        const mb = (bytesRead / 1e6).toFixed(0);
        console.log(`  отобрано слов: ${words.length} (прочитано ${mb} МБ)`);
      }
      if (words.length >= WORD_LIMIT) break outer;
    }
  }

  // Дальше качать нечего — рвём соединение, чтобы не тянуть оставшийся
  // гигабайт впустую.
  source.destroy();

  console.log(`Отобрано слов: ${words.length}. Записываю ${OUT_FILE}…`);

  const out = createWriteStream(OUT_FILE);
  const write = (buffer) =>
    new Promise((resolve, reject) => {
      out.write(buffer, (error) => (error ? reject(error) : resolve()));
    });

  // Заголовок: сколько слов, какая длина вектора. Дальше — сами слова
  // (длина и байты), потом все векторы подряд.
  const header = Buffer.alloc(8);
  header.writeUInt32LE(words.length, 0);
  header.writeUInt32LE(DIMENSIONS, 4);
  await write(header);

  for (const word of words) {
    const bytes = Buffer.from(word, 'utf8');
    const length = Buffer.alloc(1);
    length.writeUInt8(bytes.length, 0);
    await write(length);
    await write(bytes);
  }
  for (const vector of vectors) {
    await write(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength));
  }

  await new Promise((resolve) => out.end(resolve));

  const sizeMb = (8 + words.reduce((sum, w) => sum + 1 + Buffer.byteLength(w), 0) +
    words.length * DIMENSIONS * 2) / 1e6;
  console.log(`Готово. Размер файла: ${sizeMb.toFixed(0)} МБ, слов: ${words.length}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
