#!/usr/bin/env bash
set -euo pipefail

# Verify all health endpoints of a running deployment
BASE_URL="${1:-http://localhost:4000}"

echo "Checking health at $BASE_URL..."

# Liveness
echo -n "  /health: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$STATUS" = "200" ]; then echo "OK"; else echo "FAIL ($STATUS)"; exit 1; fi

# Readiness
echo -n "  /health/ready: "
READY=$(curl -s "$BASE_URL/health/ready")
STATUS=$(echo "$READY" | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).status" 2>/dev/null || echo "error")
if [ "$STATUS" = "ready" ]; then echo "OK"; else echo "DEGRADED: $READY"; fi

echo ""
echo "Health check complete."
