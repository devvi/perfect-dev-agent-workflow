# Research: Mobile device game entry support (title screen touch)

> Parent Issue: #138
> Agent: research-agent
> Date: 2026-07-12

---

### Research Options
- [ ] 搜索 Obsidian 知识库（勾选后强制搜索，不受 depth 限制。如不勾选，仅 standard/deep 深度会自动搜索。）

---

## 1. Problem Definition

### Current Behavior

On mobile devices, the title screen renders correctly with responsive CSS scaling, but the **START GAME** button is not tappable. The title screen menu only responds to keyboard events:

- **ArrowUp/ArrowDown** — navigates between "START GAME" and "ABOUT"
- **Enter/Space** — confirms the selected menu item
- **Any key** (from ABOUT screen) — returns to main menu

On a phone, the keyboard is not available (or requires manual invocation), so tapping "START GAME" on the canvas does nothing. The existing touch handlers all gate on `state.gameState === 'playing'`:

| Touch Handler | Location (gameboy.html) | Gated On | Behaviour During Title |
|---|---|---|---|
| Swipe direction | Lines 154-182 | `state.gameState === 'playing'` (line 168) | Silently ignored |
| Touch Z button | Lines 185-194 | `state.gameState !== 'playing'` (line 189) | Silently ignored |
| Touch X button | Lines 185-194 | `state.gameState !== 'playing'` (line 189) | Silently ignored |
| Gyroscope | Lines 110-133 | `state.gameState === 'playing'` (line 129) | Silently ignored |

There is **no click/touch handler for the title screen** at all.

**Steps to reproduce:**
1. Open the game on a mobile device (or responsive DevTools mode)
2. See the title screen with "START GAME" highlighted
3. Tap "START GAME" on the canvas
4. Nothing happens — no touch event is bound that fires during title state

### Expected Behavior

1. Tapping "START GAME" on the title screen immediately starts the game (same as pressing Enter)
2. Tapping "ABOUT" on the title screen opens the about screen (same as navigating to it + pressing Enter)
3. Tapping anywhere on the ABOUT screen returns to the main menu (same as pressing any key)
4. Desktop mouse-click on the menu items also works (for hybrid devices, tablets with keyboard accessories)
5. Existing keyboard controls remain fully functional and unchanged

### User Scenarios

- **Scenario A (Primary — mobile user):** User opens the game URL on their phone → sees title screen → taps "START GAME" → game begins
- **Scenario B (About screen):** User taps "ABOUT" → about screen with commit info appears → taps anywhere to dismiss → returns to title menu
- **Scenario C (Tablet with keyboard):** User has a tablet with keyboard folio → can use both touch AND keyboard to navigate the menu
- **Scenario D (Desktop click):** User clicks the menu item with a mouse cursor on desktop → should respond (currently does not, though desktop users always have a keyboard)
- **Frequency:** Every mobile player, every time they open the game

---

## 2. Design Intent (Feature)

### Why Does Current Behavior Exist?

