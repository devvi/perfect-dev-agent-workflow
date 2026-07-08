# Tasks: Title Screen — Deploy Commit Hash & Dev Menu

> Parent Issue: #56
> Source: `docs/DESIGN/56-title-dev-menu.md`

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Must-have for MVP — core functionality |
| **P1** | Nice-to-have — polish, edge cases, secondary surfaces |

---

## Phase 1: Build-Time Injection (CI/CD)

**Goal:** Embed git commit metadata into `gameboy.html` during deploy, so the runtime can read it without network calls.

**Depends on:** Nothing (CI/CD infrastructure already exists)

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 1.1 | `public/gameboy.html` | Add inline `<script>` block with `window.__COMMIT_INFO` object containing four placeholders (`__COMMIT_HASH__`, `__COMMIT_MSG__`, `__COMMIT_AUTHOR__`, `__COMMIT_DATE__`) | P0 | +6 |
| 1.2 | `.github/workflows/deploy.yml` | Add new step "Inject commit metadata" after `actions/checkout@v6` and before Vercel deploy. Use `git rev-parse --short HEAD`, `git log -1 --pretty=%s`, etc. with `sed -i` to replace placeholders in `public/gameboy.html` | P0 | +20 |

### Step Details

**1.1 — Add metadata script block (gameboy.html):**
- Insert before the `<script type="importmap">` block
- Define `window.__COMMIT_INFO` with all four placeholder strings
- This is the single source of truth for commit metadata

**1.2 — Add injection step (deploy.yml):**
- New step between checkout and Vercel deploy
- Extract: `GIT_HASH`, `GIT_MSG`, `GIT_AUTHOR`, `GIT_DATE` from `git log`
- Run four `sed -i` commands to replace each placeholder
- If any `sed` fails, log warning but continue deploy (game still works with fallback)
- Handle special characters in commit messages by using non-slash delimiter or base64 encoding

---

## Phase 2: Game State & Input Handling

**Goal:** Add `devMenuOpen` state field, wire up Backquote key to toggle the dev menu on the title screen.

**Depends on:** Phase 1 (metadata block must exist in HTML for `window.__COMMIT_INFO` to be read at runtime)

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 2.1 | `public/src/engine/core.js` | Add `devMenuOpen: false` to `createInitialState()` return object. Add `commitInfo: null` field | P0 | +2 |
| 2.2 | `public/src/engine/core.js` | In `createInitialState()`, read `window.__COMMIT_INFO` and assign to `state.commitInfo` | P0 | +3 |
| 2.3 | `public/gameboy.html` (keydown listener) | Add Backquote handler at the top of the `state.gameState === 'title'` block: toggle `state.devMenuOpen`, call `render(ctx, state)`, `preventDefault`, return early | P0 | +12 |
| 2.4 | `public/gameboy.html` (keydown listener) | In title screen Enter/Arrow handler, close `state.devMenuOpen` before starting game | P0 | +2 |
| 2.5 | `public/gameboy.html` (keydown listener) | Add Escape handler that closes dev menu if open (works regardless of gameState — only if `state.devMenuOpen === true`) | P0 | +5 |
| 2.6 | `public/gameboy.html` (keydown listener) | Guard Backquote handler so it only toggles on title screen; silently ignore in other game states | P1 | +2 |

### Step Details

**2.1-2.2 — State initialization:**
- `commitInfo` is a reference, not a copy — read-only access to the injected object
- If `window.__COMMIT_INFO` is undefined/null, set `commitInfo` to a fallback object: `{ hash: 'local', message: 'Local development build', author: 'N/A', date: 'N/A' }`

**2.3-2.6 — Input handling:**
- The Backquote handler must return early (`return;`) to prevent the Enter/Arrow handlers from also firing
- Use `e.code === 'Backquote'` for the key check (works across keyboard layouts)
- When toggling dev menu, immediately render so the user sees feedback

---

## Phase 3: Rendering — Title Screen Hash & Dev Menu Overlay

**Goal:** Render the commit hash on the title screen and draw the dev menu overlay when toggled.

**Depends on:** Phase 2 (state must have devMenuOpen and commitInfo)

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 3.1 | `public/src/render/overlays.js` | In `renderTitleScreen()`, add call to `renderCommitHash(ctx, state)` at the end | P0 | +2 |
| 3.2 | `public/src/render/overlays.js` | Add new function `renderCommitHash(ctx, state)` — draws commit hash at bottom-right corner with semi-transparent styling | P0 | +15 |
| 3.3 | `public/src/render/overlays.js` | Add new function `renderDevMenu(ctx, state)` — draws the full dev menu overlay with all commit fields, panel border, close hint | P0 | +45 |
| 3.4 | `public/src/render/overlays.js` | In `renderOverlay()`, add check: if `state.devMenuOpen === true`, call `renderDevMenu(ctx, state)` | P0 | +3 |
| 3.5 | `public/src/render/overlays.js` | Add subtle "backtick for dev" hint text on title screen (bottom-left) | P1 | +3 |

### Step Details

**3.2 — renderCommitHash():**
- Read `state.commitInfo.hash`
- Determine display value: if hash starts with `__` or is falsy → `'local'`, else use hash as-is
- Font: 9px monospace, color: `rgba(255, 255, 255, 0.3)`, align: `right`
- Position: `x = CANVAS_SIZE - 10`, `y = CANVAS_SIZE - 10`
- Text: `@ <hash>` (e.g., `@ abc1234`)

