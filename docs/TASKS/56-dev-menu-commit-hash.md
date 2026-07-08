# Task Breakdown: Title Screen Commit Hash & Dev Menu

> Parent Issue: #56
> Source: docs/DESIGN/56-dev-menu-commit-hash.md
> Repository: devvi/perfect-dev-agent-workflow

---

## Overview

Implement commit hash display on the title screen, a dev menu toggle key, and CI/CD injection of commit metadata. The feature uses build-time `sed` replacement for commit info and a canvas-rendered dev menu overlay.

**Key design decisions:**
- Build-time injection via `sed` in `deploy.yml` (no runtime API calls)
- Commit metadata stored in `<meta>` tags and read into game state at init
- Dev menu key: Backquote (`` ` ``) on title screen only
- Canvas-only rendering (no new DOM elements)
- Fallback to `dev` / local values when placeholders are not replaced

---

## Implementation Order

### Phase 1: Engine State — Core (Priority: High)

**File:** `public/src/engine/core.js`

- [ ] **P1-T1: Add `commitInfo` fields to `createInitialState()`**
  - Add `commitInfo` object with `hash`, `msg`, `author`, `date` fields
  - Default values: `hash: 'dev'`, `msg: 'Development build'`, `author: 'local'`, `date: <today>`

- [ ] **P1-T2: Add `devMenuOpen` boolean to `createInitialState()`**
  - Default: `false`

- [ ] **P1-T3: Export `updateCommitInfo(state, info)` helper**
  - Merges partial info into existing `commitInfo` object
  - Returns new state (immutable pattern)

- [ ] **P1-T4: Export `toggleDevMenu(state)` helper**
  - Only toggles when `state.gameState === 'title'`
  - Returns new state or unchanged state if blocked

**Acceptance:** State object includes commit info; helpers are exported and functional.

---

### Phase 2: HTML — Meta Tags & Input Handling (Priority: High)

**File:** `public/gameboy.html`

- [ ] **P2-T1: Add meta tags in `<head>`**
  ```html
  <meta name="commit-hash" content="__COMMIT_HASH__">
  <meta name="commit-msg" content="__COMMIT_MSG__">
  <meta name="commit-author" content="__COMMIT_AUTHOR__">
  <meta name="commit-date" content="__COMMIT_DATE__">
  ```
  Place after `<title>` tag.

- [ ] **P2-T2: Read meta tags into state during `init()`**
  - After `state = createInitialState(world)`:
    ```js
    const hash = document.querySelector('meta[name="commit-hash"]')?.getAttribute('content') || 'dev';
    const msg = document.querySelector('meta[name="commit-msg"]')?.getAttribute('content') || 'Development build';
    const author = document.querySelector('meta[name="commit-author"]')?.getAttribute('content') || 'local';
    const date = document.querySelector('meta[name="commit-date"]')?.getAttribute('content') || new Date().toISOString().split('T')[0];
    if (hash !== '__COMMIT_HASH__') {
      state = updateCommitInfo(state, { hash, msg, author, date });
    }
    ```

- [ ] **P2-T3: Add dev menu keybinding in `keydown` listener**
  - Title screen only (after existing title block):
    ```js
    if (state.gameState === 'title') {
      if (e.code === 'Backquote') {
        e.preventDefault();
        state = toggleDevMenu(state);
        render(ctx, state);
        return;
      }
      if (e.code === 'Escape' && state.devMenuOpen) {
        e.preventDefault();
        state = toggleDevMenu(state);
        render(ctx, state);
        return;
      }
    }
    ```

**Acceptance:** Meta tags present; init reads meta into state; backtick toggles dev menu.

---

### Phase 3: Renderer — Commit Hash & Dev Menu (Priority: High)

**File:** `public/src/render/overlays.js`

- [ ] **P3-T1: Add commit hash to title screen**
  - In `renderTitleScreen()`, after all existing content:
    ```js
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(state.commitInfo.hash, CANVAS_SIZE - 8, CANVAS_SIZE - 8);
    ```

- [ ] **P3-T2: Implement `renderDevMenu(ctx, state)` function**
  - Semi-transparent dark overlay (`rgba(10, 10, 26, 0.9)`)
  - Title: "⚙ DEV MENU" at top center
  - Fields (aligned left, with labels):
    - "Commit Hash:  <hash>"
    - "Commit Msg:   <msg>" (truncated to 60 chars, wrapped)
    - "Author:       <author>"
    - "Date:         <date>"
  - Close hint at bottom: "Press ` to close"
  - Font: 10px monospace for fields, 16px for title

- [ ] **P3-T3: Wire dev menu into `renderOverlay()`**
  - After `renderTitleScreen()`, add:
    ```js
    if (state.devMenuOpen) {
      renderDevMenu(ctx, state);
    }
    ```

**Acceptance:** Hash visible on title screen; dev menu overlay renders with commit info on toggle.

---

### Phase 4: CI/CD Injection (Priority: Medium)

**File:** `.github/workflows/deploy.yml`

- [ ] **P4-T1: Add injection step before Vercel deploy**
  ```yaml
  - name: Inject commit metadata
    run: |
      sed -i "s/__COMMIT_HASH__/$(git rev-parse --short HEAD)/" public/gameboy.html
      MSG=$(git log -1 --pretty=%s | sed 's/|/\\|/g')
      sed -i "s|__COMMIT_MSG__|${MSG}|g" public/gameboy.html
      sed -i "s|__COMMIT_AUTHOR__|$(git log -1 --pretty=%an)|g" public/gameboy.html
      sed -i "s|__COMMIT_DATE__|$(git log -1 --format=%ad --date=short)|g" public/gameboy.html
  ```
  - Place just before the `Deploy to Vercel` step (after checkout)
  - Use `|` as sed delimiter to avoid conflicts with `/` in commit messages
  - Escape single quotes in commit messages

**Acceptance:** Deploy logs show sed replacements; deployed title screen shows actual commit hash.

---

### Phase 5: Tests (Priority: Medium)

**File:** `tests/metroidvania-snake.test.js`

- [ ] **P5-T1: Test `commitInfo` exists and has defaults**
  - `createInitialState().commitInfo` should have `hash`, `msg`, `author`, `date`

- [ ] **P5-T2: Test `updateCommitInfo` merges correctly**
  - Partial update only changes specified field(s)

- [ ] **P5-T3: Test `toggleDevMenu` on title state**
  - `state.gameState = 'title'` → toggle toggles `devMenuOpen`

- [ ] **P5-T4: Test `toggleDevMenu` blocked on non-title state**
  - `state.gameState = 'playing'` → toggle does nothing

- [ ] **P5-T5: Test title screen render includes hash text**
  - Mock canvas context; verify `fillText` called with hash value

- [ ] **P5-T6: Test dev menu render**
  - Verify `renderDevMenu` called when `devMenuOpen` is true

- [ ] **P5-T7: Test `sed` injection (shell check)**
  - Create temp file with placeholders; run sed commands; verify replacements

**Acceptance:** All 7 test cases pass.

---

## File Change Summary

| File | Change | Lines Added/Modified | Risk | Phase |
|------|--------|---------------------|------|-------|
| `public/src/engine/core.js` | Add `commitInfo`, `devMenuOpen`, helpers | ~15 lines | 🟢 Low | P1 |
| `public/gameboy.html` | Meta tags, init logic, keybinding | ~20 lines | 🟢 Low | P2 |
| `public/src/render/overlays.js` | Hash display, `renderDevMenu` | ~40 lines | 🟢 Low | P3 |
| `.github/workflows/deploy.yml` | Injection step | ~7 lines | 🟡 Medium | P4 |
| `tests/metroidvania-snake.test.js` | 7 new test cases | ~60 lines | 🟢 Low | P5 |

**Total:** ~142 lines across 5 files

---

## Dependencies

| Depends On | Status |
|-----------|--------|
| `public/src/engine/core.js` — `createInitialState()` exists | ✅ |
| `public/src/render/overlays.js` — `renderTitleScreen()` exists | ✅ |
| `public/gameboy.html` — keydown handler exists | ✅ |
| `.github/workflows/deploy.yml` — deploy pipeline exists | ✅ |
| Git CLI available in CI runner | ✅ (GitHub Actions) |

| Blocks | Priority |
|--------|----------|
| Future: Debug overlay (FPS, hitboxes) in dev menu | Low |
| Future: Touch-based dev menu access (5-tap) | Low |

---

## Verification Checklist

| Check | Method | Expected |
|-------|--------|----------|
| Commit hash visible on title screen | Open game, observe bottom-right | Dim hash text present |
| Backtick opens dev menu | Press `` ` `` on title screen | Dev menu overlay appears |
| Dev menu shows correct info | Verify hash, msg, author, date | Matches last commit |
| Escape closes dev menu | Press Escape with dev menu open | Menu closes |
| Local dev fallback works | Open `gameboy.html` directly from filesystem | Hash shows `dev` |
| Playing state blocks dev menu | Start game, press backtick | No menu, no crash |
| Tests pass | `npm test` | All 7 new tests pass |
| CI/CD injects metadata | Deploy to Vercel preview | Hash is real commit SHA |
| No regression on game play | Play a full game | Score, controls, HUD all work |

---

## Notes

- The backtick key (`Backquote`) was chosen because it rarely conflicts with game controls. If the user's keyboard layout doesn't have a backtick key, they can still see the commit hash (just not the dev menu).
- The `sed` injection is skipped for `workflow_dispatch` without input — only `push` on `master` triggers injection.
- For local testing of the injection, run the `sed` commands manually from the repo root.