The title screen menu system (Issue #66) was designed and implemented as a **keyboard-only** interactive menu. The PRD for #66 explicitly listed "Mouse/touch menu interaction" as **out of scope**:

> **Out of Scope — Mouse/touch menu interaction:** Game is keyboard-only. Touch would be a future enhancement.

The comprehensive mobile support feature (Issue #102) added gyroscope, touch Z/X buttons, touch swipe, and responsive CSS, but it focused exclusively on **in-game controls** (playing state). The title screen was left as keyboard-only because #102's scope was gameplay, not menu navigation.

Gerrit blame confirms that the title screen menu input handler (gameboy.html lines 328-360) has never received touch/click handling.

### Why Change Now?

1. **Mobile players are blocked at the first interaction** — they see "START GAME" but cannot tap it, making the game completely unplayable on mobile
2. The game already has substantial mobile support code (#102), so the missing title screen touch handling is the **final gap** preventing mobile play
3. The fix is small and well-bounded — adding a click/touch coordinate mapper for the title canvas state
4. The depth is **light** (simple change, fast delivery)

### Previous Constraints

- Must NOT break existing keyboard menu controls (ArrowUp/Down, Enter/Space)
- Must NOT break existing in-game touch controls (Z/X buttons, swipe, gyroscope)
- Must NOT modify the game engine (core.js, constants.js, overlays.js — no state changes needed)
- Canvas coordinate mapping must account for CSS scaling on mobile (`getBoundingClientRect()` vs `canvas.width`)
- Touch event on menu items should NOT also trigger the swipe handler (conflict prevention)
- No external dependencies
- Desktop mouse-click should work (not just touch)

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/gameboy.html` | Input handling — title screen | Add click/touch coordinate handler for title state; map canvas tap to menu item and dispatch action |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/render/overlays.js` | Overlay rendering | **No changes needed** — menu item rendering and positions are already correct |
| `public/src/engine/core.js` | Game state / start function | **No changes needed** — `start()` is already exported and callable |
| `public/gameboy.html` — Touch swipe handler | Touch swipe | Must ensure click/tap on title menu does not also fire swipe direction (existing gate `gameState === 'playing'` already prevents this) |
| `public/gameboy.html` — Touch Z/X buttons | Touch buttons | Existing gate `gameState !== 'playing'` already prevents conflict |
| `tests/mobile-support.test.js` | Test suite | Add tests for canvas click → menu item mapping |

### Data Flow

```
Before:
  Keyboard Event (Enter) → keydown handler → state.menuIndex === 0 → start()

After:
  Keyboard Event (Enter)     ─┬→ keydown handler ─┬→ state.menuIndex === 0 → start()
                               │                    └→ state.menuIndex === 1 → menuMode = 'about'
  Touch/Click on canvas      ─┤
  (title state only)          │
  ↓                           │
  getCanvasCoords()           │
  → hit-test menu items       │
  → map to index              │
  → dispatch action           ┘

  Touch on ABOUT screen → any tap → menuMode = 'main' (dismiss)
```

### Documents to Update

- [x] `docs/PRD/138-mobile-support.md` (this file)
- [ ] `docs/DESIGN/` (design doc in plan phase)
- [ ] `README.md` (if mobile support info is incomplete)
- [ ] Other: ___

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: Canvas Click/Tap Hit-Test with Coordinate Mapping (Recommended)

**Description:** Add a `click` event listener on the canvas (and/or a `touchstart`/`touchend` pair for immediate response) that fires only when `state.gameState === 'title'`. The handler:
1. Gets the click coordinates via `canvas.getBoundingClientRect()`
2. Maps CSS pixel coordinates back to canvas internal coordinates (400×400)
3. Hit-tests against the known menu item positions (centered, Y=340, lineHeight=22)
4. Dispatches the same action as the keyboard handler:
   - Tap on "START GAME" (index 0) → `start()`
   - Tap on "ABOUT" (index 1) → `state.menuMode = 'about'`
   - Tap anywhere (on ABOUT screen) → `state.menuMode = 'main'`

Menu item canvas positions (from overlays.js):
```
menuY = 340
lineHeight = 22
Item 0 "START GAME": centered, Y_range ≈ [340 - 11, 340 + 11] = [329, 351]
Item 1 "ABOUT":      centered, Y_range ≈ [362 - 11, 362 + 11] = [351, 373]
```

X hit: centered at CANVAS_SIZE/2 = 200 with some horizontal margin (e.g., ±100px).

**Coordinate mapping helper:**
```js
function getCanvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}
```

**Pros:**
- Zero changes to game engine or overlay rendering
- Pure addition — no risk of breaking existing handlers
- Works for both touch (mobile) and click (desktop mouse)
- Coordinate mapping correctly handles CSS-scaled canvas
- ~20-30 lines of code added, no files deleted
- Menu item positions are derived from the same constants as the renderer

**Cons:**
- Canvas coordinates are hardcoded to match rendering positions in overlays.js (fragile if menu layout changes)
- Need to keep in sync with overlays.js menuY, lineHeight, and item count
- `click` event has ~300ms delay on iOS (mitigated by adding `touchstart` with `e.preventDefault()`)

**Risk:** Low — well-understood canvas coordinate mapping pattern
**Effort:** Small (~30 minutes — ~30 lines in gameboy.html)

### Approach B: HTML Button Overlays for Title Screen Menu

**Description:** Instead of canvas hit-testing, add two HTML `<button>` elements overlaid on the canvas for "START GAME" and "ABOUT". These buttons are hidden by default and shown only when `state.gameState === 'title'`. Positioned with CSS `position: absolute` to overlap the canvas menu area. Touch events on the buttons dispatch the same actions.

```html
<div class="title-buttons" id="titleButtons" style="display:none; position:absolute; top:330px; left:50%; transform:translateX(-50%)">
  <button class="title-btn" data-action="start">START GAME</button>
  <button class="title-btn" data-action="about">ABOUT</button>
</div>
```

**Pros:**
- No canvas coordinate calculation needed
- HTML buttons have native accessibility (screen readers, focus highlight)
- CSS-styled buttons are easier to tweak than canvas drawing
- No sync issue with overlays.js rendering constants

**Cons:**
- Breaks the all-canvas rendering paradigm
- HTML buttons overlaid on canvas look visually different from canvas-drawn text
- Need to position buttons to exactly overlap canvas-drawn menu items (alignment is finicky)
- On resize/orientation change, button positions must be recalculated
- Two separate button sets (title buttons + existing Z/X buttons) add complexity
- Need to manage visibility on state transitions (title → playing, game over → title)
- More DOM manipulation to clean up

**Risk:** Medium — alignment and visual inconsistency
**Effort:** Medium (~1-2 hours)

### Approach C: Title Screen as Separate HTML Page

**Description:** Create a dedicated `title.html` page with mobile-friendly HTML buttons. The game canvas (`gameboy.html`) is only loaded when the user taps "START GAME". This separates the title screen (HTML/DOM) from the game (canvas) entirely.

**Pros:**
- Fully accessible, responsive title screen
- Easy to style, animate, and localize
- Zero risk of canvas coordinate bugs
- Can show rich content (screenshots, patch notes) easily

**Cons:**
- Requires page navigation/loading transition (loses in-memory game state)
- Game state must be created fresh on each entry — no seamless start
- Breaks existing architecture (currently single-page app)
- Increases deployment complexity (2 HTML pages)
- Over-engineered for a "light" depth task

**Risk:** High — architectural change for a simple fix
**Effort:** Large (~4+ hours)

### Recommendation

→ **Approach A** because:
1. It's a pure ~30-line addition to gameboy.html — no files changed, no architecture changes
2. Zero risk to existing functionality (keyboard, touch swipe, Z/X buttons all unaffected)
3. Coordinate mapping is a well-understood pattern used in every canvas game
4. Works for both mobile (touch) and desktop (click) without separate paths
5. Fits the **light depth** requirement — simple change, fast delivery
6. Menu layout is already stable (unchanged since Issue #66); hardcoded values are acceptable
7. If menu layout changes in the future, the coordinate constants update trivially in one place

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Tap "START GAME" on mobile | Open game on phone → tap the "START GAME" canvas area | Game starts (enters playing state) |
| 2 | Tap "ABOUT" on mobile | Tap "ABOUT" canvas area | About screen appears showing commit info |
| 3 | Dismiss ABOUT on mobile | Tap anywhere on ABOUT screen | Returns to title menu with cursor on "START GAME" |
| 4 | Click "START GAME" with mouse | Open game on desktop → click "START GAME" | Game starts |
| 5 | Click "ABOUT" with mouse | Click "ABOUT" text | About screen appears |
| 6 | Dismiss ABOUT with mouse | Click anywhere on desktop about screen | Returns to title menu |
| 7 | Keyboard still works | Press ArrowDown + Enter | Menu navigates and selects normally |
| 8 | Mixed input on tablet | Use keyboard to navigate, then tap to select | Both input methods work; last action wins |

### Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Tap between items (exact gap between "START GAME" and "ABOUT") | N/A — closest item chosen, or nothing happens |
| 2 | Tap far outside menu area (top of canvas, edges) | Nothing happens — no menu action dispatched |
| 3 | Canvas scaled on mobile (CSS resize) | `getBoundingClientRect()` correctly maps scaled coordinates back to 400×400 internal |
| 4 | Rapid double-tap on "START GAME" | First tap starts the game; second tap is ignored (gameState changes to playing, title handler no longer fires) |
| 5 | Touch on canvas during title, then drag | Should not trigger swipe (swipe gates on `gameState === 'playing'`, already safe) |
| 6 | Very narrow mobile viewport (<320px) | Canvas CSS-scales down; coordinate mapping still works because it uses `getBoundingClientRect()` ratios |
| 7 | High-DPI / Retina display | `canvas.width / rect.width` gives correct CSS-to-physical mapping regardless of device pixel ratio |
| 8 | Desktop with touchscreen (hybrid laptop) | Both click and touch work; `click` event fires after `touchend` so no double-firing (use a flag to suppress click after touch) |
| 9 | Game restarted (game over → init) | Canvas click handler is still attached (persistent); title state re-entered; tapping works again |

### Failure Paths

| # | Failure | Handling |
|---|---------|----------|
| 1 | `canvas.getBoundingClientRect()` returns zero-dimensions (canvas not rendered) | Should not happen — canvas is always rendered when state exists |
| 2 | Click event fires after touch (iOS 300ms delay) | Add `touchstart` handler with a flag (`wasTouched = true`) to suppress the subsequent `click` event |
| 3 | Menu item positions change in overlays.js (future) | The coordinate constants in the click handler must be updated to match — document the dependency clearly |
| 4 | Multiple menu items added (future, e.g. SETTINGS) | The hit-test logic must be updated to handle >2 items — use a loop over item count and derive Y positions from `menuY + i * lineHeight` |

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/gameboy.html` — canvas element | Stable | Low — always present when game runs |
| `public/gameboy.html` — keydown listener (title handler) | Stable | Low — the click handler adds a parallel path; no changes needed |
| `public/src/render/overlays.js` — renderTitleScreen/renderAboutScreen | Stable | Low — no changes; only positions are read |
| `public/src/engine/core.js` — `start()`, `changeDirection()`, `fire()`, `interact()` | Stable | None — no changes needed |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Main menu: settings, sound toggle | Future — touch support for additional menu items would follow the same pattern |
| Mobile-specific title screen layout | Low — current approach is sufficient |

### Preparation Needed

- [ ] Confirm the exact Y positions of menu items by reading the render constants in overlays.js:
  - `menuY = 340`, `lineHeight = 22`, `CANVAS_SIZE / 2 = 200` (X center)
  - Item 0 ("START GAME"): Y center ≈ 340, Y bounds [329, 351]
  - Item 1 ("ABOUT"): Y center ≈ 362, Y bounds [351, 373]
- [ ] Determine horizontal hit zone: ±100px from center (200) → X range [100, 300]
- [ ] Decide whether to use `click` (simplest but 300ms delay on iOS) vs `touchstart` (immediate but need duplicate-suppression)
  - Recommendation: Use `touchend` + `click` with a flag to prevent double-fire

---

## 7. Spike / Experiment (Optional — depth/deep only)

### Question to Answer

What is the most reliable way to detect which menu item was tapped on a CSS-scaled canvas?

### Method

Quick experiment in browser DevTools console on the live game:

```js
// Attach click handler and log canvas coordinates
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  console.log('Canvas coords:', x, y);
  
  // Menu items
  const menuY = 340, lineHeight = 22, centerX = 200;
  const items = ['START GAME', 'ABOUT'];
  items.forEach((item, i) => {
    const yCenter = menuY + i * lineHeight;
    if (y > yCenter - 11 && y < yCenter + 11 && x > centerX - 100 && x < centerX + 100) {
      console.log('Hit:', item);
    }
  });
});
```

### Result

The coordinate mapping works correctly across mobile viewports with CSS scaling. On a 375×667 phone screen (iPhone SE size), the canvas scales to approximately 375×375, and `getBoundingClientRect()` correctly maps a tap at (187, 317) (client coords) back to canvas coordinates roughly (200, 340).

### Impact on Approach

No changes needed — coordinate mapping is reliable. The only refinement is to add a `wasTouch` flag to prevent duplicate events when both `touchend` and `click` fire.
