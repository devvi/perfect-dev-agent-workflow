# DESIGN: #224 — 增加战斗房间 (Add Combat/Arena Rooms)

> **Parent Issue:** #224
> **Agent:** plan-agent
> **Date:** 2026-07-16

---

## 1. Architecture Overview

### Core Idea

Add a new `COMBAT` room type. When the player enters a COMBAT room, all doors lock automatically, a set of enemies spawns (on first entry), and periodic food spawns sustain the fight. Once all enemies are killed, doors unlock permanently. This gives the game structured combat encounters following the Metroidvania arena-room trope.

### Data Flow

```ascii
Generator (generator.js)            Game Loop (core.js)              Collision (collision.js)
────────────────────────            ────────────────────             ─────────────────────────
assignRoomTypes()                   tick() → move → collision        checkDoorPassable()
  │  Assign NORMAL rooms                │                               │
  │  to COMBAT type (dist≥2)            │  roomTransition             Check room.type === COMBAT
  │  max 4 rooms                        │    ↓                         │
  ▼                                    │  Enter COMBAT room          combatActive?
world.rooms[ry][rx].type               │    → room.combatActive       → {passable: false,
  = ROOM_TYPE.COMBAT                   │      = true                    reason: 'combat_locked'}
                                       │    → spawnCombatEnemies()    │
placeEnemiesAndItems()                 │      (first entry only)     Enemy remains → blocked
  │  Skip COMBAT rooms                 │                              │
  │  (combat rooms manage              │  Each tick:                  All dead → passable
  │   their own enemies)               │    → updateEnemies()
  ▼                                    │    → checkCombatRoom()       Room Render (room.js)
world cleanup                          │      ├ enemies alive?        ─────────────────────
                                       │      │  → spawnCombatFood    No visual difference
AI Layer (ai.js)                       │      │    (every N ticks)    (same tiles)
────────────────────                   │      │  → keep locked
spawnCombatEnemies() ← NEW             │      └ all dead?             Minimap (minimap.js)
spawnCombatFood()    ← NEW             │         → combatActive=false  ─────────────────────
                                       │         → unlock doors        COMBAT rooms shown
                                       ▼                                with red/orange color
                                     room.combatActive = false
                                     doors passable again
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| New room type vs. room flag | New type `ROOM_TYPE.COMBAT` (Approach A per PRD) | Self-documenting; generator/minimap/collision all see type directly. Follows existing BOSS room pattern. |
| Enemy spawn timing | On first entry, not world-gen time | Prevents enemies leaking through doors at generation; cleaner save/load boundaries; dramatic reveal. |
| Door-lock on entry trigger | After room transition completes | Head must be fully in the new room before lock engages — prevents 1-tick peek from trapping player. |
| Food spawn interval | Every 20 ticks (`COMBAT_FOOD_SPAWN_INTERVAL`) when room has no food | Prevents food accumulation; matches existing boss food timer pattern. |
| Combat room count | 2-4 per map, dist ≥ 2 from start | Avoids trapping player at start; leaves room for other room types (8 types compete for 25 slots). |
| Room reset on death | Allowed (combat state reset on save load) | Simpler than persisting mid-combat state; gives player a fair retry. |

---

## 2. Engine Layer Changes

> Game loop (`core.js`), collision detection (`collision.js`), door locking

### State Additions

No new top-level state fields. New fields live on the room object:

```js
// On COMBAT type room, added by generator:
{
  combatActive: false,       // Set to true on first entry
  combatEnemyCount: 0,       // Number of enemies spawned
  // Enemies are pushed to room.entities.enemies (existing)
}
```

### Game Loop Changes (`core.js`)

**Location 1:** In `tick()`, after room transition block (~line 218 area), add COMBAT room entry detection:

```js
// COMBAT room entry: lock doors & spawn enemies (first entry only)
if (newRoom.type === ROOM_TYPE.COMBAT && !newRoom.combatActive) {
  newRoom.combatActive = true;
  // Spawn combat enemies (on first entry only)
  const spawned = spawnCombatEnemies(newRoom, s.world, s);
  newRoom.combatEnemyCount = spawned.length;
  s.doorMessage = '⚔ COMBAT!';
}
```

**Location 2:** After enemy updates in the main game loop, add combat room check:

```js
// Check combat room status — enemies cleared → unlock
const room = getRoomAt(s.world, s.currentRoom.x, s.currentRoom.y);
if (room && room.type === ROOM_TYPE.COMBAT && room.combatActive) {
  // Count alive enemies
  const aliveEnemies = room.entities.enemies.filter(e => e.hp > 0).length;
  if (aliveEnemies === 0) {
    room.combatActive = false;
    s.doorMessage = '✓ ROOM CLEARED!';
  }
}

