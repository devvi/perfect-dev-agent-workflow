# Research: Boss战代替胜利房间 (Boss Battle Victory Room)

> Parent Issue: #127
> Agent: Hermes Agent (research-agent)
> Date: 2026-07-11

---

## 1. Problem Definition

### Current Behavior

1. **Immediate victory on goal room entry**: When the player enters a `ROOM_TYPE.GOAL` room (`core.js` lines 98-101, 189-192), `gameState` is immediately set to `'won'`. The player sees the victory overlay screen (`overlays.js` lines 141-164) with stats — no gameplay interaction occurs.

2. **No boss concept**: The game has no boss entity type. Enemies are simple chase-AI with HP 1-3 (`generator.js` lines 660-685). There is no charge attack, multi-phase state machine, or multi-segment boss health system.

3. **No food physics**: Food items (`entities.js` lines 62-64) are simple `{x, y}` objects with no velocity, bounce, blink, or despawn behavior.

4. **Standard room size only**: `ROOM_SIZE = 20` (20×20 grid) is a universal constant. All rooms are the same size.

5. **Simple door system**: Doors are `CELL.DOOR` (value 3). No door type differentiation (no BOSS door vs normal door).

### Expected Behavior (Per Issue #127)

1. **BOSS room replaces goal room**: Instead of entering the goal room and instantly winning, the player enters a **boss room** (via a special BOSS door) that triggers a boss fight sequence.

2. **BOSS door visual**: The door to the boss room has a special visual indicator (different color/icon from normal doors) so the player knows it's a boss encounter.

3. **Boss intro sequence**: On entering the boss room:
   - The door closes behind the player
   - Boss appears with a name display: "Blue Hammer"
   - Dialog box shows: "Snake tasts GOOD !"
   - Game pauses (player cannot control) during intro
   - Letterbox bars (top/bottom black bars) for dramatic effect
   - After intro, game becomes playable

4. **Boss room layout**:
   - 4× larger than normal rooms (80×80 grid instead of 20×20)
   - 4 pillars at NE, SE, NW, SW corners (each pillar = STONE_WALL)
   - Boss navigates around pillars
   - Pillars are destructible: when boss collides with a pillar, it breaks and drops food
   - Periodic food spawn when both player and boss are low on HP

5. **Boss "Blue Hammer" design**:
   - **Form**: Blue double-row snake, 6 HP total (2 rows × 3 HP each)
   - **Head**: Two leading cells, one pair of eyes across both cells
   - **Damage**: HP is taken from the tail of one row first; food drops from the damaged segment
   - **Min HP**: Can survive at 1 HP (single cell/eye)

6. **Boss behaviors (4 phases)**:
   - **Phase 1 - Chase (6-4 HP)**: Standard chase — pursues player, on contact deals damage (1 segment loss). Dropped food has physics bounce.
   - **Phase 2 - Charge (4-2 HP, after losing 2 HP)**: Boss stops, charges up (with shake animation), then rushes in the player's direction. On hit: player loses 2 segments. Loops: charge → stop → charge → ...
   - **Phase 3 - Normal Snake (2 HP, only eyes remain)**: One of the two eyes becomes the new snake head. Attacks by collision. On hit, boss "turns around" (switches which eye is the head). If boss regrows to 4 HP by eating food, returns to Charge mode.
   - **Phase 4 - Hunting (overrides all)**: If food exists in the room, boss prioritizes eating food over all other behaviors. In Phase 3, switches to the head nearest to the food for hunting.

7. **Food drop physics**: When the player is hit by _any_ enemy (normal or boss), or hits non-lethal walls (STONE_WALL), the dropped body segment becomes food with physics bounce (gets "knocked away" from the collision point).

8. **Food blink before despawn**: All dropped food blinks with increasing frequency before disappearing.

9. **Victory condition**: Defeat the boss → victory screen (enhanced from current simple overlay).

### User Scenarios

