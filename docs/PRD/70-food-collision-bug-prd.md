# PRD: #70 — Food Collision Returns `damage` Instead of `food`

| Field         | Value                                  |
|---------------|----------------------------------------|
| Issue         | #70                                    |
| Status        | Analysis Complete / Ready for Fix      |
| Priority      | High (breaks core mechanic)            |
| Area          | `public/src/engine/collision.js`       |
| Reported      | `checkSnakeCollision()` returns `['damage']` when snake head moves to a cell containing food |

---

## 1. Problem / Root Cause ✓

### Root Cause: Early-return ordering in `checkSnakeCollision()`

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

---

## 2. Impact

| Game Feature         | Impact                                    |
|----------------------|-------------------------------------------|
| Food eating 🍎       | Snake cannot eat food on wall cells        |
| Score accumulation   | Player loses score opportunities           |
| Snake growth         | Snake cannot grow from wall-cell food      |
| Emergency respawn    | If respawned food lands on wall, it's stuck|
| Enemy food stealing  | Enemies consume the food but snake can't   |
| Room transition food | Food at transition boundary masked by door?|
| Observable           | Food sprite visible on wall, but eating it gives damage instead of growth |

**Severity**: Critical — eating is the core gameplay mechanic. If food on any wall cell can't be eaten, the game becomes unbeatable for those rooms.

---

## 3. Alternatives ≥ 2

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
- `tick()` in `core.js` checks `collisions.includes('damage')` first and returns early. If both `'damage'` and `'food'` are present, `tick` processes damage first. The food would still be visible but the snake wouldn't eat.
- Additional change needed in `tick()` to handle the combined case (e.g., if both food and damage, still eat the food but also apply damage/stuck).

**Implementation notes for `tick()` in `core.js`:**
```js
// Current (line ~124):
if (collisions.includes('damage')) {
  s.stuckCounter = STUCK_TICKS;
  s.pendingReverse = true;
  // ... return early
}

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

---

### Alternative B: Reorder checks — entity check before tile check

**Approach**: Move the food entity check (and other entity checks) before the tile type check.

**Change in `checkSnakeCollision()`:** Restructure so entity checks (food, enemy, save, gacha) run first and populate `results`. Then run tile checks. Do NOT early-return from tile checks when food is already detected.

```js
// Step 1: Entity checks
const { rx, ry } = worldToRoomCoords(head.x, head.y);
const room = getRoomAt(world, rx, ry);
if (room) {
  if (room.entities.food.some(f => f.x === head.x && f.y === head.y))
    results.push('food');
  // ... enemy, save point, gacha
}

