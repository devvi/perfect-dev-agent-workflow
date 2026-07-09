#!/bin/bash
# inject-commit-info.sh — Replace placeholder tokens in gameboy.html
# with real git commit metadata before deployment.
#
# Supports two data sources:
#   1. Vercel system environment vars (VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_MESSAGE)
#      → Used when available (Vercel build environment, no .git/ available)
#   2. git log -1
#      → Fallback for local development (repo root, .git/ available)
#
# If neither source is available, the script skips replacement entirely.
# Placeholder tokens survive → runtime guard catches them → ABOUT shows "N/A".
#
# Usage: bash scripts/inject-commit-info.sh
# Must be run from the repo root (where .git/ exists).

# NOTE: no "set -e" — individual command failures (e.g. git log in no-git env)
# must not abort the script. Graceful skip path exits 0.
set -uo pipefail

HTML_FILE="public/gameboy.html"
SCRIPT_NAME="inject-commit-info"

# ── Resolve commit metadata ──────────────────────────────────────────

# Source 1: Vercel system environment variables (preferred)
# Vercel provides these during build; see https://vercel.com/docs/projects/environment-variables/system-environment-variables
if [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
  HASH="${VERCEL_GIT_COMMIT_SHA:0:7}"  # first 7 chars = abbreviated hash
  MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"
  # Derive date from git log — Vercel doesn't expose a date env var
  DATE=$(git log -1 --format="%ai" "$VERCEL_GIT_COMMIT_SHA" 2>/dev/null || echo "N/A")

# Source 2: Local git repository
elif git log -1 &>/dev/null; then
  HASH=$(git log -1 --format="%h")
  MSG=$(git log -1 --format="%s")
  DATE=$(git log -1 --format="%ai")

# Source 3: Nothing available — skip replacement, runtime guard handles it
else
  echo "[${SCRIPT_NAME}] WARN: No git metadata available. Keeping placeholders (runtime fallback → N/A)."
  exit 0
fi

# ── Escape and inject ───────────────────────────────────────────────

# Escape for safe sed replacement (delimiter = @)
# Must escape: \, &, @ (the delimiter)
sed_escape() {
  printf '%s\n' "$1" | sed 's/[@\]/\\&/g; s/&/\\&/g'
}

# JSON-escape the commit message using Node.js for quotes/backticks etc.
if command -v node &>/dev/null; then
  ESCAPED_MSG=$(node -e "console.log(JSON.stringify(process.argv[1]).slice(1,-1))" "$MSG")
else
  ESCAPED_MSG="$MSG"
fi

# Ensure sed-safe: escape \, &, and @ (our delimiter)
HASH_S=$(sed_escape "$HASH")
MSG_S=$(sed_escape "$ESCAPED_MSG")
DATE_S=$(sed_escape "$DATE")

# Perform in-place replacements with @ delimiter
sed -i "s@__COMMIT_HASH__@${HASH_S}@g" "$HTML_FILE"
sed -i "s@__COMMIT_MSG__@${MSG_S}@g" "$HTML_FILE"
sed -i "s@__COMMIT_DATE__@${DATE_S}@g" "$HTML_FILE"

echo "[${SCRIPT_NAME}] Injected: $HASH — $ESCAPED_MSG"