**3.3 — renderDevMenu():**
- Draw a semi-transparent dark overlay (`rgba(10, 10, 26, 0.85)`) over the full canvas
- Draw a centered panel (light border, dark fill)
- Title: "DEV MENU" in gold (`PALETTE.GOLD`), centered
- Fields: left-aligned, colon-aligned (e.g., `Commit   : abc1234`)
- Handle long message wrapping: split at ~55 chars per line, render subsequent lines below
- Close hint: small text at bottom "Press ` or ESC to close"

**3.4 — renderOverlay dispatch:**
- The check `state.devMenuOpen === true` should be evaluated first, before the standard `gameState` checks
- Because dev menu can only open on title screen, this check won't conflict with other overlays
- But if the user wants dev menu on top of other overlays in the future, this precedence may change

**3.5 — Hint text (P1):**
- Small text: `` ` `` for dev menu
- Bottom-left corner, even smaller font, very faint
- Helps discoverability during testing

---

## Phase 4: Fallback & Edge Cases (Polish)

**Goal:** Handle all edge cases: missing metadata, corrupted placeholders, long messages, mobile.

**Depends on:** Phase 2, Phase 3

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 4.1 | `public/src/engine/core.js` | Add fallback logic in `createInitialState()`: if `window.__COMMIT_INFO` missing, use hardcoded fallback object | P0 | +5 |
| 4.2 | `public/src/render/overlays.js` | In `renderDevMenu()`, handle empty/long messages: truncate or wrap | P1 | +10 |
| 4.3 | `public/src/render/overlays.js` | In `renderDevMenu()`, handle missing fields gracefully: display "N/A" | P1 | +5 |

### Step Details

**4.1 — Fallback object:**
```js
const fallback = {
  hash: 'local',
  message: 'Local development build',
  author: 'N/A',
  date: 'N/A'
};
state.commitInfo = (window.__COMMIT_INFO && window.__COMMIT_INFO.hash)
  ? window.__COMMIT_INFO
  : fallback;
```

**4.2 — Message wrapping:**
- After extracting `state.commitInfo.message`, check `.length`
- If > 55 chars, split into multiple lines at word boundaries
- Render each line at `y + (lineIndex * 20)`
- Maximum 4 lines (guard against extremely long messages like merge commits)

---

## Phase 5: Secondary Surface — index.html (Optional)

**Goal:** Show the commit hash on the landing page for consistency and quick visual confirmation before the game loads.

**Depends on:** Phase 1 (metadata injection)

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 5.1 | `index.html` | Add inline script block with `window.__COMMIT_INFO` (same placeholder structure as gameboy.html) | P1 | +6 |
| 5.2 | `.github/workflows/deploy.yml` | Include `index.html` in the sed replacement commands (replace in both files) | P1 | +1 |
| 5.3 | `index.html` | Display the commit hash as a small footer text (e.g., `Build: abc1234`) | P1 | +3 |

---

## File Change Summary (All Phases)

| File | Total Lines Changed | Phases | Risk |
|------|--------------------|--------|------|
| `.github/workflows/deploy.yml` | ~21 | 1, 5 | 🟢 Low — new step, no structural changes |
| `public/gameboy.html` | ~20 | 1, 2 | 🟢 Low — script block + keydown handler |
| `public/src/engine/core.js` | ~10 | 2, 4 | 🟢 Low — two new fields + fallback logic |
| `public/src/render/overlays.js` | ~68 | 3, 4 | 🟡 Medium — canvas rendering logic, coordinate math |
| `index.html` | ~10 | 5 | 🟢 Low (P1 — optional) |

**Total:** ~129 lines across 5 files (93 P0 + 36 P1)

---

## Dependency Graph

```
Phase 1 (CI/CD injection)
    │
    ▼
Phase 2 (game state + input)
    │
    ▼
Phase 3 (rendering)
    │
    ▼
Phase 4 (fallback + edge cases)
    │
    ▼
Phase 5 (index.html — optional)
```

- **Phases 1-4 are sequential:** each builds on the previous
- **Phase 5 is optional:** can be done independently or skipped
- **Phase 2 and Phase 3 can be developed in parallel** if the metadata object shape is agreed upon first (share the interface contract)

---

## Testing Tasks

| # | Test Group | File | Priority |
|---|-----------|------|----------|
| T1 | Fallback behavior (A1-A3) | `tests/metroidvania-snake.test.js` | P0 |
| T2 | State management (B1-B7) | `tests/metroidvania-snake.test.js` | P0 |
| T3 | Input handling (C1-C4) | `tests/metroidvania-snake.test.js` | P0 |
| T4 | Title screen hash rendering (D1-D4) | `tests/metroidvania-snake.test.js` | P1 |
| T5 | Dev menu content (E1-E4) | `tests/metroidvania-snake.test.js` | P1 |
| T6 | Build injection testing (F1-F5) | (manual / CI test) | P1 |
| T7 | Play-test full flow | `tests/play-test.mjs` or manual | P0 |

*Testing is a separate implementation task, not part of the plan. The test scenarios are fully specified in `docs/DESIGN/56-title-dev-menu.md` section 4.*
