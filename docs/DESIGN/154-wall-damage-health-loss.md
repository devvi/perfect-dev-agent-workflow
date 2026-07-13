# DESIGN: Wall Damage — Health Loss & Food Drop

## Overview

When the snake collides with a `WALL` or `STONE_WALL` tile (damage type), the game currently only applies a stuck+reverse penalty without any resource loss. Per Issue #154, a wall collision should also remove the tail segment (health loss) and drop a bounce food item at the collision position, matching the pattern already used for enemy damage.

This DESIGN doc describes the implementation approach derived from the PRD at `docs/PRD/154-wall-damage-health-loss.md`.

---

## Module Responsibilities

| Module | File | Role | Changes |
|--------|------|------|---------|
| Game Core | `public/src/engine/core.js` | Game loop, state management, collision handlers | **Modified** — wall-damage block (lines 243–272) gets tail removal + bounce food drop; import `createBounceFood` |
| Entities | `public/src/engine/entities.js` | Entity factory functions | **Unchanged** — `createBounceFood` already exists at line 111 |
| Tests (Metroidvania) | `tests/metroidvania-snake.test.js` | Bug-documenting and validation tests | **Modified** — add bug-documenting test block for wall damage health loss |
| Tests (Gameboy) | `tests/gameboy-snake.test.js` | Classic engine variant tests | **Check** — needs assertion update in Issue #46 stuck+reverse test |

---

## Data Flow

### Before (Current)

```
Snake head collides with WALL tile
  ↓
Wall-damage handler (core.js:243-272)
  ↓
- Single-segment check → gameover
- Food-at-cell check → eat food +10
- Set stuckCounter = STUCK_TICKS
- Set pendingReverse = true
- Set screenShake
- Set score = max(0, score - 5)
- EARLY RETURN — no tail removal, no food drop
  ↓
Snake length unchanged
No food reward for player
```

### After (New)

```
Snake head collides with WALL tile
  ↓
Wall-damage handler (core.js:243-272, modified)
  ↓
- Single-segment check → gameover (unchanged)
- Food-at-cell check → eat food +10 (unchanged)
- ★ Drop bounce food at newHead position (if s.world exists)
- ★ Remove last tail segment: s.snake = s.snake.slice(0, -1)
- Set stuckCounter, pendingReverse, screenShake, score penalty (unchanged)
- Return
  ↓
Snake length reduced by 1
Bounce food appears at collision site → despawns after FOOD_DESPAWN_TOTAL ticks
```

### Key: bounce food vs regular food

- Bounce food (`createBounceFood`) has physics bounce for 3 ticks, then a despawn timer with blink phase
- Regular food (`createFood`) is a simple static food with no lifetime
- Wall-damage uses **bounce food** so it despawns, creating urgency for the player to retrieve it

---

## Implementation Phases

### Phase 1: Add `createBounceFood` to core.js imports

**File:** `public/src/engine/core.js`, line 10

**Current:**
```js
import { createSnake, createFood } from './entities.js';
```

**New:**
```js
import { createSnake, createFood, createBounceFood } from './entities.js';
```

### Phase 2: Add tail removal + bounce food drop to wall-damage block

**File:** `public/src/engine/core.js`, lines 243–272

Add two new blocks inside the `if (collisions.includes('damage'))` handler, after the existing food-at-cell check and before the stuckCounter assignment:

**1. Bounce food drop (after food-at-cell check, lines ~265):**
```js
// Drop bounce food at wall collision position (newHead)
if (s.world) {
  const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
  const room = getRoomAt(s.world, rx, ry);
  if (room) {
    const food = createBounceFood(newHead.x, newHead.y, null);
    room.entities.food.push(food);
  }
}
```

**2. Tail removal:**
```js
// Remove last tail segment (health loss)
s.snake = s.snake.slice(0, -1);
```

### Full rendered block (lines 243–272 after changes):

