# Design: #82 — About菜单Commit内容显示不正确

> Parent Issue: #82
> Agent: subagent
> Date: 2026-07-09

---

## 1. Architecture Overview

### Problem

The ABOUT screen shows `unknown` for all commit metadata fields in Vercel deployments. This is a **regression** from `#75` which introduced `scripts/inject-commit-info.sh`. The script uses `git log -1` to read metadata, but **Vercel's build environment does not include a `.git/` directory**, so every `git log -1` command fails and triggers the `|| echo "unknown"` fallback. The runtime guard (`!hash.startsWith('__')`) passes because `"unknown"` doesn't start with `"__"`, so the placeholder-like values are displayed as-is.

### Fix: Priority-Chain Fallback

The script reads commit info from three sources in priority order:

```
Vercel env vars (VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_MESSAGE)
  ↓ (not set?)
git log -1 (local development with .git/)
  ↓ (not available?)
Skip replacement → runtime guard detects __COMMIT_HASH__ → shows N/A
```

### Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Pre-Fix Flow (Broken)                                                    │
│                                                                          │
│  Vercel deploy → inject-commit-info.sh → git log -1 → FAILS             │
│    → fallback "unknown" → sed replaces tokens with "unknown"            │
│    → runtime guard: "unknown" doesn't start with "__" → passes          │
│    → ABOUT screen shows "Commit: unknown / Msg: unknown / Date: unknown"│
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Post-Fix Flow (Fixed)                                                    │
│                                                                          │
│  Vercel deploy → inject-commit-info.sh                                   │
│    → Check VERCEL_GIT_COMMIT_SHA                                         │
│    → YES → truncate SHA to 7 chars, read MSG from VERCEL_GIT_COMMIT_MSG │
│    → Date: attempt git log -1 --format="%ai" with SHA (Vercel shallow   │
│      clone may provide partial .git/) or fallback to "N/A"              │
│    → sed replaces tokens → ABOUT screen shows real values ✅             │
│                                                                          │
│  Local dev with git → inject-commit-info.sh                              │
│    → VERCEL_GIT_COMMIT_SHA not set → git log -1 → success               │
│    → ABOUT screen shows real values ✅                                   │
│                                                                          │
│  No git / no env vars → inject-commit-info.sh                            │
│    → Neither source available → skip replacement → tokens stay           │
│    → runtime guard detects __COMMIT_HASH__ → shows N/A ✅                │
└──────────────────────────────────────────────────────────────────────────┘
```

### Module Boundaries

| Module | Responsibility | Change Required |
|--------|---------------|-----------------|
| `scripts/inject-commit-info.sh` | Build-time token replacement | **Yes** — add env var priority chain |
| `public/gameboy.html` | HTML artifact with placeholder tokens | No — unchanged |
| `public/src/engine/core.js` | Runtime guard for commit info | No — correctly handles both `__XXX__` and `"unknown"` values after fix |
| `public/src/render/overlays.js` | ABOUT screen renderer | No — reads `state.commitInfo` correctly |
| `vercel.json` | Vercel build config | No — buildCommand already set |
| `.github/workflows/deploy.yml` | CI/CD pipeline | No — unchanged |
| `tests/test-inject-commit-info.sh` | Test suite | **Yes** — add Vercel env var test cases |

---

## 2. Detailed Design

### 2.1 Script Logic (Priority Chain)

```
START
  │
  ├── [YES] VERCEL_GIT_COMMIT_SHA is set?
  │   │
  │   ├── HASH = ${VERCEL_GIT_COMMIT_SHA:0:7} (truncate to 7 chars)
  │   ├── MSG = VERCEL_GIT_COMMIT_MESSAGE (first line of commit)
  │   ├── DATE = git log -1 --format="%ai" $SHA (if git available)
  │   │          └── fallback: "N/A"
  │   └── Use these values → sed replacement → DONE
  │
  ├── [NO] git log -1 succeeds?
  │   │
  │   ├── HASH = git log -1 --format="%h"
  │   ├── MSG = git log -1 --format="%s"
  │   ├── DATE = git log -1 --format="%ai"
  │   └── Use these values → sed replacement → DONE
  │
  └── [NO] Neither available
      │
      ├── Log warning: "No git commit info available"
      ├── Skip replacement (tokens → __COMMIT_XXX__ remain)
      └── Runtime guard → shows "N/A" → DONE
