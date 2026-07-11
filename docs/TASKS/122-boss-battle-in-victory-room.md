# Task Breakdown: 增加胜利房间的boss战 — Boss Battle in Victory Room

> Parent Issue: #122
> Agent: Hermes Agent (research-agent)
> Date: 2026-07-11

---

## Overview

Implement a boss battle system that replaces the instant-win goal room with a multi-phase boss encounter. The boss "Blue Hammer" is a dual-column blue snake with 6 total HP, 4-phase AI, and a boss room with destructible pillars. Food dropped from player segments now blinks and despawns after a time delay.

The implementation builds on Issue #118 (enemy attack iteration — food-chase AI, invulnerability frames) and extends existing systems (AI, collision, combat, rendering).

---

## Tasks

### Phase 1: Foundation (Constants, Types, Entity)

#### Task 1.1 — Constants & Type Definitions (`constants.js`)

- [ ] Add `ROOM_TYPE.BOSS = 'boss'` to ROOM_TYPE enum
- [ ] Add `DOOR_TYPE` enum: `{ NORMAL: 'normal', BOSS: 'boss', LOCKED: 'locked', SIZE_GATE: 'size_gate' }`
- [ ] Add boss constants:
  - `BOSS_TOTAL_HP = 6`
  - `BOSS_COL_HP = 3` (HP per column)
  - `BOSS_SPEED_TICKS = 2` (moves every N ticks)
  - `BOSS_CHARGE_SPEED = 1` (cells per sub-tick during charge)
  - `BOSS_CHARGE_DELAY = 5` (ticks of windup before charge)
  - `BOSS_CHARGE_COOLDOWN = 10` (ticks between charges)
  - `BOSS_STUFFED_DURATION = 8` (ticks of pause after overeating)
  - `BOSS_PHASE_CHARGE_THRESHOLD = 4` (enter charge mode at ≤4 HP)
  - `BOSS_PHASE_SINGLE_THRESHOLD = 2` (enter single-snake mode at ≤2 HP)
- [ ] Add food despawn constants:
  - `FOOD_DESPAWN_TICKS = 30` (lifetime in ticks)
  - `FOOD_FLASH_START = 0.5` (start flashing at 50% lifetime)
  - `FOOD_FLASH_INTERVAL_BASE = 6` (base flash interval ticks)

#### Task 1.2 — Door Type System (`world.js`)

- [ ] Add `doorType` field to door data structure: `{ connectedTo, locked, keyId, doorType }` (default: `DOOR_TYPE.NORMAL`)
- [ ] Create `setDoorType(room, dir, type)` helper function
- [ ] Create `isBossDoor(room, dir)` check helper
- [ ] Update door passability checks to include door type awareness
- [ ] Add `getBossDoorDirection(room)` to find the BOSS-type door in a room

#### Task 1.3 — Boss Entity Factory (`entities.js`)

- [ ] Create `createBoss(name, x, y, hp)` factory returning boss entity structure:

  ```js
  {
    id: nextEntityId(),
    name: 'Blue Hammer',
    x, y,                     // Top-left of the dual-column block
    segments1: [{x,y}, ...],  // Right column (3 segments at full HP)
    segments2: [{x,y}, ...],  // Left column (3 segments at full HP)
    hp: 6,
    colHp: 3,                 // HP per column
    direction: {x: 0, y: -1},
    speedTicks: 2,
    tickCounter: 0,
    phase: 'chase',           // 'chase' | 'charge' | 'single' | 'stuffed'
    chargeCooldown: 0,
    chargeWindup: 0,          // Countdown ticks before charge dash
    stuffedTicks: 0,
    roomX, roomY,             // Home room
    chaseRange: 30,
    headIndex: 0,             // Which eye is the head (0 or 1) in single-snake mode
  }
  ```

- [ ] Implement boss movement: both columns shift in tandem, maintaining 1-cell perpendicular gap between columns (align perpendicular to movement direction)
- [ ] Boss head rendering positions: front cell of each column has an "eye" (visual dot)

---

### Phase 2: Boss Room Generation

#### Task 2.1 — Place BOSS Room in Generator (`generator.js`)

- [ ] After generating the world map and placing START/GOAL/SAVE/GACHA rooms, identify the shortest path from START to GOAL
- [ ] On the shortest path, pick the room adjacent to GOAL and change its type to `ROOM_TYPE.BOSS`
- [ ] Set the BOSS room's door direction (toward the previous room on the path) as `DOOR_TYPE.BOSS`
- [ ] Ensure the BOSS room is reachable and doesn't break solvability
- [ ] Modify `generateRoomTiles(room, world, rng)` to generate BOSS room layout:
  - 4 pillars at (3,3), (16,3), (3,16), (16,16) — each a 3×3 block of STONE_WALL cells
  - Clear center area (~14×14) for combat
  - Doors at standard positions but with boss visual flag
