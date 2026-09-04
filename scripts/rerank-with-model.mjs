#!/usr/bin/env node
/**
 * Переупорядочивает верх списка настоящей языковой моделью.
 *
 * Зачем. Четыре меры расстояния дают приличный порядок, но верх списка —
 * это то, что игрок видит и по чему судит об игре, и там статистика всё
 * ещё ошибается: «ворота» при загаданном «футболе» она относит далеко,
 * потому что в русской прозе ворота почти всегда дворовые. Модель этого не
 * путает: ей сказано, какое слово загадано, и многозначность снимается
 * сама.
 *
 * Почему на сборке, а не в игре. Игре нужен полный порядок по пятидесяти
 * тысячам слов, одинаковый у всех игроков и мгновенный. Спрашивать модель
 * на каждую догадку — это секунда ожидания, плата за запрос и разные числа
 * у двух людей, играющих в одно слово. Поэтому модель зовут один раз на
 * загаданное слово, а игра работает с готовой таблицей: мгновенно,
 * одинаково у всех и без интернета.
 *
 * Что именно она делает. Для каждого из 259 слов, которые игра может
 * загадать, берутся первые CANDIDATES слов текущего порядка, и модель
 * расставляет их так, как расставил бы человек. Результат ложится в
 * `apps/api/data/rerank-ru.json.gz` и коммитится, как и словарь.
 *
 * Запуск:
 *
 *     export ANTHROPIC_API_KEY=sk-ant-...
 *     node scripts/rerank-with-model.mjs            # все слова
 *     node scripts/rerank-with-model.mjs --limit 5  # попробовать на пяти
 *
 * Стоимость: примерно один запрос на слово. На Haiku это центы за весь
 * прогон целиком.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'apps/api/data/rerank-ru.json.gz');
const CANDIDATES_FILE = join(ROOT, '.cache/rerank-candidates.json');

/** Сколько слов верха отдавать модели на пересортировку. */
const CANDIDATES = 120;

const MODEL = 'claude-haiku-4-5-20251001';
const API = 'https://api.anthropic.com/v1/messages';

/**
 * Просьба к модели.
 *
 * Сказано «загаданное слово», а не «первое слово списка», намеренно: весь
 * выигрыш модели в том, что она знает контекст и снимает многозначность.
 * И просим порядок, а не оценки: оценки от 0 до 100 модель раздаёт
 * неровно, а порядок — ровно то, что нужно игре.
 */
function prompt(secret, words) {
  return `Игра: загадано слово «${secret}». Игрок пишет слова, игра показывает, насколько они близки к загаданному.

Ниже ${words.length} слов. Расставь их от самого близкого к загаданному — до самого далёкого. Близость — человеческая: одна история, одна сцена, часть и целое, причина и следствие, предмет и его применение. Не только «похожие слова».

Важно: слово многозначно ровно в том значении, которое подходит к загаданному. Если загадан «футбол», то «ворота» — футбольные, а не дворовые.

Ответь ТОЛЬКО списком слов через запятую, в новом порядке, без нумерации и пояснений. Все ${words.length} слов, ни одного не потеряв и не добавив.

${words.join(', ')}`;
}

async function ask(secret, words, key) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt(secret, words) }],
    }),
  });
  if (!response.ok) {
    throw new Error(`модель ответила ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const text = body.content?.[0]?.text ?? '';

  // Доверяй, но проверяй: модель может потерять слово, добавить своё или
  // сбиться на пояснения. Берём только то, что было в списке, по одному
  // разу, а потерянное дописываем в прежнем порядке — так порядок не
  // портится даже при плохом ответе.
  const allowed = new Set(words);
  const seen = new Set();
  const ordered = [];
  for (const raw of text.split(/[,\n]/)) {
    const word = raw.trim().toLowerCase().replace(/ё/g, 'е');
    if (allowed.has(word) && !seen.has(word)) {
      seen.add(word);
      ordered.push(word);
    }
  }
  const lost = words.filter((w) => !seen.has(w));
  return { ordered: [...ordered, ...lost], kept: ordered.length };
}

/** Кандидатов готовит сам сервер: у него уже есть все четыре меры. */
function collectCandidates() {
  if (existsSync(CANDIDATES_FILE)) {
    console.log(`Беру кандидатов из кэша: ${CANDIDATES_FILE}`);
    return JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8'));
  }
  console.log('Собираю кандидатов текущим порядком…');
  const script = `
    import { SemanticsService } from './src/semantics/semantics.service';
    import { readFileSync } from 'node:fs';
    import { HOT_COLD_SECRET_COMMON_LIMIT, HOT_COLD_SECRET_MIN_EPISODES } from '@bible-arena/shared';
    const s = new SemanticsService(); s.onModuleInit();
    const src = readFileSync('prisma/seed-alias.ts', 'utf8');
    const bank = [...src.matchAll(/word: '([^']+)'/g)].map((m) => m[1]).filter((w) => !w.includes(' ') && !w.includes('-'));
    const out = {};
    for (const raw of bank) {
      const i = s.lookup(raw);
      if (i === null) continue;
      if (!(i < HOT_COLD_SECRET_COMMON_LIMIT || s.episodesFor(i) >= HOT_COLD_SECRET_MIN_EPISODES)) continue;
      out[raw.toLowerCase()] = s.rank(i).closest(${CANDIDATES}).map((n) => n.word);
    }
    process.stdout.write('@@' + JSON.stringify(out) + '@@');
  `;
  const raw = execFileSync('npx', ['ts-node', '--project', 'tsconfig.json', '-e', script], {
    cwd: join(ROOT, 'apps/api'),
    maxBuffer: 200 * 1024 * 1024,
  }).toString();
  const candidates = JSON.parse(raw.split('@@')[1]);
  mkdirSync(dirname(CANDIDATES_FILE), { recursive: true });
  writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates), 'utf8');
  return candidates;
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error(
      'Нужен ключ:\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...\n\n' +
        'Взять его на console.anthropic.com. Весь прогон стоит центы,\n' +
        'и делается он один раз — игра потом работает без интернета.',
    );
    process.exit(1);
  }

  const candidates = collectCandidates();
  const words = Object.keys(candidates);
  const limitAt = process.argv.indexOf('--limit');
  const limit = limitAt >= 0 ? Number(process.argv[limitAt + 1]) : words.length;
  const chosen = words.slice(0, limit);
  console.log(`Слов: ${chosen.length}, кандидатов на слово: ${CANDIDATES}`);

  const result = {};
  let failed = 0;
  for (const [index, secret] of chosen.entries()) {
    try {
      const { ordered, kept } = await ask(secret, candidates[secret], key);
      result[secret] = ordered;
      process.stdout.write(
        `\r  ${index + 1}/${chosen.length}  ${secret} (модель вернула ${kept} из ${candidates[secret].length})        `,
      );
    } catch (error) {
      failed += 1;
      // Одно упавшее слово не должно ронять весь прогон: остальные уже
      // оплачены и посчитаны.
      console.log(`\n  ${secret}: ${error.message}`);
    }
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, gzipSync(Buffer.from(JSON.stringify(result), 'utf8')));
  console.log(
    `\nГотово: ${Object.keys(result).length} слов, ошибок ${failed}.\n` + `Файл: ${OUT_FILE}`,
  );
}

main().catch((error) => {
  console.error('\n' + (error?.message ?? error));
  process.exit(1);
});
