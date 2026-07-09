# Tasks: #70 — Food Collision Returns `damage` Instead of `food`

| 字段 | 值 |
|------|----|
| Issue | #70 |
| 优先级 | P0 |

## Overview

Fix `checkSnakeCollision()` in `public/src/engine/collision.js` so that food on WALL/STONE_WALL cells is detected alongside the wall damage, and fix `tick()` in `public/src/engine/core.js` to handle the combined `['damage', 'food']` case — removing the food entity and awarding score before applying the stuck+reverse penalty. Design: `docs/DESIGN/70-food-collision-design.md`.

## Phase 1: Core Fix — `collision.js` & `core.js` (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/collision.js` (line 78–80) | Replace early `return ['damage']` with `results.push('damage')` for WALL/STONE_WALL | 无 | P0 |
| 1.2 | `public/src/engine/core.js` (~line 124) | In the damage handler block, check for simultaneous food collision: remove food, award +10 score before stuck+reverse | 1.1 | P0 |
| 1.3 | Both files | Run full test suite to confirm no regressions | 1.1, 1.2 | P0 |

### Step 1.1 Detail — `collision.js`

**Change:**
```js
// BEFORE:
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  return ['damage'];
}

// AFTER:
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  results.push('damage');
}
```

**Verification:**
- `CELL.SPIKE` / `CELL.DEATH_WALL` still returns `['death']` early
- Out-of-bounds still returns `['damage']` early
- Self-collision still returns `['self']` early
- Entity checks (food, enemy, save point, gacha) now run even when the cell is WALL/STONE_WALL

### Step 1.2 Detail — `core.js`

**Change:** Before applying stuck+reverse in the damage handler, check for combined food collision and handle it.

```js
// AFTER:
if (collisions.includes('damage')) {
  if (collisions.includes('food') && s.world) {
    const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
    const room = getRoomAt(s.world, rx, ry);
    if (room) {
      const foodIdx = room.entities.food.findIndex(
        f => f.x === newHead.x && f.y === newHead.y
      );
      if (foodIdx >= 0) {
        room.entities.food.splice(foodIdx, 1);
        s.score += 10;
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

**Net score effect when food on wall:** `initial score S → S + 10 (eat food) - 5 (wall penalty) = S + 5`

## Phase 2: Test Coverage (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `tests/metroidvania-snake.test.js` | Add Group A tests (checkSnakeCollision direct results): A1-A7 scenarios | 1.1 | P0 |
| 2.2 | `tests/metroidvania-snake.test.js` | Add Group B tests (tick() integration — combined damage+food handling): B1-B6 scenarios | 1.2 | P0 |
| 2.3 | `tests/metroidvania-snake.test.js` | Add Group C tests (edge cases: multi-food, food+enemy, score boundary, length 1): C1-C3 | 1.2 | P1 |

### Test Scenario Reference

**Group A — `checkSnakeCollision` returns correct combined results:**

| # | Description | Key Assertion |
|---|-------------|---------------|
| A1 | Food on FLOOR (regression) | `expect(result).toContain('food')` |
| A2 | Food on border WALL | `expect(result).toEqual(['damage', 'food'])` |
| A3 | Food on interior WALL | `expect(result).toEqual(['damage', 'food'])` |
| A4 | Food on STONE_WALL | `expect(result).toEqual(['damage', 'food'])` |
| A5 | No food on wall | `expect(result).toEqual(['damage'])` |
| A6 | Food on SPIKE | `expect(result).toEqual(['death'])` |
| A7 | Food out-of-bounds | `expect(result).toEqual(['damage'])` |

**Group B — `tick()` processes combined damage+food:**

| # | Description | Key Assertions |
|---|-------------|----------------|
| B1 | tick with food on WALL | food removed; score delta = +5; stuckCounter > 0; gameState = 'playing' |
| B2 | tick with food on STONE_WALL | Same as B1 |
| B3 | tick net score check | Initial score 100 → final score 105 |
| B4 | tick food removed from room | `room.entities.food` no longer contains the food entity |
| B5 | tick wall without food | Score -5, no food affected |
| B6 | tick food on FLOOR (regression) | Snake grows +1, score +10, no stuckCounter |

**Group C — Edge cases:**

| # | Description | Key Assertions |
|---|-------------|----------------|
| C1 | Two food items at same WALL cell | First food eaten, second remains |
| C2 | Food + enemy at same WALL cell | Food removed, enemy collision still processed |
| C3 | Score = 0, food on wall | Score = 10 (0 + 10 - penalty of 0 max with 0 = 5) |

## Phase 3: Validation & Polish (P1)

| Step | 变更 | 前置 | 优先级 |
|------|------|------|--------|
| 3.1 | Run full test suite — confirm all 178+ existing + new tests pass | 2.1, 2.2 | P1 |
| 3.2 | Manual playtest: place food visibly on a wall cell, verify snake can eat it (+score, food sprite disappears) | 1.2 | P1 |
| 3.3 | Verify no regression: wall without food → stuck+reverse (old behavior preserved) | 1.2 | P1 |
| 3.4 | Verify no regression: food on FLOOR → normal eat (grow + score) | 1.2 | P1 |
| 3.5 | Verify edge: food on wall + enemy on same cell → both processed | 2.3 | P1 |
| 3.6 | Verify edge: rapid tick where food is consumed on wall then immediate second tick (no food left) | 1.2 | P1 |

## Dependency Graph

```
Phase 1 ──────────────────────────────────────────
│                                                    │
├─ 1.1 (collision.js: push instead of return) ─────┐ │
├─ 1.2 (core.js: handle combined damage+food) ─────┤ │
├─ 1.3 (regression: full suite run) ────────────────┘ │
│                                                       │
Phase 2 ──────────────────────────────────────────      │
│                                                    │   │
├─ 2.1 (Group A: checkSnakeCollision tests)  <── 1.1 │   │
├─ 2.2 (Group B: tick() integration tests)   <── 1.2 │   │
├─ 2.3 (Group C: edge case tests)            <── 1.2 │   │
│                                                       │   │
Phase 3 ──────────────────────────────────────────      │   │
│                                                    │   │   │
├─ 3.1 (full suite run)  <── all prior phases ──────┘   │   │
├─ 3.2 (manual playtest)                                  │   │
├─ 3.3 (wall no food regression verify)                   │   │
├─ 3.4 (floor food regression verify)                     │   │
├─ 3.5 (food+enemy on wall verify)                        │   │
├─ 3.6 (rapid tick edge case)                             │   │
│                                                           │
All done ────────────────────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `public/src/engine/collision.js` | 修改：`return` → `push`（1 行） | ±1 |
| `public/src/engine/core.js` | 修改：damage handler 中新增 food 处理 | +10 |
| `tests/metroidvania-snake.test.js` | 修改：新建 ~12 个测试用例 | ~100 |

**No new source files** — all changes are in-place modifications to existing files.
**No new imports needed** — `worldToRoomCoords` and `getRoomAt` are already imported in `core.js`.
