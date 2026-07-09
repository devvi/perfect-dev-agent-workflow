# Research: Title Screen — Interactive Menu (Start Game / About)

> Parent Issue: #66
> Agent: research-agent
> Date: 2026-07-08
> Status: Open
> Priority: Medium

---

## 1. Problem Definition

### Current Behavior

The title screen is a static overlay rendered by `renderTitleScreen()` in `public/src/render/overlays.js`. It displays the game title, control instructions, and a single prompt: **"PRESS ENTER TO START"**. Any directional arrow or Enter key immediately transitions the game from `title` to `playing` state. There is no menu, no selection mechanism, and no way to view information about the current version.

### Root Cause

The game was built as a minimal MVP where the title screen was merely a gate to gameplay. No design was ever made for a structured menu system. The input handler in `public/gameboy.html` has a single `if (state.gameState === 'title')` branch that unconditionally starts the game on any arrow/enter/space keypress — there is no state machine for menu navigation, no cursor/index tracking, and no concept of "selected menu item" in the game state.

### Expected Behavior

Per issue #66:
1. The title screen displays a menu with at least two options: **START GAME** and **ABOUT**
2. The player navigates the menu using **arrow keys** (up/down) and selects with **Enter**
3. Selecting **START GAME** begins gameplay (same as current start action)
4. Selecting **ABOUT** switches to an overlay showing: current commit hash (abbreviated SHA), commit message, and commit timestamp
5. From the ABOUT screen, pressing any key returns to the title menu

### User Scenarios

- **Scenario A（首次体验）：** 玩家打开游戏 → 看到 START GAME 和 ABOUT 两个选项 → 方向键选择 → Enter 确认
- **Scenario B（查看版本信息）：** 玩家选择 ABOUT → 看到 commit hash、消息、日期 → 按任意键返回菜单
- **Scenario C（快速开始）：** 熟悉游戏的玩家直接按 Enter（默认选中 START GAME）→ 立即开始游戏
- **Frequency:** 每次启动游戏时触发

---

## 2. Design Intent

### Why Does Current Behavior Exist?

The title screen was a minimal MVP, merely a gate to gameplay. No design was ever made for a structured menu system. The input handler in `public/gameboy.html` has a single `if (state.gameState === 'title')` branch that unconditionally starts the game on any arrow/enter/space keypress — there is no state machine for menu navigation, no cursor/index tracking, and no concept of "selected menu item" in the game state.

### Why Change Now?

1. **用户体验提升：** 菜单系统是游戏的基础功能，提供结构化的导航体验
2. **About 信息展示：** ABOUT 页面可以展示版本信息、作者、致谢等
3. **未来扩展性：** 有了菜单框架后，可以轻松添加更多条目（设置、音效、语言等）

### Previous Constraints

- 纯 Canvas 渲染（无 DOM 菜单）
- 键盘控制（非鼠标/触屏）
- 无外部依赖

---

## 3. Impact Analysis

