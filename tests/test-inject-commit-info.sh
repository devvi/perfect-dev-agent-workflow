#!/bin/bash
# test-inject-commit-info.sh — Test injection script in multiple environments.
#
# Usage: bash tests/test-inject-commit-info.sh
# Must be run from repo root.

set -euo pipefail

PASS_COUNT=0
FAIL_COUNT=0
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/inject-commit-info.sh"
BACKUP=$(mktemp /tmp/gameboy.html.XXXXXX)

pass() { echo "  ✅ PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ----------------------------------------------------------------
echo "=== Test 1: Basic replacement in real repo ==="
# ----------------------------------------------------------------

# Backup original
cp "$REPO_ROOT/public/gameboy.html" "$BACKUP"

# Run the injection script
bash "$SCRIPT" > /dev/null 2>&1

INJECTED="$REPO_ROOT/public/gameboy.html"

# Check 1a: No literal __COMMIT_HASH__ / __COMMIT_MSG__ / __COMMIT_DATE__ tokens remain
if grep -qF '__COMMIT_HASH__' "$INJECTED" || \
   grep -qF '__COMMIT_MSG__' "$INJECTED" || \
   grep -qF '__COMMIT_DATE__' "$INJECTED"; then
  fail "Placeholder tokens still present after injection"
else
  pass "No __COMMIT_ placeholder tokens remain"
fi

# Check 1b: Hash is a 7-character hex string
# Format in file:     hash: "bf6538d",
HASH_LINE=$(grep '^[[:space:]]*hash:' "$INJECTED" || true)
HASH=$(echo "$HASH_LINE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "")
if echo "$HASH" | grep -qE '^[a-f0-9]{7}$'; then
  pass "Hash is a valid 7-char hex string: $HASH"
elif [ "$HASH" = "unknown" ]; then
  pass "Hash is 'unknown' (non-git environment)"
else
  fail "Hash '$HASH' is neither hex nor unknown"
fi

# Check 1c: Message is non-empty
MSG_LINE=$(grep '^[[:space:]]*message:' "$INJECTED" || true)
MSG=$(echo "$MSG_LINE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "")
if [ -n "$MSG" ]; then
  pass "Message is non-empty: ${MSG:0:50}..."
else
  fail "Message is empty"
fi

# Check 1d: Date is non-empty
DATE_LINE=$(grep '^[[:space:]]*date:' "$INJECTED" || true)
DATE=$(echo "$DATE_LINE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "")
if [ -n "$DATE" ]; then
  pass "Date is non-empty: $DATE"
else
  fail "Date is empty"
fi

# Restore original
cp "$BACKUP" "$REPO_ROOT/public/gameboy.html"

# ----------------------------------------------------------------
echo "=== Test 2: Fallback without git repo ==="
# ----------------------------------------------------------------

TESTDIR=$(mktemp -d)
mkdir -p "$TESTDIR/public"
# Create a gameboy.html with placeholders in the expected subdir
cat > "$TESTDIR/public/gameboy.html" << 'EOF'
<!DOCTYPE html><html><body>
<script>window.__COMMIT_INFO = {hash: "__COMMIT_HASH__", message: "__COMMIT_MSG__", date: "__COMMIT_DATE__"};</script>
</body></html>
EOF

# Run script from tmpdir (no .git there) — script expects public/gameboy.html relative
(cd "$TESTDIR" && bash "$SCRIPT" > /dev/null 2>&1)

# Check 2a: Tokens replaced with "unknown"
if grep -qF '"unknown"' "$TESTDIR/public/gameboy.html"; then
  pass "Fallback: placeholders replaced with 'unknown'"
else
  fail "Fallback: did not use 'unknown'"
fi

# Check 2b: No literal __COMMIT_HASH__ / __COMMIT_MSG__ / __COMMIT_DATE__ remain
if grep -qF '__COMMIT_HASH__' "$TESTDIR/public/gameboy.html" || \
   grep -qF '__COMMIT_MSG__' "$TESTDIR/public/gameboy.html" || \
   grep -qF '__COMMIT_DATE__' "$TESTDIR/public/gameboy.html"; then
  fail "Fallback: placeholder tokens still present"
else
  pass "Fallback: no placeholder tokens remain"
fi

rm -rf "$TESTDIR"

# ----------------------------------------------------------------
echo "=== Test 3: Special characters in commit message ==="
# ----------------------------------------------------------------

TESTDIR=$(mktemp -d)
mkdir -p "$TESTDIR/public"
cd "$TESTDIR"
git init -q
git config user.email "test@test.com"
git config user.name "Test"
echo "test" > test.txt
git add test.txt
# Commit with special chars: quotes, slash, ampersand, backticks
git commit -q -m 'feat: fix "quotes" & special/chars `code`'
# Copy gameboy.html into temp repo at expected location
cp "$REPO_ROOT/public/gameboy.html" "$TESTDIR/public/gameboy.html"
# Run injection script
bash "$SCRIPT" > /dev/null 2>&1

# Check 3a: Message contains "feat" (the beginning of the message)
if grep -qF 'feat' "$TESTDIR/public/gameboy.html"; then
  pass "Special chars: commit message injected (contains 'feat')"
else
  fail "Special chars: commit message not found"
fi

# Check 3b: JSON-style structure is intact (message field exists with content)
MSG_LINE=$(grep '^[[:space:]]*message:' "$TESTDIR/public/gameboy.html" || true)
MSG=$(echo "$MSG_LINE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "")
if [ -n "$MSG" ]; then
  pass "Special chars: message field present: ${MSG:0:40}..."
else
  fail "Special chars: message field missing or empty"
fi

# Check 3c: No literal placeholder tokens remain
if grep -qF '__COMMIT_HASH__' "$TESTDIR/public/gameboy.html" || \
   grep -qF '__COMMIT_MSG__' "$TESTDIR/public/gameboy.html" || \
   grep -qF '__COMMIT_DATE__' "$TESTDIR/public/gameboy.html"; then
  fail "Special chars: placeholder tokens still present"
else
  pass "Special chars: no placeholder tokens remain"
fi

cd "$REPO_ROOT"
rm -rf "$TESTDIR"

# ----------------------------------------------------------------
echo ""
echo "=== Results: $PASS_COUNT passed, $FAIL_COUNT failed ==="

if [ "$FAIL_COUNT" -eq 0 ]; then
  exit 0
else
  exit 1
fi
