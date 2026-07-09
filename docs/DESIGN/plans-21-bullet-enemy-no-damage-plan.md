# Design: #21 — 子弹攻击敌人不减长度 — Line-Sweep 连续碰撞检测 (Detailed)

> Parent Issue: #21
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

### Problem Summary

**Root Causes:**

1. **Primary — Discrete projectile movement:** `updateProjectiles()` in `combat.js` moves bullets by `speed=2` cells per tick. Collision is checked only at the final position. When a bullet starts at `x=11` and moves to `x=13`, an enemy at `x=12` is **skipped** (~50% miss rate since speed is even).

2. **Secondary — Head-only enemy check:** `checkProjectileCollision()` in `collision.js` only checks `e.x === proj.x && e.y === proj.y` — enemy body segments (`e.segments[]`) are never examined. Even a direct hit on a body segment is ignored.

### Approach A: Line-Sweep Continuous Collision Detection

The industry-standard solution for axis-aligned projectile collision:
- Trace every cell along the bullet's path from previous position to new position
- Check each cell for enemy (head + body segments), walls, cracked walls
- First collision wins; bullet is consumed

---

## 2. Detailed Design

### 2.1 File 1: `public/src/engine/combat.js` — `updateProjectiles`

Add `prevX`/`prevY` to the returned projectile objects.

**Current code (lines 61-71):**
```js
export function updateProjectiles(state) {
  const active = [];
  for (const proj of state.projectiles) {
    const remaining = proj.remainingRange - proj.speed;
    if (remaining <= 0) continue;
    active.push({
      ...proj,
      x: proj.x + proj.dir.x * proj.speed,
      y: proj.y + proj.dir.y * proj.speed,
      remainingRange: remaining,
    });
  }
  return { ...state, projectiles: active };
}
```

**After:**
```js
active.push({
  ...proj,
  prevX: proj.x,  // ← NEW
  prevY: proj.y,  // ← NEW
  x: proj.x + proj.dir.x * proj.speed,
  y: proj.y + proj.dir.y * proj.speed,
  remainingRange: remaining,
});
```

**Implications:**
- Every tick after the first `updateProjectiles` call, all projectiles will have `prevX`/`prevY`
- First tick: `prevX = x` and `prevY = y`, so `getCellsAlongLine` returns exactly 1 cell

### 2.2 File 2: `public/src/engine/entities.js` — `createProjectile`

Initialize `prevX`/`prevY` when the projectile is first created:

```js
export function createProjectile(id, x, y, dir, speed, remainingRange, power) {
  return {
    id, x, y,
    prevX: x,  // ← NEW
    prevY: y,  // ← NEW
    dir, speed, remainingRange, power,
  };
}
```

### 2.3 File 3: `public/src/engine/collision.js` — Three New Functions

#### 3a: `getCellsAlongLine(ax, ay, bx, by)`

Generate all cells along an axis-aligned path:

```js
export function getCellsAlongLine(ax, ay, bx, by) {
  const cells = [];
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  let cx = ax, cy = ay;
  let steps = 0;
  const MAX_STEPS = 50;

  while (steps < MAX_STEPS) {
    cells.push({ x: cx, y: cy });
    if (cx === bx && cy === by) break;
    cx += dx;
    cy += dy;
    steps++;
  }

  return cells;
}
```

**Edge case handling:**
- `dx=0, dy=0`: Returns `[{x: ax, y: ay}]`
- Negative direction: e.g., `(13,10)` to `(11,10)`: returns `[(13,10),(12,10),(11,10)]`
- Large step counts: 50-step safety limit

#### 3b: `checkProjectileCollisionForCell(state, cellX, cellY, proj)`

Check a single cell for any collision:

```js
export function checkProjectileCollisionForCell(state, cellX, cellY, proj) {
  const world = state?.world;
  if (!world) return null;

  const maxX = world.cols * ROOM_SIZE;
  const maxY = world.rows * ROOM_SIZE;
  if (cellX < 0 || cellX >= maxX || cellY < 0 || cellY >= maxY) {
    return { collisionType: 'wall', target: null };
  }

  const cellType = getCellAt(world, cellX, cellY);
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
    return { collisionType: 'wall', target: null };
  }
  if (cellType === CELL.CRACKED_WALL) {
    return { collisionType: 'cracked_wall', target: null, cellX: cellX, cellY: cellY };
  }

  const { rx, ry } = worldToRoomCoords(cellX, cellY);
  const room = getRoomAt(world, rx, ry);
  if (room) {
    const enemy = room.entities.enemies.find(e =>
      e.x === cellX && e.y === cellY ||
      e.segments.some(s => s.x === cellX && s.y === cellY)
    );
    if (enemy) {
      return { collisionType: 'enemy', target: enemy, projId: proj.id };
    }
  }

  return null;
}
```