```js
// Wall/Stone_Wall damage — tail pop + food drop at collision point
if (collisions.includes('damage')) {
    // Single-segment snake hitting wall → game over (Issue #150)
    if (s.snake.length <= 1) {
      s.gameState = 'gameover';
      return s;
    }

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
          s.score += 10;  // Award points for eating even on wall
        }
      }
    }

    // Drop bounce food at wall collision position (newHead)
    if (s.world) {
      const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
      const room = getRoomAt(s.world, rx, ry);
      if (room) {
        const food = createBounceFood(newHead.x, newHead.y, null);
        room.entities.food.push(food);
      }
    }

    // Remove last tail segment (health loss)
    s.snake = s.snake.slice(0, -1);

    s.stuckCounter = STUCK_TICKS;
    s.pendingReverse = true;
    s.screenShake = { intensity: 4, duration: 8 };
    s.score = Math.max(0, s.score - 5);
    return s;
  }
```

---

## Boundary Conditions & Edge Cases

| Condition | Handling |
|-----------|----------|
| **Snake length = 1 hitting wall** | Length check fires before food drop and tail removal → gameover immediately. No bounce food, no tail removal (the segment is already the head). Same as current behavior. |
| **Snake length = 2 hitting wall** | After tail removal, snake becomes length 1. Game continues with stuck+reverse pending. The single remaining segment will reverse direction when stuck expires. |
| **No world (classic gameboy mode)** | `if (s.world)` guards prevent food drop. Tail removal still happens (unguarded). Classic mode snakes without a world get health loss but no food reward. |
| **Food also at collision cell** | The food-at-cell branch runs first: existing food is eaten (+10 pts), then bounce food is dropped at the same position. Stacking is intentional — player loses a segment but gains points and a fresh food. |
| **Bounce food inside wall tile** | Bounce food has 3 ticks of `bounceTicks` with random velocity from `createBounceFood`. The bounce physics (`updateBossMovement`? Actually `trySpawnPeriodicFood` or the bounce-update in `ai.js`) will move it out of the wall tile naturally. If the bounce timer expires while still in a wall, the food just sits there — acceptable, as regular food can also spawn in walls. |
| **Tail removal → score penalty same tick** | Both happen in the same tick: tail is removed (length -1) and score is reduced by 5. Order doesn't matter for these two. |
| **Food drop when room is undefined** | Guard: `if (room)` prevents crash. If `worldToRoomCoords` or `getRoomAt` returns null, food is silently not spawned. |

---

## Test Plan

Add a new `describe('Bug #154: Wall damage — health loss & food drop')` block in `tests/metroidvania-snake.test.js`, placed after the Issue #22 block (end of line 1305) and before the Death wall block (line 1307). Tests to add:

| Test | Description | Assertions |
|------|-------------|------------|
| TC1: Wall collision reduces snake length by 1 | 3-segment snake hits WALL → length becomes 2 | `toBe(state.snake.length - 1)`, still `'playing'` |
| TC2: Wall collision spawns bounce food at newHead | Bounce food appears in the room's entities.food array at the same position as newHead | `food.length` > 0 after collision, food has `isBouncing: true` |
| TC3: No food drop without world | Classic mode (no world) still gets tail removal but no food | `snake.length` decreases by 1, `room.entities.food` unchanged |
| TC4: Existing behaviors preserved | stuckCounter, pendingReverse, screenShake, score penalty still apply | Verify each field |
| TC5: Single-segment → gameover | Still gameover before any food/tail operations | `gameState === 'gameover'`, no food dropped |

---

## Dependencies

| Dependency | File | Purpose |
|------------|------|---------|
| `createBounceFood` | `public/src/engine/entities.js:111` | Factory for bounce food with despawn timer |
| `worldToRoomCoords` | `public/src/engine/world.js` | Convert world coords to room grid position |
| `getRoomAt` | `public/src/engine/world.js` | Look up room by room grid coordinates |

The first dependency (`createBounceFood`) is not currently imported by `core.js` — it must be added to the import line.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gameboy-snake test breaks (Test 2) | High | Medium | Test 2 for Issue #46 in `gameboy-snake.test.js` checks exact snake array after reversal — tail removal reduces array length. Must update test expectation. |
| Bounce food not rendering in non-boss rooms | Medium | Low | `updateFoodBlinkDespawn` and bounce physics may only run in boss rooms. If so, food stays static (no bounce/despawn) but still appears and is collectable. Acceptable for now. |
| Existing Issue #46 test (metroidvania) asserts preserved length | High | Medium | Line 1281 expects `toBe(state.snake.length)` — will fail after fix. Must update to `toBe(state.snake.length - 1)`. This is expected. |