- [ ] Modify `placeEnemiesAndItems()` to skip placing regular enemies in BOSS room
- [ ] Do NOT place initial food in BOSS room (boss fight food spawns dynamically)

#### Task 2.2 — Pillar Damage System (`collision.js`, `core.js`)

- [ ] Add pillar collision detection: when snake head moves into a STONE_WALL cell that is a pillar, deal damage (remove 1 segment, drop food at nearest valid floor cell) instead of instant death
- [ ] Pillars are NOT death walls — they are damaging walls with non-lethal damage
- [ ] Boss collision with pillars: destroy pillar cells (STONE_WALL → FLOOR), boss takes no damage
- [ ] Track pillar state: `room.pillarsRemaining` / individual pillar cell tracking

---

### Phase 3: Boss AI

#### Task 3.1 — Boss AI State Machine (`ai.js`)

- [ ] Create `updateBoss(state, boss, room)` as the main AI dispatcher, called each tick from `tick()`
- [ ] Dispatch based on `boss.phase`:
  - `'chase'` → `aiBossChase(boss, snakeHead, room)`
  - `'charge'` → `aiBossCharge(boss, snakeHead, room)`
  - `'single'` → `aiBossSingleSnake(boss, snakeHead, room)`
  - `'stuffed'` → decrement `stuffedTicks`, transition back when 0

- [ ] **Phase Chase (HP > 4):** `aiBossChase()`
  - Use greedy pathfinding toward snake head (same as enemy chase but for dual-column)
  - On reaching snake head cell → check contact range (2 cells due to dual width)
  - On contact: remove 1 segment from player (from tail), drop food with bounce, set invulnerability

- [ ] **Phase Charge (HP ≤ 4 && HP > 2):** `aiBossCharge()`
  - If `chargeCooldown > 0` → decrement and continue chase movement
  - If `chargeCooldown === 0` → enter windup: set `chargeWindup = BOSS_CHARGE_DELAY`
  - During windup: boss stops moving, visual indication (flash/tint)
  - After windup: dash 4-6 cells in player's direction at time of windup start
  - Charge dash: move 1 cell per sub-tick for the dash distance
  - On player contact during dash: remove 2 segments, drop food with bounce, set invulnerability
  - After dash completes: set `chargeCooldown = BOSS_CHARGE_COOLDOWN`

- [ ] **Phase Single-Snake (HP ≤ 2):** `aiBossSingleSnake()`
  - On entry: collapse both columns into one array (flatten segments)
  - Pick nearest eye to current position as new head
  - Movement: standard single-column snake pathfinding toward player
  - On player contact: remove 1 segment from tail, drop food, swap head to the other eye
  - If boss HP reaches 4+ (by eating food): transition back to charge mode (re-split to dual-column)

- [ ] **Food Priority (all phases):** `aiBossPrioritizeFood()`
  - If food exists in room → override current phase behavior
  - Pathfind to nearest food item (using current head position)
  - On reaching food: remove food from room, boss HP += 1, add segment to appropriate column
  - If total segments > 6 → enter `'stuffed'` state for `BOSS_STUFFED_DURATION` ticks
  - In single-snake mode: switch to the eye closer to the food for pathfinding

- [ ] **Phase Transition Helper:** `updateBossPhase(boss)`
  - Called after every HP change to evaluate phase transition
  - IF food on map → keep/enter food-priority (override)
  - ELSE IF stuffed → stay in stuffed
  - ELSE IF hp ≤ 2 → single-snake mode
  - ELSE IF hp ≤ 4 → charge mode
  - ELSE → chase mode

#### Task 3.2 — Stuffed State Handling

