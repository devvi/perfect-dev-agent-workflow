# Design: #70 — Food Collision Returns `damage` Instead of `food`

> Parent Issue: #70
> Agent: subagent
> Date: 2026-07-09

---

## 1. Architecture Overview

The collision detection pipeline is split across two modules:

```
┌─────────────────────────────────────────────────────────────────┐
│ collision.js — checkSnakeCollision(head, snake, state)           │
│                                                                   │
│  1. Bounds check        → return ['damage']   (world boundary)    │
│  2. Cell type tile check → return ['death']   (SPIKE/DEATH_WALL)  │
│                         → return ['damage']   (WALL/STONE_WALL)   │
│                                                                    │
│                         ← EARLY RETURN — entity checks never run  │
│                                                                    │
│  3. Door / cracked wall → results.push('door')                    │
│  4. Self collision      → return ['self']                         │
│  5. Entity checks       → results.push('food')                    │
│                         → results.push('enemy')                   │
│                         → results.push('save_point')              │
│                         → results.push('gacha')                   │
└─────────────────────────┬─────────────────────────────────────────┘
                          │ collisions array returned to caller
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│ core.js — tick(state)                                             │
│                                                                   │
│  1. Room transition (checkRoomTransition)                          │
│  2. checkSnakeCollision → collisions array                         │
│  3. Death handling      → collisions.includes('death') → gameover │
│  4. Self collision      → collisions.includes('self')  → tail pop │
│  5. Wall damage         → collisions.includes('damage')→ stuck    │
│                           └─ early return — food never processed  │
│  6. Food handling       → collisions.includes('food') → grow+score│
│  7. Enemy handling      → collisions.includes('enemy') → tail pop │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

### The Bug

In `checkSnakeCollision()` (line 78–80 of `collision.js`), WALL and STONE_WALL cells trigger an **early return `['damage']`** before the entity loop ever runs. When food exists at the same position as a WALL/STONE_WALL tile, the function returns `['damage']` and the food is never detected.

In `tick()` (core.js), when `collisions.includes('damage')` is true, the handler applies stuck+reverse and returns early — never reaching the food-processing code path. So even if `checkSnakeCollision` were to include `'food'` in the result, the current `tick()` flow would discard it.

### Module Boundaries

| Module | File | Role |
|--------|------|------|
| Collision detection | `public/src/engine/collision.js` | Determines what the snake head collides with; returns string array |
| Game loop / state | `public/src/engine/core.js` | Processes collision results and mutates game state |
| World helpers | `public/src/engine/world.js` | `getCellAt`, `getRoomAt`, `worldToRoomCoords` used by collision detection |
| Constants | `public/src/engine/constants.js` | Defines `CELL.WALL`, `CELL.STONE_WALL`, `CELL.FLOOR`, etc. |
| Tests | `tests/metroidvania-snake.test.js` | Unit/integration tests for collision and tick behavior |

---

## 2. Detailed Design — Alternative A: Merge Results Instead of Early-Return

### 2a. Fix `checkSnakeCollision()` in `collision.js`

**Change:** Replace the early `return ['damage']` with `results.push('damage')` so that the entity checks below still run and can push additional collision types.

```js
// Line 78-80 — BEFORE:
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  return ['damage'];
}

