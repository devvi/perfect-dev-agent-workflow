# Research: Boss Battle System

> Parent Issue: #122
> Agent: Game Research Agent
> Date: 2026-07-11

---

## 1. Problem Definition

### Current Behavior
When the player enters the GOAL-type room, the game immediately transitions to the `won` state and renders the victory screen (`renderVictoryScreen` in `overlays.js`). The check happens at two points:
1. **`core.js` line 98-103**: At the beginning of every `tick()`, if the current room is `ROOM_TYPE.GOAL`, the game is set to `'won'` state unconditionally.
2. **`core.js` line 188-192**: During room transition detection, if the new room is `ROOM_TYPE.GOAL`, the game immediately sets victory.

There is no combat, no challenge, no boss encounter. The player simply walks into the goal room and wins. Boss-specific room features (visual boss door, pillars, AI boss with phases, food drop mechanics) do not exist.

### Expected Behavior
Entering the goal room transforms into a boss battle sequence:
1. A special **BOSS door** with distinct visual appearance warns the player before entry.
2. Upon entering the boss room, the door locks behind the player.
3. An **intro cinematic** plays: boss name displayed ("Blue Hammer"), boss dialogue ("Snake tasts GOOD !"), with letterbox bars (black bars top/bottom), game paused.
4. The **boss room** contains 4 destructible pillars (NE, NW, SE, SW) that deal non-lethal damage.
5. The **boss "Blue Hammer"** is a dual-column blue snake with 6 HP total, multi-phase AI behaviors.
6. **Phase-based boss AI**: normal chase → charge attack (at ≤4 HP) → single-snake mode (at ≤2 HP), with food priority overriding all modes.
7. **Player victory** requires defeating the boss, not just entering the room.
8. **Changed food drop mechanic**: food dropped from player segments (from enemy/wall damage) flashes and disappears after a delay.

### User Scenarios
- **Scenario A:** Player reaches final room — must now fight a boss instead of instant win
- **Scenario B:** Player navigates map — sees special BOSS door, knows a challenge awaits
- **Scenario C:** Player is hit by enemy — loses segment, food drops with physics (bounce effect) and timed despawn
- **Frequency:** Every game completion (once per playthrough)

---

## 2. Root Cause / Design Intent

### Why Does Current Behavior Exist?
The original implementation in `generator.js` (line 192-211) assigns the GOAL room type to a far corner room. The victory check in `core.js` was the simplest possible implementation — reach the goal room, win. The game was originally conceived as a Metroidvania-snake hybrid with a focus on exploration, room navigation, and basic combat against patrol enemies. There was no boss encounter.

### Why Change Now?
To increase replayability, player engagement, and game difficulty at the endgame. The current design has an anticlimactic conclusion — after navigating through dangerous rooms with enemies, locked doors, and gacha mechanics, reaching the goal room with no challenge is unsatisfying. The boss battle provides:
- A proper climax to the game experience
- Strategic depth (resource management before the boss)
- Reward for progression (special room, unique boss mechanics)
- Alignment with the Metroidvania genre expectations

