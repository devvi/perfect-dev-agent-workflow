# Design: #82 — About Menu Commit Info Shows "unknown" on Deployed Build

> Parent Issue: #82
> Agent: subagent
> Date: 2026-07-09

---

## 1. Architecture Overview

The fix for #75 added `scripts/inject-commit-info.sh` which uses `git log -1` to read commit metadata. This works in GitHub Actions (where `.git/` exists) but **fails in Vercel's build environment**, which does not provide `.git/`. The `git log -1` command exits non-zero, and the `||` fallback replaces all placeholder tokens with the string `"unknown"`.

The fix modifies the inject script to use Vercel's system-provided environment variables as the primary data source, falling back to `git log -1` for local development.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Current Flow (Broken)                                                │
│                                                                      │
│  Vercel Build Environment (no .git/)                                 │
│  → scripts/inject-commit-info.sh runs                                │
│  → git log -1 fails → fallback "unknown" injected                   │
│  → gameboy.html has "unknown" for all commit fields                  │
│  → Runtime guard passes ("unknown" ≠ "__...")                       │
│  → ABOUT screen shows "unknown"                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Post-Fix Flow (Fixed)                                                │
│                                                                      │
│  Vercel Build → scr reads VERCEL_GIT_COMMIT_SHA env var              │
│  → Present? → Use real SHA (first 7 chars) for commit hash           │
│  → VERCEL_GIT_COMMIT_MESSAGE available? → Use real message           │
│  → Fallback: git log -1 (local dev with .git/)                       │
│  → Double fallback: skip replacement → runtime guard shows "N/A"    │
│                                                                      │
│  Local Dev (with .git/)                                              │
│  → No VERCEL_GIT_* vars → fallback to git log -1 → real values      │
│                                                                      │
│  Local Dev (no .git/, no env vars)                                   │
│  → Both unavailable → skip replacement → runtime guard "N/A" ✅     │
└─────────────────────────────────────────────────────────────────────┘
```

### Chosen Approach

**Approach A — Vercel System Environment Variables** (recommended by PRD research)

Modify `scripts/inject-commit-info.sh` to check for `VERCEL_GIT_COMMIT_SHA` first. When available (Vercel build environment), use it instead of `git log -1`. When unavailable, fall back to `git log -1` (local dev). This keeps the solution:

- **Vercel-native** — uses officially documented system env vars
- **Backward-compatible** — local dev behavior unchanged
- **Safe fallback** — if both env vars and git fail, placeholders survive → runtime guard shows `N/A`
- **No infra changes** — `vercel.json`, `deploy.yml` unchanged

---

## 2. Detailed Design

### 2.1 File 1: `scripts/inject-commit-info.sh` (MODIFIED)

Add environment variable detection at the top, before attempting `git log -1`:

```bash
#!/bin/bash
# inject-commit-info.sh — Replace placeholder tokens in gameboy.html
# with real git commit metadata before deployment.
#
# Supports two data sources:
#   1. Vercel system environment vars (VERCEL_GIT_COMMIT_SHA, VERICEL_GIT_COMMIT_MESSAGE)
#      → Used when available (Vercel build environment, no .git/ available)
#   2. git log -1
#      → Fallback for local development (repo root, .git/ available)
#
# If neither source is available, the script skips replacement entirely.
# Placeholder tokens survive → runtime guard catches them → ABOUT shows "N/A".

set -euo pipefail

HTML_FILE="public/gameboy.html"
SCRIPT_NAME="inject-commit-info"

# ── Resolve commit metadata ──────────────────────────────────────────

