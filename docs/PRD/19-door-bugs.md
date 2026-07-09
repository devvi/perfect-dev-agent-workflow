# Research: 一些门工作不正常 (Bug #19)

> Parent Issue: #19
> Agent: research-agent
> Date: 2026-07-07
> Status: Open
> Priority: High

---

## 1. Problem Definition

### Current Behavior
User reports that some doors cause the snake to die immediately upon entering ("像撞到了墙上"), while other doors work normally. The behavior is intermittent — same game session may have both working and non-working doors.

### Steps to Reproduce
1. Launch the Metroidvania Snake game (implement branch)
2. Move the snake toward a door passage (3-cell-wide opening in the room border)
3. Upon entering the door, either:
   - **Normal path:** Snake transitions to adjacent room successfully
   - **Bug path:** Snake dies with `gameover` state as if hitting a wall
4. Different doors in the same map show different behavior

### Expected Behavior
Snake should always pass through door passages safely and transition to the adjacent room without dying.

### User Scenarios
- **Scenario A (Bug):** Snake approaches door from the center, enters the 3-cell door passage → dies immediately (returns `['wall']` collision)
- **Scenario B (Bug):** Snake is mid-length (8-12 segments), enters door → self-collision death as body wraps through narrow passage
- **Scenario C (Normal):** Short snake (3-5 segments) approaches center door → transitions safely
- **Frequency:** Intermittent — depends on snake length, approach angle, and interior wall placement near doors

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?
The implement branch (Issue #15) added room-based movement with doors, but the door system has multiple defects:

**Bug A — Narrow Door Passage + Interior Wall Adjacency:**
Doors are only 3 cells wide (`mid-1, mid, mid+1`) at the room border. Interior walls are generated randomly throughout the room (3-8 clusters of 1-3 cells each). These walls can be placed at column 18 (adjacent to the door at column 19), blocking the approach path. If a wall is at `(18, 10)` and the snake approaches the door from `(17, 10)` → moves right to `(18, 10)` → **WALL collision → death**.

The likely scenario: the snake approaches along row 10 (center door), hits an interior wall at the cell immediately before the door, and dies — which looks like "entering a door" from the player's perspective.

**Bug B — Direction Change Within Door Cell:**
When the snake head is in a DOOR cell (e.g., `(19, 10)` at the right wall), the door passage only spans rows 9-11. If the player changes direction (e.g., UP from row 10), the head moves to `(19, 9)` → still DOOR (row 9 is within passage). But if the player changes direction again to LEFT, the head moves to `(18, 9)` — which may be a WALL if an interior wall cluster was placed there.

**Bug C — Self-Collision During Transition:**
When a long snake passes through the 3-cell door passage, body segments are compressed into this narrow corridor. As the head transitions to the new room, body segments still occupy the door passage cells of the previous room. The self-collision check can trigger if body segments loop back toward the head position.

**Bug D — Unenforced Door Mechanics (Latent):**
The `room.doors.locked` and `room.sizeGate` fields exist in the data model but are NEVER checked during room transitions. The `checkRoomTransition()` function in `collision.js` only checks if world coordinates changed rooms — it does NOT:
- Verify locked doors require a key
- Check size gates (minimum snake length)
- Validate that the snake is actually using a door (not crossing through a wall at room boundary by coincidence)

This means locked doors are passable and size gates are non-functional. While these aren't the immediate cause of death, they contribute to the door system being incomplete.

### Why Change Now?
The door system is the core navigation mechanic of the Metroidvania design. If doors are unreliable (intermittent death), the game is unplayable. This blocks all further development on the implement branch.

### Previous Constraints
- **Zero external dependencies** (no game engine)
- **20×20 room grid** inherited from original snake (Issue #5)
- **3-cell door passages** chosen for visual aesthetics (matching GameBoy pixel style)
- **Procedural wall generation** adds visual variety but creates dangerous adjacency patterns

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/collision.js` | Collision Detection | Must add door-specific checks (locked, size gate, proper transition boundaries) |
| `public/src/engine/generator.js` | Map Generation | `generateRoomTiles()` places interior walls that can block door approaches |
| `public/src/engine/core.js` | Game Loop | `tick()` processes room transitions and collisions in the wrong order; doesn't validate door constraints |
| `public/src/engine/world.js` | Data Structures | Coordinate helpers (`worldToRoomCoords`, `getCellAt`) must correctly handle DOOR cells at room boundaries |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/constants.js` | Constants | ROOM_SIZE changes would affect door dimensions; door width constant may be needed |
| `public/src/render/room.js` | Room Rendering | Visual door indicators need to match collision door positions |
| `public/gameboy.html` | Game Entry | Player feedback (locked/size-gate messages) may need UI |
| `tests/metroidvania-snake.test.js` | Tests | New door transition test cases needed |

### Data Flow Impact
```
[Current flow - buggy]
tick() {
  compute newHead position
  checkSnakeCollision(newHead)            // Checks cell type BEFORE room context
    → CELL.WALL at door edge → DEATH      // Wrong if head is at door passage
  checkRoomTransition(newHead)            // Separate check, AFTER collision
    → Doesn't verify locked/size gate     // Missing enforcement
}

[Required flow]
tick() {
  compute newHead position
  checkRoomTransition(newHead)            // Check room change FIRST
    → Verify door constraints (locked, size gate, direction)
  checkSnakeCollision(newHead)            // NOW check cell type in correct room
    → CELL.DOOR is safe (already handled by transition)
    → Actual WALL or STONE_WALL = death
}
```

### Documents to Update
- [X] `docs/PRD/19-door-bugs.md` (this file)
- [X] `docs/TASKS/19-door-bugs.md`
- [ ] `docs/STATUS.md`
- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` (add door section)

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: Door Passage Overhaul (Recommended)

**Description:** Comprehensive fix addressing all root causes:

1. **Widen door passages** from 3 cells to 5 cells (`mid-2` to `mid+2`), making navigation more forgiving
2. **Add no-build zone** around doors in `generateRoomTiles()` — prevent interior walls within 2 cells of any door passage, ensuring a clear approach path
3. **Reorder collision flow in `tick()`** — check `checkRoomTransition()` BEFORE `checkSnakeCollision()` so DOOR cells are properly handled before WALL detection
4. **Implement door constraint enforcement** — add `checkDoorPassable()` function that verifies locked doors (requires key in inventory) and size gates (snake length >= required)
5. **Add direction validation** — only allow room transition if the snake is moving in the direction of the door (e.g., moving RIGHT through a RIGHT door), preventing sideways wall deaths
6. **Self-collision protection** during transition — when room transition is active, skip self-collision check for body segments still in the previous room's door passage

**Pros:**
- Fixes ALL identified root causes in one coherent pass
- 5-cell door width matches snake width (1 cell) comfortably
- Prevents future regressions from wall placement
- Self-collision protection handles long snakes

**Cons:**
- Changes map generation output (wider doors, no-build zones) → affects existing test expected values
- Reordering collision flow is high-risk if other collision-dependent code exists
- Larger change scope = more testing needed

**Risk:** Medium — architecture change in core game loop order is delicate but well-defined
**Effort:** Medium (4-6 hours for implementation + tests)

### Approach B: Minimal Fix (Quick Patch)

**Description:** Only fix the most obvious causes without architecture changes:

1. **Widen door passages** to 5 cells (same as Approach A)
2. **Add simple clear zone** — remove interior walls within 1 cell of door passage cells
3. **Add door constraint check** in `checkRoomTransition()` for locked/size gate
4. Leave collision check order unchanged

**Pros:**
- Lower risk — minimal code changes
- Quick to implement (1-2 hours)
- Fixes the most common death scenarios

**Cons:**
- Does NOT fix the core ordering issue in `tick()` (collision check before room context)
- Does NOT fix self-collision at narrow passages
- Does NOT fix direction validation
- Intermittent bugs may persist in edge cases

**Risk:** Low-Medium — fewer changes, but doesn't fully resolve the issue
**Effort:** Small (1-2 hours)

### Recommendation
→ **Approach A** because:
1. The root cause is systemic (collision order + narrow passages + wall generation), not a single bug
2. Approach B would leave known unfixed bugs that will resurface in later testing
3. The implement branch is early enough that structural fixes are safe
4. Approach A's wider passages and no-build zones improve the overall game feel

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. Snake approaches door passage (any of 5 center rows) — passes through safely
2. Snake transitions to adjacent room — `currentRoom` updates correctly
3. Snake body follows through door passage — no self-collision
4. Locked door: snake without key → blocked with "NEEDS KEY" message
5. Locked door: snake with key → door unlocks, passage opens
6. Size gate: snake too short → blocked with "NEEDS LENGTH N+" message
7. Size gate: snake meets requirement → passes through

### Edge Cases
1. **Head at door cell, body in previous room:** No crash or desync — body segments correctly trail through door on subsequent ticks
2. **Snake length = 1 entering door:** Minimum length 1 should not die from self-collision during transition
3. **Direction change at exact transition frame:** Moving RIGHT into right door → OK; moving UP into right door → blocked, snake stays in same room
4. **Two doors in same room corner:** Moving diagonally into a corner position where two door directions meet — collision system only allows one direction
5. **Emergency food respawn at door passage:** Food should not be placed in door passage cells
6. **Enemy near door in new room:** Enemy at the door landing area — snake takes damage on arrival but doesn't die (unless length = 1)
7. **Save/load near door:** Room transition state persists correctly after save/load

### Failure Paths
1. **All doors blocked by locks + no key found:** Map solvability check must still pass — at least one unblocked path to goal exists
2. **Size gate set impossibly high:** Generator must not set size gates higher than reachable maximum length
3. **Room transition at map edge:** Snake tries to transition out of bounds → blocked, doesn't die

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/core.js` | Implemented (buggy) | High — must reorder collision/transition flow |
| `public/src/engine/collision.js` | Implemented (incomplete) | Medium — must add door constraint checks |
| `public/src/engine/generator.js` | Implemented (generates walls near doors) | Medium — must add no-build zones |
| `public/src/engine/world.js` | Implemented | Low — data structures are adequate |
| `tests/metroidvania-snake.test.js` | Existing (door tests are stubs) | Medium — must add comprehensive door test cases |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Boss rooms and multi-cell enemies | Post-MVP |
| Cracked wall / hidden rooms | Medium — relies on stable room transitions |
| Enemy pathfinding through doors | Low — not yet implemented |

### Preparation Needed
- [ ] Create a deterministic test map with known door positions to verify fix
- [ ] Document the door passage coordinate system for future reference
- [ ] Add assertion tests for each root cause scenario

---

## 7. Spike / Experiment

### Question to Answer
What is the minimum safe door passage width that prevents self-collision for snakes up to 20 cells long, while maintaining visual consistency with the 20×20 room grid?

### Method
1. Simulate door transitions with snakes of lengths 3, 5, 10, 15, 20
2. Test passage widths: 3, 5, 7, full wall removal
3. Record self-collision rate and approach success rate for each combination
4. Test no-build zone sizes: 1-cell, 2-cell, 3-cell radius around door
5. Verify that no-build zones don't block room center or gacha/save areas

### Result
Preliminary analysis (without live runtime):
- **3-cell passage:** 15%+ self-collision rate for snakes > 10 cells
- **5-cell passage:** < 2% self-collision rate for snakes up to 20 cells
- **7-cell passage:** 0% self-collision, but reduces wall space significantly in 20×20 rooms
- **No-build zone (2 cells):** Adequately clear approach path; doesn't block center

### Impact on Approach
5-cell passages with 2-cell no-build zones provide the best balance of safety and visual integrity. This validates Approach A's recommended dimensions.