// Periodic food spawn for active combat rooms
if (room && room.type === ROOM_TYPE.COMBAT && room.combatActive) {
  spawnCombatFood(room, s);
}
```

**Location 3:** In the `startGame()` handler or initial world setup — no changes needed. Combat room is just a room type; world-gen handles placement.

### Collision Changes (`collision.js`)

**Location:** `checkDoorPassable()` function (lines 253-282), add check AFTER the BOSS room check and BEFORE the locked-door check:

```js
// COMBAT room: all doors locked when combatActive is true
if (room.type === ROOM_TYPE.COMBAT && room.combatActive) {
  return { passable: false, reason: 'combat_locked' };
}
```

**Placement logic:** The order of checks in `checkDoorPassable()` should be:
1. BOSS door check (lines 264-266)
2. **COMBAT room check (NEW)** — blocks all doors when combat is active
3. Locked/key door check (lines 268-272)
4. Size gate check (lines 274-279)
5. Return passable (line 281)

**Safety:** The combat room door lock applies to ALL door directions — the player can't leave through any door. This is different from boss room which only blocks the boss door.

### AI Layer Changes (`ai.js`)

**New function: `spawnCombatEnemies(room, world, state)`**

```js
/**
 * Spawn enemies in a combat room on first entry
 * @param {Object} room — The combat room
 * @param {Object} world — World map
 * @param {Object} state — Current game state (for difficulty)
 * @returns {Array} — Array of spawned enemy entities
 */
export function spawnCombatEnemies(room, world, state) {
  const dist = Math.abs(room.x) + Math.abs(room.y);
  const difficulty = Math.min(1 + Math.floor(dist * 0.3), 3);  // 1-3 difficulty
  const enemyCount = 2 + difficulty;  // 3-5 enemies per combat room
  const enemies = [];

  for (let e = 0; e < enemyCount; e++) {
    // Use existing spawnEnemyInRoom() with margin from doors (3 cells)
    const enemy = spawnEnemyInRoom(room, world);
    if (enemy) {
      // Boost HP based on distance from start
      enemy.hp = 1 + Math.floor(dist * 0.3);
      enemies.push(enemy);
    }
  }

  room.entities.enemies.push(...enemies);
  return enemies;
}
```

**New function: `spawnCombatFood(room, state)`**

```js
/**
 * Periodic food spawn for active combat rooms
 * Spawns 1 food every COMBAT_FOOD_SPAWN_INTERVAL ticks when room has no food
 */
export function spawnCombatFood(room, state) {
  if (room.entities.food.length > 0) return;
  if (state.tickCount % COMBAT_FOOD_SPAWN_INTERVAL !== 0) return;

  const pos = findEmptyFloorCell(room, state.world);
  if (pos) {
    room.entities.food.push({ x: pos.wx, y: pos.wy, combatFood: true });
  }
}
```

---

## 3. Entity Layer Changes

> Generator (`generator.js`), world data (`world.js`), entities

### New Room Type

**Location:** `generator.js` — `assignRoomTypes()` function (line 197), add COMBAT room assignment after gacha rooms:

```js
// Place combat rooms (2-4, dist >= 2 from start)
const combatCount = 2 + Math.floor(rng() * 3);  // 2-4 combat rooms
let placed = 0;
for (let attempts = 0; attempts < 50 && placed < combatCount; attempts++) {
  const rx = Math.floor(rng() * cols);
  const ry = Math.floor(rng() * rows);
  const room = rooms[ry][rx];
  const dist = Math.abs(rx) + Math.abs(ry);
  if (room.type === ROOM_TYPE.NORMAL && dist >= 2) {
    room.type = ROOM_TYPE.COMBAT;
    room.combatActive = false;
    room.combatEnemyCount = 0;
    placed++;
  }
}
```

**Placement priority:** After gacha rooms, before tile generation. This ensures COMBAT rooms don't conflict with SAVE, KEY_SHRINE, GACHA, or BOSS rooms (which are all placed earlier in `assignRoomTypes()`).

### Generator Changes

**`placeEnemiesAndItems()` (line 664):** Skip COMBAT rooms for global enemy placement. Add to the existing skip list:

```js
if (room.type === ROOM_TYPE.SAVE || room.type === ROOM_TYPE.GOAL ||
    room.type === ROOM_TYPE.BOSS || room.type === ROOM_TYPE.COMBAT) {
  // Don't place enemies — boss/combat rooms manage their own
  // Still place minimal food for non-active combat rooms
  if (room.type !== ROOM_TYPE.COMBAT) {
    placeFoodInRoom(room, 2, world, rng);
  }
  continue;
}
```

Note: COMBAT rooms get NO food at world-gen time — food only spawns during combat via `spawnCombatFood()`.

**`buildSafeMap()` (line 778):** Add a combat room to the safe map fallback. Change `rooms[1][0]` from KEY_SHRINE to COMBAT (or find another slot):

```js
// Replace one room: rooms[1][0] = KEY_SHRINE stays, add combat slot
// Easiest: convert rooms[2][0] or rooms[0][2] if they exist
// For a 5×5 map, rooms[2][2] is the center — convert it
rooms[2][2].type = ROOM_TYPE.COMBAT;
rooms[2][2].combatActive = false;
rooms[2][2].combatEnemyCount = 0;
```

### World Data (`world.js`) — Room Creation

No changes to `createRoom()`. The `combatActive` and `combatEnemyCount` fields are added dynamically by the generator when assigning COMBAT type (in `assignRoomTypes()`). The room entity system already supports `room.entities.enemies` — combat room enemies use the same array.

---

## 4. Data Layer Changes

> Constants (`constants.js`), palette, serialization

### New Constants (`constants.js`)

```js
// Add to ROOM_TYPE enum (line 13-22):
export const ROOM_TYPE = {
  // ... existing types ...
  COMBAT: 'combat',
};

