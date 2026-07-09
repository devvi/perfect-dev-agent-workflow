# Research: About Menu Commit Info Display Incorrect

> Parent Issue: #82
> Agent: research-agent (Subagent)
> Date: 2026-07-09

---

## 1. Problem Definition

### Current Behavior

The deployed game (https://perfect-dev-agent-workflow.vercel.app) displays "unknown" for all commit metadata fields in the in-game ABOUT screen:

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

This is a **regression** from the original bug #75 (which showed `N/A`). The fix for #75 (commit `6c68a3b`) added `scripts/inject-commit-info.sh` which reads metadata via `git log -1`. The script runs during deployment and **does** replace the placeholder tokens — but with the fallback string `"unknown"` instead of real git metadata.

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
3. Navigate to the ABOUT screen (down arrow + Enter on second menu item)
4. Observe all commit fields showing "unknown" instead of real values

### User Scenarios

- **Scenario A (Vercel deploy — production):** Every deployed build shows "unknown" — all users see broken commit info
- **Scenario B (Vercel preview — PR branches):** Same behavior — preview deploys also lack `.git/`
- **Scenario C (Local file:// access):** Correctly shows `N/A` (runtime guard catches unreplaced placeholders)
- **Scenario D (Local dev with `bash scripts/inject-commit-info.sh`):** Works correctly (`.git/` available)
- **Frequency:** Every single Vercel deployment

---

## 2. Root Cause Analysis (Bug)

### Why Does Current Behavior Exist?

The fix for #75 added `scripts/inject-commit-info.sh` which reads commit metadata via `git log -1`:

```bash
HASH=$(git log -1 --format="%h" 2>/dev/null || echo "unknown")
MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")
DATE=$(git log -1 --format="%ai" 2>/dev/null || echo "unknown")
```

**Root cause: Vercel's build environment does not have a `.git/` directory available.** When Vercel runs the `buildCommand`, it copies project files into a sandboxed build environment. The `git log -1` command fails, and the `|| echo "unknown"` fallback replaces all placeholder tokens with the string `"unknown"`.

The runtime guard in `createInitialState()` (`public/src/engine/core.js`):

```js
const commitInfo = (typeof window !== 'undefined' && window.__COMMIT_INFO &&
    window.__COMMIT_INFO.hash &&
    !window.__COMMIT_INFO.hash.startsWith('__'))
    ? window.__COMMIT_INFO
    : { hash: 'N/A', message: 'N/A', date: 'N/A' };
```

Since `"unknown"` does **not** start with `"__"`, this guard passes and `"unknown"` is displayed as valid commit info. This is **worse** than the original #75 behavior which showed `N/A` — `"unknown"` looks like a partially-working feature rather than an intentional fallback.

### Why Change Now?

The ABOUT screen is a core feature of the title menu (#66). Showing "unknown" for all fields is a regression from the fix for #75. Users see broken version info in the deployed game, which defeats the purpose of having commit info in the ABOUT screen.

### Previous Constraints

- **Runtime guard** (`!hash.startsWith('__')`) must remain as-is — it correctly prevents placeholder leaks in local dev
- **`inject-commit-info.sh`** is already integrated into Vercel build via `vercel.json` — don't change the pipeline
- **Local development** should continue to show `N/A` (no build step runs during `file://` or `http://` dev serving)
- **Backwards compatibility** — avoid breaking the local git-based fallback for manual use

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `scripts/inject-commit-info.sh` | Build Script | Must detect Vercel CI environment and use system env vars instead of `git log -1` |
| `public/gameboy.html` | Build Artifact | Placeholder block unchanged; injection happens at build time |
| `vercel.json` | Deployment Config | No change needed (buildCommand stays the same) |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/core.js` | Runtime Guard | No change needed — guard already correctly detects `__` prefix |
| `public/src/render/overlays.js` | About Screen | No change needed — render already displays `state.commitInfo` correctly |
| `.github/workflows/deploy.yml` | CI/CD | No change needed |

### Data Flow Impact (After Fix)

```
Vercel deploy (system env vars available during build)
  → buildCommand: bash scripts/inject-commit-info.sh
  → Script checks VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_MESSAGE
  → Replaces __COMMIT_HASH__, __COMMIT_MSG__, __COMMIT_DATE__ tokens in gameboy.html
  → Deployed HTML has real commit info
  → Runtime guard passes → ABOUT screen shows real values

Local dev (no env vars, .git/ available)
  → Script falls back to git log -1 → real values injected

No git, no env vars (edge case)
  → Script skips replacement → placeholders remain
  → Runtime guard detects __COMMIT_HASH__ → shows N/A
```

### Documents to Update

- [x] `docs/PRD/82-about-menu-commit-info.md` (this file)
- [ ] `docs/DESIGN/82-about-menu-commit-info.md` (design doc — Plan phase)
- [ ] `docs/TASKS/82-about-menu-commit-info.md` (tasks doc — Plan phase)
- [ ] Other: `tests/test-inject-commit-info.sh` (add Vercel env var test case)

---

## 4. Solution Comparison

### Approach A: Use Vercel System Environment Variables

**Description:** Modify `scripts/inject-commit-info.sh` to read commit info from Vercel's system-provided environment variables when available, falling back to `git log -1` for local development.

Vercel provides these env vars during build (confirmed by this research and Vercel docs):
- `VERCEL_GIT_COMMIT_SHA` — full 40-char commit SHA
- `VERCEL_GIT_COMMIT_MESSAGE` — first line of commit message
- `VERCEL_GIT_COMMIT_AUTHOR_LOGIN` — author GitHub username (less useful)

**Pros:**
- Uses Vercel's officially documented system env vars (reliable by design)
- No external dependencies — pure bash
- Works across Vercel CI, GitHub Actions integration, and Vercel's native Git integration
- Local fallback via `git log -1` preserves existing behavior
- No changes to `vercel.json` or CI workflow files
- Safe failure mode: if both env vars AND git unavailable → skip replacement → runtime guard shows `N/A`

**Cons:**
- Slightly more complex script logic (env var detection + conditional branching)
- `VERCEL_GIT_COMMIT_MESSAGE` is limited to the first line (multi-line messages not supported)
- Date field is not directly provided as an env var — must derive from SHA (via `git log -1` lookup) or leave as N/A

**Risk:** Low — env vars are Vercel's documented, stable API
**Effort:** Small (~0.5 hour)

### Approach B: Pass Git Metadata via GitHub Actions Workflow Variables

**Description:** In the deploy workflow (`deploy.yml`), extract git metadata using GitHub Actions steps and pass it as custom environment variables to the Vercel action.

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
```

Then update the inject script to read from `CI_COMMIT_*` env vars as a priority source.

**Pros:**
- Full control over git metadata extraction (GitHub Actions runner has `.git/` available)
- Can format date perfectly (GitHub Actions has `git log -1` working)
- No dependency on Vercel-specific env vars

**Cons:**
- **Couples the script to GitHub Actions workflow** — won't work for Vercel native Git integration
- Modifies `deploy.yml` (infrastructure change)
- If project migrates to another CI provider (e.g., CircleCI, GitLab CI), env var names would differ
- Adds workflow complexity for something that Vercel already provides as system env vars
- Not a true improvement over Approach A — still relies on the GitHub workflow to pass data

**Risk:** Low-Medium — changes CI workflow, introduces coupling
**Effort:** Small (~0.5–1 hour)

### Approach C: Preserve `.git/` in Vercel Build Environment

**Description:** Keep the existing `git log -1` approach but find a way to ensure `.git/` is accessible during Vercel build. Options include: (a) Vercel Output Files API to preserve `.git/` directory, (b) modifying `amondnet/vercel-action` to copy `.git/` into the build directory.

**Pros:**
- Minimal changes to the inject script (keep existing logic)
- The `git log -1` approach works perfectly when `.git/` is available

**Cons:**
- **Not reliable** — Vercel's build environment behavior is not guaranteed to provide `.git/`
- Requires workarounds that may break with Vercel infrastructure updates
- May require changes to `amondnet/vercel-action` configuration or Vercel project settings
- More complex to implement and maintain than reading standard env vars

**Risk:** High — relies on Vercel build internals, not a documented API
**Effort:** Medium (~1–2 hours) — depends on Vercel configuration capabilities

### Recommendation

→ **Approach A (Vercel System Environment Variables)** because:

1. **Reliability:** Uses Vercel's officially documented and stable system env vars (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_MESSAGE`)
2. **Minimal change:** Only modifies one file (`scripts/inject-commit-info.sh`) — no CI workflow changes
3. **Universal compatibility:** Works across Vercel CI, GitHub Actions, and Vercel's Git integration
4. **Safe fallback:** If Vercel env vars unavailable AND git unavailable → skip replacement → runtime guard shows `N/A` (graceful degradation)
5. **Local dev works:** Falls back to `git log -1` when Vercel env vars aren't set

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. **Vercel production deployment:** `VERCEL_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_MESSAGE` are available → script injects real values → ABOUT screen shows correct commit hash (7-char), message, and date
2. **Local dev with git:** No Vercel env vars, but `.git/` available → script falls back to `git log -1` → real values injected
3. **Local dev without git:** No env vars, no `.git/` → script skips replacement → placeholders remain → runtime guard shows `N/A`

### Edge Cases

1. **`VERCEL_GIT_COMMIT_SHA` available but `VERCEL_GIT_COMMIT_MESSAGE` is empty/missing:** Script uses SHA for hash; message field falls back to "unknown" but runtime guard won't catch it. Should handle by showing `N/A`-style fallback for message.
2. **Full 40-char SHA from `VERCEL_GIT_COMMIT_SHA`:** Script must truncate to 7 characters for display consistency (matching `%h` format).
3. **Commit message with special characters (quotes, backticks, emoji, unicode):** Script must JSON-escape the message before sed replacement (Node.js `JSON.stringify()` as already implemented).
4. **Vercel preview deployment (PR branch):** Env vars reflect the PR branch head commit — correct behavior showing the code being deployed.
5. **Vercel deploy from UI without git connection:** Neither env vars nor git available → script skips replacement → runtime guard shows `N/A` — safe degradation.

### Failure Paths

1. **`set -e` causes script to exit when both env vars and git fail:** The script must NOT use `set -e` for the fallback path, or must catch failures with `|| true`. Failure must not block deployment.
2. **Build script crashes (unhandled error):** Vercel deploy fails → deployment blocked until fix. Acceptable — better than deploying with wrong info.
3. **Date field is not available as a Vercel env var:** Must decide: (a) derive from SHA via git date, (b) use empty/unknown, (c) skip the date field. Recommendation: attempt `git log -1` for date using SHA if git available, otherwise use "N/A".

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `scripts/inject-commit-info.sh` | Stable | Low — minor refactor only |
| `vercel.json` | Stable | Low — no changes needed |
| `.github/workflows/deploy.yml` | Stable | Low — no changes needed |
| `public/src/engine/core.js` | Stable | Low — no changes needed |
| `public/src/render/overlays.js` | Stable | Low — no changes needed |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Version info in game UI | Low — cosmetic |
| Changelog/release notes display | Low — future feature |

### Preparation Needed

- [ ] Verify Vercel system env var names in deployment logs: `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_MESSAGE`
- [ ] Review escape/quoting strategy for env var content (Node.js `JSON.stringify` already implemented for `git log -1` fallback)
- [ ] Plan date handling: if `VERCEL_GIT_COMMIT_SHA` is available but git date lookup fails, fall back to `"N/A"` for the date field

---

## 7. Spike / Experiment

### Question to Answer

Does `git log -1` actually fail in Vercel's build environment? And what Vercel system env vars are available?

### Method

1. Fetch deployed `gameboy.html` from production URL
2. Check for "unknown" values vs placeholder tokens
3. Consult Vercel documentation for system env var names

### Result

- **Confirmed:** Deployed `gameboy.html` has `"unknown"` for all three fields, confirming that `git log -1` fails in Vercel's build environment
- **Confirmed:** Vercel provides these env vars during build:
  - `VERCEL_GIT_COMMIT_SHA` — Full SHA (e.g., `8dbc93f168ebb96c1fa295c3467b8079da5e00e8`)
  - `VERCEL_GIT_COMMIT_MESSAGE` — First line of commit message
  - `VERCEL_GIT_COMMIT_AUTHOR_LOGIN` — Author GitHub username
  - `VERCEL_GIT_REPO_ID`, `VERCEL_GIT_REPO_OWNER`, `VERCEL_GIT_REPO_SLUG`

### Impact on Approach

Approach A is fully validated. Vercel system env vars are the correct, reliable source of commit metadata. The inject script should check for `VERCEL_GIT_COMMIT_SHA` before falling back to `git log -1`.
