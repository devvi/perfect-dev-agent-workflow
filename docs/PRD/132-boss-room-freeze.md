# Research: Boss room freeze fix

> Parent Issue: #132
> Agent: Hermes Agent
> Date: 2026-07-11

---

### Research Options
- [ ] 搜索 Obsidian 知识库（勾选后强制搜索，不受 depth 限制。如不勾选，仅 standard/deep 深度会自动搜索。）

---

## 1. Problem Definition

### Current Behavior
On entering the boss room, the game freezes immediately after the boss intro dialog is dismissed. The snake spawns at the boss room entrance (position tiles[0][10] in room-local coordinates) but `getCellAt()` reads `CELL.WALL` because the coordinate conversion clamps to a 20×20 grid while boss room tiles are 80×80. The snake's stuck+reverse mechanic activates and it never escapes the entrance wall, producing the appearance of a complete freeze.

Additionally, the CSP error `"Content Security Policy prevents evaluation of arbitrary strings"` is reported in console alongside the freeze, though it is a secondary non-root-cause issue.

**Steps to reproduce:**
1. Play through the game until reaching the boss room (the goal room at a far corner of the map)
2. Enter the boss room through the boss door
3. The boss intro dialog triggers (`gameState = 'bossIntro'`)
4. Dismiss the dialog
5. Game resumes (`gameState = 'playing'`) but the snake is stuck at the entrance wall
6. Snake reverses, gets stuck again — perpetual loop, game appears frozen

### Expected Behavior
On entering the boss room:
- The snake should spawn on `CELL.FLOOR` inside the boss room, not `CELL.WALL`
- Boss AI should activate and the boss entity should be visible and interactive
- Pillars should be breakable at their correct tile locations
- The game should play normally within the 80×80 boss room

### User Scenarios
- **Scenario A (Primary):** Any player reaching the endgame boss room for the first time — the game appears broken, making the game unbeatable
- **Scenario B (QA/Testing):** Developers testing boss battle mechanics cannot progress past room entry
- **Frequency:** 100% reproduction rate — every boss room entry triggers the freeze

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### How It Started
The boss room system was introduced via Issue #127 (boss battle feature). The design intent was a large 80×80 grid room with 4 breakable pillars and a boss entity. A new constant `BOSS_ROOM_SIZE = 80` was added and the `generateBossRoomTiles()` function correctly allocates an 80×80 tile array. However, the coordinate conversion pipeline was never updated to handle variable room sizes.

### Why Does Current Behavior Exist?
The entire coordinate system was built around `ROOM_SIZE = 20` (the standard room dimension). All world↔room coordinate conversion functions hardcode `ROOM_SIZE`:

| Function | File | Uses | Problem |
|---|---|---|---|
| `worldToRoomCoords()` | world.js:66-72 | `ROOM_SIZE` | Divides world coords by 20, producing room-local coords in [0,19] range |
| `getCellAt()` | world.js:87-93 | `ROOM_SIZE` | Reads `tiles[cy][cx]` with cx,cy bounded to [0,19] |
| `renderRoom()` | room.js:17 | `ROOM_SIZE` | Only renders 20×20 tiles, missing 93.75% of boss room content |
| `isDoorCell()` | collision.js:11 | `ROOM_SIZE` | Door detection uses `ROOM_SIZE/2 = 10` instead of `BOSS_ROOM_SIZE/2` |
| Room bounds check | collision.js:40 | `ROOM_SIZE` | Max bounds = `world.cols × ROOM_SIZE` |
| Entity return-home | ai.js:70 | `ROOM_SIZE` | Enemy respawn uses `ROOM_SIZE` for room center calculation |

### Four Specific Bugs

**Bug 1: `getCellAt()` reads wrong tile indices**
File: `public/src/engine/world.js`, lines 87-93
- `getCellAt()` calls `worldToRoomCoords()` which divides by ROOM_SIZE (20), producing cx,cy ∈ [0,19]
- For boss rooms, `tiles[][]` is 80×80, so only the top-left 20×20 portion is accessible
- `BOSS_DOOR` at `tiles[0][40]` is NEVER detected — snake enters through `tiles[0][10]` which is CELL.WALL

**Bug 2: Room transition collision — snake stuck on entrance wall**
File: `public/src/engine/core.js`, lines 202-208
- On entering boss room → `bossIntro` state → pause
- On dismiss → `gameState = 'playing'` → next tick runs `checkSnakeCollision()` → `getCellAt(head)` returns CELL.WALL → stuck+reverse
- Snake is perpetually stuck on the invisible border wall

**Bug 3: Boss entity spawns at wrong world coordinates**
File: `public/src/engine/generator.js`, line 462
- `createBossEnemy('blue_hammer', 40, 38)` — uses tile-local coords (40, 38) as if they were world coords
- World is only 100×100 (5 rooms × 20 each), so boss.x=40 is in room grid (2,0) not the boss room
- Boss AI never runs for the actual boss room because the entity is spawned in a different room

