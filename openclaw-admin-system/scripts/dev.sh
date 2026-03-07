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

# Run API and Admin in parallel
echo "Starting API and Admin..."
npx concurrently \
  --names "api,admin" \
  --prefix-colors "cyan,magenta" \
  "npm run dev:api" \
  "npm run dev:admin"
