#!/usr/bin/env bash
# Curl a sample lemlist reply into the webhook. Usage: ./scripts/demo-trigger-a.sh [01|02]
set -euo pipefail

HOST="${HOST:-http://localhost:3000}"
N="${1:-01}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILE="$(ls "$DIR/data/sample-replies/${N}"*.json 2>/dev/null | head -1 || true)"
if [[ -z "${FILE:-}" ]]; then
  echo "No sample reply matching '${N}' in data/sample-replies/" >&2
  echo "Available:" >&2
  ls "$DIR/data/sample-replies/" >&2
  exit 1
fi

echo "→ POST $(basename "$FILE")  →  $HOST/webhook/lemlist-reply"
RESP="$(curl -sS -X POST "$HOST/webhook/lemlist-reply" -H 'content-type: application/json' --data @"$FILE")"
if command -v jq >/dev/null 2>&1; then echo "$RESP" | jq .; else echo "$RESP"; fi
