# Research: 增加战斗房间 (Add Combat/Arena Rooms)

> Parent Issue: #224
> Agent: Hermes Agent (research-agent)
> Date: 2026-07-16

---

## 1. Problem Definition

### Current Behavior

1. **No combat-dedicated room type exists.** The game has 7 room types (`ROOM_TYPE` in `constants.js` lines 13-22): NORMAL, START, GOAL, BOSS, SAVE, HIDDEN, GACHA, KEY_SHRINE. There is no COMBAT or ARENA room type.

2. **Enemies are placed at world generation time.** In `generator.js` `placeEnemiesAndItems()` (line 664), enemies are spawned once during map creation. Enemy counts are based on distance from start (line 685): `enemyCount = min(floor(dist * 0.5 * difficulty) + (rng < 0.4 ? 1 : 0), 3)`. They are distributed across NORMAL rooms only — START, SAVE, GOAL, and BOSS rooms are explicitly skipped (lines 672-681).

3. **No "all doors close on entry" mechanic.** The existing door system (`collision.js` `checkDoorPassable()`, lines 253-282) supports:
   - Locked doors (require key)
   - Size gates (require snake length)
   - BOSS door (locked from inside until boss defeated)
   
   None of these implement a "lock all doors on entry, unlock on condition met" pattern.

4. **No per-room combat state.** Rooms store `explored`, `tiles`, `doors`, `entities`, and type-specific data (savePoint, gachaMachine, bossConfig). There is no concept of a "combat active" flag or "enemies remaining" counter on a room.

5. **No periodic food respawn in combat contexts.** The existing food system (`emergencyFoodRespawn` in `ai.js`) only fires when *all rooms* have no food — a last-resort starvation prevention. There is no per-room periodic food spawn system.

6. **The BOSS room is the closest existing pattern** but it's a single, final encounter. Its door-lock mechanic is one-way (can't leave until boss is defeated) but is hardcoded to `room.bossRoom && !state.bossDefeated`. It's not a reusable combat room pattern.

### Expected Behavior (Per Issue #224)

1. **New room type**: `COMBAT` (or `ARENA`) — a standard 20×20 room where the player must defeat all enemies to progress.

2. **Door lock on entry**: When the player enters a combat room, all doors close automatically. Doors remain locked until all enemies in the room are killed.

3. **Random enemy placement**: Each combat room spawns a random set of enemies when entered (or at world-gen time, to be decided in §4).

4. **Periodic food respawn**: During combat, food spawns periodically to sustain the player during extended fights.

5. **Room reset**: If the player dies inside a combat room and reloads, the room should either reset (enemies respawn) or remain in a consistent state.

### User Scenarios

- **Scenario A (Normal Combat):** Player enters combat room → doors close behind them → enemies appear → player fights (shooting, dodging) → all enemies killed → doors unlock → player continues.

- **Scenario B (Player Dies in Combat Room):** Player enters combat room → doors close → player takes lethal damage → game over → player reloads from save → combat room may reset (based on save position).

- **Scenario C (Multiple Combat Rooms):** Player explores dungeon and encounters 2-3 combat rooms at different locations. Each is an independent encounter with its own enemy set and door lock.

- **Scenario D (Periodic Food Helps):** Player is low on HP/length in a combat room with many enemies → periodic food spawns give them a lifeline → player can recover and continue the fight.

- **Frequency:** 2-4 combat rooms per game, placed at varying distances from start on the 5×5 map.

---

## 2. Design Intent

### Why Does Current Behavior Exist?

The current design intentionally distributes enemies across NORMAL rooms without door locking because:

