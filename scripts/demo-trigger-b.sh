#!/usr/bin/env bash
# Fire the pre-meeting brief for a deal. Usage: ./scripts/demo-trigger-b.sh [dealId]
set -euo pipefail

HOST="${HOST:-http://localhost:3000}"
DEAL="${1:-deal-001}"

echo "→ POST {dealId: $DEAL}  →  $HOST/trigger-b/run"
RESP="$(curl -sS -X POST "$HOST/trigger-b/run" -H 'content-type: application/json' -d "{\"dealId\":\"$DEAL\"}")"
if command -v jq >/dev/null 2>&1; then echo "$RESP" | jq .; else echo "$RESP"; fi