// Step 2: Tile checks (only if not already food)
if (!results.includes('food')) {
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
    return ['damage'];
  }
}
```

**Pros:**
- Food always detected first, regardless of underlying tile
- No changes needed in `tick()` — food path still works normally
- Conceptually correct: food is a game entity, tile is the floor beneath it

**Cons:**
- Duplicates room lookup logic (needs to happen before tile check too)
- More complex code change
- Still allows food to be placed on wall tiles (visual oddity)

---

### Alternative C: Track food separately and skip wall damage

**Approach**: Pass food positions into `checkSnakeCollision()` as a separate argument. When checking cell type, skip the `['damage']` return if food exists at that position.

```js
export function checkSnakeCollision(head, snake, state, foodPositions = null) {
  // ...
  const foodAtCell = foodPositions
    ? foodPositions.some(f => f.x === head.x && f.y === head.y)
    : false;

  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
    if (!foodAtCell) return ['damage'];
    // If food present, continue to entity checks
  }
}
```

**Pros:**
- Targeted fix
- No structure change

**Cons:**
- Changes function signature
- Caller must pre-compute food positions
- Duplicates entity data already in room

---

### Recommendation: Alternative A (Merge results)

Alternative A is recommended because:
1. Minimal code change (2 lines in `collision.js`)
2. Correct semantic behavior — multiple collisions can coexist
3. The `tick()` adjustment is straightforward
4. Future collision types won't face the same ordering issue

---

## 4. Boundary Cases ≥ 3

### Boundary 1: Food at map edge (world boundary)

**Scenario**: Food at world coordinate `x = 0` or `x = world.cols * ROOM_SIZE - 1` or `y = 0` or `y = world.rows * ROOM_SIZE - 1`.

**Current behavior**: The bounds check in `checkSnakeCollision` returns `['damage']`:
```js
if (head.x < 0 || head.y < 0) return ['damage'];
if (world && (head.x >= maxX || head.y >= maxY)) return ['damage'];
```

**Expected behavior**: Even at the exact boundary, if food exists there and the tile is passable (DOOR), food should be detectable. Out-of-bounds cells (x < 0 or x >= max) should indeed return `['damage']`.

**Mitigation**: The bounds check takes priority over food, which is correct — food should never be truly out of bounds.

---

### Boundary 2: Food on door cell during room transition

**Scenario**: Food placed on a door cell (`CELL.DOOR = 3`) at the room edge. Snake head moves onto the door cell during a room transition.

**Current behavior**: `cellType` is `CELL.DOOR (3)`, which is not WALL/STONE_WALL, so the wall check passes. Food is correctly detected.

**Mitigation**: No action needed — door cells work correctly. However, if food is placed on a DOOR cell that also gets overwritten by tile changes, the tile type could change to WALL.

---

### Boundary 3: Food overlapping with damage entities (enemy on food + snake on food)

**Scenario**: Both food and an enemy occupy the same cell. Snake head moves onto this cell.

**Current behavior**: `checkSnakeCollision` checks food first in entity loop, then enemy. Returns `['food', 'enemy']`. In `tick()`, food is processed (growth + score), then enemy damage (tail pop).

**Expected behavior**: Snake should eat the food AND take damage from the enemy. Current behavior handles this correctly as long as neither tile check triggers first.

---

### Boundary 4: Multiple food items at the exact same position

**Scenario**: Two food entities at identical coordinates `{ x: 10, y: 10 }`.

**Current behavior**: `findIndex` returns the first match at index 0. Only `results.push('food')` happens once. In `tick()`, `findIndex` again finds the first and removes it via `splice`. The second food remains.

**Expected behavior**: Only one food should be consumed per tick. This is acceptable behavior — the second food will be consumed on the next tick.

---

### Boundary 5: Food at STONE_WALL cell

**Scenario**: Food placed on a `STONE_WALL (4)` cell.

**Current behavior**: Identical to WALL — returns `['damage']` before food check.

**Mitigation**: Same fix (Alternative A) applies. STONE_WALL is treated the same as WALL for damage purposes.

---

### Boundary 6: Food at SPIKE / DEATH_WALL cell

**Scenario**: Food placed on a `SPIKE (6)` or `DEATH_WALL (5)` cell.

**Current behavior**: Returns `['death']` before food check. This is arguably correct — instant death should take priority over eating.

**Recommendation**: Keep this behavior. Death should not be survivable even if food is present. Alternative A preserves this since `'death'` is returned before we reach the entity loop anyway.

---

### Boundary 7: Legacy mode (`!world`)

**Scenario**: `checkSnakeCollision` called without a world object.

**Current behavior**: The `!world && head.x === 0` check on line 29 returns `['damage']` if `head.x === 0`, even if food is at that position.

**Mitigation**: This is a legacy code path that should be deprecated. The modern system always passes a world.

---

## 5. Fix Plan

### Step 1: Fix `checkSnakeCollision` in `collision.js`

Change the WALL/STONE_WALL check from early return to `results.push`:

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

### Step 2: Fix `tick` in `core.js` to handle combined damage+food

```js
// After the self-collision check, handle damage (wall/stone wall) — modified:
if (collisions.includes('damage')) {
  const collidedFood = collisions.includes('food');

  // If food also at collision cell, remove it first
  if (collidedFood && s.world) {
    const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
    const room = getRoomAt(s.world, rx, ry);
    if (room) {
      const foodIdx = room.entities.food.findIndex(f => f.x === newHead.x && f.y === newHead.y);
      if (foodIdx >= 0) {
        room.entities.food.splice(foodIdx, 1);
        s.score += 10; // still award points
      }
    }
  }

  // Apply stuck+reverse (existing logic)
  s.stuckCounter = STUCK_TICKS;
  s.pendingReverse = true;
  s.screenShake = { intensity: 4, duration: 8 };
  s.score = Math.max(0, s.score - 5);
  return s;
}
```

### Step 3: Add tests

- Food on border WALL cell → `['damage', 'food']`
- Food on interior WALL cell → `['damage', 'food']`
- Food on STONE_WALL cell → `['damage', 'food']`
- tick() processes food+damage combination correctly
- Food on FLOOR cell continues to work (regression)
- No food on wall → still returns `['damage']` (no regression)

---

## 6. Files Changed

| File | Change |
|------|--------|
| `public/src/engine/collision.js` | Lines 78-80: early `return ['damage']` → `results.push('damage')` |
| `public/src/engine/core.js` | Lines ~124-140: handle combined `['damage', 'food']` case in tick |
| `tests/metroidvania-snake.test.js` | Fix existing food collision test + add boundary tests |

---

## 7. Verification

- [ ] Scenario A (food on FLOOR) → still returns `['food']`
- [ ] Scenario B (food on border WALL) → now also returns `'food'` (alongside `'damage'`)
- [ ] Scenario C (food on interior WALL) → now also returns `'food'`
- [ ] tick() handles combined `['damage', 'food']` — awards score + still applies stuck+reverse
- [ ] No food on wall → still returns `['damage']` (no regression)
- [ ] All 178 existing tests still pass
- [ ] End-to-end: manual play test with food visible on walls
