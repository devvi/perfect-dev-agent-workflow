# Research: About Menu Commit Info Display Incorrect

> Parent Issue: #82
> Agent: research-agent (Subagent)
> Date: 2026-07-09

---

## 1. Problem Definition

### Current Behavior

Deployed game (https://perfect-dev-agent-workflow.vercel.app) shows "unknown" for all commit metadata fields in the ABOUT screen:

```
Commit: unknown
Msg:    unknown
Date:   unknown
```

Confirmed by fetching the deployed `gameboy.html`:

```html
<script>
  window.__COMMIT_INFO = {
    hash: "unknown",
    message: "unknown",
    date: "unknown"
  };
</script>
```

This is **different from** the original bug #75, which showed `N/A` (from unreplaced placeholder tokens `__COMMIT_HASH__` etc.). The fix for #75 (commit `6c68a3b`) added a build-time inject script, and it **did** run during deployment — the placeholders were replaced — but with the fallback string `"unknown"` instead of real git metadata.

### Expected Behavior

The ABOUT screen should show the actual git commit info from the deployed build:

| Field | Expected |
|-------|----------|
| Commit | Abbreviated SHA (e.g., `8dbc93f`) |
| Msg   | Commit message summary (truncated to ~55 chars) |
| Date  | Commit timestamp (e.g., `2026-07-09 18:42`) |

### Steps to Reproduce

1. Open deployed game: https://perfect-dev-agent-workflow.vercel.app
2. Press Enter to show title menu
3. Navigate to the ABOUT screen
4. Observe commit fields showing "unknown" instead of real values

### User Scenarios

- **Scenario A (Vercel deploy):** Every deployed build shows "unknown" — all users see broken commit info
- **Scenario B (Local file://):** Correctly shows `N/A` (runtime guard catches unreplaced placeholders or "unknown" does NOT match)
- **Scenario C (Local dev server):** Also shows `N/A`
- **Frequency:** Every time, on every deployed build

---

## 2. Root Cause Analysis

### Why Does Current Behavior Exist?

The fix for #75 (implement/75-title-about-commit-info) added `scripts/inject-commit-info.sh` and configured it via `vercel.json`:
```json
"buildCommand": "bash scripts/inject-commit-info.sh"
```

The inject script reads metadata via `git log -1`:

```bash
HASH=$(git log -1 --format="%h" 2>/dev/null || echo "unknown")
MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")
DATE=$(git log -1 --format="%ai" 2>/dev/null || echo "unknown")
```

**Root cause: Vercel's build environment does not have the `.git/` directory available.** When Vercel runs the `buildCommand`, it deploys from a copy of the project files, not from a full git checkout. The `git log -1` command fails (non-zero exit), and the `||` fallback kicks in, replacing all placeholder tokens with the string `"unknown"`.

The runtime guard in `createInitialState()` (`public/src/engine/core.js:38`) checks:
```js
!window.__COMMIT_INFO.hash.startsWith('__')
```
Since `"unknown"` does **not** start with `"__"`, the guard passes and "unknown" is displayed as valid commit info. This is **worse** than the original #75 behavior (which showed `N/A`) because "unknown" looks like a partially-working feature rather than an intentional fallback.

### Why Change Now?

The ABOUT screen is a core feature of the title menu (#66). Showing "unknown" for all fields is a regression from the fix for #75 — it makes the deployed game's version info completely useless.

### Previous Constraints

- The runtime guard in `createInitialState()` should remain as-is (it correctly prevents placeholder leaks)
- The fix must work in Vercel's build environment where `.git/` may not be available
- Local development should continue to show `N/A` (or real values if git is available locally)

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `scripts/inject-commit-info.sh` | Build Script | Must use Vercel system env vars instead of `git log -1` |
| `public/gameboy.html` | Build Artifact | Placeholder block unchanged; injection happens at build time |
| `vercel.json` | Deployment Config | No change needed (buildCommand stays the same) |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/core.js` | Runtime Guard | No change needed — guard already correct |
| `public/src/render/overlays.js` | About Screen | No change needed — render already correct |
| `.github/workflows/deploy.yml` | CI/CD | No change needed |

### Data Flow Impact (After Fix)

```
vercel deploy (system env vars available)
  → buildCommand: bash scripts/inject-commit-info.sh
  → Script reads VERCEL_GIT_COMMIT_SHA / GIT_COMMIT_SHA etc.
  → Replaces __COMMIT_HASH__, __COMMIT_MSG__, __COMMIT_DATE__ tokens
  → Deployed gameboy.html has real commit info
  → Runtime guard passes → ABOUT screen shows real values
```

### Documents to Update

- [ ] `docs/PRD/82-about-menu-commit-info-prd.md` (this file)
- [ ] `docs/DESIGN/82-about-menu-commit-info.md` (design doc)
- [ ] `docs/TASKS/82-about-menu-commit-info.md` (tasks doc)

---

## 4. Solution Comparison

### Approach A: Use Vercel System Environment Variables (Recommended)

**Description:** Modify `scripts/inject-commit-info.sh` to read commit info from Vercel's system-provided environment variables when available, falling back to `git log -1` for local development.

Vercel provides these env vars during build:
- `VERCEL_GIT_COMMIT_SHA` — full commit SHA
- `VERCEL_GIT_COMMIT_MESSAGE` — commit message (first line)
- `VERCEL_GIT_COMMIT_AUTHOR_LOGIN` — author name (less useful)

The script would prioritize env vars over `git log`:

```bash
# Vercel CI — use system env vars
if [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
  HASH="${VERCEL_GIT_COMMIT_SHA:0:7}"
  MSG="${VERCEL_GIT_COMMIT_MESSAGE:-unknown}"
  DATE=$(date -d "@$(git log -1 --format="%ct" 2>/dev/null || echo 0)" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown")
# Local dev — use git log
elif git log -1 &>/dev/null; then
  HASH=$(git log -1 --format="%h")
  MSG=$(git log -1 --format="%s")
  DATE=$(git log -1 --format="%ai")
# No git available — leave placeholders for runtime safety net
else
  echo "[WARN] No git metadata available — keeping placeholders (runtime fallback → N/A)"
  exit 0
fi
```

**Pros:**
- Uses Vercel's officially documented system env vars
- No external dependencies
- Works in Vercel CI/GitHub Actions/Vercel build environment
- Local fallback preserves existing behavior
- **If env vars unavailable → skip replacement → runtime guard shows `N/A`** (safe fallback)

**Cons:**
- Slightly more complex script logic
- `VERCEL_GIT_COMMIT_MESSAGE` contains only the first line (no multi-line)

**Risk:** Low
**Effort:** Small (~0.5 hour)

### Approach B: Pass Git Metadata via GitHub Actions Workflow

**Description:** In the deploy workflow (`deploy.yml`), use GitHub Actions steps to extract git metadata and pass it as environment variables to the Vercel action.

```yaml
- name: Extract commit info
  id: commit_info
  run: |
    echo "sha=$(git log -1 --format='%h')" >> $GITHUB_OUTPUT
    echo "msg=$(git log -1 --format='%s')" >> $GITHUB_OUTPUT
    echo "date=$(git log -1 --format='%ai')" >> $GITHUB_OUTPUT

- name: Deploy to Vercel
  uses: amondnet/vercel-action@v42
  env:
    CI_COMMIT_SHA: ${{ steps.commit_info.outputs.sha }}
    CI_COMMIT_MSG: ${{ steps.commit_info.outputs.msg }}
    CI_COMMIT_DATE: ${{ steps.commit_info.outputs.date }}
  with: ...
```

Then update the script to read from `CI_COMMIT_*` env vars.

**Pros:**
- Full control over git metadata extraction (in GitHub Actions, `.git/` is available)
- Works regardless of Vercel's build environment setup
- Can format data precisely as needed

**Cons:**
- Couples the script's behavior to GitHub Actions workflow
- More infrastructure changes (modifies deploy.yml)
- If project moves to another CI provider, env var names may differ
- Doesn't work for Vercel's native Git integration (deploy from Vercel UI)

**Risk:** Low
**Effort:** Small (~0.5–1 hour)

### Approach C: Ensure git Availability in Vercel Build

**Description:** Keep the existing `git log -1` approach but ensure `.git/` is available during Vercel build. This could involve checking whether the repo is shallow, or using `actions/checkout@v6` with `fetch-depth: 0` to ensure full git history.

**Pros:**
- Minimal changes to the script
- Standard git approach

**Cons:**
- Vercel's build environment may not always have `.git/` accessible
- Not reliable — behavior depends on Vercel's internal changes
- May require changes in `amondnet/vercel-action` configuration
- Could break again if Vercel changes its build infrastructure

**Risk:** High — relies on Vercel's internal build environment behavior
**Effort:** Unknown (~0.5–2 hours, depends on Vercel)

### Recommendation

→ **Approach A (Vercel System Environment Variables)** because:
1. Uses Vercel's officially supported and documented system env vars
2. Works reliably across Vercel CI, GitHub Actions, and Vercel's native Git integration
3. Safe fallback: if env vars unavailable AND git fails → skip replacement → runtime guard shows `N/A`
4. No changes needed to deploy.yml or any CI workflow
5. Compatible with both `amondnet/vercel-action` and direct Vercel Git integration

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | Condition | Expected |
|---|-----------|----------|
| 1 | **Vercel deployment** (CI) | ABOUT screen shows real commit hash (7-char SHA), message, and date |
| 2 | **Local dev with git** (no Vercel env vars) | Falls back to `git log -1` — shows real values |
| 3 | **Local dev without git** (no env vars, no .git/) | Placeholders not replaced → runtime guard shows `N/A` |
| 4 | **Local file:// access** | Same as above — `N/A` |

### Edge Cases

| # | Condition | Expected Behavior |
|---|-----------|-------------------|
| 1 | **`VERCEL_GIT_COMMIT_SHA` available but not `VERCEL_GIT_COMMIT_MESSAGE`** | Show the SHA; message falls back to "unknown" or commit lookup |
| 2 | **`VERCEL_GIT_COMMIT_SHA` is full 40-char SHA** | Script truncates to first 7 chars |
| 3 | **Commit message with special characters** | Node.js JSON escaping handles quotes, backticks, slashes |
| 4 | **Commit message is empty** (edge case in git) | Show "unknown" as fallback |
| 5 | **Vercel preview deployment** (PR branch) | Shows the PR branch head commit |
| 6 | **Vercel deploy from UI with no git** | Both env vars and git unavailable → placeholders remain → `N/A` |

### Failure Paths

| # | Condition | Expected Behavior |
|---|-----------|-------------------|
| 1 | **No Vercel env vars + `git log -1` fails** | Script exits without replacing → `set -e` may exit non-zero (needs handling) |
| 2 | **Build script crashes** | Vercel deploy fails (with `set -e`) → deployment blocked until fix |
| 3 | **Environment variable has unexpected format** | Pass through to output → might cause display issues but not catastrophic |

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `scripts/inject-commit-info.sh` | Stable | Low — minor refactor |
| `vercel.json` | Stable | Low — unchanged |
| `.github/workflows/deploy.yml` | Stable | Low — unchanged |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Any deployment-visible feature | Low (cosmetic only) |

### Preparation Needed

- [ ] Verify Vercel system env var names: `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_MESSAGE`
- [ ] Review escape/quoting strategy for env var content

---

## 7. Spike / Experiment (Optional)

### Question to Answer

Does Vercel provide `VERCEL_GIT_COMMIT_MESSAGE` (commit message) as a system environment variable during build, or only `VERCEL_GIT_COMMIT_SHA`?

### Method

Deploy a test branch with a script that dumps `env | grep VERCEL_GIT` to an HTML page, then visit the deployed URL.

### Result

Confirmed by Vercel documentation: Vercel provides the following system env vars during build:
- `VERCEL_GIT_COMMIT_SHA` — Full SHA of the commit (e.g., `8dbc93f168ebb96c1fa295c3467b8079da5e00e8`)
- `VERCEL_GIT_COMMIT_MESSAGE` — First line of commit message
- `VERCEL_GIT_COMMIT_AUTHOR_LOGIN` — Author GitHub username
- `VERCEL_GIT_REPO_ID`, `VERCEL_GIT_REPO_OWNER`, `VERCEL_GIT_REPO_SLUG` — Repo metadata

Also confirmed by fetching the deployed `gameboy.html`, which shows "unknown" values, confirming that `git log -1` fails in Vercel's build environment.

### Impact on Approach

Approach A is validated — Vercel's system env vars are the correct solution. The script can read `VERCEL_GIT_COMMIT_SHA` (first 7 chars) and `VERCEL_GIT_COMMIT_MESSAGE` (first line) directly. For the date, we can either use `VERCEL_GIT_COMMIT_SHA` with `git log -1` (if available in modified context) or skip the date field by deriving it from the SHA via a local git lookup (if repo available) or leave as N/A.
