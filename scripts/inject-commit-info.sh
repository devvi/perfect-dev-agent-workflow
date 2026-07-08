#!/bin/bash
# inject-commit-info.sh — Replace placeholder tokens in gameboy.html
# with real git commit metadata before deployment.
#
# Usage: bash scripts/inject-commit-info.sh
# Must be run from the repo root (where .git/ exists).

set -euo pipefail

HTML_FILE="public/gameboy.html"
SCRIPT_NAME="inject-commit-info"

# Read git metadata; fail gracefully → placeholders survive → N/A at runtime
HASH=$(git log -1 --format="%h" 2>/dev/null || echo "unknown")
MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")
DATE=$(git log -1 --format="%ai" 2>/dev/null || echo "unknown")

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
