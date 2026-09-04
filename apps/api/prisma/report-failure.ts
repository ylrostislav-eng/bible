/**
 * Что печатать, когда заливка данных упала.
 *
 * Причина у неё почти всегда одна и та же и не имеет к данным никакого
 * отношения: база не поднята. Prisma в этом случае выдаёт двадцать строк
 * своего стека с путями внутрь `node_modules`, среди которых нужное
 * сообщение — одна строка посередине, и она говорит «Can't reach database
 * server», а не «запусти Docker». Человек, увидевший такое после
 * `pnpm run prisma:seed-all`, ищет ошибку в проекте, хотя искать нечего.
 *
 * Поэтому известные причины разбираются здесь и печатаются одной фразой
 * вместе с командой, которая их чинит. Всё остальное выводится как есть:
 * прятать незнакомую ошибку хуже, чем показать её сырой.
 */

/**
 * Известные причины: как узнать и что сказать.
 *
 * Узнаём по тексту сообщения, а не по коду ошибки. Кода бы хватило, но
 * его в этих ошибках может не быть: `PrismaClientInitializationError` про
 * недоступную базу приходит с `errorCode: undefined` — падение случается
 * до того, как соединение установлено, а код присылает сервер.
 */
const KNOWN: { match: RegExp; code: string; text: string[] }[] = [
  {
    match: /can't reach database server|ECONNREFUSED/i,
    code: 'P1001',
    text: [
      'База данных не отвечает.',
      '',
      'Скорее всего, она просто не запущена. Проверить и поднять:',
      '  docker compose up -d',
      '  docker ps      # должны быть bible-arena-postgres и -redis, оба Up',
      '',
      'На Windows и macOS Docker Desktop должен быть открыт — без него',
      '`docker compose` не работает.',
    ],
  },
  {
    match: /authentication failed/i,
    code: 'P1000',
    text: [
      'База данных не пускает: не подошли имя пользователя или пароль.',
      '',
      'Сверьте DATABASE_URL в apps/api/.env с apps/api/.env.example. Если',
      'базу поднимали с другим паролем, проще пересоздать её начисто:',
      '  docker compose down -v && docker compose up -d',
      '',
      'Внимание: `-v` стирает данные в базе. Заливка их вернёт.',
    ],
  },
  {
    match: /database .* does not exist|relation .* does not exist|P2021/i,
    code: 'P1003',
    text: [
      'В базе нет таблиц, которые ждёт заливка.',
      '',
      'Обычно значит, что миграции ещё не применяли:',
      '  pnpm --filter @bible-arena/api run prisma:migrate',
    ],
  },
];

/**
 * Печатает причину падения и ставит код выхода. Вызывать из `.catch`
 * заливки: `main().catch(reportFailure)`.
 */
export function reportFailure(error: unknown): void {
  // Код ошибки, если он есть, точнее текста — сверяем сначала по нему.
  const code =
    typeof error === 'object' && error !== null && 'errorCode' in error
      ? String((error as { errorCode?: unknown }).errorCode)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);

  const known =
    KNOWN.find((entry) => entry.code === code) ??
    KNOWN.find((entry) => entry.match.test(message));

  if (known) {
    console.error(`\n${known.text.join('\n')}\n`);
  } else {
    // Незнакомая ошибка выводится как есть: прятать её хуже, чем показать
    // сырой, — по ней хотя бы можно искать.
    console.error(error);
  }
  process.exitCode = 1;
}