### Previous Constraints
- Room size is fixed at 20×20 cells (CELL_SIZE = 20px, CANVAS_SIZE = 400px)
- Tile grid system: 20×20 tiles per room (400 cells)
- Enemy AI system uses tick-based movement with chase/food-stealing
- Snake entity is an array of {x, y} segments
- Projectile system supports firing from snake head
- The world map is 5×5 rooms (25 rooms total)
- Room generation uses spanning tree + random extra doors

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/constants.js` | Constants | Add `BOSS` and `BOSS_WALL` cell types, boss-related constants |
| `public/src/engine/entities.js` | Entities | Add `createBoss()` factory, boss entity structure with dual-column segments |
| `public/src/engine/ai.js` | AI | Add boss AI with phase-based behavior tree, charge attack, food priority |
| `public/src/engine/core.js` | Core | Replace instant-win with boss battle flow, add boss state management |
| `public/src/engine/collision.js` | Collision | Add boss collision checks, pillar collision (damage, not death) |
| `public/src/engine/combat.js` | Combat | Boss damage application, boss death handling, food-drop-with-physics |
| `public/src/engine/generator.js` | Generator | Add BOSS room placement before GOAL, pillar tiles, boss door placement |
| `public/src/engine/world.js` | World | Room data structure updates for boss fields, door type field |
| `public/src/render/overlays.js` | Overlays | Add boss intro cinematic, boss victory screen (different from GOAL victory) |
| `public/src/render/room.js` | Room Rendering | Render boss room pillars, boss entity with dual-column visual, boss door |
| `public/src/render/hud.js` | HUD | Add boss HP bar display when in boss room |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `public/gameboy.html` | HTML/JS | May need input timeout during cinematic, boss state propagation |
| `public/src/render/renderer.js` | Renderer | Screen-shake during boss charge, letterbox effect during cinematic |
| `public/src/engine/save.js` | Save | Save/restore boss state |
| `public/src/engine/items.js` | Items | Power-up interactions with boss combat |

### Data Flow Impact
- World generation: BOSS room replaces the pre-GOAL room (adjacent to GOAL). A BOSS-type room is generated between the path and GOAL. The GOAL room becomes accessible only after boss defeat.
- Room data: New `boss` field on room object, new `bossDoor` field on door data, door type enum (NORMAL, BOSS, LOCKED, SIZE_GATE).
- State data: New `bossFight` sub-state (intro, active, defeated), boss instance in world data.
- Victory flow: GOAL room check → boss exist check → boss alive → don't win; boss defeated → GOAL victory.

### Documents to Update
- [ ] `docs/DESIGN/` — Boss design doc (new)
- [ ] `docs/REFERENCE/` — Boss room generation reference
- [ ] `README.md` — Feature list update
- [ ] Other: Game controls documentation for boss interactions

---

## 4. Solution Comparison

### Approach A: Direct Boss Room (Recommended)
- **Description:** Add a `ROOM_TYPE.BOSS` to the room type system. The generator places a BOSS room on the shortest path adjacent to the GOAL room. The BOSS room's door from the previous room is rendered as a special "BOSS door" (distinct visual). Upon entry, the boss fight begins with cinematic intro, the boss entity is created, and existing systems (AI, collision, combat) are extended for boss-specific behaviors. The GOAL room victory triggers only after boss is defeated (tracked via `state.bossDefeated`).
- **Pros:**
  - Clean separation of concerns — no changes to GOAL room logic
  - Leverages existing entity/combat/AI systems
  - BOSS door placement is detectable via minimap exploration
  - Room generation already has infrastructure for special room placement
  - Boss is a superset of enemy entity — can reuse segments, HP, AI state machine
- **Cons:**
  - Need to extend AI system significantly for multi-phase behavior
  - Boss entity types diverge from regular enemies (dual-column, charge attack)
  - Room layout needs manual design vs. procedural generation
- **Risk:** Medium — requires significant AI rework but well-bounded
- **Effort:** 2-3 sprints (core mechanics 1 sprint, AI + polish 1 sprint, rendering + cinematic 0.5 sprint)

### Approach B: GOAL Room Transformation
- **Description:** Keep the current GOAL room type but add behavior configuration. When entering the GOAL room, instead of instant win, spawn a boss inside the room. The room uses the same GOAL layout but with pillars dynamically placed. The victory check changes to require boss defeat within the room.
- **Pros:**
  - No new room type needed
  - Minimal changes to generator (post-generation room modification)
  - Backward compatible with existing save files
- **Cons:**
  - GOAL room semantics become confused — a "goal" that's actually a fight
  - Can't differentiate BOSS door from GOAL door on minimap
  - Harder to ensure room has proper pillar layout (GOAL room has clear center, no walls)
  - More hacky integration — less clean architecture
- **Risk:** Medium-High — semantic confusion, harder to maintain and test
- **Effort:** 1.5-2 sprints (similar implementation, more cleanup needed)

### Recommendation
→ **Approach A (Direct Boss Room)** because:
1. Clean separation between BOSS and GOAL room types enables proper door differentiation
2. Modular design allows future bosses with different layouts/behaviors
3. GOAL room remains semantically clear as the victory destination
4. Minimap shows distinct room type for boss, improving player anticipation
5. Generator already handles room types well — no architectural debt

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. Player approaches the BOSS door (room adjacent to boss room)
2. BOSS door appears with a distinct visual (skull icon, red glow, different from normal door)
3. Player enters → door locks behind them → cinematic plays (letterbox, name, dialogue)
4. Boss room has 4 pillars (NE, NW, SE, SW) made of non-lethal damage wall (DEATH_WALL-like but deals damage + food drop, not instant death)
5. Boss "Blue Hammer" appears — dual-column blue snake, 6 HP (3+3 columns), two eyes on front segments
6. Boss cycles through phases as HP decreases
7. Food respawns periodically when both player and boss HP are low
8. Player defeats boss → GOAL room now accessible → win via GOAL room entry

### Edge Cases
1. **Boss eats food while in charge mode:** Boss prioritizes food over charge attack logic — interrupts charge and paths to food. After eating, if length > 6 segments, boss enters "stuffed" state for N ticks (pauses, doesn't move).
2. **Boss HP reduced to exactly 2 HP (single-snake mode):** Boss splits — one eye remains the head, the other becomes the tail. Boss alternates heads on player collision (head swap mechanic). If boss regrows to 4+ HP via food, returns to charge mode.
3. **Player enters boss room with very short snake (< 3 segments):** Boss fight still proceeds — boss damage removes segments, but if snake reaches 0 the player dies normally. Player should be warned by the boss door.
4. **Multiple food items on field:** Boss uses food pathfinding to nearest food. Player can use food as bait to manipulate boss movement.
5. **Boss charge destroys pillar:** Pillar cells become floor after destruction. Deals damage to boss if boss itself runs into a pillar? (Design decision: boss destroys pillar without taking damage — pillar crumbles on contact, boss passes through).
6. **Player hits boss with projectile:** Standard projectile damage — 1 damage per hit, segment removed from tail end. Boss drops food from tail.
7. **Food from player damage flash and despawn:** Dropped food has a lifetime counter. It flashes faster as it approaches despawn time.

### Failure Paths
1. **Player dies during boss fight:** Game over screen shows as normal. Player can reload from last save point.
2. **Player somehow clips through locked boss door:** Door collision should block exit. If bug occurs, treat as normal room exit (but door re-locks).
3. **Boss AI enters invalid state:** Defensive fallback — boss defaults to chase mode if phase transition fails.
4. **Save/load during boss fight:** Save point should be restored before boss room. Boss state not saved mid-fight.

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| Enemy AI system (`ai.js`) | Stable | Low — extendable |
| Collision system (`collision.js`) | Stable | Low — add BOSS_WALL cell type |
| Combat system (`combat.js`) | Stable | Low — extend projectile damage to boss |
| Room generation (`generator.js`) | Stable | Medium — boss room layout needs careful design |
| Room rendering (`room.js`) | Stable | Low — add boss rendering |
| Overlay system (`overlays.js`) | Stable | Low — add cinematic + boss victory screens |
| Entity system (`entities.js`) | Stable | Low — add boss entity factory |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Multiple boss types (more levels/bosses) | Low — future expansion |
| Boss-specific power-up drops | Low — future expansion |
| Boss arena variations | Low — future expansion |

### Preparation Needed
- [ ] Define BOSS room layout template (pillar positions, spawn spots)
- [ ] Design boss HP display bar rendering for HUD
- [ ] Storyboard boss intro cinematic (letterbox timing, text animation)
- [ ] Define physics-like food drop (bounce trajectory calculation for 20×20 grid)

---

## 7. Spike / Experiment

### Question to Answer
Can the boss dual-column snake be implemented as a single entity with two parallel segment arrays, or does it need to be two separate entities with shared AI state?

### Method
1. Prototype a minimum-viable boss entity in `entities.js`:
   - `createBoss()` returns an entity with `segments: [col1: [...], col2: [...]]` where `col1[0]` and `col2[0]` are the two heads
   - Movement: both columns shift by 1 cell per tick, maintaining 1-cell gap between columns
   - Collision: check both heads for proximity to player
2. Test with a simple chase AI (no phases) in `ai.js`
3. Visual mockup: render two parallel green columns

### Result
The dual-column entity approach is feasible:
- Represent boss as `{ segments1: [{x,y}...], segments2: [{x,y}...], hp: 6, colHp: 3 }`
- Both columns share the same speed and direction but are offset by 1 in the perpendicular axis
- Movement: align both columns to move as a unit (like a 2-cell-wide snake)
- Collision detection: check player against either column's head or body
- HP reduction: decrement `colHp` when a column's tail is hit, decrement `hp` globally
- Phase transitions map directly to `hp` thresholds

### Impact on Approach
Dual-column as a single entity is confirmed viable. This means:
- Approach A is feasible with a single boss entity containing two segment arrays
- No need for complex multi-entity coordination
- Boss AI state machine operates on single entity with `hp` as phase trigger
- Rendering draws two parallel rows with a gap
- The dual-column is visually distinct from regular enemies and reinforces the "large boss" feel
