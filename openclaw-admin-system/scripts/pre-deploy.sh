#!/usr/bin/env bash
set -euo pipefail

echo "=== Pre-deployment checks ==="

# 1. TypeScript compilation
echo "[1/4] Type checking..."
npm run typecheck

# 2. Lint
echo "[2/4] Linting..."
npm run lint

# 3. Tests
echo "[3/4] Running tests..."
npm test

# 4. Build
echo "[4/4] Building..."
npm run build

echo ""
echo "=== All pre-deployment checks passed ==="
