# Research: #70 — Food Collision Returns `damage` Instead of `food`

> Parent Issue: #70
> Agent: research-agent
> Date: 2026-07-09
> Status: Analysis Complete / Ready for Fix
> Priority: High

---

## 1. Problem Definition

### Current Behavior

The function `checkSnakeCollision()` in `public/src/engine/collision.js` runs a cell-type tile check **before** entity-based checks, and uses **early return** (`return ['damage']`) when it hits WALL or STONE_WALL. This means food placed on any wall-tile cell is never detected.

The specific code path:

```
checkSnakeCollision(head, snake, state)
  ├─ 1. Bounds check                         → return ['damage'] if out of bounds
  ├─ 2. Cell type tile check                 → return ['death'] for SPIKE/DEATH_WALL
  │                                        → return ['damage'] for WALL/STONE_WALL  ← EARLY RETURN
  ├─ 3. Door / cracked wall check            → results.push('door')
  ├─ 4. Self collision check                 → return ['self']
  └─ 5. Entity checks (food, enemy, ...)     → results.push('food')   ← NEVER REACHED for wall cells
```

**Line 78–80 of `collision.js`:**
```js
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  return ['damage'];
}
```

Because this `return` executes before the food entity lookup (line ~103), any food sitting on a WALL or STONE_WALL cell is masked.

### Reproduction

```js
// Food on FLOOR → works
room.entities.food.push({ x: 10, y: 10 });  // tile[10][10] = FLOOR (0)
checkSnakeCollision({ x: 10, y: 10 }, ...); // → ['food']            ✓

// Food on WALL border → fails
room.entities.food.push({ x: 0, y: 5 });    // tile[5][0] = WALL (1)
checkSnakeCollision({ x: 0, y: 5 }, ...);   // → ['damage']          ✗

// Food on interior wall → fails
room.entities.food.push({ x: wallX, y: wallY }); // tile[wy][wx] = WALL (1)
checkSnakeCollision({ x: wallX, y: wallY }, ...); // → ['damage']     ✗
```

### Why this happens in practice

Although `placeFoodInRoom()` (generator) only places food on FLOOR cells, the following scenarios can still trigger the bug:

1. **Generator edge case — wall clusters overlap food intent**: `findEmptyFloorCell` only checks `tiles[cy][cx] === CELL.FLOOR`, but if a tile RNG changes later, food could be on a wall. (Not currently happening, but fragile.)
2. **Runtime entity manipulation**: Enemies, room transitions, and manual food placement (via `interact`, gacha, save points) can place food on non-floor cells.
3. **Emergency respawn with snake overlap**: `emergencyFoodRespawn()` has its own floor-check but uses a different coordinate calculation, which may differ from the collision tile lookup.
4. **Legacy mode (`!world`)**: The `head.x === 0` check always returns `['damage']` regardless of food.

### Expected Behavior

当蛇头移动到有食物的格子时，应始终返回 `['food']`（或同时包含 `['damage']` 的组合），而不是仅返回 `['damage']` 掩盖食物检测。

### User Scenarios

- **Scenario A (food on FLOOR)**: Snake moves to food cell → returns `['food']` → works normally ✅
- **Scenario B (food on border WALL)**: Food visible on border wall cell → snake moves there → returns `['damage']` instead of `['food']` → snake takes damage instead of eating ❌
- **Scenario C (food on interior WALL)**: Food visible on interior wall → same behavior as B ❌
- **Frequency:** 取决于是否有食物在墙格上（通过运行时实体操作触发）

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Root Cause: Early-return ordering in `checkSnakeCollision()`

The early `return ['damage']` for WALL/STONE_WALL cells in `checkSnakeCollision()` prevents the food entity check from ever executing for those cells.

### Why Does Current Behavior Exist?

The collision function was designed with an "early exit" pattern for performance — if a tile is a wall, there's no need to check entities. The food check was assumed to only apply to FLOOR cells. This assumption was valid for the initial implementation but breaks under runtime entity manipulation scenarios.

### Why Change Now?

Food collision is a core gameplay mechanic. If food on any wall cell can't be eaten, the game becomes unbeatable for those rooms. This is critical severity.

