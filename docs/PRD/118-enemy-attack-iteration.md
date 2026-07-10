# Research: 敌人对玩家蛇的攻击迭代 (Enemy Attack on Player Snake)

> Parent Issue: #118
> Agent: Hermes Agent (research-agent)
> Date: 2026-07-11

---

## 1. Problem Definition

### Current Behavior

Currently, when the snake head overlaps with an enemy, the game performs minimal damage:
- **core.js lines 276-290**: The last segment is removed (`s.snake = s.snake.slice(0, -1)`), score is reduced by 5, and screen shake is applied.
- The removed segment simply disappears — it is **not** converted into food.
- There is **no invulnerability period** after being hit — the player can be chain-damaged on successive ticks.
- Enemy AI (`enemyChasePath` in `ai.js`) only chases the snake head; it does **not** actively seek food.
- `tryStealFood` (ai.js line 126) only triggers if the enemy happens to step on the same cell as existing food — no food-chasing behavior exists.

### Expected Behavior (Per Issue #118)

When a player snake is hit by an enemy:

1. **Last segment drops as food**: The last body segment of the snake falls off at its current position, becoming a food item that both the player and enemy can eat.
2. **Enemy chases food**: After the player is hit, enemies in the room should prioritize chasing the dropped food over chasing the player.
3. **Enemy eats food → grows**: If an enemy reaches and eats the food first, the enemy gains +1 HP (+1 segment length).
4. **Player eats food → grows**: If the player reaches the food before the enemy, the player gains +1 length and +10 score (normal food rules).
5. **Brief invulnerability after hit**: After being hit, the player has a short invulnerability window (with visual "flashing") during which they cannot be damaged again by enemies.

### User Scenarios

- **Scenario A (Hit & Drop):** Player collides with an enemy → last segment falls off at that position → enemy switches to food-chase mode → tactical race to reclaim the dropped segment.
- **Scenario B (Enemy steals food):** Enemy reaches the dropped food first → enemy HP+1, length+1 → enemy becomes slightly harder to kill.
- **Scenario C (Player reclaims):** Player snakes back to the food location and eats it → player length+1, score+10 → strategic recovery.
- **Scenario D (Invulnerability window):** After being hit, the player flashes for ~10 ticks — during this time, touching enemies deals no damage.
- **Frequency:** Every enemy collision.

---

## 2. Root Cause Analysis / Design Intent

### Why Does Current Behavior Exist?

The current design (from #15 Metroidvania snake overhaul and #20 enemy collision fix) treats enemy collision as a simple "lose one segment, score penalty" event. The removed segment is discarded — there was no concept of "dropped body segments as loot." Enemy AI was only implemented with player-chasing behavior; food-seeking was limited to a proximity check in `tryStealFood()`.

The `tryStealFood` function (ai.js:126-139) checks a 1-cell radius around the enemy, but only steals if the enemy is **exactly** on the same cell as food. There is no pathfinding toward food — the enemy never actively seeks it.

### Why Change Now?

This feature adds meaningful gameplay depth:
- **Strategic tension**: Players must decide whether to flee from enemies or stay and try to reclaim their dropped segment
- **Enemy empowerment**: Enemies can grow stronger by eating player segments, creating a risk/reward loop
- **Fairness**: The invulnerability window prevents frustration from chain-deaths (being hit every tick until dead)

### Previous Constraints

- **Pure functional state management**: All game state is immutable; `tick()` returns new state.
- **No external dependencies**: Everything is vanilla JS.
- **Room-based entity system**: Food and enemies are stored per-room in `room.entities.{food, enemies}`.
- **Enemy segments already track position**: `enemy.segments` array is maintained and rendered separately.

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js` | Game Engine (`tick()`) | Replace direct `slice(0,-1)` with food-drop logic; add invulnerability state management |
| `public/src/engine/ai.js` | Enemy AI (`updateEnemies()`) | Add food-priority pathfinding; add enemy-eats-food logic with HP/segment gain |
| `public/src/engine/collision.js` | Collision Detection | May need to adjust `checkSnakeCollision` for invulnerability check |
| `public/src/engine/entities.js` | Entity Factories | May need `createFood` helper for dropped segment |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/world.js` | World Data | No changes needed (food already stored per-room) |
| `public/src/render/room.js` | Room Rendering | May need to render invulnerability ("flashing") visual state |
| `public/src/render/hud.js` | HUD Rendering | If invulnerability indicator is shown on HUD |
| `public/src/engine/constants.js` | Constants | New constant for invulnerability tick duration |
| `tests/metroidvania-snake.test.js` | Tests | Add test cases for food drop, enemy food chase, invulnerability |

### Data Flow Impact

```
Current:
  enemy collision → remove last segment → score -5 → screen shake

Proposed:
  enemy collision → 
    1. Set invulnerability flag + tick counter (player starts "flashing")
    2. Last segment position → spawn food item at that world coordinate
    3. Enemy AI switches to food-priority mode
  
  On subsequent ticks:
    - Enemy reaches food cell → enemy.HP++, enemy.segments++
    - Player reaches food cell → snake length++, score+10
    - Invulnerability ticks down → when 0, player can be damaged again
```

### Documents to Update

- [ ] `docs/DESIGN/118-enemy-attack-iteration.md` (after implementation)
- [ ] `README.md` (gameplay features section)
- [ ] Other: ___

---

## 4. Solution Comparison

### Approach A: Food-Drop + Food-Chase AI + Invulnerability (Recommended)

- **Description:** A three-part change:
  1. **core.js** — On enemy collision: store the position of the last segment before removing it, spawn food there, set `invulnerableTicks` on state.
  2. **ai.js** — In `updateEnemies()`: if food exists in the room, the enemy should pathfind to the nearest food instead of the snake head. When enemy reaches food cell, eat it (HP++, segments++).
  3. **core.js** — Each tick, decrement `invulnerableTicks`. When > 0, skip enemy collision damage.
  4. **render side** — When `invulnerableTicks > 0`, apply flashing visual (toggle visibility every 2 ticks).
- **Pros:**
  - Clean, modular separation of concerns
  - Reuses existing entity structures (food, enemy segments)
  - Food-chase can reuse `enemyChasePath()` with food as the target instead of snake head
  - Invulnerability is a simple state counter
- **Cons:**
  - Must handle edge case: what if food and snake head are on the same tile?
  - Multiple enemies + multiple food items: need to decide which food each enemy chases
- **Risk:** Low — all changes are additive, no existing behavior is removed
- **Effort:** ~3-4 hours total

### Approach B: Simplified — Only Food Drop, No Enemy Food Chase

- **Description:** Last segment drops as food when hit, player gets invulnerability, but enemies continue chasing the player (no food-chase behavior). Enemies eat food only if they happen to step on it (current `tryStealFood` behavior).
- **Pros:**
  - Much simpler to implement (no AI changes)
  - Still adds the "drop food as risk/reward" mechanic
  - Invulnerability protects from chain-death
- **Cons:**
  - Misses the core gameplay loop described in issue: "敌人也会来抢食物" (enemy also chases food)
  - No strategic tension — food is just a random drop
  - Doesn't satisfy acceptance criteria
- **Risk:** Low — minimal code changes
- **Effort:** ~1-2 hours

### Approach C: Full Priority System — Food > Player for Enemy AI

- **Description:** Extends Approach A with a priority queue for enemy AI: food in room → chase nearest food → if no food → chase player. When enemy eats food, it gains HP and grows. Supports multiple food items per room and multiple enemies.
  - Priority: 1) Nearby food (within chaseRange) 2) Player (if in same room) 3) Idle
  - When food is eaten by enemy or player, remaining enemies re-evaluate their target