| Area | Impact |
|------|--------|
| **Title Screen Rendering** (`public/src/render/overlays.js`) | `renderTitleScreen()` must be refactored from a static prompt to a menu renderer that draws selectable items and a cursor indicator. A new `renderAboutScreen()` function must be added. |
| **Game State** (`public/src/engine/core.js`) | Requires new fields: `menuIndex` (selected item index), `menuMode` (`'main'` / `'about'`). The `createInitialState()` function must initialize these. |
| **Input Handling** (`public/gameboy.html`) | The title-screen keydown branch must be rewritten to handle: up/down arrows for navigation, Enter for selection, and any-key-dismiss on the about screen. Must not interfere with playing-state controls. |
| **Commit Metadata** (`public/gameboy.html` or new inline script) | The ABOUT screen needs commit hash, message, and timestamp at runtime. |
| **Test Suite** | New test scenarios needed for: menu navigation, menu item selection, about screen display and dismiss. |
| **Backward Compatibility** | Low risk — existing controls are only modified in the `title` state. Playing/game-over/paused states are unaffected. |

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/render/overlays.js` | Overlay Rendering | 重构 `renderTitleScreen()` 为菜单渲染；新增 `renderAboutScreen()` |
| `public/src/engine/core.js` | Game State | 新增 `menuIndex`、`menuMode` 字段到 `createInitialState()` |
| `public/gameboy.html` | Input Handling | 重写 title-screen keydown 分支 |
| `.github/workflows/deploy.yml` | CI/CD | 若需注入 commit 信息（复用 #56 模式） |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `tests/metroidvania-snake.test.js` | Tests | 新增菜单导航测试 |

### Data Flow

```
Title Screen (state.gameState === 'title', menuMode === 'main')
  │
  ├─ ArrowUp/ArrowDown → state.menuIndex changes (wraps)
  ├─ Enter → state.menuIndex === 0 → startGame()
  │              state.menuIndex === 1 → menuMode = 'about'
  └─ Any key while menuMode === 'about' → menuMode = 'main'