# Source 1: Vercel system environment variables (preferred)
# Vercel provides these during build; see https://vercel.com/docs/projects/environment-variables/system-environment-variables
if [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
  HASH="${VERCEL_GIT_COMMIT_SHA:0:7}"  # first 7 chars = abbreviated hash
  MSG="${VERCEL_GIT_COMMIT_MESSAGE:-unknown}"
  # Derive date from the commit message context — Vercel doesn't expose a date var
  # We still try git log for the date; if it fails, use "unknown"
  DATE=$(git log -1 --format="%ai" 2>/dev/null || echo "unknown")

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

# sed-safe string escaping (delimiter = @)
sed_escape() {
  printf '%s\n' "$1" | sed 's/[@\]/\\&/g; s/&/\\&/g'
}

# JSON-escape the commit message using Node.js for quotes/backticks etc.
if command -v node &>/dev/null; then
  ESCAPED_MSG=$(node -e "console.log(JSON.stringify(process.argv[1]).slice(1,-1))" "$MSG")
else
  ESCAPED_MSG="$MSG"
fi

# Ensure sed-safe
HASH_S=$(sed_escape "$HASH")
MSG_S=$(sed_escape "$ESCAPED_MSG")
DATE_S=$(sed_escape "$DATE")

# Perform in-place replacements with @ delimiter
sed -i "s@__COMMIT_HASH__@${HASH_S}@g" "$HTML_FILE"
sed -i "s@__COMMIT_MSG__@${MSG_S}@g" "$HTML_FILE"
sed -i "s@__COMMIT_DATE__@${DATE_S}@g" "$HTML_FILE"

echo "[${SCRIPT_NAME}] Injected: $HASH — $ESCAPED_MSG"
```

### 2.2 No Changes Required

| File | Reason |
|------|--------|
| `vercel.json` | `buildCommand` already configured and stays the same |
| `public/gameboy.html` | Placeholder block unchanged |
| `public/src/engine/core.js` | Runtime guard already correct |
| `.github/workflows/deploy.yml` | No workflow change needed |
| Existing tests | Same test suite covers all paths |

### 2.3 Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Env var source | Vercel system env vars (`VERCEL_GIT_COMMIT_*`) | Officially documented, always available during Vercel build |
| Date derivation | `git log -1` fallback (date not in Vercel env) | Vercel doesn't expose commit date as env var; git log works if `.git/` happens to exist; `"unknown"` fallback otherwise |
| SHA truncation | `${VAR:0:7}` bash substring | Consistent with previous fix's 7-char abbreviated format |
| Failure behavior | `exit 0` (skip + keep placeholders) | Safe: runtime guard shows `N/A` instead of broken deployment |
| `set -euo pipefail` | Kept | Script exits early on critical failures, preventing deployment of broken HTML |

### 2.4 Data Flow

```
Vercel Build (buildCommand runs)
  ↓
inject-commit-info.sh
  ↓
VERCEL_GIT_COMMIT_SHA set? ──No──→ git log -1 works? ──No──→ exit 0 (placeholders → N/A)
  ↓ Yes                           ↓ Yes
Use env var SHA (7 chars)    Use git log metadata
Use env var message           Use git log message
Try git log for date          Use git log date
  ↓                               ↓
Replace __COMMIT_HASH__, __COMMIT_MSG__, __COMMIT_DATE__ in gameboy.html
  ↓
Deploy modified gameboy.html → real values → ABOUT screen shows correct info
```

### 2.5 Boundary Conditions

| # | Condition | Behavior |
|---|-----------|----------|
| 1 | **Vercel deploy (CI)** | Env vars available → real SHA + message → ABOUT shows real values |
| 2 | **Vercel deploy without commit message** | `VERCEL_GIT_COMMIT_MESSAGE` unset → `"unknown"` fallback |
| 3 | **Local dev with git** (no env vars) | Falls back to `git log -1` → real values |
| 4 | **Local dev without git** | Both sources fail → skip → runtime guard shows `N/A` |
| 5 | **Local `file://` access** (no build step) | Placeholders intact → runtime guard shows `N/A` ✅ |
| 6 | **Full 40-char SHA** | `${VAR:0:7}` truncates to 7 chars |
| 7 | **Special chars in commit message** | Node.js JSON escaping handles quotes, backticks, slashes safely |
| 8 | **Empty commit message** | `$MSG` is empty → shows blank in output → acceptable edge case |
| 9 | **Vercel preview deployment (PR)** | Env vars reflect PR branch head commit |
| 10 | **Vercel deploy from UI (no git push)** | `VERCEL_GIT_COMMIT_SHA` still available (Vercel provides it for all git-triggered deploys) |

### 2.6 Rollback Plan

If the modified script causes issues:

1. **Immediate:** Revert `scripts/inject-commit-info.sh` to the #75 version (git log only) — but this would regress to "unknown" on Vercel
2. **Better rollback:** Set `"buildCommand": null` in `vercel.json` to disable the script entirely → placeholders survive → runtime guard shows `N/A` (safe state)
3. **Fix:** Debug env var detection and re-deploy

---

## 3. Files Changed

| File | Change Description | Est. Lines |
|------|--------------------|------------|
| `scripts/inject-commit-info.sh` | MODIFY: Add Vercel env var priority source + `else` skip path | ±15 (net) |

---

## 4. Verification Checklist

- [ ] Vercel system env var detection: when `VERCEL_GIT_COMMIT_SHA` is set, script uses env var SHA (first 7 chars) and message
- [ ] Local dev fallback: without env vars but with `.git/`, script uses `git log -1`
- [ ] Safe skip: without env vars and without `.git/`, script exits 0 without modifying HTML
- [ ] SHA truncated: `${VERCEL_GIT_COMMIT_SHA:0:7}` produces exactly 7-char abbreviated hash
- [ ] Date fallback: date value is `"unknown"` when Vercel env + git date both unavailable
- [ ] No regression: existing `git log -1` behavior unchanged for local development
- [ ] Runtime guard: after script runs, `window.__COMMIT_INFO` contains real values (not `unknown`, not `__xxx__`)
- [ ] ABOUT screen: deployed site shows real commit hash, message, date
