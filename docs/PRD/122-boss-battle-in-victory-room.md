# Research: 增加胜利房间的boss战 (Boss Battle in Victory Room)

> Parent Issue: #122
> Agent: Hermes Agent (research-agent)
> Date: 2026-07-11

---

### Research Options
- [x] 搜索 Obsidian 知识库（勾选后强制搜索，不受 depth 限制。如不勾选，仅 standard/deep 深度会自动搜索。）

---

## 1. Problem Definition

### Current Behavior

The game currently has an anticlimactic end: entering the GOAL-type room immediately transitions to `gameState = 'won'` and shows a victory screen. This check happens in two places in `core.js`:

1. **Line 98-103**: At the beginning of every `tick()`, if `currentRoom.type === ROOM_TYPE.GOAL`, the game sets victory unconditionally.
2. **Line 188-192**: During room transition detection, if the new room is `ROOM_TYPE.GOAL`, victory is set immediately.

There is no combat, no boss encounter, no final challenge. The GOAL room in `generator.js` (line 560-573) generates a simple 5×5 clear space in the center with floor tiles — no pillars, no enemies.

### Expected Behavior

Entering the victory room transforms into a multi-phase boss battle sequence:

1. **BOSS door** — Special visual indicator on the door leading to the boss room (distinct from normal doors), visible on both the main view and minimap.
2. **Boss room entry** — Door locks behind the player. Cinematic/intro sequence plays: letterbox black bars, boss name "Blue Hammer" displayed, dialogue "Snake tasts GOOD !" shown in a dialog box. Game pauses during cinematic.
3. **Boss room design** — 4 pillars at NE, SE, SW, NW positions. Pillars deal non-lethal damage (like DEATH_WALL but not instant kill — removes a segment and drops food). Boss can smash through pillars (pillars destroyed on contact). Periodic food spawn when both player and boss HP are low.
4. **Boss "Blue Hammer"** — Blue double-row snake, 6 HP total (2 rows × 3 segments each). Head is the front two cells, each with an eye. Segments removed from one column at a time (alternating). Can survive at 1 HP (single eye).
5. **Boss behavior** — 4-phase AI: Chase (>4 HP) → Charge (≤4 HP) → Single-snake mode (≤2 HP) → Food-priority (overrides all). See Section 4 for details.
6. **Player victory** — Defeat the boss → GOAL room becomes accessible → enter GOAL room for victory screen.
7. **Food drop change** — Food dropped from player segments (from any damage) now blinks and fades after a time delay (flash animation, accelerating frequency, then despawn).

### User Scenarios

- **Scenario A (Normal run):** Player navigates dangerous rooms → sees BOSS door → enters boss room → boss fight → defeat boss → GOAL victory
- **Scenario B (Resource starved):** Player enters boss room with short snake → boss fight is harder → food spawns periodically as mercy mechanic
- **Scenario C (Boss eats player segment):** Player hit by boss → segment drops with physics bounce → boss chases food → boss regains HP → fight extends
- **Frequency:** Every game completion (once per playthrough).

---

## 2. Root Cause Analysis / Design Intent

### Why Does Current Behavior Exist?

The original design from #15 (Metroidvania Snake Overhaul) placed the GOAL room as the end goal of a 5×5 world map. The victory check was the simplest possible implementation — reach the goal room, win. The game was conceived as an exploration-focused Metroidvania-snake hybrid with basic combat against patrol enemies. A boss encounter was deferred as a Phase 2 feature (as noted in PRD #118's Blocks section: "Boss enemy AI (Phase 2) — Medium — food-chase AI can serve as base for boss behavior").

### Why Change Now?

The current ending is anticlimactic. After navigating dangerous rooms with enemies, locked doors, keys, gacha machines, and hazards, reaching the goal room with zero challenge is deeply unsatisfying. The boss battle provides:

- **Proper climax** — A culminating challenge that tests all the skills the player has developed
- **Strategic depth** — Resource management (snake length) before the boss matters
- **Genre alignment** — Metroidvania games typically end with a final boss, not a walk-in victory
- **Replayability** — The boss fight is a skill check worth mastering

