# Built with repo root as build context (monorepo: apps/api depends on
# packages/shared). See docs/deployment.md for the hosting setup this pairs
# with.
FROM node:20-slim

# Prisma без OpenSSL не определяет движок под систему и работает наугад:
# в сборке это видно только предупреждением, а вылезает уже на боевом
# сервере. В node:20-slim его нет, поэтому ставим явно.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bible-arena/shared build

# Клиент Prisma генерируется из схемы, а не лежит в репозитории. Локально
# `prisma generate` вшит в `dev` и `start:dev`, но в `build` его нет — и
# сборка контейнера падала на сорока пяти ошибках вида «Module
# '@prisma/client' has no exported member 'Difficulty'». Читается это как
# поломка кода, хотя код в порядке: клиента просто не существует.
RUN pnpm --filter @bible-arena/api exec prisma generate

RUN pnpm --filter @bible-arena/api build

# Проверка на месте сборки, а не на запуске.
#
# Куда TypeScript кладёт результат, зависит от того, какие файлы попали в
# компиляцию: один лишний `.ts` рядом с `src` — и `main.js` уезжает в
# `dist/src/`. Сборка при этом проходит молча, а падает уже боевой запуск
# с `Cannot find module`, то есть в самом дорогом месте.
#
# Здесь это ловится сразу, и в логе сборки видно, что на самом деле лежит
# в `dist` — без этого причину приходится угадывать по одной строке
# ошибки в контейнере, который уже мёртв.
RUN ls -la apps/api/dist \
  && test -f apps/api/dist/main.js

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001

# Migrations run on every boot instead of as a separate release step, since
# most PaaS platforms here don't offer one — safe because `migrate deploy`
# is a no-op when there's nothing new to apply.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
