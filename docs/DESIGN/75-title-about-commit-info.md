# Design: #75 — Title About Screen Commit Info Shows N/A

> Parent Issue: #75
> Plan Agent: subagent
> Date: 2026-07-09

---

## 1. Architecture Overview

The bug occurs because `public/gameboy.html` ships placeholder tokens (`__COMMIT_HASH__`, `__COMMIT_MSG__`, `__COMMIT_DATE__`) that are never replaced at deploy time. The runtime guard in `createInitialState()` correctly detects unreplaced tokens and falls back to `N/A`, but no pipeline step exists to perform the substitution.

The fix adds a build-time injection step to the deployment pipeline:

```
┌──────────────────────────────────────────────────────────────────┐
│ Pre-Fix Flow (Broken)                                             │
│                                                                    │
│  git push → GitHub Actions → Vercel deploys gameboy.html AS-IS    │
│    (placeholders survive → runtime guard falls back → N/A)        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Post-Fix Flow (Fixed)                                             │
│                                                                    │
│  git push → GitHub Actions → inject-commit-info.sh (NEW)          │
│              ↓                                                    │
│    Replaces __COMMIT_HASH__, __COMMIT_MSG__, __COMMIT_DATE__      │
│    with real git metadata in gameboy.html                         │
│              ↓                                                    │
│    Vercel deploys modified HTML → real values pass guard →        │
│    ABOUT screen shows real commit info                            │
└──────────────────────────────────────────────────────────────────┘
```

### Chosen Approach

**Alternative A — Build-time sed script** (recommended by PRD research)

A shell script `scripts/inject-commit-info.sh` reads `git log -1` metadata and uses `sed` to perform in-place substitution on `public/gameboy.html` before deployment. This keeps the solution:

- **Zero dependencies** — pure bash + sed + git
- **Minimal code** — ~20 lines including error handling
- **CI-agnostic** — works with GitHub Actions, Vercel, Netlify, etc.
- **Simple to test** — can be run manually during development

---

## 2. File Changes

### File 1: `scripts/inject-commit-info.sh` (NEW)

A build-time script that:
1. Reads commit hash, message, and date via `git log -1`
2. Escapes the commit message using Node.js JSON serialization (if Node.js available) for safe sed replacement
3. Replaces `__COMMIT_HASH__`, `__COMMIT_MSG__`, `__COMMIT_DATE__` tokens in `public/gameboy.html`
4. Falls back gracefully on failure (leaves placeholders → runtime guard shows N/A)

```bash
#!/bin/bash
# inject-commit-info.sh — Replace placeholder tokens in gameboy.html
# with real git commit metadata before deployment.
#
# Usage: bash scripts/inject-commit-info.sh
# Must be run from the repo root (where .git/ exists).

set -euo pipefail

HTML_FILE="public/gameboy.html"

# Read git metadata; fail gracefully → placeholders survive → N/A at runtime
HASH=$(git log -1 --format="%h" 2>/dev/null || echo "unknown")
MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")
DATE=$(git log -1 --format="%ai" 2>/dev/null || echo "unknown")

# JSON-escape the commit message using Node.js (safe for sed)
if command -v node &>/dev/null; then
  ESCAPED_MSG=$(node -e "console.log(JSON.stringify(process.argv[1]).slice(1,-1))" "$MSG")
else
  # Fallback: basic sed-safe escaping
  ESCAPED_MSG=$(echo "$MSG" | sed 's/[\/&]/\\&/g')
fi

# Perform in-place replacements
sed -i "s/__COMMIT_HASH__/$HASH/g" "$HTML_FILE"
sed -i "s/__COMMIT_MSG__/$ESCAPED_MSG/g" "$HTML_FILE"
sed -i "s/__COMMIT_DATE__/$DATE/g" "$HTML_FILE"

echo "[inject-commit-info] Injected: $HASH — $ESCAPED_MSG"
```

### File 2: `vercel.json` (MODIFIED)

Add a `buildCommand` so the injection script runs before Vercel serves the static files:

```json
{
  "buildCommand": "bash scripts/inject-commit-info.sh",
  "outputDirectory": null,
  "framework": null,
  "rewrites": [],
  "redirects": []
}
```

**Why this works:**
- Vercel's deploy process runs `buildCommand` in the project root with full git history available
- The script modifies `public/gameboy.html` in-place
- Vercel then reads the modified file from `public/` and deploys it
- `outputDirectory` remains `null` → Vercel uses its default (`public/`)

### No Changes Required

| File | Reason |
|------|--------|
| `public/gameboy.html` | Placeholder block stays as-is; replacement happens at build time |
| `public/src/engine/core.js` | Runtime guard already correctly detects placeholders vs real values |
| `.github/workflows/deploy.yml` | Vercel action handles `buildCommand` automatically; no workflow change needed |
| Test suite | Existing N/A fallback tests cover both local and CI environments |

---

## 3. Pipeline Integration

### Vercel Deploy Flow

```
git push → GitHub Actions (deploy.yml)
  → Checkout code (full git history via actions/checkout@v6)
  → amondnet/vercel-action with:
      - vercel.json buildCommand → bash scripts/inject-commit-info.sh
        → Reads git metadata, replaces placeholders in gameboy.html
      - Modified HTML uploaded to Vercel
  → Vercel serves gameboy.html with real commit info
```