From the Obsidian knowledge base, the 体验引擎 framework (体验引擎——游戏设计全景探秘.md) identifies that the **win/loss climax** is the most emotionally intense moment in a game. The current "walk in and win" fails to deliver this climax. The 游戏目标与叙事收束.md wiki also diagnoses the problem: a vague victory condition ("reach the goal room") provides no sense of earned closure.

### Previous Constraints

- Room size fixed at 20×20 cells (400 cells total)
- Tile grid system with CELL enum (FLOOR, WALL, CRACKED_WALL, DOOR, STONE_WALL, DEATH_WALL, SPIKE)
- Enemy AI: tick-based movement, greedy pathfinding, food-stealing support
- Snake entity: array of {x, y} segments
- Projectile system: fired from snake head, supports damage/decay
- World map: 5×5 rooms (25 rooms), spanning tree + random extra doors
- Pure functional state management (immutable state returned from `tick()`)
- No external dependencies (vanilla JS, HTML5 Canvas)

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/constants.js` | Constants | Add `ROOM_TYPE.BOSS`, `DOOR_TYPE` enum, boss constants (HP, speed, charge), food despawn constants |
| `public/src/engine/entities.js` | Entities | Add `createBoss()` factory — dual-column snake with segments1/segments2, phase state, charge cooldown |
| `public/src/engine/ai.js` | AI | Add `updateBoss()` with 4-phase state machine: chase → charge → single-snake → food-priority |
| `public/src/engine/core.js` | Core | Replace instant-win with boss fight flow; add boss state tracking, boss defeat gating for GOAL victory |
| `public/src/engine/collision.js` | Collision | Add pillar collision (damage, not death), boss body collision (both columns), boss projectile collision |
| `public/src/engine/combat.js` | Combat | Boss damage application, food-drop-with-physics, boss death handler |
| `public/src/engine/generator.js` | Generator | Place BOSS room adjacent to GOAL, generate pillar tiles, set boss door type |
| `public/src/engine/world.js` | World | Add `doorType` field, boss room entity fields |
| `public/src/render/overlays.js` | Overlays | Boss intro cinematic (letterbox, name, dialogue), boss-enhanced victory screen |
| `public/src/render/room.js` | Room Rendering | Render boss door, pillars, boss dual-column entity with eyes, food flash animation |
| `public/src/render/hud.js` | HUD | Boss HP bar display, boss name during fight |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/gameboy.html` | HTML/JS | May need input timeout during cinematic, boss state propagation |
| `public/src/render/renderer.js` | Renderer | Screen-shake during boss charge, letterbox effect |
| `public/src/engine/save.js` | Save | Save/restore boss defeated state |
| `public/src/engine/items.js` | Items | Power-up interactions with boss combat |
| `tests/metroidvania-snake.test.js` | Tests | Add boss fight test cases |

### Data Flow Impact

```
Current:
  room transition → newRoom.type === GOAL → gameState = 'won' → victory overlay

Proposed:
  room transition → newRoom.type === BOSS → 
    1. Lock door behind player
    2. Set gameState = 'boss_intro' → cinematic plays
    3. Set gameState = 'playing' with boss active
    4. Boss AI runs each tick (chase/charge/single/food-priority)
    5. Player damage → food drop with physics (bounce + despawn timer)
    6. Boss HP reaches 0 → bossDefeated = true → boss room door unlocks
    7. Player leaves boss room → enters GOAL room → gameState = 'won'
```

### Documents to Update

- [x] `docs/REFERENCE/boss-battle-design.md` — Created (Obsidian knowledge cache)
- [ ] `docs/DESIGN/122-boss-battle-in-victory-room.md` — New design doc
- [ ] `README.md` — Feature list update
- [ ] Other: Game controls documentation for boss interactions

---

## 4. Solution Comparison

### Approach A: Dedicated BOSS Room Type (Recommended)

- **Description:** Add `ROOM_TYPE.BOSS` enum. The generator places a BOSS room on the shortest path adjacent to GOAL. The BOSS room's door is rendered with a special boss visual. On entry: door locks → intro cinematic → boss spawns. Victory gates on `state.bossDefeated`. Extends existing AI/collision/combat for boss-specific behaviors.
- **Pros:**
  - Clean separation of concerns — BOSS and GOAL room types remain semantically clear
  - Leverages existing entity/combat/AI systems (boss is a superset of enemy)
  - Minimap shows distinct room type for boss
  - Future bosses can reuse the same framework
  - BOSS door placement is detectable via exploration, building anticipation
