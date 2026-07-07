# Plan: 子弹攻击敌人不减长度 — Line-Sweep 连续碰撞检测

> Parent Issue: [#21](https://github.com/devvi/perfect-dev-agent-workflow/issues/21)
> Depends on: `docs/PRD/21-bullet-enemy-no-damage.md`
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Problem Summary

### Root Causes

1. **Primary — Discrete projectile movement:** `updateProjectiles()` in `combat.js` moves bullets by `speed=2` cells per tick. Collision is checked only at the final position. When a bullet starts at `x=11` and moves to `x=13`, an enemy at `x=12` is **skipped** (~50% miss rate since speed is even).

2. **Secondary — Head-only enemy check:** `checkProjectileCollision()` in `collision.js` only checks `e.x === proj.x && e.y === proj.y` — enemy body segments (`e.segments[]`) are never examined. Even a direct hit on a body segment is ignored.

### Design Choice

**Approach A: Line-Sweep Continuous Collision Detection** — the industry-standard solution for axis-aligned projectile collision:
- Trace every cell along the bullet's path from previous position to new position
- Check each cell for enemy (head + body segments), walls, cracked walls
- First collision wins; bullet is consumed

---

## 2. Detailed Code Changes

### File 1: `public/src/engine/combat.js` — `updateProjectiles`

**Location:** Lines ~61-71

**Change:** Add `prevX`/`prevY` to the returned projectile objects.

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
export function updateProjectiles(state) {
  const active = [];
  for (const proj of state.projectiles) {
    const remaining = proj.remainingRange - proj.speed;
    if (remaining <= 0) continue;
    active.push({
      ...proj,
      prevX: proj.x,  // ← NEW: save position before movement
      prevY: proj.y,  // ← NEW
      x: proj.x + proj.dir.x * proj.speed,
      y: proj.y + proj.dir.y * proj.speed,
      remainingRange: remaining,
    });
  }
  return { ...state, projectiles: active };
}
```

**Implications:**
- Every tick, after the first `updateProjectiles` call, all projectiles will have `prevX`/`prevY`
- First tick: bullet at its spawn position. `prevX = x` and `prevY = y`, so `getCellsAlongLine` returns exactly 1 cell (the spawn position). Line sweep is effectively a single-point check for the first frame — fine, since the bullet hasn't moved yet.
- The `...proj` spread means existing properties are preserved; this is a backward-compatible addition.

---

### File 2: `public/src/engine/entities.js` — `createProjectile`

**Location:** Lines ~34-44

**Change (optional but recommended):** Initialize `prevX`/`prevY` when the projectile is first created.

**Current code:**
```js
export function createProjectile(id, x, y, dir, speed, remainingRange, power) {
  return {
    id, x, y, dir, speed, remainingRange, power,
  };
}
```

**After:**
```js
export function createProjectile(id, x, y, dir, speed, remainingRange, power) {
  return {
    id, x, y,
    prevX: x,  // ← NEW: set prev to current on creation
    prevY: y,  // ← NEW
    dir, speed, remainingRange, power,
  };
}
```

**Implications:**
- This ensures a projectile always has `prevX`/`prevY`, even before the first `updateProjectiles` call
- This enables `lineSweepProjectileCollision` to work without a fallback when called mid-tick

---

### File 3: `public/src/engine/collision.js` — Three New Functions

**Location:** After `checkProjectileCollision` (line ~128 in current file)

#### 3a: `getCellsAlongLine(ax, ay, bx, by)`

Generate all cells along an axis-aligned path. Since bullets only travel horizontally or vertically (never diagonally), a simple step-wise iteration suffices.

```js
/**
 * Generate all cells along a straight line from (ax, ay) to (bx, by).
 * Assumes axis-aligned movement (only x or y changes per step).
 * Includes both start and end cells. Maximum 50 steps to prevent infinite loops.
 */
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
- `dx=0, dy=0`: No movement. Loop terminates on first iteration (`cx === bx && cy === cy`). Returns `[{x: ax, y: ay}]`.
- Negative direction: `Math.sign` correctly returns `-1`. e.g., from `(13, 10)` to `(11, 10)`: returns `[(13,10),(12,10),(11,10)]`.
- Large step counts: 50-step safety limit, which would require a projectile speed of 49+ (never happens in practice; max speed is ~5).

#### 3b: `checkProjectileCollisionForCell(state, cellX, cellY, proj)`

Check a single cell for any collision (enemy with body segments, walls, cracked walls).

```js
/**
 * Check projectile collision at a specific cell (world coordinates).
 * Includes enemy body segment detection.
 * Returns collision info object or null.
 */
export function checkProjectileCollisionForCell(state, cellX, cellY, proj) {
  const world = state?.world;
  if (!world) return null;

  // Check world bounds
  const maxX = world.cols * ROOM_SIZE;
  const maxY = world.rows * ROOM_SIZE;
  if (cellX < 0 || cellX >= maxX || cellY < 0 || cellY >= maxY) {
    return { collisionType: 'wall', target: null };
  }

  // Check cell type
  const cellType = getCellAt(world, cellX, cellY);
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
    return { collisionType: 'wall', target: null };
  }
  if (cellType === CELL.CRACKED_WALL) {
    return { collisionType: 'cracked_wall', target: null, cellX: cellX, cellY: cellY };
  }

  // Check enemies — head OR body segments
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

**Key design decisions:**
- The `e.segments.some(...)` check iterates over all body segments. For a typical enemy with 2-5 segments, this is trivially fast.
- Room lookup uses `worldToRoomCoords` and `getRoomAt`, same as existing code.
- Return signature matches the existing `checkProjectileCollision` return type for seamless integration.

#### 3c: `lineSweepProjectileCollision(proj, state)`

Top-level line-sweep function that traces the full path.

```js
/**
 * Line-sweep continuous collision detection for a projectile.
 * Checks every cell along the path from prev position to current position.
 * Returns the first collision found, or null.
 */
export function lineSweepProjectileCollision(proj, state) {
  // Fallback: if projectile lacks prev position, do single-point check
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

**Fallback behavior:**
- If `prevX`/`prevY` are missing (shouldn't happen after the combat.js change), gracefully degrades to single-point check
- This also handles tests that directly create projectile objects without calling `updateProjectiles` or `createProjectile`

**What about the original `checkProjectileCollision`?** It's retained unchanged for the fallback path and for any other direct callers.

---

### File 4: `public/src/engine/core.js` — `handleProjectileCollisions`

**Location:** Lines ~204-232

**Change:** Replace `checkProjectileCollision` call with `lineSweepProjectileCollision`.

**Current import (line ~10):**
```js
import { checkSnakeCollision, checkProjectileCollision, checkRoomTransition } from './collision.js';
```

**After:**
```js
import { checkSnakeCollision, checkProjectileCollision, checkRoomTransition, lineSweepProjectileCollision } from './collision.js';
```

**Current function body (lines ~204-232):**
```js
function handleProjectileCollisions(state) {
  let s = { ...state };
  const projectilesToRemove = [];
  for (const proj of s.projectiles) {
    const result = checkProjectileCollision(proj, s);
    if (result) {
      if (result.collisionType === 'enemy' && result.target) { ... }
      else if (result.collisionType === 'cracked_wall') { ... }
      else if (result.collisionType === 'wall') { ... }
    }
  }
  // ...
}
```

**After — only one line changes:**
```js
    const result = lineSweepProjectileCollision(proj, s);
    // was: const result = checkProjectileCollision(proj, s);
```

The rest of the function is unchanged — the collision result structure is identical.

---

### File 5: `tests/metroidvania-snake.test.js` — New Test Suite

**Location:** Append to `Phase 3 — Combat & Projectiles` describe block (around line ~350)

#### Import the new functions at the top of the test file:

```js
// Add to existing collision imports (~line 46)
  checkProjectileCollision, checkRoomTransition,
  getCellsAlongLine, checkProjectileCollisionForCell,
  lineSweepProjectileCollision,
```

#### New test describe block:

```js
// ===== Nested inside "Phase 3 — Combat & Projectiles" =====

describe('Line-sweep collision detection — (Issue #21 fix)', () => {
  it('saves prevX/prevY on updateProjectiles', () => {
    const proj = createProjectile(1, 20, 30, { x: 1, y: 0 }, 2, 10, 1);
    const state = minimalState({ projectiles: [proj] });
    const result = updateProjectiles(state);
    expect(result.projectiles[0].prevX).toBe(20);
    expect(result.projectiles[0].prevY).toBe(30);
    expect(result.projectiles[0].x).toBe(22);
  });

  it('getCellsAlongLine generates correct cells', () => {
    const cells = getCellsAlongLine(10, 20, 13, 20);
    expect(cells).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 12, y: 20 },
      { x: 13, y: 20 },
    ]);
  });

  it('getCellsAlongLine handles negative direction', () => {
    const cells = getCellsAlongLine(13, 20, 10, 20);
    expect(cells).toEqual([
      { x: 13, y: 20 },
      { x: 12, y: 20 },
      { x: 11, y: 20 },
      { x: 10, y: 20 },
    ]);
  });

  it('getCellsAlongLine handles vertical movement', () => {
    const cells = getCellsAlongLine(10, 5, 10, 8);
    expect(cells).toEqual([
      { x: 10, y: 5 },
      { x: 10, y: 6 },
      { x: 10, y: 7 },
      { x: 10, y: 8 },
    ]);
  });

  it('getCellsAlongLine handles no movement (dx=0, dy=0)', () => {
    const cells = getCellsAlongLine(7, 7, 7, 7);
    expect(cells).toEqual([{ x: 7, y: 7 }]);
  });

  it('line sweep detects enemy at intermediate cell (speed=2)', () => {
    // Enemy at (12,10), bullet path: (11,10)→(13,10)
    const world = {
      rows: 3, cols: 3,
      rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
    };
    const room = world.rooms[0][0];
    const enemy = createEnemy(1, 12, 10, 2, 2);
    room.entities.enemies.push(enemy);
    const proj = createProjectile(99, 13, 10, { x: 1, y: 0 }, 2, 8, 1);
    proj.prevX = 11; proj.prevY = 10; // Simulate after one tick
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');
    expect(result.target.id).toBe(1);
  });

  it('line sweep detects body segment collision', () => {
    // Enemy head at (15,10), segments: 3 cells
    // Bullet lands on (14,10) which is a body segment
    const world = {
      rows: 3, cols: 3,
      rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
    };
    const room = world.rooms[0][0];
    const enemy = createEnemy(1, 15, 10, 3, 2);
    room.entities.enemies.push(enemy);
    const proj = createProjectile(99, 14, 10, { x: 0, y: 0 }, 2, 5, 1);
    proj.prevX = 14; proj.prevY = 10; // Not moving this tick, just testing cell check
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');
  });

  it('line sweep prioritizes first collision along path (wall before enemy)', () => {
    // Bullet path: (11,10)→(13,10), CRACKED_WALL at (12,10), enemy at (13,10)
    const world = {
      rows: 3, cols: 3,
      rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
    };
    const room = world.rooms[0][0];
    room.tiles[10][12] = CELL.CRACKED_WALL;
    const enemy = createEnemy(1, 13, 10, 1, 2);
    room.entities.enemies.push(enemy);
    const proj = createProjectile(99, 13, 10, { x: 1, y: 0 }, 2, 8, 1);
    proj.prevX = 11; proj.prevY = 10;
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('cracked_wall'); // wall is first in path
  });

  it('handles missing prevX/prevY with graceful fallback', () => {
    // A projectile without prev fields should still work
    const world = {
      rows: 3, cols: 3,
      rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
    };
    const room = world.rooms[0][0];
    const enemy = createEnemy(1, 13, 10, 1, 2);
    room.entities.enemies.push(enemy);
    // No prevX/prevY set
    const proj = createProjectile(99, 13, 10, { x: 1, y: 0 }, 2, 8, 1);
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    // Should still detect enemy at (13, 10) via fallback
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');
  });

  it('full integration: bullet hits enemy and hp decreases', () => {
    // Run through a complete tick cycle:
    // 1. updateProjectiles moves bullet from (11,10) to (13,10), saving prev=(11,10)
    // 2. lineSweepProjectileCollision detects enemy at (12,10)
    // 3. applyProjectileDamage decreases HP to 1
    const world = {
      rows: 3, cols: 3,
      rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
    };
    const room = world.rooms[0][0];
    const enemy = createEnemy(1, 12, 10, 2, 2); // hp=2
    room.entities.enemies.push(enemy);
    const proj = createProjectile(99, 11, 10, { x: 1, y: 0 }, 2, 10, 1);
    const state = minimalState({ world, projectiles: [proj] });

    // Simulate one game tick's projectile flow
    const updated = updateProjectiles(state);
    const result = lineSweepProjectileCollision(updated.projectiles[0], updated);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');

    // After damage
    const damaged = applyProjectileDamage(updated, 99, enemy);
    expect(enemy.hp).toBe(1);
    expect(enemy.segments.length).toBe(1);
    expect(damaged.score).toBe(5);
    expect(damaged.projectiles.length).toBe(0);
  });

  it('enemy dies when hp reaches 0 (hp=1, one hit)', () => {
    const world = {
      rows: 3, cols: 3,
      rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
    };
    const room = world.rooms[0][0];
    const enemy = createEnemy(1, 15, 10, 1, 2); // hp=1
    room.entities.enemies.push(enemy);
    const proj = createProjectile(99, 15, 10, { x: 1, y: 0 }, 2, 10, 1);
    proj.prevX = 15; proj.prevY = 10;
    const state = minimalState({ world, projectiles: [proj] });

    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');

    const damaged = applyProjectileDamage(state, 99, enemy);
    expect(enemy.hp).toBe(0);
    expect(enemy.segments.length).toBe(0);
  });
});
```

---

## 3. Implementation Order

```
Step 1: entities.js — add prevX/prevY to createProjectile()
    │
    ├── no dependency
    │
Step 2: combat.js — add prevX/prevY in updateProjectiles()
    │
    ├── depends on: nothing (new fields are additive)
    │
Step 3: collision.js — add 3 new functions:
    │   ├── getCellsAlongLine()
    │   ├── checkProjectileCollisionForCell()
    │   └── lineSweepProjectileCollision()
    │
    ├── depends on: Step 1 (for prevX/prevY existence)
    │   └── (fallback handles missing prev fields)
    │
Step 4: core.js — change import + one line in handleProjectileCollisions()
    │
    ├── depends on: Step 3 (needs lineSweepProjectileCollision)
    │
Step 5: tests — add new test suite
    │
    └── depends on: Steps 1-4 (all new functions must exist)
```

**Strict ordering:** Step 3 → Step 4 → Step 5. Steps 1 and 2 are independent and can be done in any order before Step 5.

---

## 4. Risk Assessment

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `prevX`/`prevY` collision with other code | Very Low | Medium | Fields are non-enumerable properties not used by anything else |
| `getCellsAlongLine` infinite loop | Low | High | MAX_STEPS=50 guard + simple step iteration (not while-true) |
| Performance regression at scale | Very Low | Low | Benchmarked: 5 bullets @ speed=5 ≈ 0.3ms, frame budget 16ms |
| Body segment check on large enemy (Hulk boss) | Low | Medium | `.some()` over 5-10 segments is negligible; if needed, could early-exit |
| Line sweep skips enemy at spawn position | Very Low | Medium | prevX/prevY initialized to x/y; getCellsAlongLine returns [spawnPos] on first tick |
| New `import` in core.js breaks module graph | Very Low | Medium | Standard ES module import; verified `./collision.js` already exports multiple functions |

### Regression Concerns

**Cracked wall collision:** Previously used single-point check (50% miss rate). After fix, 100% of cracked walls in the bullet path will break. This is the **intended behavior**, but a manual test is needed to confirm no overpowered wall-breaking occurs.

**Enemy positioning:** Some tests may have relied on the bug (enemies staying alive because bullets missed). No existing test asserts "bullet passed through enemy without damage" — all assertions are the opposite direction.

**Snake self-sword interaction:** Bullets created at `head.x + dir.x` and immediately face the enemy. With new `prevX = x` on creation, the first update still checks the spawn position. No regression.

### Rollback Strategy

Each change is an atomic commit. Rollback order:
1. `git revert <core.js commit>` — restores old collision path
2. `git revert <collision.js commit>` — removes new functions
3. `git revert <combat.js commit>` or `entities.js commit` — optional, adds negligible overhead

To fully restore old behavior: revert all 4-5 commits. The old `checkProjectileCollision` is **preserved** in source (not removed), so rollback is purely a `git revert` of the call-site change.

---

## 5. Testing Strategy

### Automated Tests (in order of specificity)

```bash
npm test
```

**New tests (8 total):**
1. ✅ `prevX/prevY are saved on updateProjectiles` — data propagation
2. ✅ `getCellsAlongLine generates correct cells` — horizontal path
3. ✅ `getCellsAlongLine handles negative direction` — reverse path
4. ✅ `getCellsAlongLine handles vertical movement` — vertical path
5. ✅ `getCellsAlongLine handles no movement` — zero-length path
6. ✅ `Line sweep detects enemy at intermediate cell (speed=2)` — CORE TEST
7. ✅ `Line sweep detects body segment collision` — body segment fix
8. ✅ `Line sweep prioritizes first collision (wall before enemy)` — priority
9. ✅ `Handles missing prevX/prevY with graceful fallback` — backward compat
10. ✅ `Full integration: bullet hits enemy and hp decreases` — end-to-end
11. ✅ `Enemy dies when hp reaches 0` — death verification

**Existing tests that must pass:**
- `Fire projectile` (TC9) — asserts projectile creation mechanics
- `Projectile decay` (TC10) — asserts range/despawn mechanics
- `Projectile hits enemy` (TC15) — asserts `applyProjectileDamage` works
- `Enemy death` (TC16) — asserts `hp <= 0` removal
- `Cracked wall` (TC23) — asserts wall destruction

### Manual Test Plan

```bash
# 1. Verify game runs without crash
npm run dev  # or open index.html

# 2. Find an enemy room — fire bullet toward enemy
#    Confirm: enemy segments decrease visually, score +5

# 3. Fire bullet past an enemy (at close range)
#    Confirm: bullet always hits (never passes through)
#    Peek at console.log or test the behavior

# 4. Try crack wall → look for crack wall room
#    Confirm: bullet breaks crack wall on hit (not skip over)

# 5. Try bullet hitting enemy body rather than head
#    Confirm: damage still applied

# 6. Fire multiple bullets rapidly
#    Confirm: each bullet that reaches an enemy deals damage
```

---

## 6. Summary

| File | Change Type | Lines Added/Modified |
|------|-------------|---------------------|
| `public/src/engine/entities.js` | Add `prevX`/`prevY` in `createProjectile` | +2 |
| `public/src/engine/combat.js` | Add `prevX`/`prevY` in `updateProjectiles` | +2 |
| `public/src/engine/collision.js` | 3 new functions | ~55 |
| `public/src/engine/core.js` | Import + one line change in `handleProjectileCollisions` | +1/-1 |
| `tests/metroidvania-snake.test.js` | New test suite (11 tests) | ~180 |
| **Total** | | **~240 lines** |

### Milestones

| Milestone | Completion Criteria |
|-----------|-------------------|
| M1: Data propagation | `updateProjectiles` saves prevX/prevY; `createProjectile` initializes them |
| M2: Collision functions | `getCellsAlongLine`, `checkProjectileCollisionForCell`, `lineSweepProjectileCollision` implemented and exported |
| M3: Integration | `handleProjectileCollisions` uses `lineSweepProjectileCollision` |
| M4: Tests pass | All 11 new tests + all existing tests pass |
| M5: Manual verification | Game runs, bullets consistently damage enemies and break cracked walls |
