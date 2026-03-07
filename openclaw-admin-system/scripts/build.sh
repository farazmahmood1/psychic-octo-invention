#!/usr/bin/env bash
set -euo pipefail

echo "Building all packages and apps..."

npm run build -w packages/shared
npm run build -w packages/config
npm run build -w apps/api
npm run build -w apps/admin

echo "Build complete."