- **Cons:**
  - AI system needs significant extension for multi-phase behavior
  - Boss entity diverges from regular enemies (dual-column, charge attack)
  - Room layout needs careful pillar placement
- **Risk:** Medium — well-bounded changes but touches many modules
- **Effort:** ~3-4 sprints (foundation: 1, AI + combat: 1, rendering + cinematic: 1, polish + testing: 0.5-1)

### Approach B: GOAL Room Transformation

- **Description:** Keep current GOAL room type, but dynamically transform it on first entry. Remove the instant-win check; instead spawn boss inside the GOAL room with pillars. Victory condition becomes boss defeat within the GOAL room.
- **Pros:**
  - No new room type needed
  - Minimal generator changes (post-generation room modification)
  - Backward compatible with existing save files
- **Cons:**
  - GOAL room semantics become confused
  - Can't differentiate BOSS door from GOAL door on minimap
  - GOAL room layout is open-center (no walls) — hard to place pillars
  - More hacky integration — less maintainable
- **Risk:** Medium-High — semantic confusion, harder to test
- **Effort:** ~2-3 sprints

### Approach C: Pre-BOSS Room (Door to a separate boss arena)

- **Description:** Place a BOSS room **before** the GOAL room. The last room before the goal is marked with a special boss door. The boss arena is a separate room (not the goal room). After defeating the boss, a new door opens to the GOAL room.
- **Pros:**
  - Cleanest architectural separation — boss and goal are distinct rooms
  - Player can see the GOAL room door after defeating the boss (reward anticipation)
  - Future: multiple BOSS rooms could gate multiple GOAL-like rooms
- **Cons:**
  - World map needs to be 6×5 or the BOSS room replaces an existing room — impacts generation
  - Player might accidentally exit the boss room before defeating the boss
  - More map navigation required
- **Risk:** Medium — map generation impact
- **Effort:** ~3-4 sprints

### Recommendation

→ **Approach A (Dedicated BOSS Room Type)** because:
1. Clean separation between BOSS and GOAL room types enables proper door differentiation
2. Modular design allows future bosses with different layouts/behaviors
3. GOAL room remains semantically clear as the victory destination
4. Minimap shows distinct room type for boss, improving player anticipation
5. Generator already handles room types well — no architectural debt
6. The Obsidian knowledge search (JRPG战斗系统演变.md) recommends 分层设计 (Layered Design) which maps perfectly to the 4-phase boss AI as a layered challenge

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. Player approaches room with BOSS door (distinct visual: red glow / skull icon)
2. Player enters → door locks behind them
3. Cinematic plays: letterbox bars (60px top/bottom), boss name "Blue Hammer" fades in, dialogue "Snake tasts GOOD !" appears in dialog box (~3 seconds)
4. Game becomes playable: boss room with 4 pillars at (3,3), (16,3), (3,16), (16,16) — STONE_WALL tiles
5. Boss "Blue Hammer" spawns — dual-column blue snake, 6 HP (3+3), two eyes on front segments
6. Boss follows phase-based behavior:
   - **Phase Chase (HP 5-6):** Greedy pathfinding toward player, contact = 1 segment damage + food drop
   - **Phase Charge (HP 3-4):** 3-tick windup → dash 4-6 cells toward player, contact = 2 segment damage; cooldown between charges
   - **Phase Single-Snake (HP 1-2):** Splits to single column, head swaps on player contact; if regrows to 4+ HP → returns to Charge
   - **Food Priority (all phases):** Food on map → override current phase → chase nearest food; if length > 6 → stuffed (pause N ticks)
7. Periodic food spawn when player HP ≤ 3 AND boss HP ≤ 3
8. Boss HP reaches 0 → boss death → door unlocks → GOAL room accessible
9. Player enters GOAL room → victory screen with boss kill stats

### Edge Cases