```

### 2.2 Modified Script: `scripts/inject-commit-info.sh`

Key structural changes from the #75 version:

1. **Removed `set -e`** for the fallback path — individual commands must not cause the whole script to abort
2. **Added Vercel env var detection** at the top of the priority chain
3. **Truncated SHA** from 40-char VERCEL_GIT_COMMIT_SHA to 7 chars via bash substring `${var:0:7}`
4. **Date handling:** Vercel doesn't provide a date env var — attempt `git log -1 --format="%ai"` with the SHA (works if Vercel provides a shallow clone with that commit), fall back to `"N/A"`
5. **Graceful skip path:** if neither env vars nor git available → exit 0 (don't fail the build)

```bash
#!/bin/bash
# inject-commit-info.sh — Replace placeholder tokens in gameboy.html
# with real git commit metadata before deployment.
#
# Priority chain:
#   1. Vercel system env vars (VERCEL_GIT_COMMIT_SHA / _MESSAGE)
#   2. git log -1 (local development)
#   3. Skip (placeholders survive → runtime guard shows N/A)
#
# Usage: bash scripts/inject-commit-info.sh
# Must be run from the repo root.

set -u  # fail on undefined vars, but NOT -e (graceful fallback required)

HTML_FILE="public/gameboy.html"
SCRIPT_NAME="inject-commit-info"

HASH=""
MSG=""
DATE=""
FOUND=false

