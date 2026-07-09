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
echo "=== Test 2: Fallback without git repo — placeholders survive ==="
# ----------------------------------------------------------------

TESTDIR=$(mktemp -d)
mkdir -p "$TESTDIR/public"
# Create a gameboy.html with placeholders in the expected subdir
cat > "$TESTDIR/public/gameboy.html" << 'EOF'
<!DOCTYPE html><html><body>
<script>window.__COMMIT_INFO = {hash: "__COMMIT_HASH__", message: "__COMMIT_MSG__", date: "__COMMIT_DATE__"};</script>
</body></html>
EOF

# Run script from tmpdir (no .git there) — should hit skip path (Source 3)
(cd "$TESTDIR" && bash "$SCRIPT" > /dev/null 2>&1)

# Check 2a: Placeholder tokens survive (no replacement)
if grep -qF '__COMMIT_HASH__' "$TESTDIR/public/gameboy.html"; then
  pass "Placeholder tokens survive when no commit info available"
else
  fail "Placeholder tokens missing — script should skip replacement"
fi

# Check 2b: No "unknown" string injected (regression guard for #82 fix)
if grep -qF '"unknown"' "$TESTDIR/public/gameboy.html"; then
  fail "'unknown' should not be injected — script should skip replacement"
else
  pass "No 'unknown' string injected"
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
echo "=== Test 4: Vercel env var simulation ==="
# ----------------------------------------------------------------

TESTDIR=$(mktemp -d)
mkdir -p "$TESTDIR/public"
cat > "$TESTDIR/public/gameboy.html" << 'EOF'
<!DOCTYPE html><html><body>
<script>window.__COMMIT_INFO = {hash: "__COMMIT_HASH__", message: "__COMMIT_MSG__", date: "__COMMIT_DATE__"};</script>
</body></html>
EOF

# Mock Vercel env vars — no .git/ available, should hit Source 1 path
(cd "$TESTDIR" && \
  VERCEL_GIT_COMMIT_SHA="a1b2c3d4e5f678901234567890abcdef12345678" \
  VERCEL_GIT_COMMIT_MESSAGE="fix: resolve menu issue #82" \
  bash "$SCRIPT" > /dev/null 2>&1)

# Check 4a: Hash truncated to 7 chars (a1b2c3d)
if grep -qF 'hash: "a1b2c3d"' "$TESTDIR/public/gameboy.html"; then
  pass "Vercel: hash truncated to 7 chars (a1b2c3d)"
else
  fail "Vercel: hash not truncated correctly"
fi

# Check 4b: Message matches mock
if grep -qF 'message: "fix: resolve menu issue #82"' "$TESTDIR/public/gameboy.html"; then
  pass "Vercel: commit message matches mock"
else
  fail "Vercel: commit message mismatch"
fi

# Check 4c: Date is "N/A" (no .git/ available for git date lookup)
if grep -qF 'date: "N/A"' "$TESTDIR/public/gameboy.html"; then
  pass "Vercel: date is N/A (no .git/ available)"
else
  fail "Vercel: date should be N/A"
fi

rm -rf "$TESTDIR"

# ----------------------------------------------------------------
echo "=== Test 5: Both sources unavailable — graceful skip ==="
# ----------------------------------------------------------------

TESTDIR=$(mktemp -d)
mkdir -p "$TESTDIR/public"
cat > "$TESTDIR/public/gameboy.html" << 'EOF'
<!DOCTYPE html><html><body>
<script>window.__COMMIT_INFO = {hash: "__COMMIT_HASH__", message: "__COMMIT_MSG__", date: "__COMMIT_DATE__"};</script>
</body></html>
EOF

# No Vercel env vars, no .git/ — should hit skip path (Source 3)
(cd "$TESTDIR" && bash "$SCRIPT" > /dev/null 2>&1)

# Check 5a: Script exits 0 (verified by test continuing past the call)
# Check 5b: __COMMIT_HASH__ tokens remain
if grep -qF '__COMMIT_HASH__' "$TESTDIR/public/gameboy.html"; then
  pass "Skip: __COMMIT_HASH__ tokens remain when no sources available"
else
  fail "Skip: __COMMIT_HASH__ tokens should survive"
fi

# Check 5c: __COMMIT_MSG__ tokens remain
if grep -qF '__COMMIT_MSG__' "$TESTDIR/public/gameboy.html"; then
  pass "Skip: __COMMIT_MSG__ tokens remain when no sources available"
else
  fail "Skip: __COMMIT_MSG__ tokens should survive"
fi

# Check 5d: __COMMIT_DATE__ tokens remain
if grep -qF '__COMMIT_DATE__' "$TESTDIR/public/gameboy.html"; then
  pass "Skip: __COMMIT_DATE__ tokens remain when no sources available"
else
  fail "Skip: __COMMIT_DATE__ tokens should survive"
fi

rm -rf "$TESTDIR"

# ----------------------------------------------------------------
echo ""
echo "=== Results: $PASS_COUNT passed, $FAIL_COUNT failed ==="

if [ "$FAIL_COUNT" -eq 0 ]; then
  exit 0
else
  exit 1
fi
