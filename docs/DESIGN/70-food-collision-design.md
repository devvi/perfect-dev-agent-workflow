# Design: #70 — Food Collision Returns `damage` Instead of `food`

> Parent Issue: #70
> Plan Agent: subagent
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

**Note:** The `newHead` variable already exists in the `tick()` scope by the time we reach the damage check — it is defined at ~line 104.

### 2c. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Wall food: eat + take damage? | Yes — eat food, apply stuck+reverse, net score = +5 | Player shouldn't lose the food entirely; penalty still applies |
| `results.push` vs reorder | `results.push` (Alternative A) | Minimal change (2 lines in collision.js); all collision types preserved |
| Death + food | Death wins (no change) | Death should be terminal — you don't eat food while dying |
| Self-collision + food | Self wins (no change) | Self-collision returns `['self']` before entity checks; acceptable |
| Snake does NOT grow on wall-food | No — stuck+reverse prevents movement, so no segment added | Tail length preserved (same as regular wall hit). Food is consumed but no growth. |

---

## 3. Test Specifications

All tests go in `tests/metroidvania-snake.test.js` under a new `describe('Issue #70 — Food collision on wall cells')` block.

### Test Group A: `checkSnakeCollision` returns correct combined results

| # | Scenario | Setup | Expected Result |
|---|----------|-------|-----------------|
| A1 | Food on FLOOR cell | Place food on a FLOOR cell in room | `['food']` (regression) |
| A2 | Food on border WALL cell | Place food on a border cell that is `CELL.WALL` | `['damage', 'food']` |
| A3 | Food on interior WALL cell | Place food on an interior `CELL.WALL` cell | `['damage', 'food']` |
| A4 | Food on STONE_WALL cell | Place food on a `CELL.STONE_WALL` cell | `['damage', 'food']` |
| A5 | No food on wall | Wall cell with no food entity | `['damage']` (regression) |
| A6 | Food on SPIKE cell | Place food on a `CELL.SPIKE` cell | `['death']` (death wins) |
| A7 | Food on out-of-bounds | `head.x = -1` with food at that position in legacy mode | `['damage']` (bounds before food) |
| A8 | Legacy mode food on wall | `!world` path, food on wall | `['damage']` (legacy wall check at line 29 fires first) |

### Test Group B: `tick()` processes combined `['damage', 'food']` correctly

| # | Scenario | Setup | Expected Result |
|---|----------|-------|-----------------|
| B1 | tick with food on WALL | Place snake moving into a WALL cell with food | Food removed from room; score +10 -5 = net +5; stuckCounter set; gameState = 'playing' |
| B2 | tick with food on STONE_WALL | Same as B1 but STONE_WALL | Same as B1 |
| B3 | tick with food on WALL, check net score | Score starts at 100 | After tick: score = 105 (100 + 10 - 5) |
| B4 | tick with food on WALL, food removed from room | Verify room.entities.food array | food entity no longer present in room |
| B5 | tick with wall but no food | WALL cell, no food | score = score - 5; food unchanged; stuckCounter set |
| B6 | tick with FLOOR food (regression) | Food on FLOOR, no wall | Snake grows +1, score += 10, no stuckCounter |

### Test Group C: Edge cases

| # | Scenario | Setup | Expected Result |
|---|----------|-------|-----------------|
| C1 | Multiple food items at same WALL cell | Two `{ x, y }` food entities on same WALL cell | First food consumed (spliced), second remains for next tick |
| C2 | Food on WALL + enemy at same cell | Food + enemy on a WALL cell | `['damage', 'food', 'enemy']` — damage handles food removal, enemy pops tail |
| C3 | Wall collision with 0 score, food on wall | score = 0 | score stays 0 after stuck penalty (max(0, 0-5) = 0, then +10 = 10) |
| C4 | Snake length 1 hits wall with food | Single segment snake moving into wall+food | stuckCounter set, food removed, gameState = 'playing' (not gameover) |

### Test Construction Approach

Each test should follow the existing pattern in `tests/metroidvania-snake.test.js`:

1. **Create a minimal game state** using either `createInitialState(generateWorldMap(...))` or `minimalState()` helper
2. **Place food in the room** via `room.entities.food.push({ x, y })`
3. **Set the cell type** to WALL/STONE_WALL at the target coordinates
4. **Call `checkSnakeCollision()` directly** for group A tests
5. **Call `tick()` with appropriate direction** for group B tests
6. **Assert on the return value** — `toContain('food')`, `toContain('damage')`, score deltas, room food state

---

## 4. Files Changed

| File | Change Summary | Est. Lines |
|------|---------------|------------|
| `public/src/engine/collision.js` | Lines 78-80: early `return ['damage']` → `results.push('damage')` | ±2 |
| `public/src/engine/core.js` | Lines ~124-140: handle combined `['damage', 'food']` in damage handler | +10 |
| `tests/metroidvania-snake.test.js` | New test block for Issue #70 scenarios (groups A/B/C) | ~80 |

**Total:** ~90 lines across 3 files

---

## 5. Verification Checklist

- [ ] All existing tests pass (178 tests at baseline)
- [ ] Food on FLOOR cell → `['food']` (regression A1)
- [ ] Food on border WALL → `['damage', 'food']` (A2)
- [ ] Food on interior WALL → `['damage', 'food']` (A3)
- [ ] Food on STONE_WALL → `['damage', 'food']` (A4)
- [ ] No food on wall → `['damage']` (A5, regression)
- [ ] Food on SPIKE → `['death']` (A6)
- [ ] tick(): food on WALL → food removed, score net +5 (B1-B4)
- [ ] tick(): wall without food → score -5 (B5, regression)
- [ ] tick(): food on FLOOR (regression B6)
- [ ] Edge cases C1-C4
