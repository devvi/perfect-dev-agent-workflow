# Implementation Plan: Issue #22 — 关卡障碍死亡惩罚迭代

> Parent Issue: [#22](https://github.com/devvi/perfect-dev-agent-workflow/issues/22)
> Status: Plan
> Agent: plan-agent
> Date: 2026-07-07

---

## Overview

Current behavior: all wall/obstacle collisions (`CELL.WALL`, `CELL.STONE_WALL`) trigger **instant death** (game over). This punishes minor navigation mistakes and shortens play sessions.

**Goal:** Differentiate collision penalties into three tiers:

| Tier | Collision Target | Penalty | Screen Shake |
|------|-----------------|---------|-------------|
| 1 | Room border walls & interior obstacles (WALL, STONE_WALL) | Lose 1 length segment | ✅ Yes |
| 2 | Special lethal obstacles (new DEATH_WALL) | Instant game over | ❌ No |
| 3 | Enemy contact (existing) | Lose 1 length segment | ✅ Yes (ADD) |

This increases average play-session length, provides tactile feedback (screen shake), and enables richer level design through lethal hazard zones.

---

## Current Architecture

### Cell Types (in `constants.js`)

| Constant | Value | Current Collision Behavior |
|----------|-------|---------------------------|
| `CELL.FLOOR` | 0 | Passable |
| `CELL.WALL` | 1 | Instant death |
| `CELL.CRACKED_WALL` | 2 | Passable (can be destroyed by projectiles) |
| `CELL.DOOR` | 3 | Room transition trigger |
| `CELL.STONE_WALL` | 4 | Instant death |

### Collision Flow (current)

```
tick() in core.js
  → checkSnakeCollision() in collision.js
    → CELL.WALL or CELL.STONE_WALL → returns ['wall']
    → CELL.DOOR → returns ['door']
    → Enemy overlap → returns ['enemy']
    → Self collision → returns ['self']
    → Food → returns ['food']
  → In tick(): 'wall' → gameover immediately
  → In tick(): 'enemy' → length - 1
```

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `public/src/engine/constants.js` | Constants & enums | ~100 |
| `public/src/engine/collision.js` | Collision detection | ~100 |
| `public/src/engine/core.js` | Game loop & state updates | ~250 |
| `public/src/engine/generator.js` | Map generation, tile placement | ~650 |
| `public/src/render/room.js` | Room tile/entity rendering | ~350 |
| `public/src/render/renderer.js` | Master render dispatch | ~50 |
| `public/src/render/hud.js` | HUD overlay | ~80 |
| `public/src/engine/world.js` | Room/world data helpers | ~150 |
| `tests/metroidvania-snake.test.js` | Test cases | ~550 |

---

## Proposed Changes

### 1. `public/src/engine/constants.js` — Add DEATH_WALL cell type

```js
CELL.DEATH_WALL = 5; // Instant-death obstacle/lava/spike
```

### 2. `public/src/engine/collision.js` — Modify collision returns

- `CELL.WALL` and `CELL.STONE_WALL` → return `['damage']` instead of `['wall']`
- `CELL.DEATH_WALL` → return `['death']`
- Keep `['self']` → instant death (unchanged)
- Keep enemy collision as `['enemy']` (unchanged)

### 3. `public/src/engine/core.js` — Handle new collision types in tick()

- Handle `'damage'`: remove 1 tail segment, set `state.screenShake = shakeConfig`
- Handle `'death'`: set `state.gameState = 'gameover'`, return immediately
- Handle `'enemy'`: also set `state.screenShake` (add screen shake to enemy contact)
- Remove the old `'wall'` collision handler
- After all collision processing: if `snake.length === 0`, set gameover

**State additions:**
```js
screenShake: {
  intensity: 3,    // max pixel offset
  duration: 300,   // ms
  elapsed: 0,      // ms elapsed
  decay: 0.7,      // multiplier per tick
}
```

### 4. `public/src/render/renderer.js` — Implement screen shake

- Before rendering each frame, check `state.screenShake`
- If active: apply random offset via `ctx.translate(dx, dy)` where dx/dy are random within current intensity
- After rendering: restore transform via `ctx.setTransform()` or save/restore
- On each tick: advance `screenShake.elapsed`, reduce `screenShake.intensity` by `decay`
- When elapsed >= duration: clear screenShake state

### 5. `public/src/render/room.js` — Render DEATH_WALL tiles

Add render case for `CELL.DEATH_WALL`:
- Red/lava base color (e.g., `#cc3300` or `#ff4422`)
- Overlay effect: animated glow or pulsing pattern (use `Date.now()` for animation)
- Or: spike-like triangles drawn on top

### 6. `public/src/engine/generator.js` — Place DEATH_WALL in rooms

Modify `generateRoomTiles()`:
- Replace some interior `CELL.WALL` clusters with `CELL.DEATH_WALL` in rooms far from start (distance >= 2)
- Probability: ~15% chance per wall cluster in rooms with distance >= 2
- Never place DEATH_WALL in start, save, gacha rooms
- Ensure safe path through door remains clear (doors should never be DEATH_WALL)

### 7. `public/src/engine/world.js` — No structural changes needed

Default tile generation (`generateDefaultTiles()`) uses `CELL.WALL` for border walls. These will now be non-lethal (damage only), which is correct behavior.

### 8. `public/src/render/hud.js` — Optional: Collision damage flash

When collision damage occurs, briefly flash HUD red or show a small "💥" indicator.

---

## Implementation Steps

### Phase A: Core Logic Changes (collision + state)

**Files:** `constants.js`, `collision.js`, `core.js`

1. Add `CELL.DEATH_WALL = 5` to constants
2. Modify `checkSnakeCollision()`:
   - `CELL.WALL` and `CELL.STONE_WALL` → `['damage']`
   - `CELL.DEATH_WALL` → `['death']`
3. Modify `tick()`:
   - Replace `'wall'` handler → `'damage'` handler (length - 1 + screenShake init)
   - Add `'death'` handler → gameover
   - Add screenShake state to `initialState` (default null)
   - Add screenShake decay tick logic
   - Enemy collision: also set screenShake

### Phase B: Screen Shake Render Implementation

**Files:** `renderer.js`, `room.js`

1. Add `renderScreenShake()` wrapper:
   - Read `state.screenShake`, if active → save context, translate, render, restore
2. Add DEATH_WALL visual rendering in `renderRoom()`:
   - Red/lava tile with pulsing animation

### Phase C: Generator Changes & Enemy Shake

**Files:** `generator.js`, `hud.js`

1. Modify `generateRoomTiles()` to place DEATH_WALL in distant rooms
2. Add brief HUD damage flash on collision

### Phase D: Tests

**File:** `tests/metroidvania-snake.test.js`

1. Wall collision (room border) → length-1, no gameover
2. Interior wall collision → length-1, no gameover
3. DEATH_WALL collision → gameover
4. Length-1 snake hitting wall → gameover (length reaches 0)
5. ScreenShake state is set on damage collision
6. ScreenShake decays over time
7. Enemy contact triggers screenShake
8. Self-collision still causes instant gameover

---

## Files to Modify

| File | Change Type | Description |
|------|------------|-------------|
| `public/src/engine/constants.js` | ✅ Add constant | Add `CELL.DEATH_WALL = 5` |
| `public/src/engine/collision.js` | ✅ Modify | `WALL/STONE_WALL → 'damage'`, `DEATH_WALL → 'death'` |
| `public/src/engine/core.js` | ✅ Modify | New collision handlers, screenShake state & decay |
| `public/src/render/renderer.js` | ✅ Modify | Screen shake ctx.translate integration |
| `public/src/render/room.js` | ✅ Modify | DEATH_WALL visual rendering |
| `public/src/engine/generator.js` | ✅ Modify | Place DEATH_WALL in distant rooms |
| `public/src/render/hud.js` | 🟡 Optional | Damage flash indicator |
| `tests/metroidvania-snake.test.js` | ✅ Add tests | 8 new test cases |

---

## Testing Strategy

### Existing Tests Impact

- **`metroidvania-snake.test.js`**: The test "detects wall collision at room boundary" still works (returns `'damage'` now instead of `'wall'`). Update assertion to expect `'damage'`.
- **`gameboy-vercel.test.js`**: Unrelated — no changes needed.

### New Test Cases

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Border wall collision loses 1 length | Snake head at wall, direction into wall | `snake.length === prevLen - 1`, `gameState === 'playing'` |
| 2 | Interior wall cluster collision loses 1 length | Same for interior CELL.WALL | Same as above |
| 3 | STONE_WALL collision loses 1 length | Same for CELL.STONE_WALL | Same as above |
| 4 | DEATH_WALL collision causes game over | Head at DEATH_WALL cell | `gameState === 'gameover'` |
| 5 | Length-1 hits wall → gameover | Snake length=1 heading into wall | `gameState === 'gameover'` |
| 6 | ScreenShake set on damage collision | After `tick()` with wall collision | `state.screenShake !== null` |
| 7 | ScreenShake decays over ticks | Multiple ticks after damage | `state.screenShake.intensity` decreases |
| 8 | Enemy contact sets screenShake | Snake head overlaps enemy | `state.screenShake` is set |
| 9 | Self-collision still gameover | Head runs into body | `gameState === 'gameover'` |
| 10 | Food + wall collision same tick | Both food and wall at next head | Damage processed first (no food growth) |

### Manual Test Checklist

- [ ] Navigate into a border wall → lose 1 length, screen shakes, no gameover
- [ ] Navigate into interior obstacle → lose 1 length, screen shakes
- [ ] Touch enemy → lose 1 length, screen shakes
- [ ] Find a room with red/lava DEATH_WALL → touching it = gameover
- [ ] Snake at length 1 hits wall → gameover (length reaches 0)
- [ ] Screen shake not nauseating (max ±3px, <500ms)
- [ ] DEATH_WALL visually distinct from normal walls

---

## Migration / Compatibility

- **Existing save files**: No changes — save format doesn't include collision state
- **Existing test assertions**: Update the `checkSnakeCollision` test to expect `'damage'` instead of `'wall'`
- **Visual feedback**: Only affects new DEATH_WALL rendering; existing tiles unchanged