// AFTER:
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  results.push('damage');
}
```

**Rationale:** Multiple collision types can coexist at the same cell. The caller (`tick()`) should receive all collision types (`['damage', 'food']`) and decide priority.

**Boundary preservation:**
- `CELL.SPIKE` / `CELL.DEATH_WALL` still returns `['death']` early — death is terminal, food doesn't save you.
- Out-of-bounds still returns `['damage']` early — you can't eat food outside the map.
- Self-collision still returns `['self']` early — you can't eat food inside the snake.

### 2b. Fix `tick()` in `core.js` to Handle Combined `['damage', 'food']`

**Problem:** The current `tick()` handles `'damage'` with early return:

```js
// core.js ~line 124 — BEFORE:
if (collisions.includes('damage')) {
  s.stuckCounter = STUCK_TICKS;
  s.pendingReverse = true;
  s.screenShake = { intensity: 4, duration: 8 };
  s.score = Math.max(0, s.score - 5);
  return s;  // ← EARLY RETURN, food never processed
}
```

**Solution:** When both `'damage'` and `'food'` are present, remove the food entity and award score before applying the stuck+reverse penalty.

```js
// AFTER:
if (collisions.includes('damage')) {
  // If food also at this cell, remove it and award points
  // before applying the damage penalties
  if (collisions.includes('food') && s.world) {
    const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
    const room = getRoomAt(s.world, rx, ry);
    if (room) {
      const foodIdx = room.entities.food.findIndex(
        f => f.x === newHead.x && f.y === newHead.y
      );
      if (foodIdx >= 0) {
        room.entities.food.splice(foodIdx, 1);
        s.score += 10;  // Still award points for eating
      }
    }
  }

  s.stuckCounter = STUCK_TICKS;
  s.pendingReverse = true;
  s.screenShake = { intensity: 4, duration: 8 };
  s.score = Math.max(0, s.score - 5);
  return s;
}
```

### 2c. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Wall food: eat + take damage? | Yes — eat food, apply stuck+reverse, net score = +5 | Player shouldn't lose the food entirely; penalty still applies |
| `results.push` vs reorder | `results.push` (Alternative A) | Minimal change (2 lines in collision.js); all collision types preserved |
| Death + food | Death wins (no change) | Death should be terminal — you don't eat food while dying |
| Self-collision + food | Self wins (no change) | Self-collision returns `['self']` before entity checks; acceptable |
| Snake does NOT grow on wall-food | No — stuck+reverse prevents movement, so no segment added | Tail length preserved (same as regular wall hit). Food is consumed but no growth. |

---

## 3. Files Changed

| File | Change Summary | Est. Lines |
|------|---------------|------------|
| `public/src/engine/collision.js` | Lines 78-80: early `return ['damage']` → `results.push('damage')` | ±2 |
| `public/src/engine/core.js` | Lines ~124-140: handle combined `['damage', 'food']` in damage handler | +10 |
| `tests/metroidvania-snake.test.js` | New test block for Issue #70 scenarios (groups A/B/C) | ~80 |

**Total:** ~90 lines across 3 files

---

## 4. Verification Checklist

- [ ] All existing tests pass (178 tests at baseline)
- [ ] A1: Food on FLOOR cell → `['food']` (regression)
- [ ] A2: Food on border WALL → `['damage', 'food']`
- [ ] A3: Food on interior WALL → `['damage', 'food']`
- [ ] A4: Food on STONE_WALL → `['damage', 'food']`
- [ ] A5: No food on wall → `['damage']` (regression)
- [ ] A6: Food on SPIKE → `['death']` (death wins)
- [ ] A7: Food on out-of-bounds → `['damage']` (bounds before food)
- [ ] B1: tick with food on WALL → food removed; score +10 -5 = net +5; stuckCounter set; gameState = 'playing'
- [ ] B2: tick with food on STONE_WALL → same as B1
- [ ] B3: tick with food on WALL, net score = 105 (starting 100)
- [ ] B4: tick with food on WALL → food entity no longer present in room
- [ ] B5: tick with wall but no food → score = score - 5; food unchanged
- [ ] B6: tick with FLOOR food (regression) → snake grows +1, score += 10, no stuckCounter
- [ ] C1: Multiple food items at same WALL cell → first food consumed, second remains
- [ ] C2: Food on WALL + enemy at same cell → `['damage', 'food', 'enemy']`
- [ ] C3: Wall collision with 0 score, food on wall → score = 10
- [ ] C4: Snake length 1 hits wall with food → stuckCounter set, food removed, gameState = 'playing'
