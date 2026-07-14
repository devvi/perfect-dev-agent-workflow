# PRD: Wall Collision Bounce Food Position Fix

> Parent Issue: #163
> Parent Issue URL: https://github.com/devvi/perfect-dev-agent-workflow/issues/163
> Agent: research-agent
> Date: 2026-07-14
> Status: Open
> Priority: Medium
> Depth: Light

---

## 1. Problem Definition

### Current Behavior

When the snake collides with a `WALL` or `STONE_WALL` tile (the `'damage'` collision type), **no bounce food is spawned at all**. The wall-damage block at `core.js:243-272` only applies:

- `stuckCounter = STUCK_TICKS` (immobilization)
- `pendingReverse = true`
- Screen shake
- Score penalty (−5)
- Early return

The bounce food drop that was implemented in PR #157 has been absent since commit `c7176a7` (a docs/GDD update that accidentally reverted the functional code).

### Expected Behavior

Per Issue #163, when the snake collides with a normal wall:

1. A bounce food item should drop at the collision position (matching the game design intent)
2. The food must be **reachable** by the player — it must NOT spawn inside the wall tile
3. The food should blink/despawn after a short timeout (standard bounce food behavior)

### Historical Context

- **PR #157** (commit `6ee7b57`) implemented this feature: on wall collision, spawn `createBounceFood(newHead.x, newHead.y, null)` and pop the tail segment.
- **Commit `c7176a7`** ("docs: update GDD with #154 wall damage health loss design knowledge") was a squash-merge that came **after** PR #157 but was based on an older master. It accidentally reverted the bounce food code:
  - Removed `createBounceFood` from the import line in `core.js`
  - Removed the bounce food spawn block inside the wall-damage handler
  - Removed the `s.snake = s.snake.slice(0, -1)` tail removal line
  - Changed the block comment back to "stuck+reverse instead of tail removal"

The result is that **master currently has no bounce food on wall collision**, and the snake's length is unchanged — the wall-damage block only applies stuck+reverse.

---

## 2. Root Cause Analysis

### Layer 1: Feature Code Reverted by Accident

The diff in commit `c7176a7` shows the exact reversion:

```diff
-import { createSnake, createFood, createBounceFood } from './entities.js';
+import { createSnake, createFood } from './entities.js';
```

And the entire bounce food + tail pop block was removed from the wall-damage handler. This was a post-merge GDD update race — the commit was labeled "docs" but touched `core.js` and `tests/`.

### Layer 2: Original Implementation Spawned Food Inside Wall

Even before the revert, PR #157 dropped food at `newHead` coordinates — which **is the wall cell the snake just hit**. Food on a wall tile is invisible (walls bypass entity rendering) and unreachable by the player or enemies.

### Summary

| Problem | Detail |
|---------|--------|
| Feature missing entirely | Bounce food code was reverted by accident in commit `c7176a7` |
| Spawn position wrong | Original code spawned at `newHead` (wall cell) — invisible/unreachable |
| No tail removal | Without the reverted code, wall collision doesn't reduce snake length |

---

## 3. Solution

### Fix Approach

Re-add bounce food spawn to the wall-damage block in `tick()`, but **fix the spawn position** to use the tail's last segment (before pop) instead of `newHead` (the wall cell).

This mirrors the enemy-damage pattern at `core.js:310-312`:

```javascript
// Enemy damage pattern (lines 310-312):
const lastSeg = s.snake[s.snake.length - 1];
const dropPos = { x: lastSeg.x, y: lastSeg.y };
const food = createFood(dropPos.x, dropPos.y);
```

For wall damage, use `createBounceFood` instead of regular `createFood` to add the despawn timer.

### File Changes

**File: `public/src/engine/core.js`**

| Change | Location | Detail |
|--------|----------|--------|
| Import `createBounceFood` | Line 10 | Add to import from `./entities.js` |
| Add bounce food spawn | Lines 270-273 (within wall-damage block) | Record last segment, pop tail, drop bounce food at that position |

