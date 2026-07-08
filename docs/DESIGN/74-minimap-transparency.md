# Design: #74 — 小地图半透明 (Minimap Semi-Transparent)

> Parent Issue: #74
> Plan Agent: subagent
> Date: 2026-07-09

---

## 1. Architecture Overview

The minimap is rendered as a canvas overlay in the bottom-right corner of the game's 400×400 canvas. The rendering lives in a single function `renderMinimap()` inside `public/src/render/minimap.js`, called each frame from the main render pipeline.

```
renderer.js — renderFrame()
  │
  ├─ renderBackground()
  ├─ renderRooms()
  ├─ renderDoors()
  ├─ renderEntities()
  └─ renderMinimap()      ← single rendering function
       │
       ├─ ctx.save()
       ├─ Draw background fillRect     → alpha changed (0.85 → 0.50)
       ├─ Draw grid lines              → unmodified
       ├─ Draw explored room tiles     → unmodified
       ├─ Draw door indicators         → unmodified
       ├─ Draw player dot              → unmodified
       ├─ Draw border                  → unmodified
       ├─ Draw label "MAP"             → unmodified
       └─ ctx.restore()
```

### Data Flow (unchanged)

```
gameState.world.mapLayout   ──┐
gameState.world.exploredMap ──┤──► renderMinimap() ──► Canvas 2D
gameState.player.position   ──┘
```

No data flow changes. The same state is consumed; only the background `fillStyle` alpha value changes.

---

## 2. Module Impact

### 2.1 Files Changed

| File | Change | Lines Affected |
|------|--------|---------------|
| `public/src/render/minimap.js` | Background `fillStyle` alpha: `0.85` → `0.50` | 1 line |

### 2.2 Files Not Changed

| File | Reason |
|------|--------|
| `public/src/engine/constants.js` | No constant changes needed; all existing PALETTE values remain correct |
| `public/src/render/renderer.js` | Render pipeline unaffected; `renderMinimap()` call unchanged |
| `public/src/engine/core.js` | No gameplay logic changes |
| `public/src/engine/collision.js` | No collision logic changes |
| `public/src/engine/input.js` | No input handling changes |
| `tests/metroidvania-snake.test.js` | Existing minimap test is data-only (explored room count); may add visual tests |

---

## 3. Rendering Details

### 3.1 Background Alpha Selection

Per the PRD's recommendation (Alternative A):

```js
// Before
ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
// After
ctx.fillStyle = 'rgba(10, 10, 26, 0.50)';
```

**Rationale:**
- `0.50` provides the best balance of see-through visibility and room color contrast
- Room tile colors (green `#306230`, gold `#FFD700`, red `#FF4444`, blue `#AACCFF`, fog `#0A0A1A`) remain distinguishable
- Player dot (`#00FF88`, full opacity) remains clearly visible
- Grid lines (`rgba(48, 98, 48, 0.3)`) remain visible through the dimmed background
- Border stroke (`#306230`, full opacity) remains unchanged
- Label "MAP" text remains at full opacity

### 3.2 Rendering Order (unchanged)

1. Save context
2. Draw background rectangle (alpha 0.50)
3. Draw grid lines inside minimap
4. Draw explored room tiles (colored rectangles)
5. Draw door indicators (small colored circles at edges)
6. Draw fog / unexplored tiles
7. Draw player position dot (fully opaque `#00FF88`)
8. Draw border stroke
9. Draw "MAP" label text
10. Restore context

All layers EXCEPT the background fillRect remain at their current alpha values.

---

## 4. Test Specifications

### 4.1 Unit Tests (minimap-rendering focused)

| # | Test | Input | Expected |
|---|------|-------|----------|
| UT1 | Background alpha value | Inspect `rgba()` string in source | Alpha component is `0.50` (or equivalently `0.5`) |
| UT2 | Room tile colors unchanged | Compare `fillStyle` values for tile rendering | All room type colors match PALETTE constants (no change) |
| UT3 | Player dot opacity | Inspect player dot rendering code | Player dot `fillStyle` is unchanged (full opacity) |
| UT4 | Grid line alpha unchanged | Inspect grid line rendering code | Grid line `rgba` matches original values |
| UT5 | Border unchanged | Inspect border stroke style | Border `strokeStyle` unchanged |

### 4.2 Integration Tests

| # | Test | Setup | Expected |
|---|------|-------|----------|
| IT1 | Minimap renders without error | Create game state with 4 explored rooms | `renderMinimap()` completes without throwing |
| IT2 | Explored room count correct | Create state with 8 explored rooms | Minimap still renders 8 room tiles |
| IT3 | Player position dot visible | Player at (320, 320) (minimap zone) | Player dot renders at correct minimap position |

### 4.3 Visual / Acceptance Tests

| # | Test | Criteria |
|---|------|----------|
| VT1 | Semi-transparent background | When a bright room entity (gold/save) is in the bottom-right area, its color is visible through the minimap background |
| VT2 | Room colors distinguishable | All room type colors (green, gold, red, blue, fog) can be identified on the minimap |
| VT3 | Player dot not obscured | The player position dot remains clearly visible against the semi-transparent background |
| VT4 | Grid lines visible | Grid lines are still noticeable through the minimap area |
| VT5 | Label readable | "MAP" text is clearly readable |

### 4.4 Test Scope

- All existing tests in `tests/metroidvania-snake.test.js` must continue to pass (no regression)
- No new test file required — unit tests can be added to the existing test suite
- Visual tests are manual/inspection-based (canvas pixel validation is fragile)

---

## 5. Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Bright room behind minimap (white/dirt) | Room tiles may have reduced contrast; colors still distinguishable |
| 2 | Dark room behind minimap (cave/void) | Minimap background nearly blends with dark room; grid lines and borders maintain visibility |
| 3 | Multiple colored tiles stacked behind minimap | Semi-transparent background acts as a dark tint overlay |
| 4 | Screen-wide flash effects | Flash renders over minimap; background transparency does not interfere |
| 5 | GameBoy color palette selected | Same transparency behavior regardless of palette |
| 6 | Fog-of-war tiles | Fog tiles (`#0A0A1A`) match background color exactly; transparency doesn't affect fog distinction |

---

## 6. Out of Scope

| Item | Rationale |
|------|-----------|
| Minimap resize | Not requested (MINIMAP_SIZE = 100 stays) |
| Minimap repositioning | Not requested (stays bottom-right) |
| Toggle-able transparency/keybind | Adds scope; static alpha per PRD decision |
| Minimap fade-in animation | Not requested |
| Player dot glow/blink changes | Not requested; current blink is sufficient |
| Room color palette changes | Colors defined in constants; scope is transparency only |
| Minimap data source changes | No state/world changes needed |
