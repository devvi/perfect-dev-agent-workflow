# Tasks: #66 — Title Screen — Interactive Menu (Start Game / About)

| 字段 | 值 |
|------|----|
| Issue | #66 |
| 优先级 | P0 |

## Overview

实现标题画面交互式菜单系统：用 ArrowUp/ArrowDown 导航 START GAME 和 ABOUT 两个选项，Enter/Space 确认选择，ABOUT 页面显示 commit 元数据，任意键返回主菜单。Source: `docs/DESIGN/66-title-menu-design.md`.

## Phase 1: Game State Setup & Commit Metadata (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/core.js` | Add `menuIndex: 0` and `menuMode: 'main'` to `createInitialState()` return object | 无 | P0 |
| 1.2 | `public/src/engine/core.js` | Add `commitInfo: null` to `createInitialState()`, then populate from `window.__COMMIT_INFO` with fallback logic | 无 | P0 |
| 1.3 | `public/gameboy.html` | If #56 not present, add minimal inline `<script>` block before `importmap` defining `window.__COMMIT_INFO` with placeholders | 无 | P1 |

### Step 1.1 — State fields:
```js
// In createInitialState() return:
menuIndex: 0,
menuMode: 'main',
commitInfo: null,
```

### Step 1.2 — Commit info fallback:
```js
const commitInfo = (typeof window !== 'undefined' && window.__COMMIT_INFO &&
    window.__COMMIT_INFO.hash &&
    !window.__COMMIT_INFO.hash.startsWith('__'))
  ? window.__COMMIT_INFO
  : { hash: 'N/A', message: 'N/A', date: 'N/A' };
```

### Step 1.3 — Inline script (if #56 is not yet done):
```html
<script>
  window.__COMMIT_INFO = {
    hash: "__COMMIT_HASH__",
    message: "__COMMIT_MSG__",
    date: "__COMMIT_DATE__"
  };
</script>
```

## Phase 2: Input Handling Rewrite (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/gameboy.html` | Replace the entire `if (state.gameState === 'title')` block with the new menu dispatch | 1.1 | P0 |
| 2.2 | `public/gameboy.html` | Remove `e.code.startsWith('Arrow')` from the old condition — arrows no longer start the game | 2.1 | P0 |

### Key design decisions:
- `menuMode === 'about'` is checked first (independent of which key is pressed)
- Navigation uses modular arithmetic for wrapping: `(index + delta + N) % N`
- `itemCount` is hardcoded as `2` for now; extract to a constant when more items are added
- `start()` function is called directly — same as before
- Failed/other keys on title screen are silently ignored (no-op)

## Phase 3: Rendering — Menu & About Screen (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/render/overlays.js` | Add `MENU_ITEMS` constant at top of module: `['START GAME', 'ABOUT']` | 1.1 | P0 |
| 3.2 | `public/src/render/overlays.js` | Replace the final "PRESS ENTER TO START" block in `renderTitleScreen()` with menu-item rendering loop | 1.1 | P0 |
| 3.3 | `public/src/render/overlays.js` | Add new function `renderAboutScreen(ctx, state)` — draws dark overlay + commit info | 1.2 | P0 |
| 3.4 | `public/src/render/overlays.js` | Update `renderOverlay()` to dispatch to `renderAboutScreen()` when `menuMode === 'about'` | 1.1 | P0 |

## Phase 4: Edge Cases & Integration Testing (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `public/gameboy.html` | Verify that game-over restart → `init()` → title screen has clean menu state | 全部 | P0 |
| 4.2 | `tests/metroidvania-snake.test.js` | Add unit tests for state management (Groups A-E from DESIGN doc) | 1.1, 1.2 | P0 |
| 4.3 | — (Manual) | Run through all acceptance criteria | 全部 | P0 |

## Acceptance Criteria

- [ ] Title screen renders "START GAME" and "ABOUT" as selectable items
- [ ] Default cursor position on "START GAME"
- [ ] ArrowUp/ArrowDown navigates between items (wraps)
- [ ] Enter on "START GAME" starts the game
- [ ] Enter on "ABOUT" shows commit hash, message, date
- [ ] Any key on about screen returns to title menu
- [ ] Menu state resets on game restart
- [ ] Existing playing/game-over/paused controls unaffected
- [ ] All existing tests pass after changes

## Dependency Graph

```
Phase 1 (State setup + metadata)
    │
    ├──────────────┐
    ▼              ▼
Phase 2        Phase 3
(Input)     (Rendering)
    │              │
    └──────┬───────┘
           ▼
    Phase 4 (Edge cases + tests)
```

- **Phase 1 → Phase 2:** Input handler needs `menuIndex` and `menuMode` to exist in state
- **Phase 1 → Phase 3:** Render functions need `commitInfo`, `menuIndex`, `menuMode` in state
- **Phases 2 + 3:** Can be implemented in parallel (input and rendering are independent of each other)
- **Phase 4:** Depends on all prior phases

## Summary: Changed Files

| 文件 | 总行数变更 | 阶段 | 风险 |
|------|------------|------|------|
| `public/src/engine/core.js` | ~14 | 1 | 🟢 Low |
| `public/gameboy.html` | ~35 | 2, 4 | 🟢 Low |
| `public/src/render/overlays.js` | ~52 | 3 | 🟡 Medium |
| `tests/metroidvania-snake.test.js` | ~40 | 4 | 🟢 Low |

**Total:** ~141 lines across 4 files (130 P0 + 11 P1)
