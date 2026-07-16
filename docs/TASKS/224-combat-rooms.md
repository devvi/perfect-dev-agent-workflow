# TASKS: #224 — 增加战斗房间 (Add Combat/Arena Rooms)

> Parent Issue: #224
> Agent: Hermes Agent (research-agent)
> Date: 2026-07-16
> Estimated Effort: ~6-10 hours total (per Approach A of PRD)

---

## Task Breakdown

### Phase 1: Constants & Data Structures (0.5h)

- [ ] **T1.1** Add `ROOM_TYPE.COMBAT = 'combat'` to `constants.js`
- [ ] **T1.2** Add `COMBAT_ROOM_MIN_DIST = 2` (minimum rooms-away from start for combat room placement)
- [ ] **T1.3** Add `COMBAT_FOOD_SPAWN_INTERVAL = 20` (ticks between periodic food spawns in combat rooms)
- [ ] **T1.4** Add `MAX_COMBAT_ROOMS = 4` (max combat rooms per map)
- [ ] **T1.5** Add combat-specific door message: `'combat_locked'` reason for `checkDoorPassable()`

### Phase 2: Generator — Assign Combat Rooms (1.5h)

- [ ] **T2.1** In `generator.js` `assignRoomTypes()`: after placing GACHA rooms, add combat room assignment loop:
  - Target 2-4 NORMAL rooms at dist ≥ 2 from start (0,0)
  - Use fallback logic if not enough eligible rooms
- [ ] **T2.2** Add `generateCombatRoomTiles()` (or reuse `generateRoomTiles()` — combat rooms look like normal rooms)
- [ ] **T2.3** Ensure combat rooms are not adjacent to START room (dist ≥ 2)
- [ ] **T2.4** Ensure combat rooms don't overlap with BOSS, SAVE, GACHA, KEY_SHRINE rooms
- [ ] **T2.5** Update `placeEnemiesAndItems()`: skip COMBAT rooms for global enemy placement (combat rooms manage their own enemies)
- [ ] **T2.6** Update `buildSafeMap()` fallback to include a combat room

### Phase 3: Combat Room Entry Logic (1.5h)

- [ ] **T3.1** Add `room.combatActive = false`, `room.combatEnemyCount = 0` to room creation defaults in `generator.js`
- [ ] **T3.2** In `core.js` `tick()`, add room transition detection for COMBAT rooms:
  - On entering COMBAT room: set `room.combatActive = true`
  - If using on-entry spawning: call `spawnCombatEnemies(room, state.world, difficulty)` to generate enemies
  - Track `room.combatEnemyCount` = number of enemies spawned
- [ ] **T3.3** Add combat room exit condition check:
  - Each tick: if `room.combatActive && room.entities.enemies.filter(e => e.hp > 0).length === 0`:
    - Set `room.combatActive = false`
    - Show brief visual feedback ("Room Cleared!" or door unlock indicator)
- [ ] **T3.4** Add `spawnCombatEnemies(room, world, difficulty)` generator function:
  - 2-4 enemies per room (scaled by difficulty)
  - Use `spawnEnemyInRoom()` with a margin of 3 cells from door positions
  - Enemy HP: 1-3 (same as normal rooms) or boosted (1 HP for dist 2, 2-3 HP for dist 4+)

### Phase 4: Door Locking (1h)

- [ ] **T4.1** In `collision.js` `checkDoorPassable()`:
  - Add check: `if (room.type === ROOM_TYPE.COMBAT && room.combatActive)` → return `{ passable: false, reason: 'combat_locked' }`
  - Ensure this check comes BEFORE the BOSS room check (or is compatible with it)
- [ ] **T4.2** Add door message display: when `reason === 'combat_locked'`, show no message (doors just don't open — the player knows they're locked in) or show "⚔ Enemy remains!" icon
- [ ] **T4.3** Test: entering and immediately reversing — lock should not trigger on a peek (head at door cell, not fully in room)

### Phase 5: Periodic Food Spawn (1h)

- [ ] **T5.1** Add `spawnCombatFood(room, state)` to `ai.js` or `combat.js`:
  - Check: `room.combatActive && room.entities.food.length === 0` AND `tickCount % COMBAT_FOOD_SPAWN_INTERVAL === 0`
  - Use `findEmptyFloorCell()` to place food
  - Spawn 1 food item
- [ ] **T5.2** Wire in `core.js` `tick()`: call `spawnCombatFood()` for COMBAT rooms after enemy updates
- [ ] **T5.3** Ensure periodic food doesn't overlap with `emergencyFoodRespawn()` (emergency should still fire if all rooms empty)

### Phase 6: Minimap & Visual Indicators (0.5h)

- [ ] **T6.1** In `render/minimap.js`: add COMBAT room color (e.g., `'#e94560'` or orange `'#ff8844'`)
- [ ] **T6.2** In `render/room.js`: add optional combat room indicator on room entry ("⚔ Combat Room" flash)
- [ ] **T6.3** Add door visual: when door is combat-locked, show no special indicator (doors look normal closed) — subtlety makes it more surprising

### Phase 7: Save/Load Compatibility (0.5h)

- [ ] **T7.1** In `save.js`: add `combatActive` and `combatEnemyCount` to room serialization
- [ ] **T7.2** On save load: restore combat state — if loading mid-combat, enemies re-appear, doors remain locked
- [ ] **T7.3** Alternative (simpler): reset combat rooms on save load (set `combatActive = false`, clear enemies, let re-entry trigger combat again)

### Phase 8: Core Game Loop Integration (0.5h)

- [ ] **T8.1** In `core.js` `tick()`: integrate combat room logic after enemy updates — same phase as boss room but with different behavior
- [ ] **T8.2** Ensure `enemiesRemaining` counter updates correctly when enemies are killed by projectiles
- [ ] **T8.3** Ensure enemies can't leave the combat room through doors (enemy AI uses `room.entities.enemies` — they should stay in their assigned room)

### Phase 9: Testing (1h)

- [ ] **T9.1** Write test: generator creates COMBAT rooms at dist ≥ 2 from start
- [ ] **T9.2** Write test: entering COMBAT room sets `room.combatActive = true`
- [ ] **T9.3** Write test: all doors blocked when `combatActive = true`
- [ ] **T9.4** Write test: killing all enemies → `combatActive = false` → doors passable
- [ ] **T9.5** Write test: periodic food spawns in active combat rooms (every N ticks)
- [ ] **T9.6** Write test: combat room doors are not blocked when `combatActive = false`
- [ ] **T9.7** Write test: minimap shows COMBAT rooms with correct color
- [ ] **T9.8** Write test: enemies stay within combat room boundaries

---

## Execution Order

```
Phase 1 (Constants)
  │
  ▼
Phase 2 (Generator) ──────────────────┐
  │                                   │
  ▼                                   ▼
Phase 3 (Entry Logic)          Phase 6 (Minimap/Visual)
  │                                   │
  ▼                                   │
Phase 4 (Door Locking)                │
  │                                   │
  ▼                                   │
Phase 5 (Food Spawn)                  │
  │                                   │
  └───────────┬───────────────────────┘
              ▼
        Phase 7 (Save/Load)
              │
        Phase 8 (Core Integration)
              │
        Phase 9 (Tests)
```

Phase 1 must execute first (sets up constants).
Phase 2 (generator) and Phase 6 (minimap) are independent after Phase 1.
Phases 3-5 depend on Phase 2 and are sequential (entry → doors → food).
Phase 7 (save) runs after combat logic is settled.
Phase 8 (integration) wires everything into the game loop.
Phase 9 (tests) runs last as acceptance verification.