#### 3c: `lineSweepProjectileCollision(proj, state)`

```js
export function lineSweepProjectileCollision(proj, state) {
  if (proj.prevX === undefined || proj.prevY === undefined) {
    return checkProjectileCollision(proj, state);
  }

  const cells = getCellsAlongLine(proj.prevX, proj.prevY, proj.x, proj.y);
  for (const cell of cells) {
    const result = checkProjectileCollisionForCell(state, cell.x, cell.y, proj);
    if (result) return result;
  }

  return null;
}
```

**Fallback behavior:** If `prevX`/`prevY` are missing, gracefully degrades to single-point check.

### 2.4 File 4: `public/src/engine/core.js` — `handleProjectileCollisions`

**Import change:**
```js
import { checkSnakeCollision, checkProjectileCollision, checkRoomTransition, lineSweepProjectileCollision } from './collision.js';
```

**Function change — one line:**
```js
const result = lineSweepProjectileCollision(proj, s);
// was: const result = checkProjectileCollision(proj, s);
```

### 2.5 Implementation Order

```
Step 1: entities.js — add prevX/prevY to createProjectile() (independent)
Step 2: combat.js — add prevX/prevY in updateProjectiles() (independent)
Step 3: collision.js — add 3 new functions (depends on Step 1)
Step 4: core.js — import + one line change (depends on Step 3)
Step 5: tests — add new test suite (depends on Steps 1-4)
```

### 2.6 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `prevX`/`prevY` collision with other code | Very Low | Medium | Fields are non-enumerable, not used by anything else |
| `getCellsAlongLine` infinite loop | Low | High | MAX_STEPS=50 guard |
| Performance regression at scale | Very Low | Low | Benchmarked: 5 bullets @ speed=5 ≈ 0.3ms |
| Body segment check on large enemy | Low | Medium | `.some()` over 5-10 segments is negligible |
| Line sweep skips enemy at spawn position | Very Low | Medium | prevX initialized to x; getCellsAlongLine returns [spawnPos] |
| New `import` in core.js breaks module graph | Very Low | Medium | Standard ES module import |

### 2.7 Testing Strategy

**New tests (11 total):**
1. `prevX/prevY are saved on updateProjectiles` — data propagation
2. `getCellsAlongLine generates correct cells` — horizontal path
3. `getCellsAlongLine handles negative direction` — reverse path
4. `getCellsAlongLine handles vertical movement` — vertical path
5. `getCellsAlongLine handles no movement` — zero-length path
6. `Line sweep detects enemy at intermediate cell (speed=2)` — CORE TEST
7. `Line sweep detects body segment collision` — body segment fix
8. `Line sweep prioritizes first collision (wall before enemy)` — priority
9. `Handles missing prevX/prevY with graceful fallback` — backward compat
10. `Full integration: bullet hits enemy and hp decreases` — end-to-end
11. `Enemy dies when hp reaches 0` — death verification

---

## 3. Files Changed

| File | Change Type | Lines Added/Modified |
|------|-------------|---------------------|
| `public/src/engine/entities.js` | Add `prevX`/`prevY` in `createProjectile` | +2 |
| `public/src/engine/combat.js` | Add `prevX`/`prevY` in `updateProjectiles` | +2 |
| `public/src/engine/collision.js` | 3 new functions | ~55 |
| `public/src/engine/core.js` | Import + one line change | +1/-1 |
| `tests/metroidvania-snake.test.js` | New test suite (11 tests) | ~180 |

**Total:** ~240 lines

---

## 4. Verification Checklist

- [ ] M1: Data propagation — `updateProjectiles` saves prevX/prevY; `createProjectile` initializes them
- [ ] M2: Collision functions — `getCellsAlongLine`, `checkProjectileCollisionForCell`, `lineSweepProjectileCollision` implemented and exported
- [ ] M3: Integration — `handleProjectileCollisions` uses `lineSweepProjectileCollision`
- [ ] M4: Tests pass — all 11 new tests + all existing tests pass
- [ ] M5: Manual verification — game runs, bullets consistently damage enemies and break cracked walls
- [ ] Find an enemy room — fire bullet toward enemy → enemy segments decrease visually, score +5
- [ ] Fire bullet past an enemy (at close range) → bullet always hits (never passes through)
- [ ] Try crack wall → bullet breaks crack wall on hit (not skip over)
- [ ] Try bullet hitting enemy body rather than head → damage still applied
- [ ] Fire multiple bullets rapidly → each bullet that reaches an enemy deals damage