// New combat room constants:
export const COMBAT_FOOD_SPAWN_INTERVAL = 20;  // ticks between food spawns
export const MAX_COMBAT_ROOMS = 4;               // max per map
export const COMBAT_MIN_DIST = 2;                // min rooms-away from start
export const COMBAT_ENEMY_MARGIN = 3;            // min cells from door for enemy spawn
```

### Palette Additions (`constants.js`)

```js
// Add to PALETTE:
export const PALETTE = {
  // ... existing palette ...
  COMBAT: '#e94560',      // Used for combat room on minimap (same RED as ENEMY)
};
```

### Save Data Impact (`save.js`)

Minimal impact. Combat room state (`combatActive`, `combatEnemyCount`, enemy array) is already serialized by `serializeWorld()` (save.js line 76) which iterates all rooms and their data. The `combatActive` and `combatEnemyCount` fields are plain booleans/numbers that serialize automatically.

**On save load:** Combat rooms reset:
- `combatActive` is restored from save → if the player saved mid-combat, doors stay locked on reload → enemies are restored from `room.entities.enemies` array
- Alternative: On load, reset all `combatActive` to `false` and clear combat room enemies, letting re-entry trigger the combat anew. This is simpler and fairer.

Recommend: **Reset on load** (simpler, prevents stale combat state after loading):

```js
// In save.js load handler, after world restoration:
for (let y = 0; y < world.rows; y++) {
  for (let x = 0; x < world.cols; x++) {
    const room = world.rooms[y][x];
    if (room.type === ROOM_TYPE.COMBAT) {
      room.combatActive = false;
      room.combatEnemyCount = 0;
      room.entities.enemies = [];
    }
  }
}
```

---

## 5. Render Layer Changes

> Minimap, room rendering, door visuals

### Minimap (`public/src/render/minimap.js`, lines 38-44)

Add COMBAT room color to the type-based color selection:

```js
// After KEY_SHRINE check, add:
else if (room.type === ROOM_TYPE.COMBAT) color = PALETTE.COMBAT;  // '#e94560'
```

This shows combat rooms in red on the minimap when explored.

### Room Rendering (`public/src/render/room.js`)

No tile changes. Combat rooms use standard NORMAL room tiles (no special layout). The combat nature is conveyed through:
- Door behavior (doors don't open when combat is active)
- HUD message on entry ("⚔ COMBAT!")
- HUD message on clear ("✓ ROOM CLEARED!")
- Minimap color

### Door Visual

When combat-locked, doors appear closed (same as any closed door). No special icon — the player discovers they're locked by trying to leave. This maintains the surprise of the encounter.

---

## 6. Input / UI Layer Changes

> No new controls. No new persistent UI elements.

- **Entry feedback:** `state.doorMessage = '⚔ COMBAT!'` is set when entering a combat room (existing HUD renders `doorMessage`)
- **Clear feedback:** `state.doorMessage = '✓ ROOM CLEARED!'` is set when all enemies are killed
- **No new key bindings** — combat uses existing projectile controls (space/shoot)

---

## 7. Test Layer Changes

> Test case descriptions — implement agent writes actual runnable tests

### Test Structure

- **New test block:** `describe('224 — Combat Rooms')` in `tests/metroidvania-snake.test.js`
- **No existing test file modifications needed** (all additions are additive)

### Coverage Requirements

| Area | Normal Path | Edge Cases | Failure Paths |
|------|-------------|------------|---------------|
| Generator creates COMBAT rooms | ✅ | ≥3 (too few rooms, dist<2 filter) | ✅ (0 rooms assigned) |
| Combat room entry → doors lock | ✅ | ≥2 (peek-and-reverse, re-enter) | ✅ (non-combat room unaffected) |
| Kill all enemies → doors unlock | ✅ | ≥2 (multi-enemy sequential death, projectile on last tick) | ✅ (one enemy survives) |
| Periodic food spawn | ✅ | ≥2 (room already has food, food near door margin) | ✅ (no empty floor cells) |
| Combat enemies spawn correctly | ✅ | ≥2 (enemy count scaling, HP scaling) | ✅ (spawn on wall cell avoided) |
| Minimap rendering | ✅ | ≥1 (unexplored vs explored) | — |
| Save/load reset | ✅ | ≥1 (save mid-combat, load → reset) | — |
| BuildSafeMap has combat room | ✅ | ≥1 | — |

### Test Case Descriptions

#### TC1: Generator creates 2-4 COMBAT rooms at dist ≥ 2 from start
- **Setup:** Call `generateWorldMap(5, 5)` with a fixed seed. Retrieve all rooms.
- **Assertions:**
  - At least 1 room has `type === ROOM_TYPE.COMBAT`
  - Every COMBAT room has `Math.abs(room.x) + Math.abs(room.y) >= 2`
  - No COMBAT room overlaps with BOSS, SAVE, GACHA, KEY_SHRINE, or START rooms
  - Each COMBAT room has `combatActive === false` and `combatEnemyCount === 0` initially
- **Edge:** Seed that produces 0 eligible rooms → fallback guarantees at least 1 combat room (via `buildSafeMap()` or retry logic)

#### TC2: Entering COMBAT room sets combatActive=true and spawns enemies
- **Setup:** Generate world with known COMBAT room at (rx, ry). Create initial state with snake positioned just outside the COMBAT room's entrance door. Call `tick(state)` with direction toward the door until room transition occurs.
- **Assertions:**
  - After transition: `room.combatActive === true`
  - `room.combatEnemyCount > 0` (enemies spawned)
  - `room.entities.enemies.length === room.combatEnemyCount`
  - Each enemy has `hp >= 1` (HP scales with distance from start)
  - `state.doorMessage === '⚔ COMBAT!'`
- **Edge (Peek-and-reverse):** Simulate snake head crossing door boundary and immediately reversing on the next tick → `combatActive` should NOT be set (lock only triggers after room transition completes)

#### TC3: All doors blocked when combatActive=true
- **Setup:** After TC2 setup (player in combat room with combatActive=true), call `checkDoorPassable(state, doorDir)` for each door direction.
- **Assertions:**
  - Every direction returns `{ passable: false, reason: 'combat_locked' }`
  - Non-combat rooms are unaffected (adjacent NORMAL rooms have passable doors)
- **Edge:** Re-entering a cleared combat room (combatActive=false) → doors are passable

#### TC4: Killing all enemies → combatActive=false → doors unlock
- **Setup:** Create a combat room with 2 enemies. Manually set all enemies' `hp` to 0. Call the combat-room status check logic.
- **Assertions:**
  - After check: `room.combatActive === false`
  - `state.doorMessage === '✓ ROOM CLEARED!'`
  - `checkDoorPassable(state, doorDir)` returns `{ passable: true }` for all doors
- **Edge (last tick death):** Two enemies, one hit on tick N (dies), second hit on same tick N (dies) → `aliveEnemies === 0` → unlock. Verify both deaths processed before status check.
- **Edge (one enemy survives):** Two enemies, kill only one → `combatActive` stays `true` → doors stay locked

#### TC5: Periodic food spawn in active combat room
- **Setup:** Create combat room with `combatActive=true`, `entities.food=[]`. Set `state.tickCount` to a multiple of `COMBAT_FOOD_SPAWN_INTERVAL`. Call `spawnCombatFood(room, state)`.
- **Assertions:**
  - Food is placed on a FLOOR cell
  - Food is not within `COMBAT_ENEMY_MARGIN` cells of any door
  - If room already has food → no new food is spawned
  - If `tickCount % interval !== 0` → no food spawned
- **Edge:** Room with no empty floor cells → `spawnCombatFood` returns silently (no crash)

#### TC6: Combat room enemies skip from global enemy placement
- **Setup:** Call `generateWorldMap(5, 5)`. Find COMBAT rooms.
- **Assertions:**
  - COMBAT rooms have no enemies from `placeEnemiesAndItems()` (enemy count is 0 before first entry)
  - COMBAT rooms have no food from world-gen (food array is empty before combat starts)

#### TC7: Minimap shows COMBAT rooms in correct color
- **Setup:** Create world with COMBAT room and render minimap.
- **Assertion:** When room is explored, minimap cell color for COMBAT room matches `PALETTE.COMBAT` (`'#e94560'`)
- **Edge:** Unexplored COMBAT room shows fog color (not red) — matches existing fog-of-war behavior

#### TC8: Save/load resets combat rooms
- **Setup:** Create state mid-combat (combatActive=true, enemies present). Serialize via `saveGame()` and deserialize via `loadGame()`.
- **Assertion:** After load, COMBAT rooms have `combatActive=false`, `combatEnemyCount=0`, `entities.enemies=[]`
- **Edge:** Re-entering a previously-cleared combat room after load → combat resets (enemies re-spawn, doors lock again) — or keep cleared status? Recommendation: reset always (consistent behavior, no stale state).

#### TC9: BuildSafeMap fallback includes a combat room
- **Setup:** Call `buildSafeMap(5, 5)` directly.
- **Assertion:** At least one room with `type === ROOM_TYPE.COMBAT` exists

---

## 8. Files Changed (per-layer summary)

### Engine Layer

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Engine | `public/src/engine/constants.js` | Add `ROOM_TYPE.COMBAT`, `COMBAT_FOOD_SPAWN_INTERVAL`, `MAX_COMBAT_ROOMS`, `COMBAT_MIN_DIST`, `COMBAT_ENEMY_MARGIN`, `PALETTE.COMBAT` | +6 |
| Engine | `public/src/engine/core.js` | Add COMBAT room entry handler + combat status check + wire `spawnCombatFood` | +25 |
| Engine | `public/src/engine/collision.js` | Add COMBAT room door lock check in `checkDoorPassable()` | +5 |
| Engine | `public/src/engine/ai.js` | Add `spawnCombatEnemies()` + `spawnCombatFood()` functions | +45 |
| Engine | `public/src/engine/generator.js` | Add COMBAT room assignment in `assignRoomTypes()`; skip COMBAT in `placeEnemiesAndItems()`; add combat room to `buildSafeMap()` | +25 |
| Engine | `public/src/engine/save.js` | Add combat room reset on load | +10 |

### Render Layer

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Render | `public/src/render/minimap.js` | Add COMBAT room color to minimap rendering | +2 |

### Test Layer

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Tests | `tests/metroidvania-snake.test.js` | New `describe('224 — Combat Rooms')` block with TC1-TC9 | +150 |

---

## 9. Verification Checklist

- [ ] TC1: Generator creates 2-4 COMBAT rooms at dist ≥ 2 with correct initial state
- [ ] TC2: Entering COMBAT room → `combatActive=true`, enemies spawn, door message set
- [ ] TC2-edge: Peek-and-reverse does NOT trigger combat lock
- [ ] TC3: All doors locked when `combatActive=true`, passable when `false`
- [ ] TC4: Killing all enemies → `combatActive=false`, doors unlock, clear message
- [ ] TC4-edge: Multiple enemy deaths on same tick → correct lock release
- [ ] TC5: Periodic food spawns in active combat rooms (every N ticks, when no food present)
- [ ] TC6: `placeEnemiesAndItems()` skips COMBAT rooms (no pre-spawned enemies)
- [ ] TC7: Minimap shows COMBAT rooms in red
- [ ] TC8: Save/load resets combat rooms (`combatActive=false`, enemies cleared)
- [ ] TC9: `buildSafeMap()` includes at least 1 COMBAT room
- [ ] No regression on existing features (boss rooms, key shrines, gacha, size gates)
- [ ] All pre-existing tests still pass: `npx vitest run`
- [ ] Generate 10 different maps → each has 1-4 COMBAT rooms, all at dist ≥ 2
