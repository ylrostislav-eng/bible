#!/usr/bin/env bash
# Bootstraps a local development environment: copies env files, installs
# dependencies, starts Postgres/Redis via Docker Compose, and generates
# the Prisma client.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

copy_env() {
  local example="$1"
  local target="$2"
  if [ ! -f "$target" ]; then
    cp "$example" "$target"
    echo "Created $target"
  fi
}

copy_env ".env.example" ".env"
copy_env "apps/api/.env.example" "apps/api/.env"
copy_env "apps/web/.env.example" "apps/web/.env.local"

echo "Installing dependencies..."
pnpm install

echo "Starting Postgres and Redis..."
docker compose up -d

echo "Generating Prisma client..."
pnpm --filter @bible-arena/api run prisma:generate

echo "Done. Run 'pnpm dev' to start the apps."
