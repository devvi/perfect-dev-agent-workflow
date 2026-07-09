# Design: #66 — Title Screen — Interactive Menu (Start Game / About)

> Parent Issue: #66
> Agent: subagent
> Date: 2026-07-08

---

## 1. Architecture Overview

The feature adds an interactive menu to the title screen with two items (START GAME, ABOUT) and a commit-info display on the ABOUT screen. It touches three files in two architectural layers:

```
┌─────────────────────────────────────────────────────────┐
│ Runtime — Game State (core.js)                           │
│  • menuIndex: number  (0 = START GAME, 1 = ABOUT)       │
│  • menuMode: string   ('main' | 'about')                │
│  • commitInfo: object (reference to window.__COMMIT_INFO)│
└─────────────────────┬───────────────────────────────────┘
                      │ state passed to render + keydown
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Runtime — Rendering (overlays.js)                        │
│  • renderTitleScreen() refactored → draws menu with      │
│    cursor ▶ prefix on selected item                      │
│  • renderAboutScreen() new → draws commit info overlay   │
│  • renderOverlay() dispatch updated to handle menuMode   │
└─────────────────────┬───────────────────────────────────┘
                      │ canvas drawn to <canvas>
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Runtime — Entry Point (gameboy.html)                     │
│  • Title-screen keydown handler rewritten:               │
│    - ArrowUp/ArrowDown → navigate menu (wrap)            │
│    - Enter on START GAME → startGame()                   │
│    - Enter on ABOUT → set menuMode = 'about' + re-render │
│    - Any key on ABOUT → set menuMode = 'main' + re-render│
└─────────────────────────────────────────────────────────┘
```

### Module Breakdown

| Layer | Module | File | Role |
|-------|--------|------|------|
| State | Game Engine | `public/src/engine/core.js` | Add `menuIndex`, `menuMode`, `commitInfo` to initial state |
| Render | Overlays | `public/src/render/overlays.js` | Menu cursor rendering + about screen overlay |
| Entry | HTML/Input | `public/gameboy.html` | Title-screen key dispatch for menu navigation |

**Important:** This feature is independent of issue #56. While it reuses the `window.__COMMIT_INFO` pattern, it provides its own fallback so either issue can ship first.

---

## 2. Detailed Design

### 2.1 Commit Metadata Strategy

The ABOUT screen needs commit hash, message, and date at runtime. Two scenarios:

**Option A: #56 is already implemented (preferred)**
- `window.__COMMIT_INFO` exists as an inline `<script>` block in `gameboy.html`
- Contains fields: `hash`, `message`, `author`, `date`
- Populated at build-time by CI/CD (sed replacement of placeholders)
- #66 reads this object directly

**Option B: #56 is not yet implemented (fallback)**
- Add a minimal inline `<script>` block to `gameboy.html` with hardcoded placeholders
- Same shape as `window.__COMMIT_INFO`:
  ```js
  window.__COMMIT_INFO = {
    hash: "__COMMIT_HASH__",
    message: "__COMMIT_MSG__",
    date: "__COMMIT_DATE__"
  };
  ```
- The ABOUT screen handles unreplaced placeholders gracefully (shows "N/A")

**Design decision:** Both approaches produce the same runtime object shape. The ABOUT screen only depends on the shape, not how it's populated.

### 2.2 Game State Additions (core.js)

**New fields in `createInitialState()`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `menuIndex` | number | `0` | Currently selected menu item. 0 = START GAME, 1 = ABOUT |
| `menuMode` | string | `'main'` | Menu screen mode: `'main'` (title menu) or `'about'` (about overlay) |
| `commitInfo` | object | `null` | Reference to `window.__COMMIT_INFO` or fallback object |

**State initialization logic:**

```js
const commitInfo = (window && window.__COMMIT_INFO &&
    window.__COMMIT_INFO.hash &&
    !window.__COMMIT_INFO.hash.startsWith('__'))
  ? window.__COMMIT_INFO
  : { hash: 'N/A', message: 'N/A', date: 'N/A' };

return {
  // ...existing fields...
  menuIndex: 0,
  menuMode: 'main',
  commitInfo,
};
```

**State transitions:**

```
  title + menuMode='main' + menuIndex=0
    │  Enter → startGame() (transitions to 'playing')
    │
  title + menuMode='main' + menuIndex=1
    │  Enter → menuMode='about'
    │
  title + menuMode='about' + menuIndex=0
    │  Any key → menuMode='main', menuIndex=0
    │
  init() called (game-over restart or page load)
    │  menuIndex=0, menuMode='main' (reset to defaults)
```

### 2.3 Title Screen Menu Rendering (overlays.js)

**Modified `renderTitleScreen()`:**

The existing function draws: dark overlay, title, subtitle, instructions, and start prompt. The refactored version replaces the final "PRESS ENTER TO START" line with a two-item menu.

