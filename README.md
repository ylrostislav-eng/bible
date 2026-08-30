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

### Вручную

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d
pnpm --filter @bible-arena/api run prisma:migrate
pnpm --filter @bible-arena/api run prisma:seed
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

Prisma (из `apps/api` или через `pnpm --filter @bible-arena/api run …`):

| Команда           | Описание                         |
| ----------------- | -------------------------------- |
| `prisma:generate` | Сгенерировать Prisma Client      |
| `prisma:migrate`  | Создать и применить миграцию     |
| `prisma:seed`     | Заполнить банк вопросов (40 шт.) |
| `prisma:studio`   | Открыть Prisma Studio            |

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
  Вопросы пока только для Послания Иакова — для остальных книг
  добавляются постепенно.
- ⏳ Далее — друзья, планы чтения, вопросы для остальных книг, комнаты,
  турниры (см. `docs/CHANGELOG.md`).
