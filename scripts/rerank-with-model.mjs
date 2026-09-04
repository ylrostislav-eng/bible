#!/usr/bin/env node
/**
 * Переупорядочивает верх списка языковой моделью.
 *
 * Основной путь — **модель на своём компьютере**: бесплатно, без лимитов и
 * без чужих серверов. Ollama поднимает её одной командой и слушает на
 * localhost:11434; скрипт сам её находит. Платный путь через API оставлен
 * запасным, на случай если локально не выходит.
 *
 * Зачем это. Четыре меры дают приличный порядок, но верх списка — то, что
 * игрок видит и по чему судит об игре, и там статистика ошибается:
 * «ворота» при загаданном «футболе» она уносит далеко, потому что в
 * русской прозе ворота почти всегда дворовые. Модели сказано, какое слово
 * загадано, и многозначность снимается сама.
 *
 * Почему на сборке, а не в игре. Игре нужен полный порядок по пятидесяти
 * тысячам слов, одинаковый у всех игроков и мгновенный. Спрашивать модель
 * на каждую догадку — это ожидание, а у двух людей, играющих одно слово,
 * получились бы разные числа. Здесь модель зовут один раз на загаданное
 * слово, а игра работает с готовой таблицей.
 *
 * Оценки, а не сортировка. Просить «расставь 120 слов по порядку» — верный
 * способ получить от небольшой модели кашу. Оценка от 0 до 10 маленькими
 * пачками даётся куда надёжнее, разбирается однозначно, и главное —
 * портится по-хорошему: неоценённое слово просто остаётся на своём месте.
 *
 * Прогон долгий и его можно прерывать: сделанное сохраняется после каждого
 * слова, повторный запуск продолжает с того же места.
 *
 * --- Как запустить (Windows, PowerShell) ---
 *
 *   1. Поставить Ollama:      https://ollama.com/download
 *   2. Скачать модель:        ollama pull qwen2.5:7b
 *   3. Проверить на пяти:     node scripts/rerank-with-model.mjs --limit 5
 *   4. Прогнать всё:          node scripts/rerank-with-model.mjs
 *
 * Другая модель:              node scripts/rerank-with-model.mjs --model qwen2.5:14b
 * Через платный API:          $env:ANTHROPIC_API_KEY="sk-ant-..."  и  --provider anthropic
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'apps/api/data/rerank-ru.json.gz');
const CANDIDATES_FILE = join(ROOT, '.cache/rerank-candidates.json');
const PROGRESS_FILE = join(ROOT, '.cache/rerank-progress.json');

/** Сколько слов верха отдавать модели. Дальше игрок почти не забирается. */
const CANDIDATES = 120;

/** По сколько слов в одной просьбе. Больше — и небольшая модель начинает
 * терять слова и дописывать пояснения. */
const BATCH = 20;

const OLLAMA = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const DEFAULT_LOCAL_MODEL = 'qwen2.5:7b';
const DEFAULT_API_MODEL = 'claude-haiku-4-5-20251001';

const flag = (name, fallback = null) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

/**
 * Просьба к модели.
 *
 * Загаданное слово названо прямо — весь выигрыш модели в том, что она
 * знает контекст и снимает многозначность. Формат ответа задан жёстко и
 * скучно: чем меньше свободы, тем меньше разбирать.
 */
function prompt(secret, words) {
  return `Загадано слово «${secret}».

Оцени, насколько каждое слово ниже связано с загаданным, от 0 до 10:
10 — то же самое или неотделимо (ковчег и потоп),
7 — одна история или сцена (ковчег и гора),
4 — общая тема (ковчег и море),
1 — почти ничего общего,
0 — не связано никак (ковчег и стул).

Связь человеческая, а не «похожие слова»: часть и целое, причина и
следствие, предмет и его применение, герой и его история. Многозначное
слово понимай в том значении, которое подходит к загаданному.

Ответь строками вида «слово: число», по одной на слово, без пояснений.

${words.join('\n')}`;
}

