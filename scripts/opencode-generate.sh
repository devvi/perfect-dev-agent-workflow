#!/bin/bash
# ============================================================
# opencode-generate.sh — Thin dispatcher to OpenCode Serve API
# ============================================================
# Called by implement-agent (OpenClaw sub-agent) to generate code.
# This script is NOT the brain — it just:
#   1. Creates a session on OpenCode Serve
#   2. Sends a prompt with file context
#   3. Waits for the generated code
#   4. Returns it to stdout
#
# Usage:
#   bash scripts/opencode-generate.sh "your prompt" [--cwd /path/to/project]
#   bash scripts/opencode-generate.sh --file prompt.md [--cwd /path/to/project]
#
# Environment:
#   OPENCODE_URL   — default http://127.0.0.1:18765
#   OPENCODE_MODEL — default deepseek/deepseek-v4-flash
# ============================================================

set -euo pipefail

OPENCODE_URL="${OPENCODE_URL:-http://127.0.0.1:18765}"
MODEL="${OPENCODE_MODEL:-deepseek/deepseek-v4-flash}"
CWD="${PWD}"
PROMPT=""
TIMEOUT="${OPENCODE_TIMEOUT:-120}"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cwd) CWD="$2"; shift 2 ;;
    --file) PROMPT="$(cat "$2")"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    *)
      if [[ -z "$PROMPT" ]]; then
        PROMPT="$1"
      else
        PROMPT="$PROMPT"$'\n'"$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$PROMPT" ]]; then
  echo "ERROR: No prompt provided" >&2
  echo "Usage: opencode-generate.sh 'your prompt'" >&2
  exit 1
fi

# Escape prompt for JSON
PROMPT_JSON="$(echo "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"

# 1. Health check
HEALTH=$(curl -s "$OPENCODE_URL/global/health" 2>/dev/null || echo '{"healthy":false}')
if ! echo "$HEALTH" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('healthy') else 1)" 2>/dev/null; then
  echo "ERROR: OpenCode Serve not healthy at $OPENCODE_URL" >&2
  exit 2
fi

# 2. Create session
SESSION_RESP=$(curl -s -X POST "$OPENCODE_URL/session" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"gen-$(date +%s)\",\"cwd\":\"$CWD\"}" 2>/dev/null)

SESSION_ID=$(echo "$SESSION_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [[ -z "$SESSION_ID" ]]; then
  echo "ERROR: Failed to create session" >&2
  echo "$SESSION_RESP" >&2
  exit 3
fi

echo "[opencode-generate] Session: $SESSION_ID" >&2

# 3. Send message (sync, wait for response)
MODEL_PROVIDER="${MODEL%%/*}"
MODEL_ID="${MODEL##*/}"

RESPONSE=$(curl -s -X POST "$OPENCODE_URL/session/$SESSION_ID/message" \
  -H "Content-Type: application/json" \
  --max-time "$TIMEOUT" \
  -d "{
    \"model\": {\"providerID\": \"$MODEL_PROVIDER\", \"modelID\": \"$MODEL_ID\"},
    \"parts\": [{\"type\": \"text\", \"text\": $PROMPT_JSON}]
  }" 2>/dev/null)

# 4. Extract text response
TEXT_OUTPUT=$(echo "$RESPONSE" | python3 -c "
import json, sys
try:
  data = json.load(sys.stdin)
  # Check for error
  if 'error' in data.get('info', {}):
    print(f'ERROR: {data[\"info\"][\"error\"]}', file=sys.stderr)
    sys.exit(4)
  # Extract text parts
  parts = data.get('parts', [])
  texts = [p['text'] for p in parts if p.get('type') == 'text']
  if not texts:
    # Check if there's info content
    info_text = data.get('info', {}).get('content', '')
    if info_text:
      print(info_text)
    else:
      print('(no text in response)', file=sys.stderr)
  else:
    print(''.join(texts))
except Exception as e:
  print(f'ERROR parsing response: {e}', file=sys.stderr)
  sys.exit(5)
" 2>/dev/null)

EXIT_CODE=$?

# 5. Cleanup session
curl -s -X DELETE "$OPENCODE_URL/session/$SESSION_ID" > /dev/null 2>&1

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "[opencode-generate] Failed (exit $EXIT_CODE)" >&2
  exit $EXIT_CODE
fi

echo "$TEXT_OUTPUT"