```

### Documents to Update

- [ ] `docs/PRD/66-title-menu-prd.md` (本文件)
- [ ] `docs/TASKS/66-title-menu-prd.md` (任务文件)

---

## 4. Solution Comparison

> At least 2 approaches required.

### Alternative A: Canvas-based Menu with State Machine (Recommended)

**Description:** Modify the existing canvas rendering in `overlays.js` to draw a menu with selected item highlighting. Add `menuIndex` and `menuMode` fields to game state. Rewrite the title-screen key handler to dispatch menu navigation actions instead of immediately starting the game.

**Menu items:** `['START GAME', 'ABOUT']`

**Cursor visual:** A `▶` prefix next to the selected item, or a colored highlight.

**Pros:**
- Pure canvas rendering — consistent with the game's existing rendering approach
- No DOM manipulation needed
- Reuses the commit-info injection pattern already designed in #56 (build-time placeholders)
- Simple state machine (2 fields, 4 events)
- Easy to extend with more menu items later

**Cons:**
- Requires modifying game state shape (adds `menuIndex`, `menuMode`)
- Existing input handler logic must be restructured (currently a simple if-block)

**Risk:** Low
**Effort:** Small (~2–3 hours)

### Alternative B: DOM Overlay Menu Div

**Description:** Instead of rendering the menu on canvas, add hidden `<div>` elements for the menu and about screen in `gameboy.html`. Toggle their visibility via CSS classes. The canvas below remains visible but dimmed.

**Pros:**
- Menus use HTML/CSS — easier to style (font choices, animations)
- No canvas text layout calculations needed
- Easy to add rich content (links, images) to the About screen

**Cons:**
- Breaks the all-canvas rendering paradigm
- DOM state must be kept in sync with game state
- The gameboy aesthetic is pixel-perfect canvas; HTML menus look mismatched
- More complex to handle focus/input across DOM + canvas listeners
- Would need to hide menus when game starts (extra cleanup)

**Risk:** Medium
**Effort:** Medium (~3–4 hours)

### Alternative C: Hybrid — DOM Menu with Canvas Background

**Description:** The title screen is the only state where a DOM overlay could replace the canvas overlay entirely. When `state.gameState === 'title'`, render the menu as a DOM element overlay on top of the frozen canvas. On start, remove the DOM overlay and let the canvas game loop take over.

**Pros:**
- Rich HTML menus are easier to build and style
- About screen can have copy-friendly text (player can select/copy commit hash)
- No changes needed to canvas render code for menus

**Cons:**
- Two rendering systems competing for the title screen
- Transition from DOM menu → canvas game must be glitch-free
- Introduces DOM manipulation that must be cleaned up on init/restart
- The pixel-art aesthetic is harder to maintain with HTML

**Risk:** Medium
**Effort:** Medium (~3–4 hours)

### Recommendation

→ **Alternative A (Canvas-based Menu)** 因为：
1. Consistency with the existing all-canvas rendering pipeline
2. No DOM complexity or sync issues
3. The commit-info injection mechanism from #56 applies directly
4. Smallest code change footprint
5. Easy to maintain and extend

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Title screen shows menu | Load game | Canvas shows "START GAME" and "ABOUT" as selectable items, with a cursor on "START GAME" by default |
| 2 | Navigate menu | Press ArrowDown | Cursor moves from "START GAME" to "ABOUT" (and wraps around) |
| 3 | Navigate menu (up) | Press ArrowUp | Cursor moves from current item upward, wraps at top |
| 4 | Select "START GAME" | ArrowDown to "START GAME", press Enter | Game starts (enters playing state, game loop begins) |
| 5 | Select "ABOUT" | ArrowDown to "ABOUT", press Enter | Screen switches to about overlay showing commit hash, message, and date |
| 6 | Dismiss ABOUT | Press any key while on ABOUT screen | Returns to title menu with cursor on "START GAME" |
| 7 | Title screen commit hash visibility | Deployed build | Commit hash is visible on the title screen (bottom-right, per #56 design) |

### Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Very long commit message (>60 chars) | Truncated or wrapped to fit the about screen panel |
| 2 | Placeholder not replaced (local dev, no CI) | Show "local" instead of raw `__COMMIT_HASH__` placeholder |
| 3 | Rapid arrow key presses | Only last direction takes effect on next render frame |
| 4 | Enter pressed before menu renders (race) | Should not happen — input is queued in event loop, rendered synchronously |
| 5 | Game restart from game-over → title | Menu resets to initial state (menuIndex = 0, menuMode = 'main') |
| 6 | Browser tab hidden during menu | No special handling needed; canvas state is preserved |
| 7 | Commit metadata object missing entirely | All fields show "N/A" fallback on ABOUT screen |

### Out of Scope

| Item | Reason |
|------|--------|
| **Save/Load menu entry** | Not requested in #66. Separate feature if needed. |
| **Settings/Options menu** | Not requested. Would be a follow-up. |
| **Sound/Music toggle** | No audio system exists in the game yet. |
| **Multi-language support** | Not requested. All UI is in English. |
| **Mouse/touch menu interaction** | Game is keyboard-only. Touch would be a future enhancement. |
| **Animations on menu items** | Not requested. Static menu is sufficient for MVP. |

### Failure Paths

| # | Failure | Handling |
|---|---------|----------|
| 1 | `window.__COMMIT_INFO` is undefined | Show "N/A" for all fields; the about screen still renders gracefully |
| 2 | Commit hash placeholder not replaced | Show "local" instead of `__COMMIT_HASH__` |
| 3 | Menu state not reset after game-over | `init()` resets state completely, including menu fields |

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk | Notes |
|-----------|--------|------|-------|
| Game state shape (`core.js`) | Stable | Low | Adding `menuIndex` and `menuMode` is non-breaking |
| Canvas renderer (`overlays.js`) | Stable | Low | New render functions only; existing overlay logic unchanged |
| Input handler (`gameboy.html`) | Stable | Medium | Must restructure title-screen key dispatch without breaking other states |
| Commit hash injection (#56) | Not implemented | High | The ABOUT screen needs commit metadata. If #56 is not implemented first, a simpler inline fallback must be provided. |

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Input conflict — arrow keys for menu vs game | Low | Arrow keys only navigate menu when `state.gameState === 'title'`, which is mutually exclusive with playing state |
| State initialization — menu fields forgotten in `init()` | Low | `createInitialState()` is the single source of truth; add menu fields there |
| #56 not implemented before #66 | Medium | The ABOUT screen can use a simpler approach: a manual token placeholder in `gameboy.html` + a local build script |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Settings/Options menu | Post-MVP |

### Preparation Needed

- [ ] 确认 #56 的 commit hash 注入机制是否已经实现——否则提供 inline fallback

---

## 7. Spike / Experiment (Optional)

### Implementation Notes

#### 6.1 Game State Additions (`public/src/engine/core.js`)

```js
// In createInitialState():
menuIndex: 0,       // 0 = START GAME, 1 = ABOUT
menuMode: 'main',   // 'main' | 'about'
```

### 6.2 Title Screen Menu Rendering (`public/src/render/overlays.js`)

Replace current `renderTitleScreen()` with:

```
function renderTitleScreen(ctx, state) {
  // Same dark overlay
  // Same title/subtitle/controls
  // Instead of "PRESS ENTER TO START", draw menu items:
  const items = ['▶ START GAME', '  ABOUT'];
  // For each item, draw cursor prefix if selected index matches
  // Position menu items below controls, centered
}
```

New function:
```
function renderAboutScreen(ctx, state) {
  // Semi-transparent dark overlay
  // Draw: "ABOUT" header, commit hash, commit message, commit date
  // Footer: "Press any key to return"
}
```

The `renderOverlay()` dispatch must be updated:
```js
if (state.gameState === 'title') {
  if (state.menuMode === 'about') {
    renderAboutScreen(ctx, state);
  } else {
    renderTitleScreen(ctx, state);
  }
}
```

### 6.3 Input Handler Changes (`public/gameboy.html`)

```js
if (state.gameState === 'title') {
  if (state.menuMode === 'about') {
    // Any key → return to main menu
    e.preventDefault();
    state = { ...state, menuIndex: 0, menuMode: 'main' };
    render(ctx, state);
    return;
  }
  
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    e.preventDefault();
    const next = e.code === 'ArrowUp' ? -1 : 1;
    const newIndex = (state.menuIndex + next + 2) % 2; // 2 items, wrap
    state = { ...state, menuIndex: newIndex };
    render(ctx, state);
    return;
  }
  
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (state.menuIndex === 0) {
      start(); // START GAME
    } else {
      state = { ...state, menuMode: 'about' };
      render(ctx, state);
    }
    return;
  }
}
```

### 6.4 Commit Metadata Source

The ABOUT screen needs commit info at runtime. This depends on the pattern established by #56:
- **Reuse** the `window.__COMMIT_INFO` object designed in #56
- **If #56 is not yet implemented**, provide a simple inline fallback in `gameboy.html`

### 6.5 Menu Visual Layout (Canvas Coordinates, centered at 400×400)

```
Title:       "🐍 SNAKE"          @ (200, 130)
Subtitle:    "METROIDVANIA"      @ (200, 160)
Tagline:     "Explore. Fight..." @ (200, 200)

Controls:    Arrows, Z, X etc.   @ (200, 250-286)

Menu:
  ▶ START GAME                   @ (200, 330)
    ABOUT                        @ (200, 350)

     -- or in ABOUT mode --
    
  "ABOUT" header                 @ (200, 150)
  Commit:  a1b2c3d               @ (200, 200)
  Message: fix: prevent...       @ (200, 230)
  Date:    2026-07-08            @ (200, 260)
  Press any key to return        @ (200, 320)
```

### 6.6 Acceptance Criteria Checklist

- [ ] Title screen renders two menu items: "START GAME" and "ABOUT"
- [ ] Default cursor position is on "START GAME"
- [ ] ArrowUp/ArrowDown navigates between menu items (wraps around)
- [ ] Enter on "START GAME" starts the game
- [ ] Enter on "ABOUT" opens the about screen
- [ ] About screen shows: commit hash (abbreviated), commit message, commit date
- [ ] Any key press on about screen returns to title menu
- [ ] Menu state resets on game restart (init())
- [ ] Commit info uses `window.__COMMIT_INFO` (fallback to "local" / "N/A" if placeholder not replaced)
- [ ] Existing playing/game-over/paused controls are unaffected
- [ ] All existing tests pass
