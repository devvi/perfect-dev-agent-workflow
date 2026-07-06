# Design: Fix GameBoy 404 on Vercel Deployment

> Parent Issue: #11
> Agent: plan-agent
> Date: 2026-07-06
> Stage: Plan (after research PR #12 merged)

---

## 1. Root Cause Analysis

### The Bug

When `gameboy.html` is served from a Vercel deployment, the browser reports:

```
GET https://perfect-dev-agent-workflow.vercel.app/src/gameboy-snake-engine.js
net::ERR_ABORTED 404 (Not Found)
```

The game canvas renders the LCD background and grid, but the engine module (`createInitialState`, `tick`, etc.) is never loaded. The game is completely non-functional.

### Why It Happens

**Vercel deployment model:** By default, Vercel serves the `public/` directory as the web root. Any file outside `public/` (including the project root `src/` directory) is **not deployed** and therefore cannot be accessed via HTTP.

**Current import path:** Line 297 of `public/gameboy.html`:
```js
import { ... } from '../src/gameboy-snake-engine.js';
```
This resolves to `https://.../src/gameboy-snake-engine.js`, which does not exist on the Vercel deployment because `src/` is at the project root, outside `public/`.

**Local development contrast:** When opened via a local HTTP server serving the project root, `../src/` resolves to the correct path because `src/` exists on the filesystem. This is why the bug only manifests in deployment.

### Why This Wasn't Caught

The original design doc (`docs/DESIGN/5-gameboy-snake-game.md`) correctly separated the engine into `src/` for testability, but did not account for the Vercel deployment constraint. The `vercel.json` has no build configuration, rewrites, or redirects to bridge this gap.

### Current Vercel Config (`vercel.json`)
```json
{
  "buildCommand": null,
  "outputDirectory": null,
  "framework": null,
  "rewrites": [],
  "redirects": []
}
```
This is a zero-build, zero-config deployment — everything must live under `public/`.

---

## 2. Fix Options and Tradeoffs

### Option A: Move engine into `public/src/` ✅ **Selected**

**Description:** Relocate `src/gameboy-snake-engine.js` → `public/src/gameboy-snake-engine.js`. Update the import path in `gameboy.html` from `'../src/...'` to `'./src/...'`.

**File structure after:**
```
perfect-dev-agent-workflow/
├── public/
│   ├── gameboy.html
│   └── src/
│       └── gameboy-snake-engine.js    ← moved here
├── src/                               ← can be deleted or kept empty
├── tests/
│   └── gameboy-snake.test.js          ← import path updated
└── vercel.json                        ← unchanged
```

**Pros:**
- Minimal change: 1 file move, 1 import path update, 1 test import update
- Works immediately on Vercel — `public/` is web root, so `/src/gameboy-snake-engine.js` is served
- No Vercel config changes needed
- Preserves ES module architecture (no bundler, no build step)
- Preserves testability — Vitest can still import from the file
- Local development: works with any static HTTP server serving `public/`

**Cons:**
- File not at the typical `src/` project root — minor convention shift
- Test import path changes from `'../src/...'` to `'../public/src/...'`
- Original `src/` directory becomes empty (can clean up)

**Risk:** Very low — purely a path change
**Effort:** ~10 minutes

### Option B: Vercel Rewrites (Source Route)

**Description:** Add rewrites in `vercel.json` to serve files from project root `src/` as if they were under `public/src/`.

**Pros:**
- No file structure changes
- Clean separation of concerns maintained

**Cons:**
- **Vercel does not permit `../` in rewrite destinations** — rewrites can only map within the deployed directory (`public/`)
- Requires a custom build step to copy `src/` → `public/src/`, defeating the zero-build approach
- Adds platform-specific config that may break on other hosts

**Risk:** High — Vercel path resolution constraint makes this infeasible without a build pipeline
**Effort:** Unknown — would require a full build/copy step

### Option C: Inline Engine into HTML

**Description:** Copy all engine code directly into a `<script>` block in `gameboy.html`, removing the import entirely.

**Pros:**
- Zero file-serving issues — everything is one file
- Fastest possible load (one HTTP request instead of two)

**Cons:**
- **Breaks testability** — Vitest cannot access inline script code. This undoes the core decision from issue #5
- Violates separation of concerns
- Larger HTML file, harder to maintain
- Duplicates logic (tests reference the engine file that no longer exists)

**Risk:** Medium — introduces architectural regression
**Effort:** ~20 minutes

### Option D: Copy via Build Script

**Description:** Add a small build script that copies `src/gameboy-snake-engine.js` → `public/src/gameboy-snake-engine.js` at deploy time.

**Pros:**
- Source stays in project root `src/`

**Cons:**
- Introduces a build step where none existed
- Requires `vercel.json` `buildCommand` configuration
- Extra complexity for a single-file copy
- Tests still need to import from `src/` or `public/src/`

**Risk:** Low-medium — adds build overhead for marginal benefit
**Effort:** ~30 minutes

---

## 3. Architecture Decision

### Decision: Option A — Move engine into `public/src/`

**Rationale:**
1. **Simplicity wins.** One file move, two import path updates. No config changes, no build step, no architectural regression.
2. **Zero risk.** This is the only approach with no failure mode — the file is simply served from where Vercel expects it.
3. **Preserves architecture.** ES modules, no bundler, test isolation — all intact.
4. **Confirmed viable.** The research PR's spike verified that a static HTTP server serving `public/` correctly resolves `./src/gameboy-snake-engine.js`.

### Why NOT the others
- **Option B** is technically infeasible (Vercel constraint).
- **Option C** breaks the testability architecture (issue #5).
- **Option D** adds unwarranted complexity for a single file.

### Diagrams

**Before (broken import path):**
```
Browser ──GET /gameboy.html──→ Vercel ──serves public/gameboy.html──→ OK
         ──GET ../src/engine.js──→       ──src/ not deployed──→ 404 ❌
```

**After (fixed import path):**
```
Browser ──GET /gameboy.html──→ Vercel ──serves public/gameboy.html──→ OK
         ──GET ./src/engine.js──→       ──serves public/src/engine.js──→ 200 ✅
```

---

## 4. Implementation Plan

### Phase 1: File Restructure

| Step | File | Action |
|------|------|--------|
| 1.1 | `src/gameboy-snake-engine.js` | Move to `public/src/gameboy-snake-engine.js` |
| 1.2 | `public/gameboy.html` (line 297) | Change import to `'./src/gameboy-snake-engine.js'` |
| 1.3 | `tests/gameboy-snake.test.js` (line 15) | Change import to `'../public/src/gameboy-snake-engine.js'` |

### Phase 2: Verification

| Check | Method |
|-------|--------|
| Tests pass | `npm test` (vitest) |
| Local static serve | `npx serve public/` → open `/gameboy.html`, no 404 |
| Vercel deploy preview | Push to branch, verify preview URL |
| No regression | Check `about.html` still loads |

### Phase 3: Documentation

- Update `docs/DESIGN/5-gameboy-snake-game.md` to note `public/src/` path
- Clean up empty `src/` directory (optional)

---

## 5. Test Strategy

### Unit Tests (Vitest, existing file `tests/gameboy-snake.test.js`)
- All 25+ existing tests must pass after import path update
- These test pure game logic (state management, collision detection, scoring, win condition)
- No DOM/Canvas dependencies — runnable in Node.js

### Deployment Verification Tests (new file `tests/gameboy-vercel.test.js`)
- **File existence test:** Verify `public/src/gameboy-snake-engine.js` exists and matches expected exports
- **Import resolution test:** Import from the new path and verify all exports match the original API
- **Import path format test:** Verify the HTML file's import path is relative (`./src/...`), not absolute or `../src/...`
- **Vercel config test:** Verify `vercel.json` doesn't need changes (no build step, default framework)

### E2E Test (`tests/play-test.mjs`, Playwright)
- Verify: browser opens gameboy.html → no 404 console errors → game renders

### Manual Verification
1. `npx serve public/` → open browser → DevTools Console → no 404
2. Vercel preview deployment → same check

---

## 6. Acceptance Criteria

| Criteria | How to Verify |
|----------|---------------|
| `GET /src/gameboy-snake-engine.js` returns HTTP 200 (not 404) | Browser DevTools Network tab on deployed URL |
| All game engine tests pass | `npm test` exits with code 0 |
| Import path is relative to HTML file | `public/gameboy.html` uses `'./src/...'` not `'../src/...'` |
| No changes to `vercel.json` | Config file unchanged |
| Local development still works | `npx serve public/` → game loads correctly |

---

## 7. Rollback Plan

If the fix breaks something unexpected:
1. Revert the file move: `git mv public/src/gameboy-snake-engine.js src/gameboy-snake-engine.js`
2. Revert import paths in `gameboy.html` and test files
3. Revert any `src/` directory changes
4. Deploy the revert

No database, API, or state changes are involved — this is purely a file structure and path change.