### Detailed Code Change

```javascript
// Import line (line 10):
// Current:
import { createSnake, createFood } from './entities.js';
// New:
import { createSnake, createFood, createBounceFood } from './entities.js';

// Wall-damage block (after line ~269, before `return s;`):
// Add before the return:
// Drop bounce food at tail's last segment position (not at newHead, which is inside the wall)
const lastSeg = s.snake[s.snake.length - 1];
const dropPos = { x: lastSeg.x, y: lastSeg.y };
if (s.world) {
  const { rx, ry } = worldToRoomCoords(dropPos.x, dropPos.y);
  const room = getRoomAt(s.world, rx, ry);
  if (room) {
    const food = createBounceFood(dropPos.x, dropPos.y, null);
    room.entities.food.push(food);
  }
}

// Remove last tail segment (health loss)
s.snake = s.snake.slice(0, -1);
```

### Rationale for Fix

1. **Tail position instead of wall position**: The tail's last segment is always on a traversable tile (the snake can only exist on non-wall cells), guaranteeing the food spawns in a reachable location.
2. **Bounce food**: `createBounceFood` gives the food physics bounce (3 ticks) and a despawn timer with blink phase, creating urgency for the player to retrieve it.
3. **Tail pop as health loss**: Matching enemy-damage behavior — each wall collision costs one segment of length.
4. **Existing infrastructure**: `createBounceFood` already exists at `entities.js:111` and is already used by `ai.js` for boss bounce food drops. The `world` room lookup pattern is identical to the enemy-damage handler.

### Non-Changes

| Aspect | Decision | Reason |
|--------|----------|--------|
| `stuckCounter` | Keep as-is | Immobilization is correct gameplay |
| `pendingReverse` | Keep as-is | Direction reversal after stuck is correct |
| `screenShake` | Keep as-is | Visual feedback is appropriate |
| `score` penalty | Keep as-is | −5 score on wall collision is intentional |
| Food-at-collision-cell check | Keep as-is | If food also on the wall cell, remove it + award 10 pts (lines 253-265) |

---

## 4. Edge Cases

### Length-1 Snake Hitting Wall
Already handled at lines 246-249 — single-segment snake → immediate `gameover`. No bounce food needed.

### Pop Makes Snake Length 0
After `s.snake.slice(0, -1)`, if length reaches 0, should set `gameover`. This matches the enemy-damage handler pattern (lines 332-335):

```javascript
if (s.snake.length === 0) {
  s.gameState = 'gameover';
  return s;
}
```

### Food Spawns in a Room With No World
The `if (s.world)` guard already handles this — the bounce food spawn is conditional on having a world context. If no world (test/gameboy mode), no food is spawned, and the tail is still popped for health loss tracking.

---

## 5. Implementation Plan

| # | Task | File | Detail |
|---|------|------|--------|
| 1 | Add `createBounceFood` import | `public/src/engine/core.js:10` | Add to import line |
| 2 | Add bounce food spawn + tail pop | `public/src/engine/core.js:270` | In wall-damage block, before `return s;` |
| 3 | Add gameover check for length-0 | `public/src/engine/core.js` | After `s.snake = s.snake.slice(0, -1)` |

---

## 6. References

- **Issue #163**: Original bug report
- **PR #157** (commit `6ee7b57`): Original implementation that was reverted
- **Commit `c7176a7`**: Accidentally reverted the bounce food code (GDD update race)
- **`public/src/engine/entities.js:111`**: `createBounceFood` factory function (already exists)
- **`public/src/engine/core.js:310-312`**: Enemy damage tail-pop + food-drop pattern (reference implementation)
- **`docs/PRD/154-wall-damage-health-loss.md`**: Original PRD for the wall damage health loss feature
- **`docs/TASKS/154-wall-damage-health-loss.md`**: Task list from the original implementation
- **`docs/DESIGN/154-wall-damage-health-loss.md`**: Design doc from the original implementation
