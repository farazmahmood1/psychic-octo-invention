#!/usr/bin/env bash
set -euo pipefail

echo "Starting local development environment..."

# Check for .env file
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in your values."
  exit 1
fi

# Start Redis via Docker if not running
if ! docker ps --format '{{.Names}}' | grep -q openclaw-redis; then
  echo "Starting Redis..."
  docker compose up -d redis
fi

REDIS_CONFIGURED=$(grep -E '^REDIS_URL=' .env | grep -vE '^REDIS_URL=$' || true)

if [ -n "$REDIS_CONFIGURED" ]; then
  echo "Starting API, Worker, and Admin..."
  npx concurrently \
    --names "api,worker,admin" \
    --prefix-colors "cyan,yellow,magenta" \
    "npm run dev:api" \
    "npm run dev:worker" \
    "npm run dev:admin"
else
  echo "WARNING: REDIS_URL is not configured. Starting API + Admin in fallback mode (no worker)."
  npx concurrently \
    --names "api,admin" \
    --prefix-colors "cyan,magenta" \
    "npm run dev:api" \
    "npm run dev:admin"
fi