- **Scenario A (Normal Boss Fight):** Player enters boss room → intro plays → chase → boss HP drops to 4 → charge mode activates → boss HP drops to 2 → normal snake mode + hunting → player defeats boss → victory screen.
- **Scenario B (Player Dies):** Player enters boss room → intro plays → player takes lethal damage → game over → return to save point or restart.
- **Scenario C (Boss Eats Food):** Boss in hunting mode eats food → regrows HP → may regain charge ability → fight extends.
- **Scenario D (Pillar Collision):** Boss or player collides with pillar → pillar breaks → food drops with bounce → both compete for food.
- **Frequency:** Once per game (first boss). This is the final encounter replacing the goal room.

---

## 2. Design Intent

### Why Does Current Behavior Exist?

The current goal room design (`core.js` lines 98-101, 189-192) was implemented as part of the #15 Metroidvania overhaul — a minimal "reach the goal → win" loop. The `ROOM_TYPE.GOAL` type in `constants.js` (line 14) was designed as a simple endpoint, not as a gameplay encounter. The game had no boss system because bosses were planned as a Phase 2 feature (noted in PRD #118's Section 6: "Boss enemy AI (Phase 2)").

Room type assignment in `generator.js` (line 209-210) places the goal at a far corner of the map. The door system (`collision.js` lines 251-275) only supports locked and size-gate checks — no BOSS door type.

### Why Change Now?

The player reaching the final room and instantly winning is anti-climactic. A boss fight provides:
- **Climactic payoff**: The final encounter should be the hardest and most memorable part of the game
- **Skill test**: All mechanics (movement, projectile, dodging, food management) are tested in one fight
- **Narrative punch**: The boss intro dialog gives the game its first piece of story/fiction
- **Replayability**: A well-designed boss fight gives players a reason to replay to master the encounter
- **Design completeness**: The game's progression (explore → fight enemies → collect keys → boss) matches the Metroidvania promise

### Previous Constraints

