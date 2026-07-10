# Design: #118 — 敌人对玩家蛇的攻击迭代 (Enemy Attack on Player Snake)

> Parent Issue: #118
> Agent: plan-agent
> Date: 2026-07-11

---

## 1. Architecture Overview

### Core Idea
Replace the current snake-vs-enemy collision (simple segment removal + score penalty) with a three-part mechanic: (1) the removed last segment drops as a food item at its last world position, (2) enemy AI prioritises pathfinding toward the nearest dropped food over chasing the snake head, and (3) the player gains a brief invulnerability window after being hit, preventing chain-damage.

### Data Flow
```
Current flow:
  enemy collision → remove last segment → score -5 → screen shake

Proposed flow:
  tick() runs →
    checkSnakeCollision(newHead, ...) returns 'enemy' →
      segmentPos = snake[snake.length-1]   // record last segment
      food = createFood(segmentPos)         // spawn food at that world coord
      room.entities.food.push(food)
      s.invulnerableTicks = INVULNERABILITY_DURATION
      s.snake = s.snake.slice(0, -1)        // remove last segment
      s.score = max(0, s.score - 5)
      screenShake set

  updateEnemies(state) →
    for each enemy in room:
      if room.entities.food.length > 0:
        target = nearestFood(enemy, room.entities.food)
        chase(target)                        // food-priority mode
      else:
        chase(snakeHead)                     // normal mode
      if enemy steps on food → eat it (hp++, segment++, remove food)

   invulnerability tick-down:
     if s.invulnerableTicks > 0:
       s.invulnerableTicks--
       if checkSnakeCollision(...) returns 'enemy': SKIP damage (no op)
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Invulnerability storage | Counter on game state (`invulnerableTicks`) | Simple integer — decrement each tick, check before applying enemy damage |
| Food drop position | Last segment's **current world position** before removal | Ensures food appears where the segment was, not at collision point (may be same cell as enemy — handled as edge case) |
| Enemy food targeting | Nearest-food greedy selection | Simple priority: all food in room → chase closest → if none → chase player. No complex priority queue needed |
| Enemy eats food → grows | `enemy.hp++` and `enemy.segments.push(lastPos)` | Reuses existing segment structure; purely additive |
| Food-on-obstacle fallback | If food cell is WALL/obstacle, walk outward in a spiral to find the nearest FLOOR cell | Prevents food from being unreachable |
| Visual flashing | Render toggle: skip drawing snake every other 2 ticks when `invulnerableTicks > 0` | Simple visual feedback, no new render state needed |

---

## 2. Engine Layer 变更

### State Additions
```js
// Added to game state (initialized in createInitialState)
{
  invulnerableTicks: 0,    // number of ticks remaining where player can't be damaged by enemies
}
```

### 2.1 `core.js` — Enemy collision → food drop + invulnerability

**Change in `tick()`:** Replace the current enemy-collision branch (lines ~276-290) with:

```js
// After checkSnakeCollision(newHead, s.snake, s) returns 'enemy' (or 'enemy_head'):
if (s.invulnerableTicks <= 0) {
  // 1. Record last segment position BEFORE removal
  const lastSeg = s.snake[s.snake.length - 1];
  const dropPos = { x: lastSeg.x, y: lastSeg.y };

  // 2. Spawn food at that position (with obstacle-fallout)
  const food = createFood(dropPos.x, dropPos.y);
  ensureValidFoodPosition(food, currentRoom, s.world);
  currentRoom.entities.food.push(food);

  // 3. Set invulnerability
  s.invulnerableTicks = INVULNERABILITY_DURATION;

  // 4. Remove last segment + score penalty (existing logic)
  s.snake = s.snake.slice(0, -1);
  s.score = Math.max(0, (s.score || 0) - 5);
  s.screenShake = { intensity: 4, duration: 8 };
}
// If invulnerableTicks > 0, enemy collision is silently ignored (no segment removal, no score penalty)
```

**Tick-down logic at end of `tick()`:**
```js
if (s.invulnerableTicks > 0) {
  s.invulnerableTicks--;
}
```

### 2.2 `ai.js` — Food-priority enemy AI

**New function:** `nearestFood(enemy, foodList)` — returns the closest food item to the enemy, or null if foodList is empty.

**Change in `updateEnemies()`:** Before deciding on a target for each enemy:
```js
// Priority: food in room > snake head > idle
let target;
if (room.entities.food && room.entities.food.length > 0) {
  const nearest = nearestFood(enemy, room.entities.food);
  if (nearest && distance(enemy, nearest) <= enemy.chaseRange) {
    target = nearest;  // chase food
  }
}
if (!target) {
  target = snakeHead;  // fallback to chasing player
}
// Then pathfind toward target with enemyChasePath()
```

**Enemy eats food:** In the movement step, after computing the enemy's new position:
```js
const foodIdx = room.entities.food.findIndex(f => f.x === newX && f.y === newY);
if (foodIdx >= 0) {
  room.entities.food.splice(foodIdx, 1);   // consume food
  enemy.hp += 1;                            // +1 HP
  enemy.segments.push({ x: newX, y: newY }); // +1 segment length
}
```

### 2.3 `collision.js` — Invulnerability-aware collision

**No structural change needed.** The invulnerability check is in `tick()` in `core.js` — if `invulnerableTicks > 0`, the enemy collision branch is skipped entirely. However, a guard comment should be added.

### 2.4 `entities.js` — Food creation helper

Ensure `createFood(x, y)` exists or is used. It likely already exists (line 62 of test file imports it). If not, add:
```js
export function createFood(x, y, type = 'normal') {
  return { x, y, type };
}
```

### 2.5 `constants.js` — New constant
```js
export const INVULNERABILITY_DURATION = 10;  // ticks of invulnerability after enemy hit
```

### Game Loop Changes (`core.js`)

- `tick()`: Branch on `invulnerableTicks > 0` to skip enemy collision damage
- `tick()`: After all updates, decrement `invulnerableTicks` if > 0
- `createInitialState()`: Initialize `invulnerableTicks: 0`
- `startGame()`: Ensure `invulnerableTicks: 0` is set (new game cleanup)

---

## 3. Entity Layer 变更

### New Entity Types
No new entity types. The dropped food reuses the existing `createFood()` entity structure `{ x, y, type }`.

### Existing Entity Modifications
- **Enemy (`enemy` object)**: No structural changes. Enemy eats food by consuming from `room.entities.food[]` array and mutating `.hp` / `.segments`.
- **Food (`food` object)**: No structural changes. The dropped segment is simply a generic food item with `type: 'normal'`.

### World / Map Changes
No world structure changes. Food storage remains `room.entities.food[]`.

---

## 4. Data Layer 变更

### New Constants (`constants.js`)
```js
export const INVULNERABILITY_DURATION = 10;   // ~10 game ticks ~= 1.5 seconds at default speed
```

### Save Data Changes
- `invulnerableTicks` is transient game state — **not saved** to save file (reset to 0 on load).
- Dropped food in rooms should persist in save (it's already part of `room.entities.food`).

---

## 5. Render Layer 变更

### 5.1 `room.js` — Invulnerability visual flashing

**Change:** In the snake rendering path, when `invulnerableTicks > 0`, toggle snake visibility every 2 ticks:

```js
// In snake rendering section of renderRoom():
if (s.invulnerableTicks > 0) {
  // Flash: skip drawing every other 2 ticks for visual effect
  const flashPhase = Math.floor(s.invulnerableTicks / 2) % 2;
  if (flashPhase === 0) {
    // Render snake normally
  } else {
    // Skip rendering (invisible this frame) — or render semi-transparent
    // Draw a faint outline instead of full snake
  }
} else {
  // Normal snake rendering
}
```

### HUD / Overlay Changes
No HUD changes needed — the visual flashing on the snake itself is sufficient feedback.

---

## 6. Input / UI Layer 变更

No input or UI changes.

---

## 7. Test Layer 变更

### 7.1 Test Structure

| # | Test File | Focus |
|---|-----------|-------|
| 1 | `tests/metroidvania-snake.test.js` (extend Phase 4) | New enemy collision → food drop tests |
| 2 | `tests/metroidvania-snake.test.js` (extend Phase 5) | Food chase AI and enemy-eats-food tests |

### 7.2 Coverage Requirements

| Area | Normal Path | Edge Cases | Failure Paths |
|------|-------------|------------|---------------|
| Enemy collision → food drop | ✅ | ≥3 | ✅ |
| Enemy food-chase AI | ✅ | ≥2 | ✅ |
| Enemy eats food → grows | ✅ | ≥2 | ✅ |
| Player eats dropped food | ✅ | ≥2 | ✅ |
| Invulnerability window | ✅ | ≥3 | ✅ |
| Multiple enemies / multiple food | ✅ | ≥2 | ✅ |
| No regression on existing collision | ✅ | ≥1 | ✅ |

---

## 8. Implementation Phases

### Phase 1: Food Drop + Invulnerability (core.js, entities.js, constants.js)

**Files:**
- `public/src/engine/constants.js` — add `INVULNERABILITY_DURATION`
- `public/src/engine/entities.js` — ensure `createFood(x, y)` exists
- `public/src/engine/core.js` — modify enemy collision branch in `tick()`:
  - Add `invulnerableTicks > 0` guard before enemy damage
  - Record last segment position, spawn food at that cell
  - Set `invulnerableTicks` after hit
  - Decrement `invulnerableTicks` each tick
  - Initialize `invulnerableTicks: 0` in `createInitialState()`
- **Test stubs:** Add test skeletons for Phase 1 scenarios

**Tasks:**
1. Add `INVULNERABILITY_DURATION = 10` to constants.js
2. Ensure `createFood(x, y)` export exists in entities.js
3. In `createInitialState()`, add `invulnerableTicks: 0`
4. In `tick()`, add invulnerability guard before enemy collision damage
5. In `tick()`, after collision: record last segment, spawn food, set invulnerableTicks
6. In `tick()`, decrement invulnerableTicks at end
7. Add `ensureValidFoodPosition()` to handle food-on-obstacle edge case

**Test specifications (text only):**
- **NP1** (Normal Path): Enemy collision → food spawns at last segment position, segment count decreases by 1
- **NP2** (Normal Path): After hit, snake head touching enemy on next tick does NOT take damage
- **EC1** (Edge Case): Snake length = 1 when hit → last (only) segment drops, but game ends (snake = []) — food still remains in room
- **EC2** (Edge Case): Food spawns on WALL cell → food is relocated to nearest FLOOR cell
- **FP1** (Failure Path): InvulnerabilityTicks persists across new game → verify `startGame()` resets to 0
- **FP2** (Failure Path): Double food from same collision → verify food spawns exactly once

---

### Phase 2: Enemy Food-Chase AI (ai.js)

**Files:**
- `public/src/engine/ai.js` — modify `updateEnemies()`:
  - Add `nearestFood()` helper function
  - Add food-priority targeting logic
  - Add enemy-eats-food logic on movement
- `tests/metroidvania-snake.test.js` — add full test implementations

**Tasks:**
1. Add `nearestFood(enemy, foodList)` function — returns closest food item by Manhattan distance
2. Modify enemy targeting in `updateEnemies()`: check food first if food exists in room
3. Add enemy-eats-food logic: after enemy moves, check if it landed on a food cell → consume it
4. Handle enemy HP/segment growth on food consumption

**Test specifications (text only):**
- **NP3** (Normal Path): Food exists in room → enemy chases food (moves toward it) instead of snake head
- **NP4** (Normal Path): Enemy reaches food cell → food removed from room → enemy.hp increases by 1 → enemy.segments gains +1
- **EC3** (Edge Case): No food in room → enemy chases snake head (normal behavior, no regression)
- **EC4** (Edge Case): Two food items in room → enemy chases closest one
- **EC5** (Edge Case): Two enemies, one food item → both chase it, first to arrive consumes it, second re-evaluates target
- **FP3** (Failure Path): Enemy already at full segments → eating food still increases HP by 1 (enemy gets tougher)

---

### Phase 3: Visual Flashing + Player Eats Dropped Food (room.js, core.js)

**Files:**
- `public/src/render/room.js` — add invulnerability flashing effect
- `public/src/engine/core.js` — ensure player eating dropped food works (should already work via existing food-consumption logic, but verify)
- `tests/metroidvania-snake.test.js` — add rendering-adjacent and player-eats-food tests

**Tasks:**
1. In `renderRoom()`: when `invulnerableTicks > 0`, toggle snake visibility every 2 ticks (flash effect)
2. Verify player eating dropped food works: snake head lands on food cell → normal eat-food behavior (+1 length, +10 score)
3. End-to-end test: enemy hits player → food drops → player reclaims it → verify score and length

**Test specifications (text only):**
- **NP5** (Normal Path): Player eats dropped food → snake length +1, score +10 (same as normal food)
- **NP6** (Normal Path): Enemy eats food → snake does NOT gain score/length
- **EC6** (Edge Case): Multiple food items in room (one dropped, one normal) — player can eat either, enemy chases nearest
- **EC7** (Edge Case): Invulnerable ticks expire → enemy can damage player again
- **EC8** (Edge Case): Player hit while already invulnerable (shouldn't happen, but tick > 0 guard ensures no-op)
- **FP4** (Failure Path): Non-enemy damage (wall, spike) still works during invulnerability window
- **FP5** (Failure Path): Enemy collision during room transition — food drops in room where collision occurred

---

## 9. Files Changed（按層匯總）

### Engine Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/engine/constants.js` | Add `INVULNERABILITY_DURATION` constant | +1 |
| `public/src/engine/entities.js` | Ensure `createFood()` export exists | ±0–5 |
| `public/src/engine/core.js` | Modify enemy collision: food drop, invulnerability, tick-down | ±40 |
| `public/src/engine/ai.js` | Add `nearestFood()`, food-priority targeting, enemy-eats-food | ±40 |

### Render Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/render/room.js` | Add invulnerability flash (skip snake render every 2 ticks) | ±15 |

### Test Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/metroidvania-snake.test.js` | Add Phase 1–3 test cases (food drop, invulnerability, AI chase, eat) | ±120 |

---

## 10. Verification Checklist

- [ ] Enemy collision spawns food at last segment position (not collision point)
- [ ] `invulnerableTicks > 0` prevents enemy damage during window
- [ ] `invulnerableTicks` decrements each tick, reaches 0 → damage resumes
- [ ] Enemy AI chases nearest food when food exists in room
- [ ] Enemy eats food → `hp++`, `segments.push()` (length +1)
- [ ] Player eats dropped food → length +1, score +10
- [ ] Snake length 1 → hit → food drops, game over (snake = [])
- [ ] Food on WALL → relocated to nearest FLOOR
- [ ] Non-enemy damage (wall, spike) works during invulnerability
- [ ] Multiple enemies target distinct food items correctly
- [ ] Visual flashing visible during invulnerability window
- [ ] No regression on existing Phase 4 (enemy AI) tests
- [ ] No regression on existing Phase 5 (food system) tests
- [ ] All pre-existing tests still pass
