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
  users/        Профиль пользователя (CRUD), начисление наград/уровня
  game/         Одиночная игра: подбор вопросов, игровые сессии
  health/       GET /health — проверка доступности БД и Redis
```

Каждый модуль независим и содержит свои DTO/сервисы/контроллеры. Общие
типы, которые должны совпадать на фронте и бэке (профиль, языки, страны,
вопросы/сессии), вынесены в `packages/shared`, чтобы избежать дублирования
и рассинхрона.

## База данных

Модели (см. `apps/api/prisma/schema.prisma`):

- `User` — профиль, уровень/опыт/монеты/рейтинг, статистика игр.
- `Question` — банк вопросов викторины (текст, 4 варианта, правильный
  ответ, объяснение, книга/глава/стихи, тема, сложность, статус проверки,
  счётчики использования и ошибок).
- `GameSession` — одна сыгранная партия (пока только режим `SOLO`).
- `GameAnswer` — ответ на конкретный вопрос в рамках сессии (порядок,
  выбранный вариант, правильность, время ответа).

`GameSession.userId` — единственный владелец сессии; при добавлении дуэлей
и комнат потребуется отдельная таблица участников (`GameParticipant`) —
переиспользовать `userId` для нескольких игроков не получится, и это
сознательно не сделано заранее, чтобы не гадать на будущей форме API.

Изменения схемы — только через `prisma migrate dev` (миграции хранятся в
`apps/api/prisma/migrations` и коммитятся в репозиторий). Вопросы
наполняются через `pnpm --filter @bible-arena/api run prisma:seed`
(см. `apps/api/prisma/seed.ts` — 40 проверенных вопросов по обоим Заветам).

## Redis

`RedisService` — единая точка доступа к Redis. Сейчас используется для:

- presence-ключей (`presence:<userId>`, TTL 60s) — фундамент для будущего
  статуса "онлайн" у друзей.
- health-check (`GET /health` проверяет `PING`).

В дальнейшем Redis возьмёт на себя комнаты, живой рейтинг и WebSocket-стейт,
как описано в ТЗ.

## Одиночная игра

Поток одиночной игры:

1. `POST /game/solo/start { questionCount }` — `QuestionsService` берёт все
   вопросы со статусом `APPROVED` (опционально фильтруя по Завету/сложности),
   перемешивает и берёт `questionCount` штук (или меньше, если подходящих
   вопросов не хватает — без падения с ошибкой). Создаётся `GameSession` со
   всеми `GameAnswer`-заготовками сразу (по одной на вопрос, по порядку).
   Клиенту возвращается **только** первый вопрос, без правильного ответа.
2. `POST /game/solo/:sessionId/answer { questionId, answerIndex }` —
   проверяет, что вопрос действительно текущий (нельзя ответить не по
   порядку или дважды), сравнивает индекс с `correctIndex`, обновляет
   `usageCount`/`errorCount` у вопроса, возвращает правильный ответ,
   объяснение и ссылку на стих. Если это был последний вопрос — сессия
   помечается `COMPLETED`, начисляются опыт/монеты
   (`UsersService.applyGameRewards`, пересчёт уровня по формуле
   `level = floor(experience / 100) + 1`), и в ответ добавляется `summary`.

Сессия принадлежит пользователю (проверка на каждом запросе); нельзя
получить чужую сессию или подглядеть правильный ответ до отправки своего.

Известное ограничение: если Mini App перезагрузится посреди игры, сессия
восстановлена не будет (нужно начать заново) — сознательно не реализовано
в этом этапе, чтобы не усложнять API восстановлением состояния ради
редкого сценария.

## Frontend: структура

```
src/
  app/
    layout.tsx          Корневой layout: тёмная тема, TelegramProvider, AuthProvider
    (main)/              Route group с нижней навигацией
      layout.tsx          Оборачивает контент в AuthGate
      page.tsx             Главная
      play/                 Одиночная игра: настройка → вопрос → ответ → итог
      friends/ rating/ tournaments/ learn/   "В разработке" — честные заглушки
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
pnpm --filter @bible-arena/api run prisma:seed   # наполняет банк вопросов
pnpm dev
```
