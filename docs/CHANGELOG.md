# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## [Unreleased]

## [0.2.0] — Этап 2: авторизация и профиль

### Добавлено

- Схема Prisma: модель `User` (профиль, статистика игр, рейтинг, уровень,
  опыт, монеты).
- Backend: авторизация через Telegram Mini Apps `initData` (валидация HMAC,
  проверка срока действия) с выдачей JWT.
- Backend: `UsersModule` — `GET /users/me`, `PATCH /users/me` с валидацией
  DTO (никнейм, аватар, страна, язык).
- Backend: глобальные модули `PrismaModule`, `RedisModule`; `GET /health`
  (проверка БД и Redis).
- Backend: валидация переменных окружения (`class-validator`), глобальный
  `ValidationPipe`, CORS.
- Frontend: TailwindCSS v4, тёмная тема, mobile-first layout под Telegram
  Mini Apps (safe-area, viewport-fit=cover).
- Frontend: интеграция `@telegram-apps/sdk-react`, `AuthProvider` (вход по
  `initData`, состояния loading/no-telegram/error/authenticated).
- Frontend: онбординг (никнейм, страна, язык), профиль (реальная
  статистика), настройки (редактирование профиля).
- Frontend: нижняя навигация (Главная, Играть, Рейтинг, Друзья, Профиль);
  Играть/Друзья/Рейтинг/Турниры/Изучение — честные страницы "в разработке".
- `packages/shared`: общие типы профиля, список языков и стран,
  переиспользуемые фронтендом и бэкендом.
- Redis используется для presence-ключей (фундамент для статуса "онлайн").
- Docker Compose: добавлен сервис Redis.
- Husky + lint-staged, `.editorconfig`, `docs/`, `scripts/setup.sh`.

### Архитектурные решения

- Нижняя навигация ограничена 5 вкладками вместо 8 (см. `docs/architecture.md`).
- Аватар по умолчанию берётся из Telegram при первом входе; кастомный
  аватар — по прямой ссылке (без файлового хранилища, чтобы не усложнять
  этот этап).
- JWT-гвард не зависит от `UsersModule` (нет циклических зависимостей
  между модулями).

## [0.1.0] — Этап 1: базовая структура проекта

### Добавлено

- pnpm-монорепо: `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared`.
- Docker Compose с PostgreSQL.
- Prisma подключена к backend (пустая схема).
- ESLint, Prettier, корневые команды `dev`/`build`/`lint`.
- `.env.example`, корневой `README.md`.
