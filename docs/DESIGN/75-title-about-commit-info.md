# Design: #75 — Title About Screen Commit Info Shows N/A

> Parent Issue: #75
> Agent: subagent
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

## 2. Detailed Design

### 2.1 File 1: `scripts/inject-commit-info.sh` (NEW)

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

### 2.2 File 2: `vercel.json` (MODIFIED)

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

### 2.3 No Changes Required

| File | Reason |
|------|--------|
| `public/gameboy.html` | Placeholder block stays as-is; replacement happens at build time |
| `public/src/engine/core.js` | Runtime guard already correctly detects placeholders vs real values |
| `.github/workflows/deploy.yml` | Vercel action handles `buildCommand` automatically; no workflow change needed |
| Test suite | Existing N/A fallback tests cover both local and CI environments |

### 2.4 Pipeline Integration

#### Vercel Deploy Flow

```
git push → GitHub Actions (deploy.yml)
  → Checkout code (full git history via actions/checkout@v6)
  → amondnet/vercel-action with:
      - vercel.json buildCommand → bash scripts/inject-commit-info.sh
        → Reads git metadata, replaces placeholders in gameboy.html
      - Modified HTML uploaded to Vercel
  → Vercel serves gameboy.html with real commit info
```

### 2.5 Boundary Conditions

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

### 2.6 Rollback Plan

If the build script causes deployment failures:

1. **Immediate:** Set `"buildCommand": null` in `vercel.json` to disable the script
2. **Restore:** `git checkout master -- public/gameboy.html scripts/` to reset modified files
3. **Debug:** Check Vercel deploy logs for build command output
4. **Fix:** Patch the script and re-deploy

---

## 3. Files Changed

| File | Change Description | Est. Lines |
|------|--------------------|------------|
| `scripts/inject-commit-info.sh` | NEW: build-time shell script for git metadata injection | ~20 |
| `vercel.json` | Add `"buildCommand": "bash scripts/inject-commit-info.sh"` | +1 |

---

## 4. Verification Checklist

- [ ] Script: replaces `__COMMIT_HASH__` with a 7-char hex string
- [ ] Script: replaces `__COMMIT_MSG__` with non-empty string
- [ ] Script: replaces `__COMMIT_DATE__` with ISO 8601 date string
- [ ] Script: no `__xxx__` tokens remain in the file after replacement
- [ ] Script fallback: outside git repo → tokens replaced with "unknown", exit code 0
- [ ] Script: commit msg with special chars ("`, /, &) — file is valid HTML after replacement
- [ ] Integration: after running script, `window.__COMMIT_INFO` has non-placeholder values
- [ ] Integration: ABOUT screen shows real commit info (manual browser check)
- [ ] Integration: `createInitialState()` with real values — `state.commitInfo.hash === "abc1234"` etc.
- [ ] Regression: existing N/A fallback tests still pass with `window.__COMMIT_INFO` missing
- [ ] `vercel.json` buildCommand correctly triggers script during deploy
- [ ] Rollback: set `"buildCommand": null` disables the script without side effects
