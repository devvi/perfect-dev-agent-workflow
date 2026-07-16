# Research: 玩家初始状态修改 — Player Initial State Modification (Issue #222)

> Parent Issue: #222
> Agent: research-agent
> Date: 2026-07-16
> Status: Research Complete
> Priority: Low (light depth)

---

## 1. Overview & Motivation

Modify player starting conditions to **increase initial pressure** and encourage the player to **quickly move between rooms**:

1. **Initial health**: Player starts with **2 snake segments** instead of 3 (less health margin at the start)
2. **Starting room enemies**: Place **2 enemies** in the start room so the player cannot idle safely

### Motivation (from issue body)
> "增加一开始的压力，让玩家快速切换房间"
> (Increase initial pressure to encourage the player to quickly switch rooms)

---

## 2. Current State Analysis

### 2.1 Player Initial Health (Snake Length)

The game uses **snake segment count as player health**. When the snake takes damage (wall collision, enemy contact), the last tail segment is removed.

| Aspect | Location | Current Value |
|--------|----------|---------------|
| Snake creation | `public/src/engine/entities.js:9-15` (`createSnake()`) | **3 segments**: `[head, body, tail]` at positions `(start, start-1, start-2)` |
| Default initial state | `public/src/engine/core.js:23-81` (`createInitialState()`) | Calls `createSnake()` with center position of start room |

**Health mechanics**: The snake length IS the player's HP:
- Wall collision → remove tail segment (line 287, core.js)
- Enemy contact → remove tail segment (line 352, core.js)
- Snake length reaches 0 → game over (lines 290-293, 356-359, 412-415, core.js)
- Self-collision → remove tail + stun (lines 231-240, core.js)
- Invulnerability frames exist (10 ticks) after enemy hits (line 349, core.js)

### 2.2 Enemy Placement in Start Room

| Aspect | Location | Current Value |
|--------|----------|---------------|
| Enemy placement | `public/src/engine/generator.js:664-697` (`placeEnemiesAndItems()`) | **Start room explicitly skipped** (lines 672-675) |
| Food in start room | Same function | **3 food items** placed in start room |
| Start room type | `ROOM_TYPE.START` at grid `(0,0)` | Starts explored, center 5×5 cleared of obstacles |

**Current code** (`generator.js:672-675`):
```js
// Skip start room for enemies (but still place some food)
if (room.type === ROOM_TYPE.START) {
  placeFoodInRoom(room, 3, world, rng);
  continue;
}
```

### 2.3 Solvability Verification

The `verifySolvability()` function (`generator.js:364-421`) uses BFS from start to boss room, checking that key/lock ordering is solvable. Enemies **do not affect** solvability checks — they are purely gameplay entities with no impact on map connectivity.

---

## 3. Changes Required

### 3.1 Reduce Starting Snake Length: 3 → 2

**File: `public/src/engine/entities.js`** (line 9-14)

```js
// Current (3 segments):
export function createSnake(startWorldX, startWorldY) {
  return [
    { x: startWorldX, y: startWorldY },
    { x: startWorldX - 1, y: startWorldY },
    { x: startWorldX - 2, y: startWorldY },
  ];
}

// Changed (2 segments):
export function createSnake(startWorldX, startWorldY) {
  return [
    { x: startWorldX, y: startWorldY },
    { x: startWorldX - 1, y: startWorldY },
  ];
}
```

**Impact**: Player starts with 2 HP instead of 3. One hit brings them to 1 HP; a second hit = game over. Forces careful movement from the very start.

### 3.2 Add 2 Enemies to Start Room

**File: `public/src/engine/generator.js`** (line 672-675)

Remove the early `continue` that skips the start room, and instead place enemies in the start room:

```js
// Current:
if (room.type === ROOM_TYPE.START) {
  placeFoodInRoom(room, 3, world, rng);
  continue;
}

// Changed:
if (room.type === ROOM_TYPE.START) {
  placeFoodInRoom(room, 3, world, rng);
  // Place 2 enemies in start room to create initial pressure
  for (let e = 0; e < 2; e++) {
    const enemy = spawnEnemyInRoom(room, world, rng);
    if (enemy) room.entities.enemies.push(enemy);
  }
  continue;
}
```

**Enemy specs** (from `spawnEnemyInRoom`, generator.js:744-768):
- HP: 1-3 (random)
- Speed: moves every 2 ticks
- Chase range: 20 cells (will approach the player)
- AI: idle → chase on proximity

### 3.3 Test Update

**File: `tests/gameboy-snake.test.js`** (line 37-48)

The test `'should return idle state with snake length 3, score 0, and centered at (10,10)'` explicitly checks `expect(state.snake).toHaveLength(3)`. Update to `toHaveLength(2)` and remove the assertion for `state.snake[2]`.

