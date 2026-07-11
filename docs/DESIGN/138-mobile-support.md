# Design: Mobile device game entry support (title screen touch)

> Parent Issue: #138
> Agent: plan-agent (subagent of research-agent)
> Date: 2026-07-12

---

## 1. Overview

Add touch/click handling to the title screen canvas so players on mobile devices can tap "START GAME" to begin playing, tap "ABOUT" to view the about screen, and tap anywhere on the about screen to dismiss it. Desktop mouse-click support is included automatically.

**Approach:** Canvas click/tap hit-test with coordinate mapping (Approach A from PRD).

**Scope:** ~30 lines added to `public/gameboy.html` only. No changes to game engine, overlays, or other files.

---

## 2. Module Responsibilities

| Module | File | Responsibility |
|--------|------|----------------|
| **Title touch handler** | `public/gameboy.html` (new code) | Add `click` and `touchend` listeners on the canvas that map CSS coordinates to canvas coordinates, hit-test menu items, and dispatch the same actions as the keyboard handler |
| **Keyboard handler** | `public/gameboy.html` (existing) | Unchanged — continues to handle ArrowUp/Down, Enter/Space for keyboard/mouse users |
| **Touch swipe handler** | `public/gameboy.html` (existing) | Unchanged — already gated on `gameState === 'playing'`, no conflict |
| **Touch Z/X buttons** | `public/gameboy.html` (existing) | Unchanged — already gated on `gameState !== 'playing'`, no conflict |
| **Overlay renderer** | `public/src/render/overlays.js` (existing) | No changes — menu item positions (`menuY=340`, `lineHeight=22`) are read-only constants used by the handler |
| **Game engine** | `public/src/engine/core.js` (existing) | No changes — `start()` is already exported and called from keyboard path |
| **Tests** | `tests/mobile-support.test.js` | Add unit tests for the canvas hit-test helper function and coordinate mapping |

---

## 3. Data Flow

```
Before (keyboard only):
  Keyboard Event (Enter) → keydown handler → state.menuIndex === 0 → start()
                                          → state.menuIndex === 1 → menuMode = 'about'

After (keyboard + touch/click):

  Keyboard Event (Enter)     ─┬→ keydown handler ─┬→ state.menuIndex === 0 → start()
                               │                    └→ state.menuIndex === 1 → menuMode = 'about'
                               │
  Touch/Click on canvas       ─┤
  (only in 'title' state)      │
    ↓                          │
  getCanvasCoords(e)           │
    → (clientX,clientY)        │
    → (canvasX, canvasY)       │
    ↓                          │
  hitTestMenuItem(canvasX,     │
    canvasY, menuY,            │
    lineHeight, items)         │
    ↓                          │
  If hit: dispatch action      │
    index 0 → start()          │
    index 1 → menuMode='about' │
    ───────────────────────────┘

  Touch anywhere on ABOUT screen
    → dismiss: menuMode = 'main'
```

### Coordinate Mapping

```
CSS/Client Coords                    Canvas Coords
─────────────────────                ──────────────────
clientX, clientY                     canvasX = (clientX - rect.left) * (canvas.width / rect.width)
  │                                   canvasY = (clientY - rect.top) * (canvas.height / rect.height)
  ▼
getBoundingClientRect()
  rect.left, rect.top
  rect.width, rect.height
```

### Hit-Test Logic

```
Menu items (canvas coordinates):
  CANVAS_SIZE = 400
  centerX = 200          (CANVAS_SIZE / 2)
  hitWidth = 100         (±100px from center)

  Item 0 "START GAME": Y ≈ 340,  Y range [329, 351],  X range [100, 300]
  Item 1 "ABOUT":      Y ≈ 362,  Y range [351, 373],  X range [100, 300]

  For each item i:
    yCenter = menuY + i * lineHeight
    if |canvasY - yCenter| ≤ lineHeight/2 AND |canvasX - centerX| ≤ hitWidth:
      → hit item i

  For ABOUT screen (state.menuMode === 'about'):
    Any tap anywhere → dismiss (menuMode = 'main')
```

---

## 4. Implementation Phases

### Phase 1: Add Canvas Click/Touch Handler (`public/gameboy.html`)

Add the following to `public/gameboy.html` after the existing touch handlers (~line 200), before the keydown listener:

```js
// --- Title screen touch/click handler ---
// Maps canvas CSS coordinates to internal coordinates, hit-tests menu items,
// and dispatches the same actions as the keyboard handler.

let wasTouch = false; // prevents double-fire on hybrid touch+click devices

function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function handleTitleTap(e, clientX, clientY) {
  if (!state || state.gameState !== 'title') return;

  if (state.menuMode === 'about') {
    // About screen: any tap dismisses
    state = { ...state, menuIndex: 0, menuMode: 'main' };
    render(ctx, state);
    return;
  }

  const coords = getCanvasCoords(clientX, clientY);
  const menuY = 340;
  const lineHeight = 22;
  const centerX = 200;
  const hitWidth = 100;
  const itemCount = 2; // START GAME, ABOUT

  for (let i = 0; i < itemCount; i++) {
    const yCenter = menuY + i * lineHeight;
    const inY = Math.abs(coords.y - yCenter) <= lineHeight / 2;
    const inX = Math.abs(coords.x - centerX) <= hitWidth;
    if (inY && inX) {
      if (i === 0) {
        start(); // START GAME
      } else {
        state = { ...state, menuMode: 'about' };
        render(ctx, state);
      }
      break;
    }
  }
}

// Bind click (desktop mouse, and fallback for touch devices)
canvas.addEventListener('click', (e) => {
  if (wasTouch) { wasTouch = false; return; } // suppressed by prior touch
  handleTitleTap(e, e.clientX, e.clientY);
});

// Bind touchend (immediate response on mobile, no 300ms delay)
canvas.addEventListener('touchend', (e) => {
  const touch = e.changedTouches[0];
  handleTitleTap(e, touch.clientX, touch.clientY);
  wasTouch = true; // suppress subsequent click event
  // Reset flag after a short delay so real clicks still work
  setTimeout(() => { wasTouch = false; }, 100);
});
```