- **Pure functional state**: All game state is immutable; `tick()` returns new state. Boss logic must follow this pattern.
- **Room-based entities**: Boss is room-specific, like other entities.
- **No external dependencies**: Vanilla JS, no engines.
- **Canvas rendering**: 400×400px main canvas — boss room (80×80 grid) requires viewport scrolling or zoom-out.
- **Existing door system**: `checkDoorPassable()` in `collision.js` supports locked/size-gate checks — BOSS door can reuse the `locked` mechanism with a special check.
- **Existing AI system**: `enemyChasePath()`, `aiState` fields, segment/hp model — all extensible for boss.
- **Existing food system**: `createFood()`, `room.entities.food` array, `tryStealFood()` — all reusable.
- **Existing overlays**: `renderVictoryScreen()`, `renderPauseScreen()` — base for boss intro and enhanced victory.

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/constants.js` | Constants | Add `ROOM_TYPE.BOSS`, `BOSS_ROOM_SIZE`, `BOSS_CELL_SIZE`, boss-specific timing constants |
| `public/src/engine/core.js` | Game Engine (`tick()`) | Replace goal-room victory check with boss-room trigger (`bossIntro` state); add boss state tick logic; add food blink/despawn logic |
| `public/src/engine/entities.js` | Entity Factories | New `createBossEnemy()` factory for Blue Hammer (double-row, 6 HP, segments, phases) |
| `public/src/engine/ai.js` | Enemy AI | New `updateBoss()` function: chase (Phase 1) → charge (Phase 2, with wind-up + rush) → normal snake (Phase 3, head-swap on hit) → hunting (Phase 4, food priority) |
| `public/src/engine/generator.js` | Map Generation | Update `assignRoomTypes()` to replace GOAL room with BOSS room with `room.bossRoom = true`; add BOSS door connections; generate 4× size room with pillars |
| `public/src/engine/collision.js` | Collision Detection | Add BOSS door check (special door type); pillar collision → break → food drop with physics |
| `public/src/engine/world.js` | World Data | Add `BOSS` door type enum; per-room `bossConfig` field |
| `public/src/render/room.js` | Room Rendering | Boss room viewport (scrolling/zoom for 80×80 grid), BOSS door rendering (special color/icon), pillar rendering, boss rendering (blue double-row, multi-segment) |
| `public/src/render/overlays.js` | Overlay Screens | New: boss intro overlay (name + dialog + letterbox), boss defeat → enhanced victory screen |
| `public/src/render/hud.js` | HUD Rendering | Boss health bar (6-segment, dual-row display) when in boss room |
| `tests/metroidvania-snake.test.js` | Tests | New test suite for boss mechanics |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/combat.js` | Combat | Projectile damage against boss may need special handling (boss takes damage but doesn't die from single projectile) |
| `public/src/engine/items.js` | Items | Power-ups in boss room (food spawn mechanics, periodic food) |
| `public/src/engine/save.js` | Save | Save before boss room creates checkpoint |
| `public/gameboy.html` | HTML Page | May need additional canvas or overlay elements for boss UI |
| `docs/DESIGN/127-boss-battle-victory-room.md` | Design Doc | After implementation |

### Data Flow Impact

```
Current (no boss):
  Enter GOAL room → gameState = 'won' → renderVictoryScreen()

New flow:
  Enter BOSS door region (special door) → room transition into BOSS room
    → gameState = 'bossIntro' → renderBossIntroOverlay()
    → player presses key → gameState = 'playing' (in boss room)
    → each tick:
        1. Update boss AI (phase-based state machine)
        2. Check boss vs player collision → damage + food drop
        3. Check boss vs pillar collision → pillar break + food drop
        4. Check projectile vs boss → boss HP reduction
        5. Check food → boss eats (grow) or player eats (recover)
        6. Check food blink timer → blink animation → despawn
        7. Check boss HP → phase transitions
        8. Check boss HP = 0 → boss death anim → gameState = 'won'
    → renderBossVictoryScreen() (enhanced)
```

### Documents to Update

- [ ] `docs/DESIGN/127-boss-battle-victory-room.md` (after implementation)
- [ ] `docs/REFERENCE/boss-battle-design.md` (already created)
- [ ] `README.md` (gameplay features: boss battle)
- [ ] Other: `docs/PRD/127-boss-battle-victory-room.md` (this file)

---

## 4. Solution Comparison

### Approach A: Boss Room as Extended Room Type (Recommended)

- **Description:** Add `ROOM_TYPE.BOSS` to the enum. The generator replaces the GOAL room with a BOSS room. The BOSS room has:
  - 4× larger grid (80×80 cells) with viewport following the snake head
  - Special BOSS door visual (red/different icon) with locked-door-style passability check that blocks re-entry from the outside
  - 4 pillars at corners (NE, SE, NW, SW) implemented as destructible STONE_WALL tiles
  - A single boss entity (`createBossEnemy()`) with multi-phase state machine
  - Boss health HUD overlay (6-segment dual-row bar)
  - On boss defeat → `gameState = 'won'` with enhanced victory screen
  
  Boss AI is implemented as a separate `updateBoss()` function in `ai.js` with a state machine:
  ```
  Phase 1 (HP 6-4, Chase):
    - Extends existing enemyChasePath() with higher speed
    - On contact: damage player (1 segment), food drops with bounce vector
    - On collision with pillar: pillar breaks → food drops with bounce
  
  Phase 2 (HP 4-2, Charge):
    - Boss stops moving → wind-up animation (shake, 5 ticks)
    - Rush: linear dash toward player's position at time of wind-up
    - On hit: player loses 2 segments, food flies away
    - If hits pillar: pillar breaks, food drops, boss stops
    - Loop: charge → stop (2 ticks) → wind-up → charge
  
  Phase 3 (HP 2, Normal Snake):
    - One eye becomes new head, other becomes tail
    - Attack by collision, standard damage (1 segment)
    - On hitting player: swap head/tail (turn around)
    - If reaches 4 HP by eating: return to Phase 2
  
  Phase 4 (Hunting, overrides all):
    - If food in room: pathfind to nearest food
    - In Phase 3: use head nearest to food
    - Eating food: HP+1, segments+1
    - If length > 6: boss "stuffed" (pauses 3 ticks)
  ```
  
  Food physics:
  - Bounce: when food is dropped from damage, it has random velocity (scattered 1-3 cells from impact point)
  - Blink: food ticks down a despawn timer (e.g., 30 ticks). When timer < 10, blink frequency increases (toggle visibility every tick). Food removed when timer = 0.

- **Pros:**
  - Clean separation: boss room is a distinct type with its own rendering and logic
  - Reuses existing infrastructure (door system, room generation, entity placement)
  - Boss AI is self-contained in `updateBoss()` — can be tested independently
  - Viewport scrolling can be implemented as a simple camera offset in `renderRoom()`
  - Phase state machine maps directly to the issue's requirements
  - Food physics and blink are additive to existing food system

- **Cons:**
  - Viewport handling for 4× room requires new camera logic (or zoom-out)
  - BOSS door visual requires new cell type or door property
  - Boss AI is complex (4 phases) — careful state management needed
  - Per-room size override means `ROOM_SIZE` can't be a simple constant anymore

- **Risk:** Medium — boss AI complexity and viewport scrolling are the main risk areas
- **Effort:** ~12-16 hours total (largest feature in the game so far)

### Approach B: Boss as Special Enemy in GOAL Room (Simplified)

- **Description:** Keep the GOAL room at 20×20 size. Spawn a special "boss enemy" with extended HP and behaviors inside the room. The boss is a single snake (not double-row) with higher HP. The victory condition changes from "entering the room" to "defeating the boss in the room."
  - No room size change
  - No pillars (or simplified wall obstacles)
  - Boss is a standard enemy with more HP and simple charge behavior
  - Standard food drop (no physics, no blink)
  - Boss intro via simple overlay

- **Pros:**
  - Much simpler implementation (~4-6 hours)
  - No viewport/zoom changes needed
  - Minimal generator changes (just spawn boss instead of empty goal room)
  - Leverages existing enemy AI with minor extensions

- **Cons:**
  - Does NOT match the issue requirements:
    - No 4× room (required: "boss房间比普通房间大（4倍于普通房间）")
    - No pillars (required: "东北、东南、西北、西南，各4根柱子")
    - No double-row boss (required: "双列蛇，总血量6格，双列")
    - No physics bounce (required: "食物会有物理效果被弹飞")
    - No blink despawn (required: "闪烁，并提高闪烁频率，直到消失")
    - No BOSS door (required: "boss房间门不同于普通门")
  - Would fail acceptance criteria
  - Smaller room makes boss fight cramped and less interesting

- **Risk:** Low — minimal code changes, but fails to deliver the requested feature
- **Effort:** ~4-6 hours

### Approach C: Full Boss Room with Viewport Camera System

- **Description:** Like Approach A, but implements a proper viewport/camera system that follows the snake head in the boss room. The boss room is rendered at 80×80 on a logical canvas, and the camera snaps to the snake head position, showing a 20×20 window. This provides a scrolling boss arena.
  
  Key difference from Approach A: rather than rendering the full 80×80 room zoomed out, the camera system treats the boss room as a large tilemap and scrolls a viewport window around the player.

- **Pros:**
  - Player always sees at same zoom level (consistent with rest of game)
  - Camera can be reused for other large rooms in future
  - More professional feel (scrolling boss arena)
  - Pillars provide landmarks, making the room feel structured

- **Cons:**
  - Camera logic adds complexity (clamping to room bounds, smooth scrolling, rendering entities relative to camera)
  - Player can't see boss if it's off-screen (pillars, food also off-screen)
  - Multiple entities across a large room need distance-based processing
  - Need to decide: render all entities or only those in viewport?

- **Risk:** Medium-High — camera system is new code, interactions with existing rendering need careful design
- **Effort:** ~16-20 hours (camera system + boss mechanics)

### Recommendation

→ **Approach A** because:

1. **Matches all issue requirements**: 4× room, pillars, double-row boss, charge attack, physics food, blink despawn, BOSS door, intro sequence
2. **Reuse over new infrastructure**: Approach C (scrolling camera) adds unnecessary complexity for a single room. Zoom-out rendering (render 80×80 at 5px/cell instead of 20px/cell in the boss room) is simpler and lets the player see the entire arena.
3. **Clean boss state machine**: The phase-based boss AI naturally maps to a state machine with clear transitions at HP thresholds, testable in isolation
4. **Additive changes**: Existing game structure (room generation, entity system, AI module, rendering) is extended, not rewritten
5. **Feasible effort-to-value**: ~12-16 hours for a significant, climactic feature

**Implementation order suggestion:**
1. Add `ROOM_TYPE.BOSS` and `BOSS_ROOM_SIZE = 80` to constants
2. Modify generator: replace GOAL room with BOSS room, add pillars, add BOSS door
3. Add boss entity factory (`createBossEnemy()`)
4. Implement boss AI state machine (`updateBoss()`)
5. Add boss room rendering (zoom-out, pillars, BOSS door, boss health bar)
6. Add boss intro overlay and enhanced victory overlay
7. Add food physics (bounce on drop)
8. Add food blink/despawn timer
9. Wire everything in `core.js`: boss room enter → intro → boss tick → defeat → victory
10. Add tests

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. Player reaches the door to the boss room → BOSS door visual is distinct (e.g., red glow, skull icon)
2. Player enters the BOSS door → room transition to BOSS room
3. `gameState` changes to `'bossIntro'` → letterbox bars animate in from top/bottom
4. Boss name "Blue Hammer" appears with dramatic entrance animation
5. Dialog box: "Snake tasts GOOD !" — player reads, presses any key to dismiss
6. Game becomes playable: `gameState = 'playing'`, boss room viewport renders
7. Boss starts in Phase 1 (Chase), pursuing the player
8. Phase transitions occur at HP thresholds (6→5→4→3→2→1→0)
9. Boss defeated at HP=0: death animation, `gameState = 'won'`
10. Enhanced victory screen shows: boss name, stats, clear time

### Edge Cases

1. **Player flees boss room:** BOSS door is locked from outside → cannot re-enter without key/condition. If inside, door is locked until boss defeated → no escape.
2. **Boss HP exactly at threshold:** When HP drops to exactly 4 (Phase 1→2 transition) or exactly 2 (Phase 2→3 transition), the transition triggers on the same tick. No double-transition.
3. **Charge misses player:** Boss charges, misses → continues to wall, stops, re-evaluates (2-3 tick pause), then attacks again.
4. **Multiple food items + boss hunting:** Boss targets nearest food. If food is equidistant, targets latter (last spawned).
5. **Boss eats food while at max HP (6):** Boss HP is capped at 6. Eating food when at 6 HP has no effect (food is consumed but no growth). The "stuffed" pause triggers regardless.
6. **Phase 3 head swap during a chase:** When boss hits player in Phase 3, it swaps head/tail. The swap should not cause an extra damage event — just a position inversion.
7. **Player collides with boss on the same tick boss eats food:** Resolve player damage first (boss attack takes priority over food), then resolve boss food consumption.
8. **All pillars destroyed:** Pillars stay broken permanently. No re-spawning pillars.
9. **Both at low HP, periodic food spawn:** Every 15-20 ticks when both boss HP ≤ 3 and player length ≤ 3, spawn 1 food item at a random floor cell not occupied by entities.
10. **Boss death while in charge wind-up:** If projectile kills boss during wind-up animation, boss should immediately play death animation (skip the charge).

### Failure Paths

1. **Generator fails to place boss room in a reachable location:** BFSWithKeys in generator must handle BOSS room like GOAL room — ensure it's at the end of the key chain, reachable with all keys collected.
2. **BOSS door not generated correctly:** If door connection between previous room and BOSS room is missing, player has no way to enter → doorkess room accessibility check in generator verification.
3. **Invulnerability not reset on new game:** `invulnerableTicks` must initialize to 0 even in boss room context.
4. **Boss HP display not updating:** Boss health bar in HUD must reflect current boss HP on every render tick.
5. **Food blink despawn eating food in the same tick:** If player/boss eats food on the exact tick it would despawn, the eat should succeed (trigger first, despawn second).
6. **Zoom-out rendering breaks with existing minimap:** Minimap position/size calculations assume 20×20 rooms. Boss room (80×80) needs special handling on the minimap as well.

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/constants.js` | Stable (merged) | Low |
| `public/src/engine/core.js` | Stable (merged) — must not break existing tick loop | Medium — boss state machine adds conditional logic |
| `public/src/engine/entities.js` | Stable (merged) | Low — additive (new factory) |
| `public/src/engine/ai.js` | Stable (merged) — must not break existing enemy AI | Medium — new `updateBoss()` runs in parallel |
| `public/src/engine/generator.js` | Stable (merged) — replace GOAL room with BOSS room | Low — similar to existing room type replacement |
| `public/src/engine/collision.js` | Stable (merged) — add BOSS door type | Low |
| `public/src/engine/world.js` | Stable (merged) | Low |
| `public/src/engine/combat.js` | Stable (merged) — projectile vs boss handling | Low |
| `public/src/render/room.js` | Stable (merged) — viewport zoom-out logic | Medium — new rendering mode |
| `public/src/render/overlays.js` | Stable (merged) — new overlay states | Low |
| `public/src/render/hud.js` | Stable (merged) — boss HP bar | Low |
| #118 Enemy attack iteration | Merged — provides food-drop + invulnerability foundation | Low-Medium — #118 must be merged first for food physics pattern |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Boss fight polish (additional boss types, Phase 2 bosses) | Low |
| Boss gate before final area (require boss key) | Low |

### Preparation Needed

- [ ] Ensure #118 (Enemy Attack Iteration) is fully merged — its food-drop and invulnerability patterns are foundational
- [ ] Run full test suite to establish baseline: `npm run test`
- [ ] Review viewport rendering feasibility: render 80×80 room at reduced cell size (5px)
- [ ] Decide on minimap representation for the boss room (larger cell on minimap?)

---

## 7. Spike / Experiment (Required — depth/deep)

### Question to Answer

**Can the 80×80 boss room render effectively at zoom-out (5px/cell) or is a viewport/camera system necessary?**

### Method

1. Create a minimal test page that renders a 20×20 room at normal zoom (20px/cell) and an 80×80 room at 5px/cell on the same 400×400 canvas.
2. Evaluate:
   - Are the pillars and boss visually distinguishable at 5px/cell?
   - Is the snake head (1 cell) visible at 5px/cell?
   - Can the player see the whole arena and make tactical decisions?
   - What minimum cell size is acceptable?
3. If zoom-out is insufficient, prototype a viewport system: camera follows snake head, renders 20×20 window of the 80×80 room.

### Result

Spike results will be documented in `docs/DESIGN/127-boss-battle-victory-room.md` after the spike is run. The implement agent will use the result to choose between zoom-out rendering and viewport scrolling.

### Impact on Approach

- If zoom-out (5px/cell) is viable → Approach A is confirmed, simpler implementation
- If viewport scrolling is needed → Approach A is still valid but shifts to Approach C's camera system
- Either way, the boss room architecture (ROOM_TYPE.BOSS, boss state machine, pillars, BOSS door) remains the same — only the rendering strategy differs
