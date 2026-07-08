# Tasks: Title Screen — Interactive Menu (Start Game / About)

> Parent Issue: #66
> Source: `docs/DESIGN/66-title-menu-design.md`
> Priority: Medium
> Effort: ~2–3 hours (total across all phases)

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Must-have for MVP — core functionality |
| **P1** | Nice-to-have — polish, edge cases, secondary surfaces |

---

## Phase 1: Game State Setup & Commit Metadata

**Goal:** Add `menuIndex`, `menuMode`, and `commitInfo` fields to the game state. Ensure the commit metadata fallback works regardless of #56's status.

**Depends on:** Nothing (independent of other phases)

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 1.1 | `public/src/engine/core.js` | Add `menuIndex: 0` and `menuMode: 'main'` to `createInitialState()` return object | P0 | +2 |
| 1.2 | `public/src/engine/core.js` | Add `commitInfo: null` to `createInitialState()`, then populate from `window.__COMMIT_INFO` with fallback logic | P0 | +12 |
| 1.3 | `public/gameboy.html` | If #56 not present, add minimal inline `<script>` block before `importmap` defining `window.__COMMIT_INFO` with placeholders | P1 | +7 |

### Step Details

**1.1 — State fields:**
```js
// In createInitialState() return:
menuIndex: 0,
menuMode: 'main',
commitInfo: null,
```

**1.2 — Commit info fallback:**
```js
// At the top of createInitialState(), after world generation:
const commitInfo = (typeof window !== 'undefined' && window.__COMMIT_INFO &&
    window.__COMMIT_INFO.hash &&
    !window.__COMMIT_INFO.hash.startsWith('__'))
  ? window.__COMMIT_INFO
  : { hash: 'N/A', message: 'N/A', date: 'N/A' };
```

