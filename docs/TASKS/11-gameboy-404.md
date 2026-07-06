# Task Breakdown: [Bug] GameBoy HTML 404 — Engine JS not found on Vercel

> Parent Issue: #11
> Source: docs/PRD/11-gameboy-404.md
> Recommended Approach: Approach A — Move engine into `public/src/`

---

## Overview

The `gameboy.html` fails on Vercel deployment because `src/gameboy-snake-engine.js` is outside the deploy root and cannot be served as a static file. Fix: move the engine file into `public/src/` and update the import path.

---

## Tasks

### Phase 1: File Restructure

- [ ] **P1-T1: Move engine JS into `public/src/`**
  - Move `src/gameboy-snake-engine.js` → `public/src/gameboy-snake-engine.js`
  - Ensure `.gitkeep` or empty placeholder if `public/src/` directory doesn't exist yet
  - Note: leave empty `src/` directory at project root (no need to delete yet — other tools may reference it)

- [ ] **P1-T2: Update import path in `public/gameboy.html`**
  - Line 297: Change `'../src/gameboy-snake-engine.js'` → `'./src/gameboy-snake-engine.js'`
  - Verify: the path is relative to the HTML file location (`public/gameboy.html` → `public/src/gameboy-snake-engine.js`), so `./src/` is correct

- [ ] **P1-T3: Update test import paths**
  - `tests/gameboy-snake.test.js`: update `import` from `../src/` → `../public/src/` (or relative path from `tests/` to `public/src/`)
  - Verify tests still compile and pass

### Phase 2: Verification

- [ ] **P2-T1: Local static server test**
  - Run `npx serve public/` or `python -m http.server` from `public/` directory
  - Open `http://localhost:3000/gameboy.html`
  - Verify: no 404 errors in browser console, game loads and plays correctly

- [ ] **P2-T2: Run test suite**
  - `npm test` — confirm all game engine tests pass with updated import paths

- [ ] **P2-T3: Vercel deploy preview**
  - Push to a branch; let Vercel auto-deploy the preview
  - Open the preview URL `/gameboy.html`
  - Verify: no 404 errors, game functional

### Phase 3: Documentation

- [ ] **P3-T1: Update design doc**
  - `docs/DESIGN/5-gameboy-snake-game.md`: add note about deployment path requirement
  - Update file structure diagram to show `public/src/gameboy-snake-engine.js`

---

## Verification Checklist

| Check | Method | Pass/Fail |
|-------|--------|-----------|
| No 404 on Vercel deploy | Open deployed URL, check DevTools Console | [ ] |
| Game renders and plays | Arrow keys move snake, food system works | [ ] |
| All tests pass | `npm test` | [ ] |
| Local development works | `npx serve public/` then open browser | [ ] |
| No regression on `about.html` | Check `about.html` still loads correctly | [ ] |

---

## Notes

- The original `src/` directory at project root can remain as-is (or be cleaned up later). Moving the file does not require deleting the directory.
- If other files in the project import from `src/gameboy-snake-engine.js`, audit those too. Currently only `public/gameboy.html` and `tests/gameboy-snake.test.js` use this module.

