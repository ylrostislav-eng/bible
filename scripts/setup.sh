#!/usr/bin/env bash
# Bootstraps a local development environment: copies env files, installs
# dependencies, starts Postgres/Redis via Docker Compose, and generates
# the Prisma client.
#
# Safe to re-run on an existing checkout — that's the main reason it
# exists. An env file that's already there is never overwritten (it holds
# real tokens), but it *is* checked against its example, because the
# failure mode this script had before was silent: a setting added to the
# project after someone's first run simply never reached their .env, and
# the app failed later with an error that pointed nowhere near the cause.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

missing_keys_found=0

copy_env() {
  local example="$1"
  local target="$2"

  if [ ! -f "$example" ]; then
    echo "Skipping $target — $example is missing"
    return
  fi

  if [ ! -f "$target" ]; then
    cp "$example" "$target"
    echo "Created $target"
    return
  fi

  # Already there: keep it, but say which settings it doesn't have yet.
  local missing=()
  local key
  while IFS= read -r key; do
    if ! grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}=" "$target"; then
      missing+=("$key")
    fi
  done < <(grep -oE '^[[:space:]]*[A-Z_][A-Z0-9_]*=' "$example" | tr -d ' =')

  if [ ${#missing[@]} -gt 0 ]; then
    missing_keys_found=1
    echo "Kept existing $target, but it is missing: ${missing[*]}"
    echo "  Add them from $example — the app may fail in confusing ways without them."
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

echo
if [ "$missing_keys_found" -eq 1 ]; then
  echo "Done, but see the missing env settings listed above first."
else
  echo "Done. Run 'pnpm dev' to start the apps."
fi