**Menu layout (canvas centered at 400×400, y-coordinates):**

```
y=130  🐍 SNAKE                  (PALETTE.RED, 24px)
y=160  METROIDVANIA              (PALETTE.GOLD, 14px)
y=200  Explore. Fight. Eat. Grow. (#8bac0f, 11px)
y=250  ⬆ ⬇ ⬅ ➡  Move            (#ccc, 10px)
y=268  Z  Fire projectile         (#ccc, 10px)
y=286  X  Interact (gacha/save)   (#ccc, 10px)
y=310  ENTER  Select              (#ccc, 10px)
y=340  ▶ START GAME               (PALETTE.FOOD, 12px)
y=360    ABOUT                    (#ccc, 12px)
```

**Cursor visual:**
- A `▶` prefix before the selected item name
- Non-selected item gets `  ` (two-space) prefix for consistent alignment
- Selected item uses `PALETTE.FOOD` color, non-selected uses `#ccc`

**Constant:**
```js
const MENU_ITEMS = ['START GAME', 'ABOUT'];
```

**New function: `renderAboutScreen(ctx, state)`:**

Draws a commit-info overlay. Design:

```
┌──────────────────────┐
│       ABOUT          │  (PALETTE.GOLD, 16px, centered at y=150)
│                      │
│  Commit: a1b2c3d     │  (hash, 12px monospace, left at x=80, y=200)
│  Msg:   fix: prevent │  (message, 12px, y=230, potentially wrapped)
│  Date:  2026-07-08   │  (date, 12px, y=270)
│                      │
│  Press any key to    │  (PALETTE.FOOD, 11px, centered at y=330)
│  return              │
└──────────────────────┘
```

**Updated `renderOverlay()` dispatch:**

```js
export function renderOverlay(ctx, state) {
  if (state.gameState === 'title') {
    if (state.menuMode === 'about') {
      renderAboutScreen(ctx, state);
    } else {
      renderTitleScreen(ctx, state);
    }
  } else if (state.gameState === 'gameover') {
    renderGameOverScreen(ctx, state);
  } else if (state.gameState === 'won') {
    renderVictoryScreen(ctx, state);
  } else if (state.gameState === 'paused') {
    renderPauseScreen(ctx);
  }
}
```

### 2.4 Input Handling (gameboy.html)

**New behavior:**

```js
if (state.gameState === 'title') {
  // ABOUT screen: any key returns to main menu
  if (state.menuMode === 'about') {
    e.preventDefault();
    state = { ...state, menuIndex: 0, menuMode: 'main' };
    render(ctx, state);
    return;
  }

  // Main menu: navigation
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    e.preventDefault();
    const direction = e.code === 'ArrowUp' ? -1 : 1;
    const itemCount = 2; // START GAME, ABOUT
    const newIndex = (state.menuIndex + direction + itemCount) % itemCount;
    state = { ...state, menuIndex: newIndex };
    render(ctx, state);
    return;
  }

  // Main menu: selection
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (state.menuIndex === 0) {
      start(); // START GAME → transitions to playing
    } else {
      // ABOUT → switch to about screen
      state = { ...state, menuMode: 'about' };
      render(ctx, state);
    }
    return;
  }
}
```

**Design notes:**
- State mutations use spread operator to match existing code style
- `render(ctx, state)` is called immediately on every menu action for instant visual feedback
- Arrow keys only trigger re-render of the title screen; they do NOT start the game
- Menu wraps: pressing ArrowDown on "ABOUT" (index 1) wraps to "START GAME" (index 0)

### 2.5 Game Restart Behavior

When the game restarts from game-over/victory screens via `init()`:
- `init()` calls `createInitialState(world)` which returns fresh defaults
- `menuIndex = 0`, `menuMode = 'main'` are automatically reset
- No special handling needed

### 2.6 Data Flow

#### State Machine Diagram

```
                    init() / page load
                           │
                           ▼
              ┌─────────────────────┐
              │  menuMode='main'    │
              │  menuIndex=0        │
              └──────┬──────┬───────┘
                     │      │
          ArrowUp/   │      │ Enter on menuIndex=0
          ArrowDown  │      │
              │      │      ▼
              │      │  ┌──────────┐
              │      │  │ playing  │
              │      │  └──────────┘
              ▼      │
    menuIndex changes │
    (wraps: 0↔1)     │ Enter on menuIndex=1
                     │
                     ▼
              ┌─────────────────────┐
              │  menuMode='about'   │
              │  commit hash, msg,  │
              │  date displayed     │
              └─────────────────────┘
                     │
                     │ Any key
                     ▼
              ┌─────────────────────┐
              │  menuMode='main'    │
              │  menuIndex=0        │
              └─────────────────────┘
```

#### Render Flow

