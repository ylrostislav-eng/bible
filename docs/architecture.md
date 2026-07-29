# Архитектура Bible Arena

## Обзор

Bible Arena — Telegram Mini App: игровая платформа для изучения Библии
(соревнования, друзья, рейтинги, комнаты, турниры). Репозиторий — pnpm-монорепо.

```
apps/
  web/       Next.js (App Router) + TypeScript + TailwindCSS — Telegram Mini App фронтенд
  api/       NestJS + TypeScript — REST API
packages/
  shared/    Общие TypeScript-типы и константы (профиль, языки, страны)
docs/        Документация
scripts/     Вспомогательные скрипты для разработки
docker-compose.yml   PostgreSQL + Redis для локальной разработки
```

## Технологический стек

| Слой         | Технология                                            |
| ------------ | ----------------------------------------------------- |
| Frontend     | Next.js 16 (App Router), React 19, TypeScript         |
| Стили        | TailwindCSS v4 (тёмная тема, mobile-first)            |
| Backend      | NestJS 11, TypeScript                                 |
| База данных  | PostgreSQL                                            |
| ORM          | Prisma                                                |
| Кэш/Realtime | Redis (ioredis)                                       |
| Авторизация  | Telegram Mini Apps `initData` + JWT                   |
| Telegram SDK | `@telegram-apps/sdk-react`                            |
| Тулинг       | pnpm workspaces, ESLint, Prettier, Husky, lint-staged |

## Аутентификация

Пароли не используются. Схема входа:

1. Telegram Mini App передаёт подписанную строку `initData` через
   `@telegram-apps/sdk-react` (`retrieveRawInitData()`).
2. Фронтенд отправляет её на `POST /auth/telegram`.
3. `TelegramAuthService` проверяет HMAC-подпись по алгоритму, описанному в
   [документации Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
   и отклоняет данные старше 24 часов.
4. `UsersService.findOrCreateByTelegramId` находит или создаёт пользователя;
   при создании аватар по умолчанию берётся из Telegram (`photo_url`).
5. Выдаётся JWT (`sub` = id пользователя), который фронтенд прикладывает как
   `Authorization: Bearer <token>` ко всем последующим запросам.
6. `JwtAuthGuard` — единственная точка проверки токена; он не зависит от
   `UsersModule` (нет циклических зависимостей), так как `JwtModule`
   зарегистрирован глобально.

Новый пользователь получает `needsOnboarding: true` (пока не задан
`nickname`) — фронтенд показывает форму онбординга вместо основного экрана.

## Backend: структура модулей

```
src/
  config/       Валидация переменных окружения (class-validator)
  prisma/       PrismaService/PrismaModule (глобальный)
  redis/        RedisService/RedisModule (глобальный, ioredis)
  auth/         Telegram initData validation, JWT, guards, decorators
  users/        Профиль пользователя (CRUD)
  health/       GET /health — проверка доступности БД и Redis
```

Каждый модуль независим и содержит свои DTO/сервисы/контроллеры. Общие
типы, которые должны совпадать на фронте и бэке (профиль, языки, страны),
вынесены в `packages/shared`, чтобы избежать дублирования и рассинхрона.

## База данных

Единственная модель на данном этапе — `User` (см.
`apps/api/prisma/schema.prisma`). Она спроектирована с учётом полей,
описанных в ТЗ (уровень, опыт, монеты, рейтинг, статистика игр), но без
таблиц для игр/друзей/турниров — они появятся вместе с соответствующей
бизнес-логикой на следующих этапах, чтобы не создавать неиспользуемые
таблицы.

Изменения схемы — только через `prisma migrate dev` (миграции хранятся в
`apps/api/prisma/migrations` и коммитятся в репозиторий).

## Redis

`RedisService` — единая точка доступа к Redis. Сейчас используется для:

- presence-ключей (`presence:<userId>`, TTL 60s) — фундамент для будущего
  статуса "онлайн" у друзей.
- health-check (`GET /health` проверяет `PING`).

В дальнейшем Redis возьмёт на себя комнаты, живой рейтинг и WebSocket-стейт,
как описано в ТЗ.

## Frontend: структура

```
src/
  app/
    layout.tsx          Корневой layout: тёмная тема, TelegramProvider, AuthProvider
    (main)/              Route group с нижней навигацией
      layout.tsx          Оборачивает контент в AuthGate
      page.tsx             Главная
      play/ friends/ rating/ tournaments/ learn/   "В разработке" — честные заглушки
      profile/             Полный профиль (реальные данные с бэкенда)
      settings/            Редактирование профиля (никнейм, аватар, страна, язык)
  components/
    auth-gate.tsx         Состояния: loading / no-telegram / error / onboarding / app
    onboarding/            Форма первичной настройки профиля
    navigation/            Нижняя навигация (5 вкладок)
    ui/                    Button, Card, Spinner, ComingSoon
    icons/                 Inline SVG-иконки (без внешних зависимостей)
  lib/
    api.ts                 fetch-обёртка с Bearer-токеном
    auth-context.tsx       React Context: статус авторизации, профиль, updateProfile
    telegram-provider.tsx  Инициализация Telegram SDK (init, expandViewport, ready)
```

### Архитектурное решение: 5 вкладок вместо 8

В ТЗ перечислено 8 пунктов меню (Главная, Играть, Друзья, Рейтинг, Турниры,
Изучение, Профиль, Настройки). Мы сознательно оставили в нижней навигации
только 5 самых частых действий (Главная, Играть, Рейтинг, Друзья, Профиль) —
это стандарт мобильных приложений (Instagram, Duolingo и т.д.), так как 8
иконок в нижней панели становятся нечитаемыми на маленьких экранах.
Турниры, Изучение и Настройки доступны как быстрые действия с Главной и
пункт в Профиле — доступность не теряется, но UI остаётся чистым.

## Переменные окружения

См. `.env.example` (корень), `apps/api/.env.example`, `apps/web/.env.example`.
Ключевые: `DATABASE_URL`, `REDIS_URL`, `TELEGRAM_BOT_TOKEN`, `JWT_SECRET`,
`CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`.

## Как запустить локально

```bash
pnpm install
docker compose up -d          # PostgreSQL + Redis
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @bible-arena/api run prisma:migrate
pnpm dev
```
