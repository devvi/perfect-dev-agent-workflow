# Tasks: #11 — [Bug] GameBoy HTML 404 — Engine JS not found on Vercel

| 字段 | 值 |
|------|----|
| Issue | #11 |
| 优先级 | P0 |

## Overview

The `gameboy.html` fails on Vercel deployment because `src/gameboy-snake-engine.js` is outside the deploy root and cannot be served as a static file. Fix: move the engine file into `public/src/` and update the import path. Source: `docs/PRD/11-gameboy-404.md`. Recommended Approach: Approach A — Move engine into `public/src/`.

## Phase 1: File Restructure (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `src/gameboy-snake-engine.js` → `public/src/gameboy-snake-engine.js` | Move engine JS into `public/src/`. Ensure `.gitkeep` or empty placeholder if `public/src/` directory doesn't exist yet. Note: leave empty `src/` directory at project root (no need to delete yet — other tools may reference it) | 无 | P0 |
| 1.2 | `public/gameboy.html` | Line 297: Change `'../src/gameboy-snake-engine.js'` → `'./src/gameboy-snake-engine.js'`. Verify: the path is relative to the HTML file location (`public/gameboy.html` → `public/src/gameboy-snake-engine.js`), so `./src/` is correct | 1.1 | P0 |
| 1.3 | `tests/gameboy-snake.test.js` | Update `import` from `../src/` → `../public/src/` (or relative path from `tests/` to `public/src/`). Verify tests still compile and pass | 1.1 | P0 |

## Phase 2: Verification (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | — (Manual: local server) | Run `npx serve public/` or `python -m http.server` from `public/` directory. Open `http://localhost:3000/gameboy.html`. Verify: no 404 errors in browser console, game loads and plays correctly | 1.1, 1.2 | P0 |
| 2.2 | — (Manual: test suite) | `npm test` — confirm all game engine tests pass with updated import paths | 1.1, 1.3 | P0 |
| 2.3 | — (Manual: Vercel preview) | Push to a branch; let Vercel auto-deploy the preview. Open the preview URL `/gameboy.html`. Verify: no 404 errors, game functional | 1.1, 1.2 | P0 |

## Phase 3: Documentation (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `docs/DESIGN/5-gameboy-snake-game.md` | Add note about deployment path requirement. Update file structure diagram to show `public/src/gameboy-snake-engine.js` | 1.1 | P1 |

## Verification Checklist

| Check | Method | Pass/Fail |
|-------|--------|-----------|
| No 404 on Vercel deploy | Open deployed URL, check DevTools Console | [ ] |
| Game renders and plays | Arrow keys move snake, food system works | [ ] |
| All tests pass | `npm test` | [ ] |
| Local development works | `npx serve public/` then open browser | [ ] |
| No regression on `about.html` | Check `about.html` still loads correctly | [ ] |

## Notes

- The original `src/` directory at project root can remain as-is (or be cleaned up later). Moving the file does not require deleting the directory.
- If other files in the project import from `src/gameboy-snake-engine.js`, audit those too. Currently only `public/gameboy.html` and `tests/gameboy-snake.test.js` use this module.

## Dependency Graph

```
Phase 1 (File Restructure)
├─ 1.1 (move engine JS) ──────────────────┐
├─ 1.2 (update import path in HTML) ←─ 1.1 │
├─ 1.3 (update test imports)    ←─ 1.1     │
                                            │
Phase 2 (Verification)                      │
├─ 2.1 (local static server test) ←─ 1.2   │
├─ 2.2 (run test suite)          ←─ 1.3    │
├─ 2.3 (Vercel deploy preview)   ←─ 1.2    │
                                            │
Phase 3 (Documentation)                     │
├─ 3.1 (update design doc)       ←─ 1.1    │
                                            │
All done ────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `src/gameboy-snake-engine.js` | 移动 → `public/src/gameboy-snake-engine.js` | — |
| `public/gameboy.html` | 修改（import 路径） | ±1 |
| `tests/gameboy-snake.test.js` | 修改（import 路径） | ±1 |
| `docs/DESIGN/5-gameboy-snake-game.md` | 修改（部署路径注释） | +3 |
