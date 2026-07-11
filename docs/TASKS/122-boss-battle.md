# Task Breakdown: Boss Battle System

> Parent Issue: #122
> Agent: Game Research Agent
> Date: 2026-07-11

---

## Overview

Implement a boss battle system that replaces the instant-win goal room with a multi-phase boss encounter. The boss "Blue Hammer" is a dual-column blue snake with 6 total HP that exhibits 4 behavior patterns: chase, charge (≤4 HP), single-snake mode (≤2 HP), and food priority mode. The boss room has 4 destructible pillars and a special boss door.

---

## Tasks

### 1. Constants & Types (`constants.js`)
- [ ] Add `ROOM_TYPE.BOSS` enum value
- [ ] Add `DOOR_TYPE` enum: `{ NORMAL, BOSS, LOCKED, SIZE_GATE }`
- [ ] Add `CELL.BOSS_WALL` (or reuse `CELL.STONE_WALL` for pillars)
- [ ] Add boss constants: `BOSS_HP`, `BOSS_SPEED_TICKS`, `BOSS_CHARGE_SPEED`, `BOSS_CHARGE_DELAY`, `BOSS_STUFFED_DURATION`, `FOOD_FLASH_INTERVAL`, `FOOD_DESPAWN_TICKS`

### 2. Door System Update (`world.js`)
- [ ] Add `doorType` field to door data structure (default: NORMAL)
- [ ] Create `setDoorType(room, dir, type)` helper
- [ ] Create `isBossDoor(room, dir)` check helper
- [ ] Ensure door passability checks include door type awareness

### 3. Boss Entity (`entities.js`)
- [ ] Create `createBoss(name, x, y, hp)` factory returning boss entity:
  ```js
  {
    id, name, x, y,
    segments1: [...],  // Right column (3 segments at full HP)
    segments2: [...],  // Left column (3 segments at full HP)
    hp: 6, colHp: 3,
    direction: {x, y},
    speedTicks: 2, tickCounter: 0,
    phase: 'chase',  // 'chase' | 'charge' | 'single' | 'stuffed'
    chargeCooldown: 0,
    stuffedTicks: 0,
    roomX, roomY,
    chaseRange: 30,
  }
  ```
- [ ] Implement boss movement: both columns move in tandem, maintaining 1-cell gap

### 4. Boss AI (`ai.js`)
- [ ] Implement `updateBoss(state, boss, room)` — main AI dispatcher
- [ ] **Phase 1 — Chase (HP > 4):** Boss pursues player using greedy pathfinding. On contact, deals 1 segment damage with food drop + physics bounce.
- [ ] **Phase 2 — Charge (HP ≤ 4, HP > 2):** Boss enters charge mode: 3-tick windup animation → dash 4-6 cells in player's direction. Hits for 2 segment damage + food drop. Cooldown between charges.
- [ ] **Phase 3 — Single Snake (HP ≤ 2):** Boss splits into single-column snake. One eye becomes head. On player contact, head swaps to other eye. If boss regrows to 4+ HP → returns to charge mode.
- [ ] **Food Priority (all phases):** If food exists in room, boss moves toward nearest food, overriding phase behavior. If boss length would exceed 6 after eating → enter stuffed state (pause movement for N ticks).
- [ ] **Pillar collision:** Boss moves through pillars, destroying them (pillar cells → FLOOR). Boss takes no damage from pillars.

### 5. Boss Combat (`combat.js`, `collision.js`)
- [ ] Extend `checkProjectileCollision` to detect boss body segments (both columns)
- [ ] Create `applyBossDamage(state, projId, boss)` — decrement HP, remove tail segment from a column (alternating), spawn food at removed segment position
- [ ] Create `checkBossCollision(state, head, boss)` — detect player collision with either column
- [ ] Create `handleBossHitPlayer(state, boss)` — segment removal, food drop with bounce velocity, invulnerability frames
- [ ] Create `checkBossDeath(state, boss)` — remove boss, unlock boss door, mark `state.bossDefeated = true`