**Bug 4: Boss room pillar collision also broken**
File: `public/src/engine/generator.js`, lines 446-455
- Pillars at tiles[5][5], [74][5], [5][74], [74][74] are at indices outside the 0-19 range visible to `getCellAt()`
- `checkBossPillarCollision()` calls `getCellAt()` which can never read STONE_WALL at those positions

### CSP Error (Secondary Issue)
The console CSP error ("Permissions policy violation: unload is not allowed") comes from standard browser extension behavior or user browser settings, not from the application code. No CSP header is sent by the Vercel deployment (verified via curl). This is NOT the root cause of the freeze.

### Why Change Now?
The boss room (Issue #127) is the endgame content that makes the game completable. Without it working, players cannot finish the game. The freeze blocks all further development on boss mechanics, victory conditions, and post-game content.

### Previous Constraints
- `generateDefaultTiles()` and standard room generation must continue using ROOM_SIZE=20 (no regression for normal rooms)
- The room grid stays 5×5 (MAP_COLS=5, MAP_ROWS=5) — world→room coordinate mapping must remain intact
- Boss room data structures (`room.bossRoom`, `room.bossConfig`, `room.pillars`) are sound and should be preserved

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|---|---|---|
| `public/src/engine/world.js` | World coordinate helpers | `worldToRoomCoords()`, `getCellAt()` must accept room-aware size parameter |
| `public/src/engine/core.js` | Game loop, room transition | After boss intro dismiss, ensure snake spawns on FLOOR, not WALL |
| `public/src/engine/generator.js` | Boss room generation | Boss entity world-coordinate calculation must be correct |
| `public/src/engine/collision.js` | Collision detection | Door/passable checks must handle BOSS_ROOM_SIZE |
| `public/src/render/room.js` | Room rendering | Render loop must render full BOSS_ROOM_SIZE for boss rooms |
| `public/src/engine/ai.js` | Boss AI, food spawn | Food spawn coords must use tile-local, not world coords |

### Indirectly Affected Modules

| File | Module | Why Affected |
|---|---|---|
| `public/src/engine/entities.js` | Entity creation | `createBossEnemy()` called from generator with wrong coordinates |
| `public/src/render/overlays.js` | Overlay rendering | Minimap/screen shake may need boss-room-aware bounds |

### Data Flow Impact
The room-local coordinate system currently works as:
```
world_xy → worldToRoomCoords(wx, wy) → { rx, ry, cx, cy }  [cx,cy ∈ [0, ROOM_SIZE-1]]
  → room.tiles[cy][cx]                                       [assumes room.tiles is ROOM_SIZE×ROOM_SIZE]
```

For boss rooms this breaks because `room.tiles` is `BOSS_ROOM_SIZE×BOSS_ROOM_SIZE` (80×80) but the conversion yields coordinates clamped to [0,19]. The fix must either:

**Option A:** Make `worldToRoomCoords()` return room-local coords in [0, BOSS_ROOM_SIZE-1] when the room is a boss room — requires passing room type or size through the conversion pipeline.

**Option B:** Change the room-local coordinate system so boss rooms are addressed as 20×20 "cells" in world space, and the boss room internally maps each cell to a 4×4 sub-grid (80×80 visual → 20×20 logical). This requires a full rendering scale factor approach.

### Documents to Update
- [x] `docs/PRD/132-boss-room-freeze.md` (this document)
- [ ] `docs/DESIGN/` — boss room design doc may need coordinate clarification
- [ ] `docs/REFERENCE/` — coordinate conversion reference
- [ ] `README.md`
- [ ] Other: ___

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: Room-Aware Coordinate Conversion
- **Description:** Modify `worldToRoomCoords()` (and all callers) to accept an optional `roomSize` parameter. When the current room is a boss room (`room.type === ROOM_TYPE.BOSS`), use `BOSS_ROOM_SIZE` instead of `ROOM_SIZE` for the modulo/index operations. The snake's spawn position during room transition must be offset to account for the boss door being at `MATCH.FLOOR(BOSS_ROOM_SIZE / 2)` instead of `ROOM_SIZE / 2`.
- **Pros:**
  - Matches the existing data structure (boss room tiles are genuinely 80×80)
  - Works transparently once the conversion functions know room size
  - Can be implemented incrementally (fix world.js first, then render, then AI)
- **Cons:**
  - Every coordinate conversion call site needs updating
  - Snake movement speed (cells per tick) may feel different at 80-wide scale
  - NPC spawn positions in ai.js that use `ROOM_SIZE` for random placement must be audited
- **Risk:** Medium — coordinate math is high-touch; every conversion path must be caught
- **Effort:** Medium (5-8 files, ~100 lines changed)

### Approach B: Logical Grid with Visual Scaling (BOSS_CELL_SIZE)
- **Description:** Keep all coordinate conversion using ROOM_SIZE=20. The boss room internally maps its 80×80 visual tile grid to a 20×20 logical grid. Each logical cell represents a 4×4 macro-tile. The boss room generation writes tiles in 4×4 blocks. The renderer scales by BOSS_CELL_SIZE (5) when drawing boss rooms. Entities are placed at logical (x,y) and rendered at (x*4, y*4).
- **Pros:**
  - Zero changes to `worldToRoomCoords()`, `getCellAt()`, or collision detection
  - Snake movement speed is consistent across all rooms
  - Less surface area for bugs
- **Cons:**
  - Fundamentally changes boss room layout (pillars at logical (1,1), (18,1), (1,18), (18,18) — less spacious)
  - Boss AI and charge mechanics need re-tuned for scaled coordinates
  - Rendering pipeline needs scaling logic added (renderer must know to scale)
  - Existing boss room tile generation function must be rewritten
- **Risk:** Medium-High — retrofitting a scaling layer introduces new edge cases
- **Effort:** Medium (same number of files, but more architectural change)

### Approach C: Hybrid — Keep 80×80 Tiles, Fix Conversion Pipeline
- **Description:** Keep the 80×80 boss room tile array. Refactor `worldToRoomCoords()` and `getCellAt()` to accept a room object (or room size) parameter. Update all call sites. Additionally, pass the room's actual tile array dimensions through the conversion layer. The renderer similarly detects boss rooms and iterates to BOSS_ROOM_SIZE.
- **Pros:**
  - Preserves existing boss room layout and pillar positions
  - Most faithful to the original design intent of Issue #127
  - Boss AI code already uses BOSS_ROOM_SIZE — no re-tuning needed
- **Cons:**
  - Requires careful auditing of every getCellAt/worldToRoomCoords call site
  - Snake movement may be slow across 80-wide space (mitigate by adjusting boss room tick rate)
- **Risk:** Low-Medium — well-understood pattern, changes are mechanical
- **Effort:** Medium (6-8 files, ~150 lines changed)

### Recommendation
→ **Approach C (Hybrid)** because:
1. It preserves the existing boss room layout (pillars at 5,5 / 74,5 etc.) which was designed for boss charge mechanics
2. The coordinate conversion fix is a well-understood mechanical change — make functions room-size-aware
3. Boss AI code (ai.js) already correctly references BOSS_ROOM_SIZE — only coordinate conversion needs fixing
4. No re-tuning of boss charge speed or pillar HP needed
5. Rendering fix is straightforward — detect boss room, use BOSS_ROOM_SIZE for iteration bounds

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. Player enters boss room → boss intro dialog displays
2. Dialog dismissed → snake is on CELL.FLOOR (not WALL)
3. Boss entity is visible near center of room
4. 4 breakable pillars visible at (5,5), (74,5), (5,74), (74,74)
5. Player can move freely within the 80×80 boss room
6. Boss AI activates and charges at player
7. Collision with pillars triggers break animation (STONE_WALL → FLOOR)
8. Boss defeated → boss door to next room unlocks

### Edge Cases
1. **Snake entering through any door direction:** Whether the boss room entrance is up/down/left/right, the snake must enter on FLOOR, not WALL
2. **Rapid door entry/exit:** Entering boss room and immediately reversing should work without coordinate clamping
3. **Save/load in boss room:** If game is saved in boss room (once save points exist), reload must place player on valid tile
4. **Boss defeated → room exit:** After boss defeat, the exit door transitions must work correctly (coords map properly for the adjacent room)
5. **Normal rooms still work:** All existing 20×20 rooms must be unaffected — no regression

### Failure Paths
1. **Missing room size at call site:** If any `getCellAt()` call lacks the room size parameter, default to ROOM_SIZE=20 (safe fallback)
2. **BOSS_ROOM_SIZE changed in future:** If BOSS_ROOM_SIZE is modified (e.g., to 100), the coordinate conversion should gracefully adapt

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|---|---|---|
| Boss room tile generation (Issue #127) | Stable | Low — fully merged, just has coordinate bug |
| Coordinate conversion functions (world.js) | Stable (must change) | Low — pure function refactor |
| Room transition logic (core.js) | Stable (must change) | Low — entry point adjustment |

### Blocks
| Future Work | Priority |
|---|---|
| Boss battle victory room (Issue #129) | High — blocked by boss room not working |
| Post-boss content & game completion flow | Medium |
| Boss balance tuning (charge speed, HP) | Low — cannot tune what doesn't run |

### Preparation Needed
- [ ] Identify every call site of `worldToRoomCoords()`, `getCellAt()`, `roomToWorldCoords()` in the codebase
- [ ] Determine which functions need the room object vs. just the room type

---

## 7. Spike / Experiment (Optional — depth/deep only)

### Question to Answer
N/A — standard depth, root cause already confirmed.

### Method
N/A

### Result
N/A

### Impact on Approach
N/A