```
render(ctx, state)
  │
  ├─ renderRoom()         ← game world (always drawn)
  ├─ renderHUD()          ← score/length/keys
  ├─ renderMinimap()      ← explored rooms
  ├─ renderOverlay()      ← based on gameState
  │    │
  │    └─ state.gameState === 'title'
  │         ├─ menuMode === 'main'
  │         │    └─ renderTitleScreen(ctx, state)
  │         │         ├─ dark overlay
  │         │         ├─ title "🐍 SNAKE"
  │         │         ├─ subtitle "METROIDVANIA"
  │         │         ├─ controls info
  │         │         ├─ menu items with cursor
  │         │         └─ commit hash (bottom-right, if #56 exists)
  │         │
  │         └─ menuMode === 'about'
  │              └─ renderAboutScreen(ctx, state)
  │                   ├─ dark overlay
  │                   ├─ "ABOUT" header
  │                   ├─ commit hash, message, date
  │                   └─ "Press any key to return"
  │
  └─ renderScanlines()   ← screen-wide effect
```

### 2.7 Dependencies & Risks

| Dependency | Risk | Mitigation |
|-----------|------|------------|
| `window.__COMMIT_INFO` availability | Medium — #56 may not be done | Minimal inline script block in `gameboy.html` + fallback in `createInitialState()` |
| Canvas `fillText` text rendering | None | Standard API, no layout engine needed |
| `start()` function signature | Low | Must remain a no-argument function called from keydown handler |
| Existing test suite | Low | Menu navigation only changes title-screen behavior; all existing tests remain unaffected |

**No external libraries or build tools are required.** The feature is pure vanilla JS.

### 2.8 Non-Goals & Future Considerations

| Topic | Status | Notes |
|-------|--------|-------|
| Mouse/touch menu interaction | Post-MVP | Game is keyboard-only |
| Animations on menu items | Post-MVP | Static menu sufficient for MVP |
| Settings/Options menu item | Post-MVP | Separate feature |
| Save/Load menu entry | Post-MVP | Already accessible via S key on game-over |
| Animated cursor blink | Post-MVP | Adds visual polish but unnecessary for MVP |
| Sound effects on menu navigation | Post-MVP | No audio system exists yet |

---

## 3. Files Changed

| File | Change Description | Est. Lines |
|------|--------------------|------------|
| `public/src/engine/core.js` | Add `menuIndex`, `menuMode`, `commitInfo` fields to state | ~10 |
| `public/src/render/overlays.js` | Refactor `renderTitleScreen()` for menu cursor; add `renderAboutScreen()` | ~80 |
| `public/gameboy.html` | Rewrite title-screen keydown handler for menu navigation | ~40 |

---

## 4. Verification Checklist

- [ ] A1: Default menuIndex — `createInitialState()` → `state.menuIndex === 0`
- [ ] A2: Default menuMode — `createInitialState()` → `state.menuMode === 'main'`
- [ ] A3: commitInfo shape — `state.commitInfo.hash`, `.message`, `.date` all defined
- [ ] A4: commitInfo fallback — `window.__COMMIT_INFO` undefined → `state.commitInfo.hash === 'N/A'`
- [ ] A5: commitInfo ignores raw placeholder — `window.__COMMIT_INFO.hash = "__COMMIT_HASH__"` → fallback `'N/A'` used
- [ ] B1: ArrowDown navigates forward — `menuIndex=0`, ArrowDown → `menuIndex=1`
- [ ] B2: ArrowUp navigates backward — `menuIndex=1`, ArrowUp → `menuIndex=0`
- [ ] B3: ArrowDown wraps — `menuIndex=1`, ArrowDown → `menuIndex=0`
- [ ] B4: ArrowUp wraps — `menuIndex=0`, ArrowUp → `menuIndex=1`
- [ ] C1: Enter on START GAME → gameState transitions to `'playing'`
- [ ] C2: Enter on ABOUT → `menuMode === 'about'`, gameState remains `'title'`
- [ ] D1: Any key dismisses about screen → `menuMode='main'`, `menuIndex=0`
- [ ] E1: Menu resets on init after game-over → `menuIndex === 0`, `menuMode === 'main'`
- [ ] F1: Menu items rendered — "START GAME" and "ABOUT" strings appear on canvas
- [ ] F2: Cursor on default item — `menuIndex=0` → cursor prefix (▶) before "START GAME"
- [ ] F3: Cursor moves to ABOUT — `menuIndex=1` → cursor prefix appears before "ABOUT"
- [ ] G1: About screen renders — "ABOUT" header, commit info, and "Press any key" text visible
- [ ] G5: Fallback text on missing data — `commitInfo.hash = 'N/A'` → "N/A" displayed
- [ ] I1: Full title menu flow — ArrowDown → Enter → About screen opens
- [ ] I3: Full start game flow — Enter on START GAME → game starts correctly
- [ ] I8: Game-over restart resets menu — menu at default state (index 0, main mode)