**Key design decisions:**
- `touchend` fires immediately (no 300ms iOS delay) while `click` handles desktop mouse
- `wasTouch` flag prevents double-fire when both `touchend` and `click` fire on the same tap
- Handler is a no-op unless `state.gameState === 'title'` — no conflict with in-game touch controls
- Menu item constants (`menuY`, `lineHeight`, `centerX`, `hitWidth`) match overlays.js rendering
- Hit-tested with a loop (not item-specific branches) — supports future menu expansion

### Phase 2: Add Unit Tests (`tests/mobile-support.test.js`)

Add tests for the coordinate mapping and hit-test functions (see Section 6).

### Phase 3: Verification

1. Open game in Chrome DevTools mobile emulation (iPhone SE)
2. Tap "START GAME" — verify game starts
3. Tap "ABOUT" — verify about screen appears
4. Tap anywhere on about screen — verify it dismisses
5. Test desktop mouse click — verify it works
6. Test keyboard controls still work — ArrowDown, Enter
7. Run `npx vitest run` — verify all tests pass

---

## 5. Boundary Conditions & Edge Cases

| # | Condition | Handling |
|---|-----------|----------|
| 1 | Tap between items (gap between Y=351) | Neither hit box matches → no action dispatched (harmless miss) |
| 2 | Tap far outside menu area (top, edges) | `inY && inX` is false → no action dispatched |
| 3 | Canvas CSS-scaled on mobile | `getBoundingClientRect()` ratios correctly map scaled coords back to 400×400 |
| 4 | Rapid double-tap "START GAME" | First tap → state changes to playing → second tap is no-op (handler gates on 'title') |
| 5 | Touch on canvas during title, then drag | `touchend` fires with end coords; if far from menu area → miss. Swipe handler gates on 'playing' → no conflict |
| 6 | Very narrow viewport (<320px) | Canvas CSS-scales down; coordinate mapping uses ratios, still correct |
| 7 | High-DPI / Retina display | `canvas.width / rect.width` ratios work correctly regardless of devicePixelRatio |
| 8 | Hybrid device (touch + mouse) | `wasTouch` flag + 100ms timeout prevents double-fire; subsequent mouse clicks still work after timeout expires |
| 9 | Game restarted (game over → init) | Handler is persistent (added once, never removed); re-entering 'title' state activates it again |
| 10 | `getBoundingClientRect()` zero-dimensions | Should not happen — canvas is always rendered; if it does, the handler silently does nothing |
| 11 | Future menu items added (e.g., SETTINGS) | Loop-based hit-test auto-handles >2 items; increment `itemCount` and adjust Y calcs from constants |
| 12 | Future `menuY`/`lineHeight` changes in overlays.js | Must update corresponding constants in the touch handler — document dependency |

---

## 6. Test Plan

### New Tests for `tests/mobile-support.test.js`

Add a new `describe('Mobile Support — Title Screen Touch', () => { ... })` block with:

1. **Coordinate mapping** — `getCanvasCoords()` maps client coords to internal 400×400 coords
   - Test with unscaled canvas (rect.width === canvas.width)
   - Test with scaled canvas (e.g., 800px CSS → rect.width=400, canvas.width=200, ratio=0.5)

2. **Hit-test "START GAME"** — a tap at canvas (200, 340) hits item 0

3. **Hit-test "ABOUT"** — a tap at canvas (200, 362) hits item 1

4. **Hit-test miss** — a tap at canvas (50, 50) hits nothing

5. **Hit-test between items** — a tap at canvas (200, 352) hits nothing (in the gap)

6. **State gate** — handler is no-op when `gameState !== 'title'`

7. **About screen dismiss** — any tap in about mode sets `menuMode = 'main'`

8. **Edge of hit zone** — tap at (100, 340) hits; tap at (99, 340) misses

---

## 7. Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `public/gameboy.html` | latest | Target file for the touch handler addition |
| `public/src/render/overlays.js` | latest | Source of menu position constants (menuY, lineHeight) — read-only |
| `public/src/engine/core.js` | latest | Exports `start()` — used when "START GAME" is tapped |
| `tests/mobile-support.test.js` | latest | Add unit tests for the new handler |
| vitest | project | Test runner |

**No new dependencies required** — all functionality uses existing DOM APIs (`getBoundingClientRect`, `addEventListener`, canvas element).

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Coordinate constants drift from overlays.js | Low (menu stable since #66) | High (wrong hit zones) | Document dependency; add a comment in the handler pointing to overlays.js |
| iOS double-fire (touchend → click) | Certain | Medium (double-start) | `wasTouch` flag with 100ms timeout |
| Touch event prevents scroll on page | Medium | Low (game is fullscreen) | Use `passive: true` where possible; don't call `preventDefault()` unless needed |
| Conflicts with existing touch handlers | Very low | High | Handler gated on `gameState === 'title'`; existing handlers gate on `!== 'title'` / `=== 'playing'` — mutually exclusive states |
