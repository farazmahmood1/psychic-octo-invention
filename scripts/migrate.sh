#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations..."

if [ "${NODE_ENV:-development}" = "production" ]; then
  npx prisma migrate deploy --schema=prisma/schema.prisma
else
  npx prisma migrate dev --schema=prisma/schema.prisma
fi

echo "Migrations complete."