### 6. Boss Room Generation (`generator.js`)
- [ ] Place BOSS room on the shortest path adjacent to GOAL room
- [ ] Set BOSS room's door to previous room as type `DOOR_TYPE.BOSS`
- [ ] Generate boss room tiles: 4 pillars at (3,3), (16,3), (3,16), (16,16) using `CELL.STONE_WALL`
- [ ] Ensure center area is clear for boss/player movement
- [ ] Modify `placeEnemiesAndItems` to skip placing regular enemies in BOSS room
- [ ] Do NOT place food in boss room initially (boss does not need starting food)

### 7. Boss Intro Cinematic (`overlays.js`, `core.js`)
- [ ] Add `GAME_STATE.BOSS_INTRO` state for cinematic sequence
- [ ] Letterbox effect: draw black bars at top/bottom (60px each)
- [ ] Boss name display: "Blue Hammer" centered, animated (fade in)
- [ ] Boss dialogue: "Snake tasts GOOD !" with dialog box at bottom
- [ ] Duration: ~3 seconds of auto-advance text
- [ ] After cinematic: transition to `GAME_STATE.PLAYING` with boss active
- [ ] Game is paused/player input disabled during cinematic

### 8. Boss Room Rendering (`room.js`, `hud.js`)
- [ ] Render boss door differently: red glow / skull icon / distinct color
- [ ] Render boss room pillars: use STONE_WALL rendering with slight glow
- [ ] Render boss entity: dual-column blue snake, two heads with eyes
- [ ] Boss HP bar: centered at top of screen, 6 heart segments (or HP bar), rendered in HUD
- [ ] Render food from dropped segments with flash animation (increasing frequency)
- [ ] Show boss name above HP bar during fight

### 9. Food Drop Physics (`core.js`, `room.js`)
- [ ] When food is dropped from player damage: store `{x, y, tickCreated, vx, vy}` for each food item
- [ ] Implement food bounce: food appears at drop position with random velocity, "bounces" 1-2 cells away over 3-4 ticks
- [ ] Food lifetime: `FOOD_DESPAWN_TICKS` (e.g., 30 ticks)
- [ ] Food flash: starts flashing at 50% lifetime, interval decreases as lifetime approaches 0
- [ ] Food despawns and disappears when lifetime reaches 0

### 10. Victory Flow (`core.js`)
- [ ] Modify GOAL room victory check: gate on `state.bossDefeated`
- [ ] On boss death: unlock the boss door leading to the GOAL room
- [ ] If player enters boss room with boss already defeated → normal passage (don't re-spawn boss)
- [ ] Save/continue compatibility: save boss defeated state

### 11. Rendering Overlay Updates (`overlays.js`)
- [ ] If `state.bossDefeated` during game over → render victory screen with boss kill stats
- [ ] Normal GOAL victory works as before (just now requires boss defeat first)
- [ ] Boss defeat can add a special victory animation (optional)

### 12. Testing & Edge Cases
- [ ] Boss fight with snake length 3 (minimum viable)
- [ ] Boss fight with snake length 0 (defeat → game over)
- [ ] Boss eating food during charge → transition to stuffed state
- [ ] Boss single-snake mode growing back to charge mode
- [ ] Boss destroying all 4 pillars
- [ ] Multiple food items on field, boss food pathfinding correctness
- [ ] Save/load state during boss encounter (should restore to save point)

---

## Implementation Order

1. **Phase 1 — Foundation:** Constants → Door system → Boss entity (Tasks 1-3)
2. **Phase 2 — Room & Combat:** Boss room generation → Boss combat (Tasks 4-6)
3. **Phase 3 — AI:** Boss AI with all 4 phases (Task 4, detailed)
4. **Phase 4 — Presentation:** Rendering → Cinematic → HUD (Tasks 7-8, 10-11)
5. **Phase 5 — Polish:** Food physics → Testing (Tasks 9, 12)

---

## Risk Register
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Boss AI pathfinding in tight space | Medium | High | Ensure pillars are placed with enough clearance |
| Charge attack too fast for grid-based movement | Medium | High | Tune charge speed (1 cell per sub-tick vs. instant dash) |
| Dual-column rendering misaligned | Low | Medium | Use shared direction with perpendicular offset |
| Food physics bounce feels unnatural | Medium | Low | Simple 1-cell random offset is sufficient |