# ── Priority 1: Vercel system environment variables ──
if [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
    HASH="${VERCEL_GIT_COMMIT_SHA:0:7}"
    MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"

    # Vercel doesn't provide a date env var — try git with SHA
    DATE=$(git log -1 --format="%ai" "$VERCEL_GIT_COMMIT_SHA" 2>/dev/null || echo "N/A")

    # If git failed, DATE is "N/A" — that's acceptable
    FOUND=true
fi

# ── Priority 2: Local git repository ──
if [ "$FOUND" = false ] && HASH=$(git log -1 --format="%h" 2>/dev/null) && [ -n "$HASH" ]; then
    MSG=$(git log -1 --format="%s" 2>/dev/null)
    DATE=$(git log -1 --format="%ai" 2>/dev/null)
    FOUND=true
fi

# ── Priority 3: No data available ──
if [ "$FOUND" = false ]; then
    echo "[${SCRIPT_NAME}] WARNING: No git commit info available. Placeholders will remain (runtime guard shows N/A)."
    exit 0
fi

# ── Escape for sed ──
# Escape: \, &, and @ (our delimiter)
sed_escape() {
  printf '%s\n' "$1" | sed 's/[@\]/\\&/g; s/&/\\&/g'
}

# JSON-escape the commit message using Node.js
if command -v node &>/dev/null; then
  ESCAPED_MSG=$(node -e "console.log(JSON.stringify(process.argv[1]).slice(1,-1))" "$MSG")
else
  ESCAPED_MSG="$MSG"
fi

# Ensure sed-safe: escape \, &, and @ (our delimiter)
HASH_S=$(sed_escape "$HASH")
MSG_S=$(sed_escape "$ESCAPED_MSG")
DATE_S=$(sed_escape "$DATE")

# ── Perform replacements ──
sed -i "s@__COMMIT_HASH__@${HASH_S}@g" "$HTML_FILE"
sed -i "s@__COMMIT_MSG__@${MSG_S}@g" "$HTML_FILE"
sed -i "s@__COMMIT_DATE__@${DATE_S}@g" "$HTML_FILE"

echo "[${SCRIPT_NAME}] Injected: $HASH — ${ESCAPED_MSG:0:50}"
```

### 2.3 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Env var source | `VERCEL_GIT_COMMIT_SHA` / `_MESSAGE` | Vercel's documented system env vars — reliable, stable, CI-agnostic |
| SHA truncation | `${var:0:7}` bash substring | Matches `git log -1 --format="%h"` format for display consistency |
| Date strategy | `git log -1` with SHA, fallback to `"N/A"` | Vercel doesn't provide date env var; a shallow clone may have the head commit; if not, `N/A` is acceptable |
| Error handling | `set -u` but NOT `set -e` | Script must survive individual command failures (e.g., `git log -1`) and still exit 0 |
| Escape strategy | `sed` with `@` delimiter + Node.js JSON.stringify | Same as #75 — proven to handle quotes, backticks, special characters |
| Skip vs fallback string | Skip replacement entirely | Better than injecting `"unknown"` — runtime guard shows `N/A` which is clear intent |
| No CI workflow changes | Verdict: unnecessary | Vercel provides everything via env vars; no coupling to GitHub Actions |

### 2.4 Boundary Conditions

| # | Condition | Behavior |
|---|-----------|----------|
| 1 | **Vercel production deploy** | Env vars set → real values → ABOUT ✅ |
| 2 | **Vercel preview deploy (PR)** | Same as production — env vars reflect PR head commit ✅ |
| 3 | **Vercel deploy from UI (no git connection)** | No env vars, no `.git/` → skip → N/A ✅ |
| 4 | **Local dev with git (`file://` or `http://`)** | No env vars, `.git/` available → git log works ✅ |
| 5 | **Local dev without git** | No env vars, no `.git/` → skip → N/A ✅ |
| 6 | **Full 40-char SHA from Vercel** | Truncated to 7 chars via `${VERCEL_GIT_COMMIT_SHA:0:7}` ✅ |
| 7 | **Commit message with special chars** | Node.js JSON.stringify escapes safely ✅ |
| 8 | **VERCEL_GIT_COMMIT_MSG empty/missing** | Falls to empty string — sed replaces with empty; better than "unknown" |
| 9 | **Script exits non-zero on failure (regression)** | `set -u` only, `exit 0` on skip path — must not crash Vercel build ✅ |
| 10 | **Vercel shallow clone doesn't have `.git/` at all** | `git log -1` prints error to stderr → captured by `2>/dev/null` → DATE = "N/A" ✅ |

### 2.5 Rollback Plan

1. **Immediate:** Revert `scripts/inject-commit-info.sh` to the #75 version (which injects "unknown")
2. **Restore:** `git checkout master -- scripts/inject-commit-info.sh`
3. **Fix:** Publish hotfix with corrected env var detection

---

## 3. Files Changed

| File | Change Type | Description | Est. Lines |
|------|-------------|-------------|------------|
| `scripts/inject-commit-info.sh` | **MODIFY** | Add Vercel env var priority chain; remove `set -e`; add graceful skip path; add SHA truncation | ±15 |
| `tests/test-inject-commit-info.sh` | **MODIFY** | Add Test 4 (Vercel env var simulation with mock env vars) and Test 5 (both env vars and git unavailable) | +40 |

---

## 4. Test Specifications

### 4.1 Unit Tests — Shell Script Logic (Manual)

These tests validate the three code paths in `scripts/inject-commit-info.sh`.

#### TC-1: Vercel env var path (priority source)

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-1 |
| Name | VERCEL_GIT_COMMIT_SHA takes priority over git log |
| Setup | Set env vars: `VERCEL_GIT_COMMIT_SHA=abc1234deadbeef01234567`, `VERCEL_GIT_COMMIT_MESSAGE="Fix: button alignment"`. Run script in a directory WITH `.git/` |
| Steps | 1. `export VERCEL_GIT_COMMIT_SHA=abc1234deadbeef01234567` 2. `export VERCEL_GIT_COMMIT_MESSAGE="Fix: button alignment"` 3. `bash scripts/inject-commit-info.sh` 4. Check `gameboy.html` |
| Expected | Script reads env var SHA (first 7 chars = `abc1234`) and message. Date comes from `git log -1`. No "unknown" appears. |
| Postcondition | `grep -c "unknown" public/gameboy.html` returns 0 |

#### TC-2: Local dev git fallback

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-2 |
| Name | git log -1 fallback when no env vars |
| Setup | No VERCEL_GIT_* env vars. Run in repo root WITH `.git/` |
| Steps | 1. `unset VERCEL_GIT_COMMIT_SHA VERCEL_GIT_COMMIT_MESSAGE` 2. `bash scripts/inject-commit-info.sh` 3. Check `gameboy.html` |
| Expected | Script reads metadata from `git log -1`. Real SHA (7-char) and message injected. Same behavior as original #75 fix. |
| Postcondition | No regression: existing local dev behavior preserved |

#### TC-3: Safe skip when no source available

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-3 |
| Name | No env vars AND no git → skip replacement |
| Setup | Run script outside a git repo (e.g., `/tmp/`) with no VERCEL_GIT_* vars |
| Steps | 1. `cd /tmp && mkdir -p test-no-git && cd test-no-git` 2. Copy `gameboy.html` with placeholders 3. Copy and run `scripts/inject-commit-info.sh` 4. Check exit code and HTML |
| Expected | Exit 0. HTML unchanged (placeholders remain). Runtime guard catches them → ABOUT shows `N/A` |
| Postcondition | `grep "__COMMIT_" public/gameboy.html` still matches |

#### TC-4: SHA truncation

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-4 |
| Name | 40-char SHA truncated to 7 chars |
| Setup | Set `VERCEL_GIT_COMMIT_SHA` to a full 40-char hex string |
| Steps | 1. `export VERCEL_GIT_COMMIT_SHA=abcdef1234567890abcdef1234567890abcdef12` 2. `bash scripts/inject-commit-info.sh` 3. Check injected hash |
| Expected | Hash injected is exactly `abcdef1` (first 7 chars). The full 40-char string NOT present in the output. |
| Postcondition | `grep "hash.*abcdef123" public/gameboy.html` returns 0 (only 7-char version present) |

#### TC-5: Special characters in commit message

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-5 |
| Name | JSON escaping of special chars |
| Setup | Set `VERCEL_GIT_COMMIT_MESSAGE` with quotes, backticks, slashes: `It's "done" — ready for \`deploy\`?` |
| Steps | 1. Export message with special chars 2. Run script 3. Verify injected HTML is valid JS |
| Expected | No script error. Node.js `JSON.stringify` properly escapes the message. HTML `<script>` block remains valid. |
| Postcondition | Game loads without console error due to malformed commit info |

### 4.2 Integration Tests (Manual)

#### TC-6: Runtime guard still works

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-6 |
| Name | Runtime guard catches placeholder leak |
| Steps | 1. Open `public/gameboy.html` directly via `file://` (no build step) 2. Navigate to ABOUT screen |
| Expected | `__COMMIT_HASH__` etc. remain in source. Runtime guard in `core.js` checks `startsWith('__')` → shows `N/A`. |

#### TC-7: Full end-to-end Vercel deploy

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-7 |
| Name | Deployed build shows real commit info |
| Steps | 1. Merge implement PR to main 2. Wait for Vercel deploy 3. Visit deployed URL 4. Navigate to ABOUT screen |
| Expected | Commit hash (7-char), message, and date show real values. No "unknown" visible. |

### 4.3 Regression Tests

#### TC-8: Current behavior unchanged for local dev

| Field | Value |
|-------|-------|
| ID | TC-DESIGN-8 |
| Name | Local dev git path unchanged |
| Steps | 1. In repo root (with `.git/`) without Vercel env vars 2. `bash scripts/inject-commit-info.sh` 3. Check output |
| Expected | Same behavior as #75: real values from `git log -1` injected. Script output matches pre-fix behavior. |

---

## 5. Verification Checklist

### Unit Tests (Text Specs)

**Test 1: Basic replacement in real repo** (existing, unchanged)
- Inject script runs in real repo
- No `__COMMIT_*__` tokens remain in output
- Hash is valid 7-char hex string
- Message and date are non-empty

**Test 2: Fallback without git repo** (existing, updated assertion)
- Inject script runs in temp dir without `.git/`
- Script must NOT inject "unknown" — instead, tokens remain untouched
- **Updated expectation:** Placeholders survive → `grep __COMMIT_HASH__` returns match
- Script exits 0

**Test 3: Special characters in commit message** (existing, unchanged)
- Commit with quotes, ampersands, backticks
- Script produces valid sed replacement
- No `__COMMIT_*__` tokens remain

**Test 4 (NEW): Vercel env var simulation**
- Mock `VERCEL_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_MESSAGE` env vars
- Inject script in temp dir without `.git/`
- Hash is truncated 7-char hex from mock SHA
- Message matches mock message
- Date is "N/A" (since no `.git/` available for git date lookup)

**Test 5 (NEW): Both env vars and git unavailable — graceful skip**
- Inject script in temp dir without `.git/`, without Vercel env vars
- Script exits 0
- `__COMMIT_HASH__` tokens remain in output (no replacement)
- **This is the test that would have caught the #82 regression**

### Integration Checks

- [ ] Vercel deploy: build logs show `[inject-commit-info] Injected: <hash> — <msg>`
- [ ] Deployed ABOUT screen shows real commit hash (7-char), message, date
- [ ] Preview deploy (PR branch) also shows correct commit info
- [ ] Local dev: `bash scripts/inject-commit-info.sh` still works with `.git/`
- [ ] Local dev without `.git/`: script exits 0, tokens untouched, runtime guard shows N/A
- [ ] `createInitialState()` with real values — `state.commitInfo.hash === "abc1234"` etc.
- [ ] Existing N/A fallback tests still pass

### Regression Checks

- [ ] `npm test` all tests pass
- [ ] `tests/test-inject-commit-info.sh` all tests pass (existing + new)
- [ ] Manual: navigate ABOUT screen in deployed game — no broken HTML, no JS errors
- [ ] Edge: commit message with CJK characters (relevant for Chinese commits)
- [ ] Edge: commit message with emoji (e.g., "🎉 Initial commit")
