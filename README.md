# Bible Quiz — Telegram Mini App

Начальная структура монорепозитория для Telegram Mini App — викторины по Библии.

## Стек технологий

- **Frontend**: Next.js + TypeScript (`apps/web`)
- **Backend**: NestJS + TypeScript (`apps/api`)
- **Database**: PostgreSQL
- **ORM**: Prisma (`apps/api/prisma`)
- **Monorepo**: pnpm workspaces
- **Общие типы**: `packages/shared`

## Структура проекта

```
apps/
  web/       # Next.js приложение
  api/       # NestJS приложение
packages/
  shared/    # Общие TypeScript-типы
docker-compose.yml
.env.example
```

## Требования

- Node.js >= 20
- pnpm >= 10
- Docker + Docker Compose (для PostgreSQL)

## Установка

```bash
pnpm install
```

Скопируйте файлы окружения:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

## База данных

Запустить PostgreSQL в Docker:

```bash
docker compose up -d
```

Сгенерировать Prisma Client:

```bash
pnpm --filter @bible-quiz/api run prisma:generate
```

Применить миграции (после появления моделей в `apps/api/prisma/schema.prisma`):

```bash
pnpm --filter @bible-quiz/api run prisma:migrate
```

## Команды разработки

Из корня проекта:

| Команда      | Описание                                                |
| ------------ | ------------------------------------------------------- |
| `pnpm dev`   | Запускает `web` и `api` в режиме разработки параллельно |
| `pnpm build` | Собирает все приложения и пакеты                        |
| `pnpm lint`  | Запускает линтинг во всех приложениях и пакетах         |

По умолчанию:

- `apps/web` доступен на http://localhost:3000
- `apps/api` доступен на http://localhost:3001

## Статус

Это начальная структура проекта без бизнес-логики: нет Telegram-бота, пользователей, вопросов викторины и т.д. Эти части будут добавлены на следующих этапах разработки.
