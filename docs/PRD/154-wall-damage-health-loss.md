# PRD: Wall Damage — Health Loss & Food Drop

## 1. Problem

### Current Behavior
When the snake collides with a `WALL` or `STONE_WALL` tile (the `'damage'` collision type), the game logic at `public/src/engine/core.js:243-272` applies:
- `stuckCounter = STUCK_TICKS` (5 ticks of immobilization)
- `pendingReverse = true` (direction flips after stuck expires)
- Screen shake
- Score penalty (−5)
- **Early return** — NO tail segment removed, NO food spawned

This means the snake's length is unchanged on wall collision, and there is no resource penalty (a small risk/reward cost) or food reward for the player to recover.

### Expected Behavior
Per issue #154, a wall collision should:
1. Remove the last (tail) segment — reducing snake length by 1
2. Spawn a food item at the wall collision position (the blocked newHead position)
3. The dropped food should **blink/despawn** after a short timeout (like bounce food does)
4. Preserve all existing behavior: `stuckCounter`, `pendingReverse`, screen shake, score penalty, game-over check for length-1 snakes

This matches the behavior snakes already have in the **enemy damage** codepath (`core.js:310-332`), which pops the last segment and drops food at that position.

---

## 2. Solution

### Approach
Port the tail-removal + food-drop pattern from the enemy-damage handler into the wall-damage handler. The food should be a **bounce food** (with despawn/blink timer) so it disappears after a short time, adding urgency.

### Full Replacement Map

**File:** `public/src/engine/core.js`, lines 243–272

| Aspect | Current | New |
|---|---|---|
| **Length check** | `if (s.snake.length <= 1)` → gameover (keep) | Same |
| **Food-at-cell check** | If food also at collision cell, remove it + award 10 pts (keep) | Same |
| **stuckCounter** | Set to `STUCK_TICKS` (keep) | Same |
| **pendingReverse** | Set to `true` (keep) | Same |
| **screenShake** | `{ intensity: 4, duration: 8 }` (keep) | Same |
| **score penalty** | `s.score = Math.max(0, s.score - 5)` (keep) | Same |
| **Tail removal** | ❌ Not done | **Add:** `const lastSeg = s.snake[s.snake.length - 1];` then `s.snake = s.snake.slice(0, -1);` |
| **Food drop** | ❌ Not done | **Add:** Create `createBounceFood(newHead.x, newHead.y, null)` and push to current room's `entities.food` array (if `s.world` is set) |
| **Return** | `return s;` | `return s;` (same) |

### Detailed code change

The current wall-damage block (lines 243–272):

```js
// Wall/Stone_Wall damage — stuck+reverse instead of tail removal
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

    s.stuckCounter = STUCK_TICKS;
    s.pendingReverse = true;
    s.screenShake = { intensity: 4, duration: 8 };
    s.score = Math.max(0, s.score - 5);
    // Don't move head, don't remove tail — return early
    return s;
  }
```

Should become (additions marked `★`):

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

    // ★ Drop bounce food at wall collision position (newHead)
    if (s.world) {
      const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
      const room = getRoomAt(s.world, rx, ry);
      if (room) {
        const food = createBounceFood(newHead.x, newHead.y, null);
        room.entities.food.push(food);
      }
    }

    // ★ Remove last tail segment (health loss)
    s.snake = s.snake.slice(0, -1);

    s.stuckCounter = STUCK_TICKS;
    s.pendingReverse = true;
    s.screenShake = { intensity: 4, duration: 8 };
    s.score = Math.max(0, s.score - 5);
    return s;
  }
```

### Rendered end state (full new block, lines 243–272)

```
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

## 3. Implementation Notes

### Files to Edit

| File | What | Notes |
|---|---|---|
| `public/src/engine/core.js:243-272` | **Primary fix** — add tail removal + bounce food drop inside wall damage handler | Must import `createBounceFood` (already imported from `entities.js` at line 10) |
| `tests/metroidvania-snake.test.js:1264-1284` | **Update test** — wall collision test currently expects `result.snake.length` to be preserved (`toBe(state.snake.length)`). Must change to `toBe(state.snake.length - 1)` | Also add assertion that food was dropped in the room |
| `tests/gameboy-snake.test.js:480-492` | **Check & update** — classic engine variant. If it has a similar engine, update the length expectation | Add food-drop assertion if applicable |

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Food spawn on classic engine without world** | Low | The code already guards with `if (s.world)` — classic engine snakes without a world get tail removal but no food drop (acceptable) |
| **Regression: existing test expects preserved length** | Medium | The test at line 1264 explicitly asserts `toBe(state.snake.length)` — must be updated to `toBe(state.snake.length - 1)`. Easy to spot with `npm run test` |
| **Stacked collisions (both damage AND food)** | Low | The food-at-cell branch runs first and handles eating food at the collision cell; then bounce food is dropped at newHead position — correct behavior |
| **Bounce food dropped inside wall tile** | Low | Bounce food's physics will move it in a random direction for 3 ticks; it will naturally exit the wall tile. Additionally, `updateFoodBlinkDespawn` only runs in boss rooms — need to ensure blink/despawn works everywhere or use regular `createFood` instead |

### Scope Check

- [x] **In scope** — Wall collision → tail removal + bounce food drop + all existing behavior
- [x] **In scope** — Test updates (length assertion change + food drop assertion)
- [ ] **Out of scope** — `STONE_WALL` differentiation (same code path)
- [ ] **Out of scope** — Boss room special handling (bounce food works everywhere)
- [ ] **Out of scope** — Multi-segment damage or damage-on-contact rework

### Acceptance Criteria

1. **Snake length reduces by 1** on wall collision (length > 1)
2. **Bounce food spawns** at the blocked newHead position (if world exists)
3. **Food blinks/despawns** after timeout (handled by `createBounceFood`'s built-in despawn timer)
4. **Existing behaviors preserved**: stuckCounter, pendingReverse, screen shake, score penalty (−5)
5. **Single-segment snake** still gets gameover
6. **If food is also at the collision cell**, it's eaten (+10 pts) before the bounce food drop
7. **All 234 tests pass** (`npm run test`)