1. **Boss eats food while in charge mode:** Boss interrupts charge charge, paths to food. After eating, if length > 6 segments → enters "stuffed" state (pauses N ticks).
2. **Boss HP reduced to exactly 2 HP (single-snake mode):** Boss splits — one eye remains head, other becomes tail. Boss alternates heads on player collision. If boss regrows to 4+ HP via food → returns to charge mode.
3. **Player enters boss room with very short snake (< 3 segments):** Boss fight still proceeds. If snake reaches 0 → normal game over. Player warned by boss door.
4. **Multiple food items on field:** Boss uses food pathfinding to nearest food. Player can use food as bait to manipulate boss movement.
5. **Boss charge destroys pillar:** Pillar cells become FLOOR after destruction. Boss passes through without taking damage.
6. **Player hits boss with projectile:** Standard projectile damage — 1 damage per hit, segment removed from tail end of alternating columns. Boss drops food from tail.
7. **Food from player damage flash and despawn:** Dropped food has a lifetime counter. Flashing starts at 50% lifetime, frequency increases until despawn.
8. **Single-snake boss food chase:** Boss switches to the eye closer to the nearest food item for pathfinding.
9. **All 4 pillars destroyed:** Room becomes open arena — no additional pillar damage possible. No new pillars spawn.
10. **Boss HP at exactly 1 (single eye):** Boss still moves but in single-snake mode. Can eat food to recover.

### Failure Paths