Other tests that assume snake length = 3 may need adjustment. A grep for `snake.length.*3\|toHaveLength(3)\|toHaveLength.*3` in test files will reveal all candidates.

---

## 4. Impact Analysis

### Directly Affected Files

| File | Change | Risk |
|------|--------|------|
| `public/src/engine/entities.js` | `createSnake()` — remove one segment | **Low** (data-only change) |
| `public/src/engine/generator.js` | `placeEnemiesAndItems()` — add enemy placement in START rooms | **Low** (reuses existing `spawnEnemyInRoom`) |
| `tests/gameboy-snake.test.js` | Update initial length assertion | **Low** (test expectation fix) |

### Indirectly Affected Files

| File | Why Affected |
|------|-------------|
| `tests/metroidvania-snake.test.js` | Some tests may assume snake length = 3 in certain room-transition or collision tests |
| `public/src/engine/core.js` | No change needed — damage/health logic (tail removal) works the same regardless of starting length |

### Impact on Gameplay

| Scenario | Before (Length=3) | After (Length=2) |
|----------|-------------------|------------------|
| First enemy hit | Survive with 2/3 HP | Survive with 1/2 HP (critical) |
| Second enemy hit | Survive with 1/3 HP | **Game over** (0/2 HP) |
| Wall collision | Lose 1 segment → 2/3 | Lose 1 segment → 1/2 (critical) |
| Start room enemies | None (safe zone) | 2 enemies must be dodged or killed |
| Start room food | 3 food items | Still 3 food items (unchanged) |

### Risk: Game Balance

With 2 starting HP and 2 enemies in the start room, the player can die very quickly. Mitigations:
- Food is still plentiful (3 items) — eating food grows the snake, effectively healing
- Player can immediately exit to adjacent rooms (no locked doors on start room)
- Enemy AI allows dodging (not all enemies are hyper-aggressive)
- 10 ticks of invulnerability after each hit provides a brief grace period

---

## 5. Implementation Notes

### Approach: Light-Depth Direct Changes

Both changes are **2-3 line modifications** in existing functions. No new data structures, no new files:

1. **`entities.js`**: Remove one `{ x: ..., y: ... }` object from the return array of `createSnake()`
2. **`generator.js`**: Add a `for` loop before the `continue` in the START room branch of `placeEnemiesAndItems()`

### Solvability Concern

Enemies do not affect map connectivity — the `verifySolvability()` BFS only checks door/room connectivity and key/lock ordering. Adding enemies to the start room does not impact solvability.

### Edge Cases

1. **Start room at (0,0) with 2 enemies**: `spawnEnemyInRoom` uses `findEmptyFloorCell` which checks for floor tiles free of entities. The start room's center 5×5 is cleared, providing ample space for enemy placement.
2. **Multiple playthroughs**: Procedural generation uses RNG, but the 2-enemy placement is deterministic (always 2). The RNG affects which floor cells enemies spawn on.
3. **Safe map fallback**: `buildSafeMap()` (generator.js:778-820) also calls `placeEnemiesAndItems()` — so the safe map fallback will also get 2 enemies in the start room.

---

## 6. Acceptance Criteria

### Normal Path
1. Player starts game → snake has **exactly 2 segments** (length 2)
2. Start room contains **2 enemy entities**
3. Enemies are placed on floor cells (not overlapping each other or food)
4. Enemies are visible in the room and can be collided with
5. Eating food (growing to 3 segments) restores survivability margin

### Edge Cases
1. Safe map fallback also has 2 enemies + 2-segment start
2. Enemies can be killed with projectiles (damage works normally)
3. After dying (length 0 from enemy hits), game over triggers correctly

### Failure Paths
1. Enemy cannot spawn in start room (no floor cells) → `spawnEnemyInRoom` returns null → silently skip (graceful fallback)
2. RNG places both enemies on the same path → valid gameplay (may be harder, but still playable)

---

## 7. Dependencies & Blockers

| Dependency | Status | Risk |
|------------|--------|------|
| `entities.js` — no external imports affected | Already analyzed | **None** |
| `generator.js` — `spawnEnemyInRoom` already imported | Already available | **None** |
| Test expectation updates | Manual grep needed | **Low** |

**No blockers.** Both changes are independent, leaf-level modifications with no architectural dependencies.

---

## 8. Future Considerations (Out of Scope)

- **Difficulty scaling**: Future issues could make starting length/enemy count configurable per difficulty level
- **Tutorial**: A brief "tip" message when entering the start room could help new players understand the dodge-or-leave dynamic
- **Variable enemy count based on map size**: Could scale start room enemies to map size in larger grids

---

*PRD generated 2026-07-16 — research depth: light*