### Previous Constraints

- 保持 `checkSnakeCollision()` 函数签名不变（对外部调用者）
- 不能破坏现有的 `['damage']` / `['death']` / `['self']` 返回值

---

## 3. Impact Analysis

| Game Feature | Impact |
|-------------|--------|
| Food eating 🍎 | Snake cannot eat food on wall cells |
| Score accumulation | Player loses score opportunities |
| Snake growth | Snake cannot grow from wall-cell food |
| Emergency respawn | If respawned food lands on wall, it's stuck |
| Enemy food stealing | Enemies consume the food but snake can't |
| Room transition food | Food at transition boundary masked by door? |
| Observable | Food sprite visible on wall, but eating it gives damage instead of growth |

**Severity**: Critical — eating is the core gameplay mechanic.

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/collision.js` | Collision | Lines 78-80: early `return ['damage']` → `results.push('damage')` |
| `public/src/engine/core.js` | Core (tick) | Lines ~124-140: handle combined `['damage', 'food']` case in tick |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `tests/metroidvania-snake.test.js` | Tests | Fix existing food collision test + add boundary tests |
| `public/src/engine/generator.js` | Map Generation | No change needed (placeFoodInRoom already works correctly) |

### Data Flow Impact

```
[Before]
checkSnakeCollision → hits WALL → return ['damage'] early → food on that cell ignored

[After]
checkSnakeCollision → hits WALL → results.push('damage') → continues to entity checks
  → food found → results.push('food') → return ['damage', 'food']
  → tick() processes: eat food (growth + score) + also apply damage (stuck/reverse)
```

### Documents to Update

- [ ] `docs/PRD/70-food-collision-bug-prd.md` (本文件)
- [ ] `docs/TASKS/70-food-collision-bug-prd.md` (任务文件)
- [ ] `tests/metroidvania-snake.test.js` — 更新测试

---

## 4. Solution Comparison

> At least 2 approaches required.

### Alternative A: Merge results instead of early-return (Recommended)

**Approach**: Remove the early `return ['damage']` for wall cells. Instead, collect all collision types into the `results` array and let the caller decide priority.

**Change in `checkSnakeCollision()`:**
```js
// Before (line 78-80):
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  return ['damage'];
}

// After:
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  results.push('damage');
}
```

The entity checks below will still add `'food'`, `'enemy'`, etc. The final return becomes `['damage', 'food']` when both apply.

**Pros:**
- Minimal change (2 lines)
- All collisions are reported; callers decide priority
- Fixes all edge cases at once
- Does not change behavior for non-food wall hits

**Cons:**
- `tick()` in `core.js` checks `collisions.includes('damage')` first and returns early. If both `'damage'` and `'food'` are present, `tick` processes damage first.
- Additional change needed in `tick()` to handle the combined case (e.g., if both food and damage, still eat the food but also apply damage/stuck).

**Implementation notes for `tick()` in `core.js`:**
```js
// After (handle combined food+damage):
const hasDamage = collisions.includes('damage');
const hasFood = collisions.includes('food');