- [ ] When boss length exceeds max dual-column length (6), set `boss.phase = 'stuffed'`
- [ ] Stuffed: boss pauses movement for `BOSS_STUFFED_DURATION` ticks
- [ ] Visual indicator: boss "pulsates" (slight size/color change every tick)
- [ ] After stuffed expires: return to appropriate phase based on current HP
- [ ] If boss eats additional food while stuffed → reset stuffed timer (can't stack, just refresh)

---

### Phase 4: Boss Combat & Collision

#### Task 4.1 — Boss Combat System (`combat.js`, `collision.js`)

- [ ] `checkProjectileCollision` — extend to detect boss body segments (check both `segments1` and `segments2`)
- [ ] `applyBossDamage(state, projId, boss)` — decrement boss HP by projectile power, remove tail segment from alternating columns (track last column hit), spawn food at removed segment position with bounce
- [ ] `checkBossCollision(state, head, boss)` — detect player head overlap with either column's body
- [ ] `handleBossHitPlayer(state, boss)` — segment removal from player, food drop with bounce, invulnerability frames
- [ ] `checkBossDeath(state, boss)` — if boss HP ≤ 0: remove boss from room, unlock boss door, set `state.bossDefeated = true`

#### Task 4.2 — Food Drop with Physics (`core.js`, `room.js`)

- [ ] When food is dropped from player/boss damage: create food item with extra fields:
  ```js
  { x, y, tickCreated, lifetime: FOOD_DESPAWN_TICKS, bounced: false }
  ```
- [ ] Implement food "bounce": over 3-4 ticks, the food moves 1-2 cells in a random direction from its origin point
- [ ] After bounce settles, food stays at final position until lifetime expires
- [ ] All food (including non-dropped) with `lifetime` will flash and despawn
- [ ] Initial room-placed food has `lifetime = -1` (no despawn) — only dropped food despawns

---

### Phase 5: Rendering & UI

#### Task 5.1 — Boss Door Rendering (`room.js`)

- [ ] Detect `DOOR_TYPE.BOSS` in room's door data
- [ ] Render boss door with distinct visual: red glow / skull icon / brighter color than normal door
- [ ] On minimap: show boss room with special color (e.g., red outline)

#### Task 5.2 — Boss Room Rendering (`room.js`)

- [ ] Render boss room pillars: STONE_WALL cells drawn with slight glow/shader effect to indicate they are damaging walls (non-lethal)
- [ ] Render boss entity:
  - Two parallel columns of blue segments (use PALETTE.BLUE for body, lighter blue for heads)
  - Two eyes on the front segments (white circles with black pupils)
  - In single-snake mode: single column with one eye
  - Phase change visual cues: charge windup (flash), stuffed state (pulsate)
- [ ] Render dropped food flash animation:
  - When `tickCreated + lifetime * FOOD_FLASH_START ≤ currentTick`: start flashing
  - Flash frequency increases as lifetime approaches 0: `interval = max(1, floor((lifetime - elapsed) * 0.3))`
  - On flash-off ticks: don't draw the food item
- [ ] Render pillar destruction: when pillar cells are destroyed → FLOOR tiles, no visual residue

#### Task 5.3 — Boss HUD (`hud.js`)

- [ ] When in boss room with active boss: show boss HP bar at top center
- [ ] HP bar: 6 segments (hearts or rectangles), filled = green, empty = red
- [ ] Show boss name "Blue Hammer" above the HP bar
- [ ] Show phase indicator text below HP bar (optional: "CHASE", "CHARGE", "SINGLE")
- [ ] HP bar should only appear during boss fight (boss alive and in boss room)

#### Task 5.4 — Boss Intro Cinematic (`overlays.js`)

- [ ] Add `GAME_STATE.BOSS_INTRO` state for cinematic sequence
- [ ] Letterbox effect: draw black bars at top and bottom (60px each) — canvas dims to 400×280 playable area
- [ ] Boss name display: "Blue Hammer" centered, large font, animated (fade in over 0.5s)
- [ ] Boss dialogue: "Snake tasts GOOD !" in a dialog box at bottom
- [ ] Duration: ~3 seconds total (1s name display → 1s dialogue → 1s hold)
- [ ] After cinematic: transition to `GAME_STATE.PLAYING` with boss active
- [ ] All player input is ignored during cinematic (except debug skip)

#### Task 5.5 — Victory Screen Enhancement (`overlays.js`)

- [ ] If `state.bossDefeated` is true on game end: show "BOSS DEFEATED!" in the victory screen
- [ ] Show boss-specific stats: boss HP remaining (always 0), phases endured
- [ ] Normal GOAL victory screen shows when entering GOAL room after boss defeat

---

### Phase 6: Victory Flow Integration

#### Task 6.1 — Core Game Loop Changes (`core.js`)

- [ ] Modify `tick()` to handle BOSS room entry:
  - Check if entering `ROOM_TYPE.BOSS` room → if first time, trigger boss intro cinematic
  - If boss already defeated (room has `bossDefeated: true`), pass through normally
- [ ] Modify GOAL room victory check: gate on `state.bossDefeated`
  - If `state.bossDefeated === true && newRoom.type === GOAL` → gameState = 'won'
  - If `state.bossDefeated === false && newRoom.type === GOAL` → don't win (boss room blocks path)
- [ ] Add boss update call in `tick()`: if current room has active boss → call `updateBoss()`
- [ ] Add periodic food spawn logic: every N ticks while boss alive AND player length ≤ 3 AND boss HP ≤ 3
- [ ] Food spawn: place 1 food item at random FLOOR cell in boss room
- [ ] Handle boss death: remove boss entity, unlock door, set `state.bossDefeated = true`

#### Task 6.2 — Save/Load Compatibility (`save.js`)

- [ ] Save `state.bossDefeated` in SaveData
- [ ] On load: if boss is defeated, restore room state without boss entity
- [ ] On save during boss fight: checkpoint is before boss room (don't save mid-fight state)
- [ ] Clear boss state on new game / restart

---

### Phase 7: Testing

#### Task 7.1 — Boss Fight Tests (`tests/metroidvania-snake.test.js`)

- [ ] **Boss entity creation:** `createBoss('Blue Hammer', 10, 10, 6)` → boss has 2 columns of 3 segments each, 6 HP, phase='chase'
- [ ] **Boss movement:** Both columns move in tandem, maintain 1-cell gap
- [ ] **Phase transition (HP 6→4):** Boss transitions from chase to charge mode
- [ ] **Phase transition (HP 4→2):** Boss transitions from charge to single-snake mode
- [ ] **Phase transition (HP 2→4 via food):** Boss transitions back to charge mode
- [ ] **Boss charge attack:** Windup → dash → collision removes 2 player segments
- [ ] **Boss food priority:** Food in room → boss moves toward food instead of player
- [ ] **Boss stuffed state:** Boss eats beyond 6 segments → pauses for N ticks
- [ ] **Boss collision with pillar:** Pillar destroyed (STONE_WALL → FLOOR), boss takes no damage
- [ ] **Player collision with pillar:** 1 segment removed, food dropped (non-lethal)
- [ ] **Player projectile hits boss:** Boss HP -1, segment removed from tail, food dropped
- [ ] **Boss death:** HP ≤ 0 → boss removed, door unlocked, `state.bossDefeated = true`
- [ ] **GOAL victory gated:** Enter GOAL room without boss defeated → don't win
- [ ] **GOAL victory after boss:** Enter GOAL room with `bossDefeated = true` → win
- [ ] **Food flash/despawn:** Dropped food blinks at 50% lifetime, despawns at 100%
- [ ] **Food bounce:** Dropped food moves 1-2 cells over 3-4 ticks from origin
- [ ] **Boss intro cinematic:** `GAME_STATE.BOSS_INTRO` → letterbox → name → dialogue → playing
- [ ] **Boss fight with short snake (3 segments):** Fight proceeds, snake death = game over
- [ ] **Boss fight with long snake (20 segments):** Fight proceeds, no special behavior
- [ ] **Save/load during boss fight:** Save point restored before boss room, no mid-fight save

#### Task 7.2 — Integration Tests

- [ ] Full game simulation: generate world → navigate to boss room → boss fight → defeat boss → GOAL victory
- [ ] Boss room generation: BOSS room placed adjacent to GOAL on shortest path
- [ ] Boss door visual: minimap shows distinct room type
- [ ] All 4 pillars present in boss room
- [ ] No regular enemies in boss room
- [ ] Food spawns during low-HP stalemate

---

## Implementation Order

```
Phase 1 — Foundation (Tasks 1.1, 1.2, 1.3)
  ↓
Phase 2 — Room & Pillars (Tasks 2.1, 2.2)
  ↓
Phase 3 — Boss AI (Tasks 3.1, 3.2)
  ↓
Phase 4 — Combat (Tasks 4.1, 4.2)
  ↓
Phase 5 — Rendering & UI (Tasks 5.1, 5.2, 5.3, 5.4, 5.5)
  ↓
Phase 6 — Victory Flow (Tasks 6.1, 6.2)
  ↓
Phase 7 — Testing (Tasks 7.1, 7.2)
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Boss AI pathfinding in tight space with 4 pillars | Medium | High | Ensure pillars have 3-cell clearance from walls |
| Charge attack too fast for grid-based movement | Medium | High | Tune charge speed (1 cell per sub-tick, not instant) |
| Dual-column rendering misaligned with movement | Low | Medium | Use shared direction vector with perpendicular offset for second column |
| Food bounce physics feels unnatural | Medium | Low | Simple 1-2 cell random offset is sufficient |
| Boss phase transition edge cases (HP exactly at threshold) | Medium | Medium | Use `<=` thresholds and verify every HP change triggers phase check |
| Player trapped behind boss in tight corridor | Low | High | Ensure center area is 14×14 minimum clear space |
| Boss difficulty unbalanced | Medium | Medium | Tune boss speed and charge damage during playtesting |