1. **Exploration-first design** (from #15 Metroidvania Overhaul): The game prioritizes free exploration. Locking the player in a room would disrupt the flow of "explore → eat → grow → explore more."

2. **BOSS room as the only lock-in**: The single boss encounter at the end of the game (Issue #127) is the only door-lock experience. It's a climactic finale, designed to be unique.

3. **Enemy avoidance is valid**: Currently, the player can avoid enemies by moving around them. Forcing combat through door locking is a deliberate design shift — it makes combat rooms feel like mini-boss encounters.

4. **Food system designed for exploration**: Food is spread across rooms to reward exploration. Periodic food respawn in a locked room is a different design intent — it's for sustain, not exploration incentive.

### Why Change Now?

1. **Combat variety**: Currently all enemies are in open rooms where the player can flee. Combat rooms force engagement, adding tactical depth and risk/reward decision-making.

2. **Difficulty granularity**: Normal rooms have increasing enemy counts by distance from start but no "intensity spike." Combat rooms give designers (and the generator) a discrete difficulty tool — a room that says "you must fight to pass."

3. **Metroidvania trope**: Locked combat rooms (sometimes called "arena rooms") are a Metroidvania staple — they test the player's combat skills before allowing progress.

4. **Resource pressure**: Finding a combat room late in the game with low HP forces the player to rely on periodic food spawns and careful shooting — creating tension in every tick.

### Previous Constraints the New Design Must Respect

- **Pure functional state**: All game state is immutable; `tick()` returns new state. Combat room logic must follow this pattern.
- **Room-based entities**: Combat room enemies are room-specific, like existing entities.
- **No external dependencies**: Vanilla JS, no engines.
- **Existing door system**: `checkDoorPassable()` supports locked doors — can extend with a conditional lock that checks combat state.
- **Existing enemy AI**: `enemyChasePath()`, `aiState`, segment/hp model — all reusable for combat room enemies.
- **Existing enemy spawn**: `spawnEnemyInRoom()`, `placeEnemiesAndItems()` — combat rooms need their own spawn logic (random placement, difficulty scaling).
- **Existing food system**: `createFood()`, `emergencyFoodRespawn()` — can extend with per-room periodic food timer.
- **Existing combat system**: `combat.js` provides projectile system, damage handling — all reusable.

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/constants.js` | Constants | Add `ROOM_TYPE.COMBAT = 'combat'` to enum |
| `public/src/engine/generator.js` | Map Generation | Add COMBAT room to `assignRoomTypes()`; add `generateCombatRoomTiles()`; add combat-specific enemy placement |
| `public/src/engine/collision.js` | Collision Detection | Update `checkDoorPassable()` to support combat-room door locking (lock all doors on entry, unlock when enemies === 0) |
| `public/src/engine/core.js` | Game Engine (`tick()`) | Add combat room logic: door state tracking, "all enemies killed" check, trigger door unlock |
| `public/src/engine/ai.js` | Enemy AI | Add periodic food spawn for combat rooms (`spawnCombatFood()`), separate from `emergencyFoodRespawn` |
| `public/src/engine/world.js` | World Data | Add per-room `combatActive` flag, `enemiesRemaining` counter, door-lock tracking |
| `public/src/render/room.js` | Room Rendering | Add combat room visual indicators (e.g., crossed swords icon on minimap, combat room door color) |
| `public/src/render/minimap.js` | Minimap | Add COMBAT room color/symbol on minimap |
| `docs/GAME_DESIGN/04-WORLD.md` | GDD | Add COMBAT room type to room type table (§4.2) |
| `docs/GAME_DESIGN/03-COMBAT.md` | GDD | Consider adding combat room mechanics to combat system docs |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/save.js` | Save | Combat room state (doors open/closed, enemies remaining) may need to be saved/restored |
| `public/gameboy.html` | HTML Page | If combat room UI indicators are needed (e.g., "Enemies Remaining: 3" overlay) |

### Data Flow Impact

```
Current (no combat room):
  Enter NORMAL room → enemies are present (from world gen) → doors are always open
  → player can leave at any time → enemies follow through rooms

New flow:
  Enter COMBAT room → room.combatActive = true
    → All doors locked (from inside AND outside?)
    → Enemies active (randomly placed at gen time or on entry)
    → Each tick: check enemy count in room
      → enemies remaining > 0 → periodic food check → continue
      → enemies remaining === 0 → unlock doors, combatActive = false
    → Player exits through now-open door → room stays unlocked
```

### Documents to Update

- [ ] `docs/GAME_DESIGN/04-WORLD.md` — add COMBAT room type (§4.2) and combat door behavior (§4.3)
- [ ] `docs/GAME_DESIGN/03-COMBAT.md` — add combat room mechanics description
- [ ] `docs/PRD/224-combat-rooms.md` (this file)

---

## 4. Solution Comparison

### Approach A: COMBAT Room as Independent Room Type (Recommended)

**Description:**
Add `ROOM_TYPE.COMBAT = 'combat'` to the room type enum. The generator assigns 2-4 NORMAL rooms to COMBAT type during `assignRoomTypes()`, placed at moderate distances from start (dist ≥ 2). Combat rooms are 20×20 (standard size) and look like normal rooms from outside.

**Key mechanics:**

1. **Door locking on entry:**
   - Snake head enters COMBAT room → `room.combatActive = true` in the room data
   - `checkDoorPassable()` checks `room.combatActive` for COMBAT rooms: if active, all doors return `{ passable: false, reason: 'combat_locked' }`
   - When all enemies in the room are dead → `room.combatActive = false` → doors become passable

2. **Enemy generation:**
   - At world-gen time: `placeEnemiesInCombatRoom()` places enemies based on room's distance from start
   - Use existing `spawnEnemyInRoom()` with boosted counts: 2-4 enemies per room, HP 1-3 each
   - Alternative: spawn enemies on first entry (not at gen time), to avoid lag in bullet-through-doors during initial generation

3. **Periodic food spawn:**
   - Each tick while `combatActive`: if no food exists in room AND game timer % 15 === 0 → spawn 1 food at random floor cell
   - Alternative: spawn food every 20 ticks regardless (to prevent starvation in extended fights)

4. **Room visual:**
   - On minimap: different color (e.g., red/orange) or crossed-swords icon
   - On room entry: brief flash/indicator "⚔ Combat Room: Defeat all enemies to proceed!"

5. **Player death and reset:**
   - If player dies in combat room and reloads from save → combat room should reset (enemies respawn, doors lock again)
   - This is consistent with existing behavior (enemies respawn on save load for NORMAL rooms too? Need to verify)

**Pros:**
- Clean architectural pattern: COMBAT is a distinct room type with specific behavior, testable independently
- Reuses existing infrastructure (door system, enemy system, food system)
- Composable: can have 1, 2, or multiple combat rooms on any map
- Minimal new code: door lock logic is an extra check in `checkDoorPassable()`, not a new system
- No rendering changes to rooms themselves (same tiles, same doors — behavior differs)
- Compatible with existing save system (combatActive flag serializes easily)

**Cons:**
- May overlap with existing room types if too many are assigned (5×5 = 25 rooms, 2-4 combat rooms leaves less room for variety)
- Door locking on entry could feel abrupt if the player accidentally walks in
- Need to prevent enemies from entering/leaving the room through doors (combat room enemies must stay contained)

**Risk:** Low-Medium — behavior is additive, most infrastructure exists
**Effort:** ~6-10 hours total

### Approach B: COMBAT Room as a Room Flag (Simplified)

**Description:**
Instead of a new room type, add a `combatRoom: true` flag that can be attached to any NORMAL room. When a flagged room is entered with enemies alive, doors lock. This reuses the "explored" NORMAL room pattern but adds the door-lock constraint.

**Pros:**
- More flexible: any room can be a combat room without restricting the type assignment algorithm
- Simpler generator changes: just flag existing NORMAL rooms instead of reassigning types
- Minimap already shows explored/unexplored NORMAL rooms — combat rooms look identical until entered

**Cons:**
- Less explicit: room type says nothing about the combat nature
- Harder for minimap differentiation (can't easily show combat-ready rooms without extra lookups)
- Generator already has 8 room types competing for 25 slots; flagging NORMAL rooms doesn't change this
- Confusing for the player: "which random NORMAL room has the combat flag?"

**Risk:** Low — simplest change, but less clear design
**Effort:** ~4-6 hours

### Approach C: Combat Room with Per-Room State Machine

**Description:**
Build a combat room state machine with 4 states: `idle` (before entry), `active` (combat in progress), `completed` (all enemies dead), `reset` (after player death/reload). Enemies are spawned ONLY on first entry (not at world-gen time). The state machine tracks door locks, enemy spawn timers, and food spawn independently per room.

**Pros:**
- Most correct: enemies only exist when the player is present, saving memory and avoiding edge cases where enemies escape through doors
- Cleanest state transitions: entry → spawn enemies → fight → unlock
- Supports "room reset on death" naturally (state returns to idle on save load)
- No enemies leaking into adjacent rooms through doors (enemies don't exist until combat starts)

**Cons:**
- Most complex: per-room state machine adds state tracking, serialization, and test burden
- Spawning enemies on entry means the player sees enemies "appear" — could feel gamey
- Extra code for the spawn-on-entry effect (fade-in? pop-in? no animation?)

**Risk:** Medium — state machine is more surface area for bugs
**Effort:** ~8-12 hours

### Recommendation

→ **Approach A** because:

1. **Explicit room type**: `ROOM_TYPE.COMBAT` is self-documenting. Generator code, minimap code, and game logic all know immediately what kind of room this is from the type field alone.

2. **Existing pattern match**: The BOSS room (Approach A from #127) already uses `room.bossRoom` flag for door locking. Adding `room.combatActive` for COMBAT rooms follows the same established pattern.

3. **At world-gen time or on-entry spawning**: Approach A is flexible enough to support either enemy-spawn timing. Recommend **on-entry spawning** (like Approach C's key insight) for cleaner behavior:
   - Enemies don't exist until the player enters → no enemies can escape through doors
   - Room feels "empty" until you step in → doors slam shut → enemies appear → dramatic reveal
   - No stale enemy state across save/load boundaries

4. **Appropriate complexity**: Approach A adds ~6-10 hours for a clean, testable feature. Approach B saves 2 hours but loses clarity. Approach C adds 2-4 more hours for no user-visible benefit over Approach A with on-entry spawning.

**Implementation order suggestion:**
1. Add `ROOM_TYPE.COMBAT = 'combat'` to constants
2. Update generator `assignRoomTypes()`: assign 2-4 NORMAL rooms to COMBAT based on distance from start (dist ≥ 2)
3. Update `generateRoomTiles()`: COMBAT rooms use standard room tiles (no special layout needed)
4. Add `room.combatActive: false`, `room.combatEnemyCount: 0` to room creation
5. Implement combat room enemy spawn (`spawnCombatEnemies()`): create enemies on first room entry
6. Update `checkDoorPassable()`: block all doors when `room.type === 'combat' && room.combatActive`
7. Add combat door-lock logic to `core.js` `tick()`: check enemies in combat room, unlock on zero
8. Add periodic food spawn for combat rooms
9. Update minimap rendering: show combat rooms with special icon/color
10. Add tests

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. Player approaches a COMBAT room from a NORMAL room → door looks normal from outside
2. Player enters the COMBAT room → all doors close (locked state) → enemies spawn (if on-entry spawning) or are already present (if gen-time spawning)
3. Player fights enemies using projectiles
4. Food spawns periodically if the player is low on resources
5. All enemies killed → doors unlock → brief visual feedback ("Room Cleared!")
6. Player exits through any door → room remains unlocked for the rest of the game

### Edge Cases

1. **Player enters combat room with 1 HP:** Doors lock → player is trapped → periodic food spawns give a chance to recover → if they die, game over → load from save → room resets.

2. **Projectile hits enemy on the same tick the last enemy is killed:** Door unlock triggers after all damage is resolved on that tick. Filter: `room.entities.enemies.filter(e => e.hp > 0).length === 0`.

3. **Player immediately reverses out of the combat room on entry:** If the snake head crosses the door boundary and the game detects room change → `combatActive = true` → doors lock. The head must be past the door tile. Test: head at door cell → next tick moves back → is the lock already triggered? Recommend: lock triggers AFTER the room transition completes (head is fully in the new room), so a single-tick peek doesn't lock the player in.

4. **Multiple enemies, player kills them one at a time:** Each death reduces `enemiesRemaining`. Doors stay locked until `enemiesRemaining === 0`. Works fine with sequential kills.

5. **Periodic food spawn when player already has food in the room:** Only spawn if `room.entities.food.length === 0`. Prevents food accumulation. Alternative: check if any food exists within a timer window.

6. **Enemy dropped by combat spawns at the door cell:** Enemy could be immediately visible from outside. Use `findEmptyFloorCell()` (existing) with a margin from door cells — don't spawn enemies within 3 cells of any door.

7. **Player enters combat room with enemies from a previous room following them:** Existing enemy AI + room boundaries should handle this. Combat room enemies only exist when combat is active; followers from other rooms are separate.

8. **Save in a combat room mid-combat:** `room.combatActive` and `room.enemiesRemaining` must be serialized in save data. On reload: combat state restores, doors remain locked, enemies remain as they were.

9. **Combat room right next to start room (dist=1):** Generator should only place combat rooms at dist ≥ 2 from start, to avoid trapping the player immediately.

10. **Combat room adjacent to BOSS room:** Both have door-lock mechanics but for different reasons. Combat room lock clears independently of boss state. No interference expected.

### Failure Paths

1. **Generator assigns 0 combat rooms:** Minimal requirement is 0 (valid if the random selection fails). Should the generator guarantee at least 1? Recommend: guarantee at least 1 combat room per map.

2. **Generator assigns too many combat rooms:** Upper limit should be 4 (leaving room for other types). If COMBAT density is too high, the map feels oppressive. Cap at 4.

3. **Door unlock fails to trigger:** If the enemy-count check in `tick()` misses a death event (e.g., enemy killed by projectile that goes through a door buffer) → doors stay locked. Mitigation: check `combatActive && enemiesRemaining === 0` every tick.

4. **Food spawns inside a wall:** Use `findEmptyFloorCell()` which only returns FLOOR cells. Should be safe.

5. **All enemies killed but `combatActive` not reset:** Defensive: check in `checkDoorPassable()`, `tick()`, and door-render code. Triple-redundancy is fine for a critical game state.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/constants.js` | Stable (merged) | Low |
| `public/src/engine/generator.js` | Stable (merged) | Low — additive changes |
| `public/src/engine/collision.js` | Stable (merged) | Low — extend `checkDoorPassable()` |
| `public/src/engine/core.js` | Stable (merged) | Low-Medium — must not break existing room transitions |
| `public/src/engine/ai.js` | Stable (merged) | Low — additive (food spawn function) |
| `public/src/engine/world.js` | Stable (merged) | Low — additive (room flag) |
| `public/src/render/minimap.js` | Stable (merged) | Low — new minimap color |
| #127 Boss battle | Merged | Medium — provides BOSS_DOOR, door-lock pattern, boss room infrastructure that this feature extends |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Combat room rewards (special loot, keys, power-ups on clearing) | Low |
| Combat room difficulty scaling (more enemies per room in later game) | Low |

### Preparation Needed

- [ ] Run full test suite to establish baseline: `npm run test`
- [ ] Review existing `checkDoorPassable()` locking logic — ensure combat lock doesn't conflict with boss lock or key locks
- [ ] Decide: on-entry enemy spawning vs world-gen-time spawning (Recommend: on-entry)

---

## 7. Continuation Context

*This section is the activeForm handoff to the next agent. It captures the current state
of the feature area so the plan agent can pick up without re-scanning all source files.*

The room system currently has 8 room types (NORMAL, START, GOAL, BOSS, SAVE, HIDDEN, GACHA, KEY_SHRINE) with no COMBAT type. The door system in `collision.js` (`checkDoorPassable()`, lines 253-282) supports locked/key doors, size gates, and boss-room locking (hardcoded to `room.bossRoom && !state.bossDefeated`). Enemies are placed at world-gen time by `placeEnemiesAndItems()` (generator.js line 664) in NORMAL rooms only, with counts based on distance from start (`enemyCount = min(floor(dist * 0.5) + rng, 3)`). Food respawn is limited to `emergencyFoodRespawn()` (fires when all rooms are food-empty). The proposed approach adds `ROOM_TYPE.COMBAT`, assigns 2-4 such rooms on the map, implements all-door locking on entry (extending `checkDoorPassable()`), spawns enemies either on entry or at gen time, adds periodic food spawn during combat, and uses the minimap to signal combat rooms to the player. The main risk is the door-lock/combatActive state machine interacting with save/load and the existing boss-room door lock — both patterns exist but need careful integration so they don't conflict.
