# Built with repo root as build context (monorepo: apps/api depends on
# packages/shared). See docs/deployment.md for the hosting setup this pairs
# with.
FROM node:20-slim

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bible-arena/shared build
RUN pnpm --filter @bible-arena/api build

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001

# Migrations run on every boot instead of as a separate release step, since
# most PaaS platforms here don't offer one — safe because `migrate deploy`
# is a no-op when there's nothing new to apply.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