/** Разбирает ответ в оценки. Чужое и лишнее молча отбрасывается. */
function readScores(text, words) {
  const allowed = new Set(words);
  const scores = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*[-*\d.\s]*([а-яё]+)\s*[:\-—]\s*(\d+)/i);
    if (!match) continue;
    const word = match[1].toLowerCase().replace(/ё/g, 'е');
    if (allowed.has(word) && !scores.has(word)) {
      scores.set(word, Math.max(0, Math.min(10, Number(match[2]))));
    }
  }
  return scores;
}

async function askOllama(model, text) {
  const response = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text,
      stream: false,
      // Нулевая температура: игра должна давать одинаковые числа всем, и
      // пересборка таблицы не должна её перетряхивать.
      options: { temperature: 0 },
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama ответила ${response.status}: ${await response.text()}`);
  }
  return (await response.json()).response ?? '';
}

async function askAnthropic(model, text, key) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!response.ok) {
    throw new Error(`API ответил ${response.status}: ${await response.text()}`);
  }
  return (await response.json()).content?.[0]?.text ?? '';
}

/** Запуск программы из node_modules: на Windows это .cmd, ему нужна оболочка. */
function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    maxBuffer: 200 * 1024 * 1024,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}

/**
 * `@bible-arena/shared` подключается собранным `dist`, а не исходником, и
 * после `git pull` он на машине старый: новые константы в нём ещё не
 * появились. Обычная разработка это не замечает — `pnpm dev` собирает
 * пакет первым делом, — но скрипт запускают отдельно, поэтому он
 * пересобирает пакет сам. Это несколько секунд и делается вхолостую, если
 * всё и так свежее.
 */
function buildShared() {
  console.log('Пересобираю @bible-arena/shared…');
  try {
    run('npx', ['tsc', '-p', 'tsconfig.json'], join(ROOT, 'packages/shared'));
  } catch (error) {
    const details = [error.stdout, error.stderr]
      .map((chunk) => chunk?.toString().trim())
      .filter(Boolean)
      .join('\n');
    throw new Error(`Не удалось собрать общий пакет.\n${details}`);
  }
}

/** Кандидатов готовит сам сервер: у него уже есть все четыре меры. */
function collectCandidates() {
  if (existsSync(CANDIDATES_FILE)) {
    console.log(`Беру кандидатов из кэша: ${CANDIDATES_FILE}`);
    return JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8'));
  }
  buildShared();
  console.log('Собираю кандидатов текущим порядком (это займёт минуту)…');
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
  // Скрипт уходит файлом, а не через `-e`. На Windows `npx` — это `npx.cmd`,
  // а .cmd без оболочки не запускается; оболочка же здесь cmd.exe, и она
  // порубила бы многострочный аргумент по переносам строк. Путь к файлу —
  // один короткий аргумент без кавычек и переносов, и проблемы нет.
  const scriptFile = join(ROOT, 'apps/api/.rerank-candidates.ts');
  writeFileSync(scriptFile, script, 'utf8');
  let raw;
  try {
    raw = run(
      'npx',
      ['ts-node', '--project', 'tsconfig.json', '.rerank-candidates.ts'],
      join(ROOT, 'apps/api'),
    );
  } catch (error) {
    // Свою ошибку ts-node уже написал в stderr; пересказывать её стеком
    // самого скрипта — значит утопить единственную полезную строку.
    const details = [error.stdout, error.stderr]
      .map((chunk) => chunk?.toString().trim())
      .filter(Boolean)
      .join('\n');
    throw new Error(`Сервер не смог собрать кандидатов.\n${details}`);
  } finally {
    rmSync(scriptFile, { force: true });
  }
  const candidates = JSON.parse(raw.split('@@')[1]);
  mkdirSync(dirname(CANDIDATES_FILE), { recursive: true });
  writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates), 'utf8');
  return candidates;
}

async function chooseProvider() {
  const asked = flag('provider');
  const key = process.env.ANTHROPIC_API_KEY;

  if (asked !== 'anthropic') {
    try {
      const tags = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) });
      if (tags.ok) {
        const installed = (await tags.json()).models?.map((m) => m.name) ?? [];
        const model = flag('model', DEFAULT_LOCAL_MODEL);
        if (
          installed.length > 0 &&
          !installed.some((name) => name.startsWith(model.split(':')[0]))
        ) {
          console.log(
            `Ollama работает, но модели «${model}» нет. Установленные: ${installed.join(', ')}`,
          );
          console.log(`Скачать:  ollama pull ${model}`);
          process.exit(1);
        }
        console.log(`Модель на этом компьютере: ${model} (Ollama)`);
        return { ask: (text) => askOllama(model, text), local: true };
      }
    } catch {
      // Ollama не запущена — не беда, ниже объясним по-человечески.
    }
  }

  if (key) {
    const model = flag('model', DEFAULT_API_MODEL);
    console.log(`Модель через API: ${model} (платно)`);
    return { ask: (text) => askAnthropic(model, text, key), local: false };
  }

  console.error(
    'Модель не найдена. Бесплатный путь, на своём компьютере:\n\n' +
      '  1. Поставить Ollama — https://ollama.com/download\n' +
      `  2. ollama pull ${DEFAULT_LOCAL_MODEL}\n` +
      '  3. запустить этот скрипт снова\n\n' +
      'Ollama сама поднимает сервер на localhost:11434; ничего настраивать\n' +
      'не нужно. Если она стоит на другой машине — задайте OLLAMA_HOST.\n\n' +
      'Платный запасной путь: ANTHROPIC_API_KEY и --provider anthropic',
  );
  process.exit(1);
}

async function main() {
  const provider = await chooseProvider();
  const candidates = collectCandidates();

  // Сделанное раньше не переделываем: локальный прогон идёт часами, и
  // прервать его должно быть не страшно.
  const done = existsSync(PROGRESS_FILE) ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')) : {};
  const limit = Number(flag('limit', Infinity));
  const todo = Object.keys(candidates)
    .filter((word) => !(word in done))
    .slice(0, limit);

  console.log(
    `Слов всего ${Object.keys(candidates).length}, уже сделано ${Object.keys(done).length}, ` +
      `сейчас будет ${todo.length}. Пачек на слово: ${Math.ceil(CANDIDATES / BATCH)}.`,
  );
  if (provider.local) {
    console.log('Прервать можно в любой момент — прогресс сохраняется после каждого слова.\n');
  }

  const started = Date.now();
  for (const [index, secret] of todo.entries()) {
    const words = candidates[secret];
    const scores = new Map();
    for (let at = 0; at < words.length; at += BATCH) {
      const batch = words.slice(at, at + BATCH);
      try {
        for (const [word, score] of readScores(await provider.ask(prompt(secret, batch)), batch)) {
          scores.set(word, score);
        }
      } catch (error) {
        // Одна упавшая пачка — не повод терять слово целиком: те, что
        // модель не оценила, останутся на прежних местах.
        console.log(`\n  ${secret}: ${error.message}`);
      }
    }

    // Устойчивая сортировка: при равной оценке порядок остаётся прежним, а
    // неоценённые слова уходят вниз, но не перемешиваются между собой.
    done[secret] = words
      .map((word, at) => ({ word, at, score: scores.get(word) ?? -1 }))
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .map((entry) => entry.word);

    mkdirSync(dirname(PROGRESS_FILE), { recursive: true });
    writeFileSync(PROGRESS_FILE, JSON.stringify(done), 'utf8');

    const each = (Date.now() - started) / (index + 1);
    const left = Math.round((each * (todo.length - index - 1)) / 60_000);
    process.stdout.write(
      `\r  ${index + 1}/${todo.length}  ${secret} — оценено ${scores.size} из ${words.length}` +
        `, осталось ~${left} мин          `,
    );
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, gzipSync(Buffer.from(JSON.stringify(done), 'utf8')));
  console.log(`\n\nГотово: ${Object.keys(done).length} слов.\nФайл: ${OUT_FILE}`);
  console.log('Теперь перезапустите сервер и сыграйте — числа станут другими.');
}

main().catch((error) => {
  console.error('\n' + (error?.message ?? error));
  process.exit(1);
});