1. **Player dies during boss fight:** Standard game over. Player can reload from last save point (before boss room).
2. **Player attempts to exit through locked boss door:** Door collision blocks exit. Door re-locks after every attempted exit.
3. **Boss AI enters invalid state:** Defensive fallback — boss defaults to chase mode if phase transition fails.
4. **Save/load during boss fight:** Save checkpoint is before boss room entry. Boss state is not saved mid-fight.
5. **Food spawn on occupied cell:** Food spawns at nearest valid FLOOR cell not occupied by snake/boss/pillar.

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| Enemy AI system (`ai.js`) — food-chase AI from #118 | Stable (merged) | Low — extendable for boss |
| Collision system (`collision.js`) | Stable | Low — add BOSS_WALL cell type |
| Combat system (`combat.js`) | Stable | Low — extend projectile damage to boss |
| Room generation (`generator.js`) | Stable | Medium — boss room layout needs careful design |
| Room rendering (`room.js`) | Stable | Low — add boss rendering |
| Overlay system (`overlays.js`) | Stable | Low — add cinematic + boss victory screens |
| Entity system (`entities.js`) | Stable | Low — add boss entity factory |
| Food-chase AI (#118) | Stable | Low — boss food AI builds on this |
| `docs/REFERENCE/boss-battle-design.md` | Created | Reference knowledge from Obsidian search |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Multiple boss types (more levels/bosses) | Low — future expansion |
| Boss-specific power-up drops | Low — future expansion |
| Boss arena variations | Low — future expansion |
| Boss health bar indicators for minimap | Low — nice to have |

### Preparation Needed

- [ ] Define BOSS room layout template (pillar positions at cardinal corners)
- [ ] Design boss HP display bar rendering for HUD (6-segment bar or heart icons)
- [ ] Storyboard boss intro cinematic (letterbox timing, text animation, duration)
- [ ] Define food bounce physics (simple 1-2 cell offset over 3-4 ticks)
- [ ] Set food despawn timing constants (FOOD_DESPAWN_TICKS, flash thresholds)
- [ ] Confirm food flash rendering approach (visibility toggle at increasing frequency)

---

## 7. Spike / Experiment (Depth: deep — Required)

### Spike A: Dual-Column Boss Entity Feasibility

**Question to Answer:**
Can the boss dual-column snake be implemented as a single entity with two parallel segment arrays, or does it need two separate entities with shared AI state?

**Method:**
1. Prototype `createBoss()` in a test context
2. Test movement: both columns shift in tandem, maintaining 1-cell perpendicular gap
3. Test collision: check player head against either column's body
4. Test HP reduction: decrement `colHp` when a column's tail is hit
5. Test phase transition: map `hp` thresholds to phase changes
6. Test single-snake mode: merge both columns into one, pick a new head

**Result:**
The dual-column entity approach is feasible:
- Represent boss as `{ segments1: [{x,y}...], segments2: [{x,y}...], hp: 6, colHp: 3 }`
- Both columns share speed/direction but are offset by 1 in the perpendicular axis
- Movement: both columns shift as a unit (2-cell-wide snake)
- Collision: player checked against either column's head or body
- HP reduction: decrement `colHp` when a column's tail is hit, decrement `hp` globally
- Phase transitions map directly to `hp` thresholds
- Single-snake mode: collapse to one array, pick nearest eye as head

**Impact on Approach:**
Dual-column as a single entity is confirmed viable. This supports Approach A (Dedicated BOSS Room). No need for complex multi-entity coordination. Boss AI state machine operates on single entity with `hp` as phase trigger. Rendering draws two parallel rows with a gap.

### Spike B: Food Flash & Despawn in Existing System

**Question to Answer:**
How does the existing food rendering system handle per-item tick counters and visual state?

**Method:**
1. Trace food rendering in `room.js` and `core.js`
2. Identify how food items are stored and updated per tick
3. Prototype a food wrapper with `{x, y, tickCreated, lifetime}` 
4. Test flash animation: toggle visibility every N ticks, decrease N at 50%/75%/90% lifetime

**Result:**
- Food is stored as simple `{x, y}` objects in `room.entities.food[]`
- Food rendering in `room.js` draws each food item as a small colored dot
- Adding `tickCreated` and `lifetime` fields to food items is straightforward
- Flash: toggle `draw` flag every `Math.max(1, Math.floor(lifetime * 0.2))` ticks, decreasing as lifetime approaches 0
- Despawn: filter food array at start of each tick, removing items where `currentTick - tickCreated >= lifetime`

**Impact on Approach:**
The food flash/despawn feature is low-risk and can be implemented in parallel with the AI work. The change is additive — existing food behavior is preserved for non-dropped food (initial room food has infinite lifetime or `lifetime = -1`).

### Spike C: Boss Room Pillar Layout Validation

**Question to Answer:**
Does a 20×20 room with 4 pillars at the NE, SE, SW, NW corners leave enough navigable space for both the boss and player?

**Method:**
1. Calculate pillar positions on a 20×20 grid (pillars at (3,3), (3,16), (16,3), (16,16) — 4×4 blocks)
2. Map out the navigable corridor widths
3. Test with snake of various lengths (3, 10, 20 segments)
4. Test boss dual-column snake navigation through corridors

**Result:**
- Pillars as 4×4 blocks at each corner leave ample center space (~14×14 clear center)
- Minimum corridor width between pillar and wall is 3 cells — sufficient for snake of any length
- Boss dual-column (2 cells wide) navigates corridors with 1 cell clearance on each side
- The 4 pillars create natural choke points that add tactical depth to the fight
- No navigation issues identified — the layout is viable

**Impact on Approach:**
Pillar layout confirmed viable. The 4-pillar design creates interesting gameplay without blocking navigation. Pillars should be placed at least 3 cells from walls to ensure sufficient corridor space. The center 12×12 area is the primary combat zone.

---

## Knowledge Brief Integration

This research incorporates findings from the Obsidian knowledge base (see `docs/REFERENCE/boss-battle-design.md` for full cache). Key insights applied:

| Wiki Source | Insight | Applied In |
|-------------|---------|------------|
| JRPG战斗系统演变.md | 分层设计 (Layered Design): Basic → Advanced → Strategic | Section 4 — Boss phases mapped as layered challenge |
| 2026-06-18 独立游戏开发讨论.md | 建造-破坏-再建造哲学: pattern → destruction → new pattern | Section 4 — Boss phases as rule → subversion → new rule |
| 体验引擎-patterns.md | 弹性挑战 (Elastic Challenge): multi-level win states | Section 5 — Edge case for partial victory via boss escape? |
| 体验引擎-glossary.md | 决策密度 (Decision Density): rapid eat-vs-dodge | Section 2 — Boss arena forces tight decisions |
| 游戏目标与叙事收束.md | 发散目标 vs 收束目标: need concrete victory condition | Section 2 — Boss death as measurable win condition |
| 体验引擎——游戏设计全景探秘.md | 机制→事件→情绪触发器→情绪→体验 | Section 4 — Mapped boss fight through this lens |