- **Pros:**
  - Full-featured — matches all acceptance criteria
  - Makes gameplay deeper: enemies compete for dropped segments
  - Reuses existing pathfinding
- **Cons:**
  - Slightly more AI logic to handle multiple enemies targeting distinct food items
  - Need to prevent all enemies clustering on one food item
- **Risk:** Low-Medium — AI logic is straightforward greedy pathfinding
- **Effort:** ~4-5 hours

### Recommendation

→ **Approach A** because:
1. It satisfies all acceptance criteria from the issue
2. The food-chase AI naturally extends existing `enemyChasePath()` by passing food coordinates as the target
3. Invulnerability is a simple tick-down counter, requiring minimal state changes
4. Approach C (full priority) can be built on top of Approach A as a future enhancement if needed
5. The effort-to-value ratio is excellent — ~3-4 hours for a significant gameplay improvement

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. Snake head collides with enemy → last body segment position is recorded → food is spawned at that world coordinate
2. Player gains `invulnerableTicks > 0` (e.g., 10 ticks) — cannot take enemy damage
3. Enemy AI in the same room switches target to the nearest food item
4. Enemy pathfinds to and reaches the food → `enemy.hp += 1`, `enemy.segments.push(...)`, food removed from room
5. OR: Player reaches the food first → `s.snake = [newHead, ...s.snake]` (grow by 1), `s.score += 10`
6. After `invulnerableTicks` expire, player can be damaged again

### Edge Cases

1. **Multiple enemies in room:** Both enemies should chase the nearest food. If only one food exists, both path toward it; first to arrive eats it.
2. **Multiple food items:** Enemy chases closest food. Player and enemy could target different food items.
3. **Snake length = 1 when hit:** The last (and only) segment drops as food, but snake length becomes 0 → game over. The dropped food remains for enemies.
4. **Invulnerability + non-enemy damage:** Player should still take wall damage (STONE_WALL, SPIKE) even while invulnerable to enemies.
5. **Hit during room transition:** If enemy collision happens during a room transition, the food should still drop in the room where collision occurred.
6. **Food spawned on wall/obstacle:** If the last segment's position is on a wall cell, spawn the food at the nearest valid floor cell.
7. **Enemy already at full segments:** Enemy eating food should always increase HP by 1, even if already at max. This makes enemies tougher over time.

### Failure Paths

1. **Invulnerability not reset on new game:** State from a previous game (invulnerableTicks) should not carry over — createInitialState must initialize it.
2. **Food drop during non-collision tick:** Only drop food when enemy collision actually triggers damage — not during stuck/reverse ticks.
3. **Double food from same collision:** Ensure food is spawned exactly once per collision event.

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/core.js` | Stable (merged) | Low |
| `public/src/engine/ai.js` | Stable (merged) | Low |
| `public/src/engine/collision.js` | Stable (merged) | Low |
| `public/src/engine/entities.js` | Stable (merged) | Low |
| `public/src/engine/world.js` | Stable (merged) | Low |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Boss enemy AI (Phase 2) | Medium — food-chase AI can serve as base for boss behavior |
| Enemy type specialization | Low — different enemy types could have different food-chase priorities |

### Preparation Needed

- [ ] Confirm branch is based on latest master (includes #20 enemy collision fix and #21 bullet damage fix)
- [ ] Run full test suite to establish baseline: `npm run test`
- [ ] Review how renderer handles entity visibility for "flashing" effect

---

## 7. Spike / Experiment (Optional — depth: standard, skip)

### Question to Answer

N/A — standard depth, no spike needed.

### Method

N/A

### Result

N/A

### Impact on Approach

N/A
