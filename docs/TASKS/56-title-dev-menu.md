# Tasks: #56 — Title Screen — Deploy Commit Hash & Dev Menu

| 字段 | 值 |
|------|----|
| Issue | #56 |
| 优先级 | P1 |

## Overview

在标题画面底部渲染部署 commit hash，添加可通过反引号键（Backquote）触发的开发者菜单（显示完整 commit 信息）。实现构建时元数据注入。Source: `docs/DESIGN/56-title-dev-menu.md`.

## Phase 1: Build-Time Injection (CI/CD) (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/gameboy.html` | Add inline `<script>` block with `window.__COMMIT_INFO` object containing four placeholders (`__COMMIT_HASH__`, `__COMMIT_MSG__`, `__COMMIT_AUTHOR__`, `__COMMIT_DATE__`) | 无 | P0 |
| 1.2 | `.github/workflows/deploy.yml` | Add new step "Inject commit metadata" after `actions/checkout@v6` and before Vercel deploy. Use `git rev-parse --short HEAD`, `git log -1 --pretty=%s`, etc. with `sed -i` to replace placeholders in `public/gameboy.html` | 1.1 | P0 |

## Phase 2: Game State & Input Handling (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/src/engine/core.js` | Add `devMenuOpen: false` to `createInitialState()` return object. Add `commitInfo: null` field | 无 | P0 |
| 2.2 | `public/src/engine/core.js` | In `createInitialState()`, read `window.__COMMIT_INFO` and assign to `state.commitInfo` | 1.1 | P0 |
| 2.3 | `public/gameboy.html` (keydown listener) | Add Backquote handler at the top of the `state.gameState === 'title'` block: toggle `state.devMenuOpen`, call `render(ctx, state)`, `preventDefault`, return early | 2.1 | P0 |
| 2.4 | `public/gameboy.html` (keydown listener) | In title screen Enter/Arrow handler, close `state.devMenuOpen` before starting game | 2.3 | P0 |
| 2.5 | `public/gameboy.html` (keydown listener) | Add Escape handler that closes dev menu if open (works regardless of gameState — only if `state.devMenuOpen === true`) | 2.3 | P0 |
| 2.6 | `public/gameboy.html` (keydown listener) | Guard Backquote handler so it only toggles on title screen; silently ignore in other game states | 2.3 | P1 |

## Phase 3: Rendering — Title Screen Hash & Dev Menu Overlay (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/render/overlays.js` | In `renderTitleScreen()`, add call to `renderCommitHash(ctx, state)` at the end | 2.1 | P0 |
| 3.2 | `public/src/render/overlays.js` | Add new function `renderCommitHash(ctx, state)` — draws commit hash at bottom-right corner with semi-transparent styling | 2.2 | P0 |
| 3.3 | `public/src/render/overlays.js` | Add new function `renderDevMenu(ctx, state)` — draws the full dev menu overlay with all commit fields, panel border, close hint | 2.1, 2.2 | P0 |
| 3.4 | `public/src/render/overlays.js` | In `renderOverlay()`, add check: if `state.devMenuOpen === true`, call `renderDevMenu(ctx, state)` | 2.1 | P0 |
| 3.5 | `public/src/render/overlays.js` | Add subtle "backtick for dev" hint text on title screen (bottom-left) | 2.1 | P1 |

## Phase 4: Fallback & Edge Cases (Polish) (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `public/src/engine/core.js` | Add fallback logic in `createInitialState()`: if `window.__COMMIT_INFO` missing, use hardcoded fallback object | 2.2 | P0 |
| 4.2 | `public/src/render/overlays.js` | In `renderDevMenu()`, handle empty/long messages: truncate or wrap | 3.3 | P1 |
| 4.3 | `public/src/render/overlays.js` | In `renderDevMenu()`, handle missing fields gracefully: display "N/A" | 3.3 | P1 |

## Phase 5: Secondary Surface — index.html (Optional) (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 5.1 | `index.html` | Add inline script block with `window.__COMMIT_INFO` (same placeholder structure as gameboy.html) | 1.1 | P1 |
| 5.2 | `.github/workflows/deploy.yml` | Include `index.html` in the sed replacement commands (replace in both files) | 1.2 | P1 |
| 5.3 | `index.html` | Display the commit hash as a small footer text (e.g., `Build: abc1234`) | 5.1 | P1 |

## Testing Tasks

| # | Test Group | 文件 | 优先级 |
|---|-----------|------|----------|
| T1 | Fallback behavior (A1-A3) | `tests/metroidvania-snake.test.js` | P0 |
| T2 | State management (B1-B7) | `tests/metroidvania-snake.test.js` | P0 |
| T3 | Input handling (C1-C4) | `tests/metroidvania-snake.test.js` | P0 |
| T4 | Title screen hash rendering (D1-D4) | `tests/metroidvania-snake.test.js` | P1 |
| T5 | Dev menu content (E1-E4) | `tests/metroidvania-snake.test.js` | P1 |
| T6 | Build injection testing (F1-F5) | (manual / CI test) | P1 |
| T7 | Play-test full flow | `tests/play-test.mjs` or manual | P0 |

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
- **Phase 2 and Phase 3 can be developed in parallel** if the metadata object shape is agreed upon first

## Summary: Changed Files

| 文件 | 总行数变更 | 阶段 | 风险 |
|------|------------|------|------|
| `.github/workflows/deploy.yml` | ~21 | 1, 5 | 🟢 Low |
| `public/gameboy.html` | ~20 | 1, 2 | 🟢 Low |
| `public/src/engine/core.js` | ~10 | 2, 4 | 🟢 Low |
| `public/src/render/overlays.js` | ~68 | 3, 4 | 🟡 Medium |
| `index.html` | ~10 | 5 | 🟢 Low (P1 — optional) |

**Total:** ~129 lines across 5 files (93 P0 + 36 P1)
