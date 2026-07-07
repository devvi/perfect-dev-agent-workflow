# Implementation Plan: Issue #21 — 子弹攻击到敌人，敌人长度不会减少

> Parent Issue: [#21](https://github.com/devvi/perfect-dev-agent-workflow/issues/21)
> Status: Plan
> Agent: plan-agent
> Date: 2026-07-07
> Depends on: [docs/PRD/21-bullet-enemy-no-damage.md](../docs/PRD/21-bullet-enemy-no-damage.md)

---

## Overview

**Bug:** When the player fires bullets at enemies, the enemy's length (segment count) and HP do not decrease. Bullets visually pass through enemies without effect.

**Solution:** Implement line-sweep continuous collision detection so that bullets check every cell along their flight path (including body segments of enemies), rather than only the endpoint.

### Summary

| Item | Value |
|------|-------|
| Root Cause | Projectile moves 2 cells/tick → skips over enemy in middle cell; collision check only targets head position |
| Fix Method | Line-sweep (per-cell) collision + body segment detection |
| Effort | ~1.5 hours |
| Approach | Approach A from Research — Line-Sweep Continuous Collision Detection |

---

## Root Cause Analysis

### Primary: Discrete Projectile Movement (Position Skip)

`updateProjectiles()` in `public/src/engine/combat.js` moves each projectile by `speed` (default 2) cells per tick:

```js
x: proj.x + proj.dir.x * proj.speed,  // jumps 2 cells at once
y: proj.y + proj.dir.y * proj.speed,
```

This creates a 2-cell gap. If an enemy is in the intermediate cell, the projectile "jumps over" it completely.

**Example:**
- Bullet starts at x=11, moves right by 2 → lands at x=13
- Enemy head at x=12 — never checked, never hit

**Detection rate with speed=2:** ~50% (only when bullet lands exactly on enemy head).

### Secondary: Only Head Position Checked

`checkProjectileCollision()` in `public/src/engine/collision.js` only matches the enemy's head position (`e.x, e.y`). Bullets passing through the enemy's body segments (`enemy.segments[]`) are ignored.

```js
// Only checks head — body segments are ignored
const enemy = room.entities.enemies.find(e => e.x === proj.x && e.y === proj.y);
```

---

## Proposed Changes

### Plan: Line-Sweep Continuous Collision Detection (Approach A)

**Core idea:** After moving projectiles, check every cell along the path from previous position to new position, rather than just the endpoint. Also check enemy body segments.

**Files to modify:**

| File | Change Type | Description |
|------|------------|-------------|
| `public/src/engine/combat.js` | ✅ Modify | Add `prevX`/`prevY` to projectile data; add `lineSweepProjectileCollision()` function |
| `public/src/engine/collision.js` | ✅ Modify | Add `checkProjectileCollisionForCell()` with body segment detection; export for line-sweep use |
| `public/src/engine/core.js` | ✅ Modify | `handleProjectileCollisions()` calls line-sweep instead of single-point check |
| `tests/metroidvania-snake.test.js` | ✅ Add tests | 5 new test cases for line-sweep + body segment collision |

---

## Implementation Steps

### Step 1: Add `prevX`/`prevY` to Projectile Movement

**File:** `public/src/engine/combat.js` — `updateProjectiles()`

**Change:** When pushing the new projectile object, include the previous position:

```js
active.push({
  ...proj,
  prevX: proj.x,       // ← NEW: record old position before move
  prevY: proj.y,       // ← NEW
  x: newX,
  y: newY,
  remainingRange: remaining,
});
```

**Verification:** Every projectile in state has `prevX === old_x` and `prevY === old_y` after `updateProjectiles()`.

### Step 2: Create Line-Sweep Collision Function

**File:** `public/src/engine/combat.js` — New function

**Logic:** Walk from `(prevX, prevY)` to `(x, y)` one cell at a time, checking for collision at each step.

```js
/**
 * Line-sweep collision: check every cell from old pos to new pos.
 * Returns first collision found, or null.
 */
export function lineSweepProjectileCollision(proj, state) {
  const dx = Math.sign(proj.x - proj.prevX);
  const dy = Math.sign(proj.y - proj.prevY);
  let cx = proj.prevX;
  let cy = proj.prevY;

  while (true) {
    const result = checkProjectileCollisionForCell(state, cx, cy, proj);
    if (result) return result;

    if (cx === proj.x && cy === proj.y) break;
    cx += dx;
    cy += dy;
  }
  return null;
}
```

**Note:** Since projectiles only travel along one axis (horizontal or vertical), this is a simple linear walk, not a diagonal Bresenham.

### Step 3: Add Cell-Level Collision + Body Segment Detection

**File:** `public/src/engine/collision.js` — New function (or refactor existing)

**Change:** Create `checkProjectileCollisionForCell()` that checks a single cell. The key difference from `checkProjectileCollision()` is that it also matches enemy body segments, not just the head.

```js
/**
 * Check projectile collision at a specific cell coordinate.
 * Includes enemy body segment detection.
 */
export function checkProjectileCollisionForCell(state, cellX, cellY, proj) {
  const world = state.world;
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
    return { collisionType: 'cracked_wall', target: null, cellX, cellY };
  }

  // Check enemies — including body segments!
  const { rx, ry } = worldToRoomCoords(cellX, cellY);
  const room = getRoomAt(world, rx, ry);
  if (room) {
    const enemy = room.entities.enemies.find(e =>
      e.x === cellX && e.y === cellY ||                                         // head
      e.segments.some(s => s.x === cellX && s.y === cellY)                      // body segments
    );
    if (enemy) {
      return { collisionType: 'enemy', target: enemy, projId: proj.id };
    }
  }

  return null;
}
```

**Reuse:** `checkProjectileCollision()` can internally call `checkProjectileCollisionForCell()` or remain as-is for backward compatibility.

### Step 4: Update `handleProjectileCollisions` (Core Engine)

**File:** `public/src/engine/core.js`

**Change:** In the projectile handling loop, call `lineSweepProjectileCollision()` instead of `checkProjectileCollision()`:

```js
// Before:
const result = checkProjectileCollision(proj, s);

// After:
const result = lineSweepProjectileCollision(proj, s);
```

Add the import for the new function:
```js
import { fireProjectile, updateProjectiles, applyProjectileDamage, updateCooldowns, lineSweepProjectileCollision } from './combat.js';
```

### Step 5: Add Tests

**File:** `tests/metroidvania-snake.test.js`

Add tests to the "Combat & Projectiles" describe block:

| # | Test Name | Scenario | Expected |
|---|-----------|----------|----------|
| 1 | Line-sweep catches enemy in skipped cell | Bullet from (11,10)→(13,10); enemy head at (12,10) | Collision detected (enemy) |
| 2 | Line-sweep catches enemy body segment | Bullet from (13,10)→(15,10); enemy body at (14,10) | Collision detected (enemy) |
| 3 | Line-sweep catches cracked wall in skipped cell | Bullet from (6,5)→(8,5); cracked wall at (7,5) | Collision detected (cracked_wall) |
| 4 | Line-sweep with speed=3 checks all intermediate cells | Bullet from (10,10)→(13,10); enemy at (11,10) | Collision detected |
| 5 | Enemy removed when HP reaches 0 after projectile hit | Enemy with hp=1 hit by projectile | Enemy removed from room |

---

## Files to Modify

| File | Change | Details |
|------|--------|---------|
| `public/src/engine/combat.js` | `updateProjectiles()` — add `prevX`/`prevY` | Add 2 lines in the push object |
| `public/src/engine/combat.js` | New `lineSweepProjectileCollision()` | ~20 lines |
| `public/src/engine/collision.js` | New `checkProjectileCollisionForCell()` | ~30 lines (derived from existing `checkProjectileCollision`) |
| `public/src/engine/collision.js` | Export the new function | Add to export statement |
| `public/src/engine/core.js` | Import + use `lineSweepProjectileCollision` | 2 lines changed |
| `tests/metroidvania-snake.test.js` | 5 new test cases | ~80 lines of test code |

---

## Testing Strategy

### Existing Tests Impact

| Test | Impact | Action |
|------|--------|--------|
| "Fire projectile — decreases snake length by 1" | Unchanged | No change needed |
| "Projectile decay" | Unchanged | No change needed |
| "Max projectiles" | Unchanged | No change needed |
| "Projectile hits enemy — reduces HP" | Unchanged (tests `applyProjectileDamage` directly) | No change needed |
| "Enemy death — removes enemy when HP reaches 0" | Unchanged | No change needed |
| Room transition, food, generator tests | Unchanged | No change needed |

### New Test Cases

All new tests live under a new `describe('Line-sweep collision', ...)` block:

1. **Line-sweep catches enemy in skipped cell** — Bullet jumps over enemy head at intermediate position → still hits
2. **Line-sweep catches enemy body segment** — Bullet lands on a body segment → triggers damage
3. **Line-sweep catches cracked wall** — Bullet jumps over cracked wall at intermediate position → wall destroyed
4. **Line-sweep with speed=3** — Higher speed still catches all intermediate cells
5. **Enemy removal on death** — hp=1 enemy killed by projectile → removed from room entities

### Run Tests

```bash
npx vitest run tests/metroidvania-snake.test.js
```

Expected: all existing tests pass, 5 new tests pass.

### Manual Test

- [ ] Open game in browser
- [ ] Fire bullets at enemies of varying positions and distances
- [ ] Verify enemy HP decreases, segment length decreases
- [ ] Verify cracked walls can be destroyed from any distance
- [ ] Fire at enemy body segments (not head) — still registers as hit
- [ ] No performance degradation with multiple projectiles

---

## Migration / Compatibility

- **No save file changes** — projectile state is ephemeral
- **No rendering changes** — `renderRoom.js` already draws `enemy.segments` correctly
- **No generator changes** — `generator.js` unaffected
- **`checkProjectileCollision()` retained** — kept for backward compatibility if any external callers exist

---

## Verification

| # | Check | Method |
|---|-------|--------|
| 1 | All 106+ existing tests pass | `npx vitest run tests/metroidvania-snake.test.js` |
| 2 | 5 new line-sweep tests pass | Same command |
| 3 | Bullet hits enemy at any position along 2-cell jump | Manual + test |
| 4 | Bullet hits enemy body segments | Manual + test |
| 5 | Cracked wall hit from any distance | Manual + test |
| 6 | No game-breaking performance regression | Play test in browser |