if (hasDamage) {
  // Remove food first if present
  if (hasFood && s.world) {
    // remove food entity
  }
  // Then apply stuck+reverse
  s.stuckCounter = STUCK_TICKS;
  s.pendingReverse = true;
  // ... return early
}
```

**Risk:** Low
**Effort:** Small (~1 hour)

### Alternative B: Reorder checks — entity check before tile check

**Approach**: Move the food entity check (and other entity checks) before the tile type check.

**Change in `checkSnakeCollision()`:** Restructure so entity checks (food, enemy, save, gacha) run first and populate `results`. Then run tile checks. Do NOT early-return from tile checks when food is already detected.

**Pros:**
- Food always detected first, regardless of underlying tile
- No changes needed in `tick()` — food path still works normally
- Conceptually correct: food is a game entity, tile is the floor beneath it

**Cons:**
- Duplicates room lookup logic (needs to happen before tile check too)
- More complex code change
- Still allows food to be placed on wall tiles (visual oddity)

**Risk:** Medium
**Effort:** Medium (~1-2 hours)

### Alternative C: Track food separately and skip wall damage

**Approach**: Pass food positions into `checkSnakeCollision()` as a separate argument. When checking cell type, skip the `['damage']` return if food exists at that position.

**Pros:**
- Targeted fix
- No structure change

**Cons:**
- Changes function signature
- Caller must pre-compute food positions
- Duplicates entity data already in room

**Risk:** Low
**Effort:** Small (~1 hour)

### Recommendation

→ **Alternative A (Merge results)** 因为：
1. Minimal code change (2 lines in `collision.js`)
2. Correct semantic behavior — multiple collisions can coexist
3. The `tick()` adjustment is straightforward
4. Future collision types won't face the same ordering issue

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

### Edge Cases

### Boundary 1: Food at map edge (world boundary)

**Scenario**: Food at world coordinate `x = 0` or `x = world.cols * ROOM_SIZE - 1` or `y = 0` or `y = world.rows * ROOM_SIZE - 1`.

**Current behavior**: The bounds check in `checkSnakeCollision` returns `['damage']`. Out-of-bounds cells should indeed return `['damage']`.

**Mitigation**: The bounds check takes priority over food, which is correct — food should never be truly out of bounds.

### Boundary 2: Food on door cell during room transition

**Scenario**: Food placed on a door cell (`CELL.DOOR = 3`) at the room edge.

**Current behavior**: `cellType` is `CELL.DOOR (3)`, which is not WALL/STONE_WALL, so the wall check passes. Food is correctly detected.

**Mitigation**: No action needed.

### Boundary 3: Food overlapping with damage entities (enemy on food + snake on food)

**Scenario**: Both food and an enemy occupy the same cell.

**Current behavior**: `checkSnakeCollision` checks food first in entity loop, then enemy. Returns `['food', 'enemy']`. In `tick()`, food is processed (growth + score), then enemy damage (tail pop).

**Expected behavior**: Snake should eat the food AND take damage from the enemy.

### Boundary 4: Multiple food items at the exact same position

**Scenario**: Two food entities at identical coordinates.

**Current behavior**: `findIndex` returns the first match. Only one food consumed per tick.

**Expected behavior**: Acceptable — second food consumed on next tick.

### Boundary 5: Food at STONE_WALL cell

**Scenario**: Food placed on a `STONE_WALL (4)` cell.

**Current behavior**: Identical to WALL — returns `['damage']` before food check.

**Mitigation**: Same fix (Alternative A) applies.

### Boundary 6: Food at SPIKE / DEATH_WALL cell

**Scenario**: Food placed on a `SPIKE (6)` or `DEATH_WALL (5)` cell.

**Current behavior**: Returns `['death']` before food check. This is arguably correct — instant death should take priority over eating.

**Recommendation**: Keep this behavior.

### Boundary 7: Legacy mode (`!world`)

**Scenario**: `checkSnakeCollision` called without a world object.

**Current behavior**: The `!world && head.x === 0` check on line 29 returns `['damage']`.

**Mitigation**: This is a legacy code path that should be deprecated.

### Failure Paths

1. **bounds check 不区分 wall 类型：** 边界检查（`head.x < 0` 等）返回 `['damage']` 但不允许绕过（out of bounds == damage，正确）
2. **SPIKE/DEATH_WALL 上的食物仍致死：** 应保留——即死优先于食物

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `checkSnakeCollision` in `collision.js` | Stable | Low |
| `tick()` in `core.js` | Stable | Low |

### Blocks

| Future Work | Priority |
|-------------|----------|
| — | — |

### Preparation Needed

- [ ] 确认 `checkSnakeCollision` 的 `!world` 分支不会受影响

---

## 7. Spike / Experiment (Optional)

### Verification

- [ ] Scenario A (food on FLOOR) → still returns `['food']`
- [ ] Scenario B (food on border WALL) → now also returns `'food'` (alongside `'damage'`)
- [ ] Scenario C (food on interior WALL) → now also returns `'food'`
- [ ] tick() handles combined `['damage', 'food']` — awards score + still applies stuck+reverse
- [ ] No food on wall → still returns `['damage']` (no regression)
- [ ] All 178 existing tests still pass
- [ ] End-to-end: manual play test with food visible on walls