**1.3 — Inline script (if #56 is not yet done):**
```html
<script>
  window.__COMMIT_INFO = {
    hash: "__COMMIT_HASH__",
    message: "__COMMIT_MSG__",
    date: "__COMMIT_DATE__"
  };
</script>
```

### Deliverables

- [ ] `createInitialState()` returns state with `menuIndex: 0`, `menuMode: 'main'`
- [ ] `state.commitInfo` is populated from `window.__COMMIT_INFO` or fallback
- [ ] Fallback displays `'N/A'` for all fields when metadata is missing or placeholder not replaced

---

## Phase 2: Input Handling Rewrite

**Goal:** Rewrite the title-screen keydown handler to support menu navigation (ArrowUp/ArrowDown with wrapping), selection (Enter/Space), and about-screen dismissal (any key).

**Depends on:** Phase 1 (state fields must exist for the handler to read/write)

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 2.1 | `public/gameboy.html` | Replace the entire `if (state.gameState === 'title')` block with the new menu dispatch | P0 | +30 / -5 |
| 2.2 | `public/gameboy.html` | Remove `e.code.startsWith('Arrow')` from the old condition — arrows no longer start the game | P0 | — |

### Step Details

**2.1 — New title-screen key handler structure:**

```js
if (state.gameState === 'title') {
  // ABOUT screen: any key → return to main menu
  if (state.menuMode === 'about') {
    e.preventDefault();
    state = { ...state, menuIndex: 0, menuMode: 'main' };
    render(ctx, state);
    return;
  }

  // Main menu navigation
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    e.preventDefault();
    const direction = e.code === 'ArrowUp' ? -1 : 1;
    const itemCount = 2;
    const newIndex = (state.menuIndex + direction + itemCount) % itemCount;
    state = { ...state, menuIndex: newIndex };
    render(ctx, state);
    return;
  }

  // Main menu selection
  if (e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (state.menuIndex === 0) {
      start();
    } else {
      state = { ...state, menuMode: 'about' };
      render(ctx, state);
    }
    return;
  }
}
```

**Key design decisions:**
- `menuMode === 'about'` is checked first (independent of which key is pressed)
- Navigation uses modular arithmetic for wrapping: `(index + delta + N) % N`
- `itemCount` is hardcoded as `2` for now; extract to a constant when more items are added
- `start()` function is called directly — same as before
- Failed/other keys on title screen are silently ignored (no-op)

### Deliverables

- [ ] ArrowDown/ArrowUp navigates menu items with wrapping
- [ ] Enter on START GAME starts the game
- [ ] Enter on ABOUT switches to about screen
- [ ] Any key on about screen returns to title menu
- [ ] Space also works for selection
- [ ] Non-menu keys on title screen are ignored

---

## Phase 3: Rendering — Menu & About Screen

**Goal:** Refactor `renderTitleScreen()` to draw menu items with a cursor. Add `renderAboutScreen()` for the commit metadata display.

**Depends on:** Phase 1 (state fields), Phase 2 (input handler triggers state changes that are reflected in rendering)

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 3.1 | `public/src/render/overlays.js` | Add `MENU_ITEMS` constant at top of module: `['START GAME', 'ABOUT']` | P0 | +1 |
| 3.2 | `public/src/render/overlays.js` | Replace the final "PRESS ENTER TO START" block in `renderTitleScreen()` with menu-item rendering loop | P0 | +15 / -3 |
| 3.3 | `public/src/render/overlays.js` | Add new function `renderAboutScreen(ctx, state)` — draws dark overlay + commit info | P0 | +30 |
| 3.4 | `public/src/render/overlays.js` | Update `renderOverlay()` to dispatch to `renderAboutScreen()` when `menuMode === 'about'` | P0 | +5 / -1 |

### Step Details

**3.1 — Menu items constant:**
```js
const MENU_ITEMS = ['START GAME', 'ABOUT'];
```

**3.2 — Menu rendering in renderTitleScreen():**

Replace:
```js
// Start prompt
ctx.fillStyle = PALETTE.FOOD;
ctx.font = '12px monospace';
ctx.fillText('PRESS ENTER TO START', CANVAS_SIZE / 2, 350);
```

With:
```js
// Menu items
ctx.font = '12px monospace';
ctx.textAlign = 'center';
MENU_ITEMS.forEach((item, i) => {
  const isSelected = state.menuIndex === i;
  ctx.fillStyle = isSelected ? PALETTE.FOOD : '#ccc';
  const prefix = isSelected ? '▶ ' : '  ';
  ctx.fillText(prefix + item, CANVAS_SIZE / 2, 340 + i * 20);
});
```

**3.3 — renderAboutScreen():**

```js
function renderAboutScreen(ctx, state) {
  // Dark overlay
  ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Header
  ctx.fillStyle = PALETTE.GOLD;
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ABOUT', CANVAS_SIZE / 2, 150);

  // Commit info
  const info = state.commitInfo || { hash: 'N/A', message: 'N/A', date: 'N/A' };
  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Commit:  ' + truncateHash(info.hash), 100, 200);
  ctx.fillText('Msg:     ' + truncateMessage(info.message), 100, 230);
  ctx.fillText('Date:    ' + info.date, 100, 270);

  // Footer
  ctx.fillStyle = PALETTE.FOOD;
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Press any key to return', CANVAS_SIZE / 2, 330);
}

function truncateHash(hash) {
  if (!hash || hash === 'N/A') return 'N/A';
  return hash.length > 7 ? hash.slice(0, 7) : hash;
}

function truncateMessage(msg) {
  if (!msg || msg === 'N/A') return 'N/A';
  return msg.length > 55 ? msg.slice(0, 52) + '...' : msg;
}
```

**3.4 — renderOverlay() dispatch:**
```js
if (state.gameState === 'title') {
  if (state.menuMode === 'about') {
    renderAboutScreen(ctx, state);
  } else {
    renderTitleScreen(ctx, state);
  }
}
```

### Deliverables

- [ ] Title screen renders "▶ START GAME" and "  ABOUT" with cursor on START GAME
- [ ] Cursor moves to ABOUT when `menuIndex === 1`
- [ ] About screen shows commit hash (abbreviated to 7 chars), message (truncated at 55 chars), and date
- [ ] About screen shows "N/A" when metadata is unavailable
- [ ] About screen footer: "Press any key to return"
- [ ] Existing overlay states (game-over, victory, paused) are unaffected

---

## Phase 4: Edge Cases & Integration Testing

**Goal:** Handle edge cases and ensure no regressions.

**Depends on:** Phases 1-3 complete

### Files & Changes

| # | File | Change | Priority | Lines |
|---|------|--------|----------|-------|
| 4.1 | `public/gameboy.html` | Verify that game-over restart → `init()` → title screen has clean menu state | P0 | — (no code change needed if `createInitialState()` resets state) |
| 4.2 | `tests/metroidvania-snake.test.js` | Add unit tests for state management (Groups A-E from DESIGN doc) | P0 | +40 |
| 4.3 | Manual verification | Run through all acceptance criteria | P0 | — |

### Step Details

**4.1 — Restart verification:**
- `init()` calls `createInitialState()` which sets `menuIndex: 0, menuMode: 'main'`
- No additional cleanup needed
- Verify manually by: play game → die/game-over → press Space/Enter → title screen shows correct menu state

**4.2 — Unit tests:**

Add test block for menu state:

```js
describe('Title Menu State', () => {
  it('initializes with menuIndex=0 and menuMode=main', () => {
    const state = createInitialState(generateWorldMap(5, 5));
    expect(state.menuIndex).toBe(0);
    expect(state.menuMode).toBe('main');
  });

  it('ArrowDown increments menuIndex with wrap', () => {
    const state = createInitialState(generateWorldMap(5, 5));
    const next = { ...state, menuIndex: (state.menuIndex + 1 + 2) % 2 };
    expect(next.menuIndex).toBe(1);
    const wrap = { ...state, menuIndex: (1 + 1 + 2) % 2 };
    expect(wrap.menuIndex).toBe(0);
  });

  it('Enter on menuIndex=0 starts the game', () => {
    const state = createInitialState(generateWorldMap(5, 5));
    const result = startGame(state);
    expect(result.gameState).toBe('playing');
  });

  it('Enter on menuIndex=1 switches to about', () => {
    const state = { ...createInitialState(generateWorldMap(5, 5)), menuIndex: 1, menuMode: 'about' };
    expect(state.menuMode).toBe('about');
  });

  it('any key on about returns to main menu', () => {
    const state = { ...createInitialState(generateWorldMap(5, 5)), menuMode: 'about' };
    const next = { ...state, menuIndex: 0, menuMode: 'main' };
    expect(next.menuMode).toBe('main');
    expect(next.menuIndex).toBe(0);
  });

  it('commitInfo fallback when metadata missing', () => {
    // Simulate: no window.__COMMIT_INFO
    const state = createInitialState(generateWorldMap(5, 5));
    expect(state.commitInfo.hash).toBe('N/A');
    expect(state.commitInfo.message).toBe('N/A');
    expect(state.commitInfo.date).toBe('N/A');
  });
});
```

**4.3 — Acceptance criteria checklist:**
- [ ] Title screen renders "START GAME" and "ABOUT" as selectable items
- [ ] Default cursor position on "START GAME"
- [ ] ArrowUp/ArrowDown navigates between items (wraps)
- [ ] Enter on "START GAME" starts the game
- [ ] Enter on "ABOUT" shows commit hash, message, date
- [ ] Any key on about screen returns to title menu
- [ ] Menu state resets on game restart
- [ ] Existing playing/game-over/paused controls unaffected
- [ ] All existing tests pass after changes

### Deliverables

- [ ] All edge cases handled (long messages, missing metadata, game restart)
- [ ] Unit tests for menu state management added to test suite
- [ ] Manual verification passes all acceptance criteria
- [ ] Existing test suite passes

---

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

---

## File Change Summary (All Phases)

| File | Total Lines Changed | Phases | Risk |
|------|--------------------|--------|------|
| `public/src/engine/core.js` | ~14 | 1 | 🟢 Low — new fields in state object, no logic changes |
| `public/gameboy.html` | ~35 | 2, 4 | 🟢 Low — keydown handler restructured, 1 inline script |
| `public/src/render/overlays.js` | ~52 | 3 | 🟡 Medium — canvas rendering, coordinate math, new render fn |
| `tests/metroidvania-snake.test.js` | ~40 | 4 | 🟢 Low — new test cases, no infrastructure changes |

**Total:** ~141 lines across 4 files (130 P0 + 11 P1)

---

## Rollout Strategy

1. **Phase 1 first** — establish state shape (no visual impact)
2. **Phase 2 + Phase 3 in parallel** — input + rendering can be developed independently
3. **Phase 4 last** — tests and edge case polish

Testing can begin after Phase 3 is done (manual play-testing) and finalized in Phase 4.