### Why deploy.yml doesn't need changes

The `amondnet/vercel-action` automatically runs the `buildCommand` defined in `vercel.json` before deploying. The deploy workflow already has all needed pieces:
- `actions/checkout@v6` fetches full git history (including commit info)
- Vercel action reads the project config from `vercel.json`

---

## 4. Boundary Conditions

| # | Condition | Behavior |
|---|-----------|----------|
| 1 | **Local file:// access** | No build step runs → placeholders intact → runtime guard shows N/A ✅ |
| 2 | **No git repo / no git binary** | `git log -1` fails → script falls back to "unknown" → guard shows N/A ✅ |
| 3 | **Shallow clone (CI)** | `git log -1` works on shallow clones — the single commit is the head ✅ |
| 4 | **Special chars in commit msg** | Node.js JSON escaping handles quotes, slashes, backslashes safely ✅ |
| 5 | **Preview deployments (PR branches)** | Checkout fetches branch head → `git log -1` shows correct commit ✅ |
| 6 | **Empty repo (no commits)** | `git log -1` exits non-zero → fallback to "unknown" → N/A ✅ |
| 7 | **Vercel buildCommand failure** | `set -e` → script fails → Vercel deploy fails → not deployed with broken HTML ✅ |
| 8 | **Concurrent deploys** | Each deploy gets its own workspace; no race condition ✅ |

---

## 5. Test Specifications

### 5.1 Unit Tests

#### Test: `inject-commit-info.sh` — replaces placeholders

```
Input: gameboy.html with __COMMIT_HASH__, __COMMIT_MSG__, __COMMIT_DATE__
Steps:
  1. Create temp copy of gameboy.html in /tmp
  2. Run bash scripts/inject-commit-info.sh with modified CWD
  3. Verify __COMMIT_HASH__ is replaced with a 7-char hex string
  4. Verify __COMMIT_MSG__ is replaced with non-empty string
  5. Verify __COMMIT_DATE__ is replaced with ISO 8601 date string
  6. Verify no __xxx__ tokens remain in the file

Implementation: shell test script (tests/test-inject-commit-info.sh)
```

#### Test: `inject-commit-info.sh` — fallback on no git repo

```
Input: gameboy.html with placeholder tokens
Setup: Run script outside a git repo (or in temp dir without .git/)
Steps:
  1. cd /tmp/no-git-dir
  2. Create gameboy.html with tokens
  3. Run inject-commit-info.sh
  4. Verify tokens are replaced with "unknown" strings
  5. Verify script exits with code 0 (no crash)

Implementation: shell test with mktemp
```

#### Test: `inject-commit-info.sh` — commit msg with special chars

```
Input: A git commit with message containing quotes ("), slashes (/),
       backticks (`), and ampersands (&)
Steps:
  1. Create a temp git repo
  2. Commit with message: "feat: fix "quotes" & special/chars `test`"
  3. Run inject-commit-info.sh
  4. Verify __COMMIT_MSG__ is replaced with the exact escaped message
  5. Verify sed did not break (file is valid HTML)

Implementation: shell test in temp git repo
```

### 5.2 Integration / E2E Tests

#### Test: `gameboy.html` — placeholders survive after script

```
Input: Run inject-commit-info.sh on current gameboy.html
Steps:
  1. Run bash scripts/inject-commit-info.sh
  2. Check public/gameboy.html
  3. Open public/gameboy.html in browser
  4. Verify window.__COMMIT_INFO has non-placeholder values
  5. Verify ABOUT screen shows real commit info
  6. git checkout -- public/gameboy.html (restore placeholders)

Implementation: manual or headless browser test
```

#### Test: `createInitialState()` — real values pass guard

```
Input: window.__COMMIT_INFO with real values (simulated in test env)
Steps:
  1. Set window.__COMMIT_INFO = { hash: "abc1234", message: "feat: x", date: "2026-07-09" }
  2. Call createInitialState(world)
  3. Verify state.commitInfo.hash === "abc1234"
  4. Verify state.commitInfo.message === "feat: x"

Implementation: existing test suite in metroidvania-snake.test.js
```

### 5.3 Existing Test Coverage (No Changes Needed)

The test suite in `tests/metroidvania-snake.test.js` already covers:

```js
// Test: commitInfo fallback when window.__COMMIT_INFO is missing or has placeholders
it('commitInfo fallback when window.__COMMIT_INFO missing', () => {
  const world = generateWorldMap(5, 5);
  const state = createInitialState(world);
  expect(state.commitInfo.hash).toBe('N/A');
  expect(state.commitInfo.message).toBe('N/A');
  expect(state.commitInfo.date).toBe('N/A');
});
```

This test validates that the N/A fallback works correctly. After the fix, this test **must still pass** — the only difference is that in deployed environments, the placeholders will already be replaced by real metadata.

---

## 6. Rollback Plan

If the build script causes deployment failures:

1. **Immediate:** Set `"buildCommand": null` in `vercel.json` to disable the script
2. **Restore:** `git checkout master -- public/gameboy.html scripts/` to reset modified files
3. **Debug:** Check Vercel deploy logs for build command output
4. **Fix:** Patch the script and re-deploy
