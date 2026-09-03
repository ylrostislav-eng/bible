# Bible Arena — Telegram Mini App

Игровая социальная платформа для изучения Библии внутри Telegram: дуэли,
комнаты, рейтинги, турниры, друзья, ежедневные задания.

Подробная архитектура — в [`docs/architecture.md`](docs/architecture.md).
История изменений — в [`docs/CHANGELOG.md`](docs/CHANGELOG.md).
Как выложить приложение в интернет (чтобы играть с друзьями) — в
[`docs/deployment.md`](docs/deployment.md).

## Стек технологий

- **Frontend**: Next.js (App Router) + TypeScript + TailwindCSS (`apps/web`)
- **Backend**: NestJS + TypeScript (`apps/api`)
- **База данных**: PostgreSQL + Prisma (`apps/api/prisma`)
- **Кэш/Realtime**: Redis
- **Авторизация**: Telegram Mini Apps `initData` → JWT
- **Monorepo**: pnpm workspaces
- **Общие типы**: `packages/shared`

## Структура проекта

```
apps/
  web/       # Next.js приложение (Telegram Mini App)
  api/       # NestJS API
packages/
  shared/    # Общие TypeScript-типы и константы
docs/        # Документация и changelog
scripts/     # Вспомогательные скрипты разработки
docker-compose.yml   # PostgreSQL + Redis
.env.example
```

## Требования

- Node.js >= 20
- pnpm >= 10
- Docker + Docker Compose (для PostgreSQL и Redis)

## Быстрый старт

```bash
./scripts/setup.sh
```

Скрипт скопирует файлы окружения, установит зависимости, поднимет
PostgreSQL/Redis и сгенерирует Prisma Client. Дальше — `pnpm dev`.

Его же стоит запускать **после каждого `git pull`**: существующий `.env`
он не трогает (там ваши токены), но проверяет его по `.env.example` и
называет настройки, которых в нём ещё нет. Без этого новая переменная
проекта до вашего файла просто не доезжает, а приложение позже падает с
ошибкой, которая на причину не указывает — например «Dev login is
disabled», если в `apps/api/.env` нет `ENABLE_DEV_LOGIN=true`.

### Вручную

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d
pnpm --filter @bible-arena/api run prisma:migrate
pnpm --filter @bible-arena/api run prisma:seed-all
pnpm dev
```

Для реальной авторизации через Telegram нужно указать `TELEGRAM_BOT_TOKEN`
(из [@BotFather](https://t.me/BotFather)) в `apps/api/.env`.

## Команды разработки

Из корня проекта:

| Команда       | Описание                                                |
| ------------- | ------------------------------------------------------- |
| `pnpm dev`    | Запускает `shared` (watch), `web` и `api` параллельно   |
| `pnpm build`  | Собирает все приложения и пакеты (в правильном порядке) |
| `pnpm lint`   | Запускает линтинг во всех приложениях и пакетах         |
| `pnpm format` | Форматирует код через Prettier                          |

После `git pull`:

```bash
pnpm install
pnpm --filter @bible-arena/shared run build
pnpm --filter @bible-arena/api run prisma:migrate
pnpm --filter @bible-arena/api run prisma:seed-all
```

Одних миграций мало: новая функция обычно приезжает с новой таблицей,
которую нужно ещё и наполнить. Пустая таблица не ломает приложение — оно
просто показывает пустой экран, и понять, что данных нет, а не «всё
сломалось», по интерфейсу невозможно. `prisma:seed-all` можно запускать
повторно.

Prisma (из `apps/api` или через `pnpm --filter @bible-arena/api run …`):

| Команда             | Описание                           |
| ------------------- | ---------------------------------- |
| `prisma:generate`   | Сгенерировать Prisma Client        |
| `prisma:migrate`    | Создать и применить миграцию       |
| `prisma:seed`       | Банк вопросов (40 шт.)             |
| `prisma:seed-bible` | Текст Синодального перевода        |
| `prisma:seed-alias` | Слова для Библейского Alias        |
| `prisma:seed-all`   | Всё перечисленное выше, по порядку |
| `prisma:studio`     | Открыть Prisma Studio              |

`prisma:seed-chapter-questions` стоит отдельно: он пересоздаёт вопросы к
главам и удаляет связанные с ними ответы игроков, поэтому в `seed-all` не
входит.

По умолчанию:

- `apps/web` доступен на http://localhost:3000
- `apps/api` доступен на http://localhost:3001 (`GET /health` — проверка БД/Redis)

Перед коммитом автоматически запускается Prettier на изменённых файлах
(Husky + lint-staged).

## Статус разработки

- ✅ Этап 1 — базовая структура монорепозитория.
- ✅ Этап 2 — авторизация через Telegram, профиль пользователя, оболочка
  приложения (навигация, тёмная тема, онбординг).
- ✅ Этап 3 — одиночная игра: банк из 40 вопросов, полный игровой цикл
  (вопрос → ответ → объяснение → итог), начисление опыта/монет/уровня.
- ✅ Этап 4 — дуэли: приглашение по коду, живой счёт по числу верных
  ответов, ничьи, победы/поражения и рейтинг с дневным лимитом на очки
  с побед.
- ✅ Деплой: конфигурация для Railway (backend + PostgreSQL + Redis) и
  Vercel (frontend) — см. `docs/deployment.md`.
- ✅ Знания (бывший "Рейтинг") — таблица лидеров, начинается со 100,
  может уходить в минус; звание игрока зависит от текущего значения и
  падает вместе с ним (см. `docs/CHANGELOG.md` — полный список званий).
- ✅ Изучение: читалка (полный текст Синодального перевода, навигация по
  книгам и главам) + проверка по главе с таймером, очками +5/−3 за
  ответ (не чаще раза в 7 дней на главу) + серия дней подряд (streak).
  Вопросы для проверки — 5–10 на главу в зависимости от её длины и
  значимости, теми же вопросами пополняется общий банк для соло-игры и
  дуэлей. **Весь Новый Завет готов — все 27 книг** (Матфея, Марка,
  Луки, Иоанна, Деяния, Иакова, 1–2 Петра, 1–3 Иоанна, Иуды, Римлянам,
  1–2 Коринфянам, Галатам, Ефесянам, Филиппийцам, Колоссянам,
  1–2 Фессалоникийцам, 1–2 Тимофею, Титу, Филимону, Евреям, Откровение;
  1652 вопроса) — далее Ветхий Завет.
- ⏳ Далее — друзья, вопросы для остальных книг, комнаты,
  турниры (см. `docs/CHANGELOG.md`).
