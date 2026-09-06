# Собирается с корнем репозитория как контекстом: web зависит от
# packages/shared, и из папки apps/web этот пакет не виден.
# Парный файл для сервера — apps/api/Dockerfile.
FROM node:20-slim

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bible-arena/shared build

# Адрес сервера подставляется НА СБОРКЕ, а не на запуске.
#
# Всё, что начинается с `NEXT_PUBLIC_`, Next вшивает в код, который
# уезжает в браузер: после сборки эта строка — часть готовых файлов, и
# менять переменную на работающем контейнере бесполезно. Отсюда `ARG`, а
# не только `ENV`: Railway отдаёт переменные сервиса в сборку как
# аргументы, и без объявления `ARG` они до `next build` не доходят.
#
# Практическое следствие: сменился адрес сервера — сайт надо
# пересобрать, перезапуска мало.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @bible-arena/web build

ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000

# Порт даёт платформа; 3000 остаётся запасным для запуска руками.
CMD ["sh", "-c", "pnpm exec next start -p ${PORT:-3000}"]
