# Plan: Issue #19 — 一些门工作不正常

> **Parent Issue:** #19
> **Agent:** plan-agent
> **Date:** 2026-07-07
> **Status:** Planning complete — ready for implement

---

## 1. Problem Analysis

### Root Cause Diagnosis

The research phase (PR #27, merged) identified **four distinct root causes** that collectively make doors unreliable:

#### Bug A — Mismatched Door Pairs in `addRandomDoors()` ⚠️ CRITICAL

**File:** `public/src/engine/generator.js` (lines 145-181)

The `addRandomDoors()` function creates extra doors (creating map loops). It builds a flat array of individual door keys (e.g., `"0,0:right"`, `"1,0:left"` as a pair), then **Fisher-Yates shuffles all individual keys**, then iterates in steps of 2 — assuming shuffled indices [0,1], [2,3], etc. form valid pairs.

**After shuffle, pairs are broken.** Room A may get `.doors.right = { connectedTo: roomB }` but Room B does NOT get `.doors.left`. When the snake enters A's right door, the cell in Room B at the entrance is still `CELL.WALL` — **immediate death**.

**Even if 1-2 pairs survive**, the bug guarantees at least one broken pair per 5×5 grid generation.

#### Bug B — 3-Cell Door Passages Too Narrow

**File:** `public/src/engine/generator.js` — `generateRoomTiles()` (lines 293-310)

Doors are only 3 cells wide (`mid-1, mid, mid+1`). For snakes longer than ~10 cells, body segments compress through the narrow corridor, causing **self-collision deaths** during room transitions.

#### Bug C — Interior Walls Block Door Approaches

**File:** `public/src/engine/generator.js` — `generateRoomTiles()` (lines 312-333)

Interior walls (3-8 clusters of 1-3 cells each) can be placed at the cell immediately before a door passage. The snake approaches along the center row, hits a wall at `(18, 10)` when the door is at `(19, 10)` — **looks like "entering a door and dying"** from the player's perspective.

#### Bug D — Collision Check Runs Before Room Transition

**File:** `public/src/engine/core.js` — `tick()` (lines 82-97)

The `tick()` function currently:
```
1. compute newHead position
2. checkSnakeCollision(newHead)   ← checks cell type (WALL → dies) BEFORE room context
3. checkRoomTransition(newHead)   ← separate check, AFTER collision
```

This means the snake head can be at a DOOR cell (room border) but the collision check runs before the room transition is processed. If the head enters the new room's wall at the door threshold, the collision check sees `CELL.WALL` and kills the snake.

**Required order:**
```
1. compute newHead position
2. checkRoomTransition(newHead)   ← update room context FIRST
3. checkSnakeCollision(newHead)   ← now checks cells in the correct room
```

### Secondary Issues

| # | Issue | File |
|---|-------|------|
| E | Locked doors passable without key | `collision.js` / `core.js` — `checkRoomTransition()` never validates |
| F | Size gates never checked | same as E |
| G | Direction validation missing — snake can transition sideways through a door | `collision.js` — no direction check |
| H | Food/enemies can spawn in door cells (unlikely but not explicitly prevented) | `generator.js` |
| I | Self-collision during long-snake transitions | `core.js` — no exclusion zone during transition |

---

## 2. Proposed Solution Architecture

### Approach: Comprehensive Fix (Approach A per Research)

A single cohesive pass fixing all root causes:

### Phase 1 — Door Passage Redesign

| Task | File | Change |
|------|------|--------|
| 1.1 | `generator.js:293-310` | Widen door passages from 3→5 cells: change `mid ± 1` to `mid ± 2` for all 4 door directions |
| 1.2 | `generator.js:312-333` | Add **no-build zone** (2 cells) around door passages — prevent interior wall placement within 2 cells of any door cell |
| 1.3 | `generator.js:145-181` | Fix `addRandomDoors()` — store door pairs as tuples, shuffle the **pairs array** instead of individual keys, then add both keys from selected pairs |
| 1.4 | `render/room.js` | Update `drawDoorIndicator()` for 5-cell passages + size gate / locked indicators |

### Phase 2 — Collision Logic Rework

| Task | File | Change |
|------|------|--------|
| 2.1 | `core.js:tick()` | **Reorder collision/transition:** Move `checkRoomTransition()` BEFORE `checkSnakeCollision()` |
| 2.2 | `collision.js` (new func) | Add `checkDoorPassable(state, doorDir)` — validates locked doors (key in inventory), size gates (length >= required), direction alignment |
| 2.3 | `core.js:tick()` | Add self-collision protection during room transition — exclude body segments in previous room's door passage from self-collision check |
| 2.4 | `collision.js` | Add direction validation to `checkRoomTransition()` — only allow transition if movement direction aligns with door |
| 2.5 | `core.js:tick()` | Add blocked-door feedback — display "NEEDS KEY" / "NEEDS LENGTH N+" when blocked |

### Phase 3 — Generation Safeguards

| Task | File | Change |
|------|------|--------|
| 3.1 | `generator.js` | Explicitly exclude door cells from `findEmptyFloorCell()` for food placement |
| 3.2 | `generator.js` | Same for `spawnEnemyInRoom()` |
| 3.3 | `generator.js` | Verify solvability still works with wider doors and no-build zones |

### Phase 4 — Testing

| Task | File | Test Cases |
|------|------|------------|
| 4.1 | `metroidvania-snake.test.js` | Door transition (all 4 directions) — snake moves through → room updates |
| 4.2 | `metroidvania-snake.test.js` | Self-collision avoidance — long snake (15+ cells) through door → no death |
| 4.3 | `metroidvania-snake.test.js` | Locked door — without key → blocked; with key → passes |
| 4.4 | `metroidvania-snake.test.js` | Size gate — below min length → blocked; at/above → passes |
| 4.5 | `metroidvania-snake.test.js` | Direction validation — moving OUT of door direction → blocked |
| 4.6 | `metroidvania-snake.test.js` | No-build zone — verify walls not placed within 2 cells of doors |
| 4.7 | `metroidvania-snake.test.js` | Map boundary — room at edge has no outward door → blocked safely |
| 4.8 | `metroidvania-snake.test.js` | `addRandomDoors()` — verify no mismatched pairs after fix |

---

## 3. Key Architecture Decisions

### Decision 1: Door Passage Coordinates

```
ROOM_SIZE = 20, mid = 10
Width change: 3 cells (rows 9-11) → 5 cells (rows 8-12)

Right door (room X):     world (X*20 + 19, 8-12) → local tiles[8-12][19]
Left door (room X):      world (X*20 + 0,  8-12) → local tiles[8-12][0]
Up door (room Y):        local tiles[0][8-12]
Down door (room Y):      local tiles[19][8-12]
```

### Decision 2: Collision/Transition Order

**Before (buggy):**
```
tick() {
  newHead = compute head
  collisions = checkSnakeCollision(newHead)   // CELL.DOOR → not WALL but also not room-aware
  if collisions.wall → DEATH
  transition = checkRoomTransition(newHead)   // too late if already dead
  ...
}
```

**After (fixed):**
```
tick() {
  newHead = compute head
  transition = checkRoomTransition(newHead)   // FIRST: detect room change
  if transition.entered {
    update currentRoom
    verify door constraints (locked, size gate, direction)
  }
  collisions = checkSnakeCollision(newHead)   // NOW: correct room context
  ...
}
```

### Decision 3: Self-Collision Protection During Transition

When `transition.entered` is true, the snake head is in the **new room** but body segments trail through the door passage in the **previous room**. Self-collision check must skip body segments that are still in the previous room's door passage cells.

Implementation: During the tick where a transition occurs, check self-collision against only body segments that are:
- In the same room as the head (new room), OR
- Not in door passage cells of the previous room

After the first post-transition tick, body segments have moved through the door and normal self-collision resumes.

### Decision 4: `addRandomDoors()` Fix

Store door pairs as tuple objects `[keyA, keyB]`, shuffle the **pairs array**, then flatten:

```js
// Before (broken):
allPossible.push(key1, key2);  // individual keys
shuffle(allPossible);           // pairs broken
for (let i = 0; i < count; i += 2) {
  edges.add(allPossible[i]);   // might be key from different pair
  edges.add(allPossible[i+1]); // might be key from different pair
}

// After (fixed):
const pairs = [];
pairs.push([key1, key2]);       // store as pair tuple
shuffle(pairs);                  // pairs stay intact
for (let i = 0; i < Math.min(count, pairs.length); i++) {
  edges.add(pairs[i][0]);       // keyA from pair i
  edges.add(pairs[i][1]);       // keyB from same pair
}
```

---

## 4. Implementation Steps (Ordered)

### Step 1: Fix `addRandomDoors()` — Shuffle Pairs Not Keys
- **File:** `public/src/engine/generator.js`
- **Change:** Lines 145-181 — replace flat array with pair-tuple approach
- **Risk:** Low — isolated function, well-understood change
- **Verify:** Doors in generated maps always have matching pairs

### Step 2: Widen Door Passages to 5 Cells
- **File:** `public/src/engine/generator.js`
- **Change:** Lines 293-310 — Change `mid ± 1` to `mid ± 2`
- **Also:** Update `render/room.js` `drawDoorIndicator()` and `getDoorPosition()`
- **Risk:** Low — mechanical width change

### Step 3: Add No-Build Zones Around Doors
- **File:** `public/src/engine/generator.js`
- **Change:** In `generateRoomTiles()`, before placing each wall cluster, check if it's within 2 cells of any door passage cell. Skip if so.
- **Risk:** Low — additional validation only

### Step 4: Reorder Collision/Transition in `tick()`
- **File:** `public/src/engine/core.js`
- **Change:** Move `checkRoomTransition()` before `checkSnakeCollision()`
- **Risk:** Medium — changes core game loop order, needs careful testing

### Step 5: Add Door Constraint Enforcement
- **File:** `public/src/engine/collision.js`
- **Change:** Add `checkDoorPassable()` + update `checkRoomTransition()`
- **Risk:** Medium — new logic, may affect transition behavior

### Step 6: Add Self-Collision Protection
- **File:** `public/src/engine/core.js`
- **Change:** In the transition block, modify self-collision check to exclude trailing body segments
- **Risk:** Medium — self-collision is critical safety check

### Step 7: Add Direction Validation
- **File:** `public/src/engine/collision.js`
- **Change:** In `checkRoomTransition()`, verify `state.direction` aligns with door being entered
- **Risk:** Low-Medium — clear precondition

### Step 8: Add Blocked-Door Feedback
- **File:** `public/src/engine/core.js`
- **Change:** When a door blocks passage, set a `doorMessage` field on state
- **Risk:** Low — UI-only change

### Step 9: Generation Safeguards
- **File:** `public/src/engine/generator.js`
- **Change:** Exclude door cells from `findEmptyFloorCell()` and `spawnEnemyInRoom()`
- **Risk:** Low

### Step 10: Write Tests
- **File:** `tests/metroidvania-snake.test.js`
- **Change:** Add 8 new test cases (see Phase 4)
- **Risk:** Low — tests document correct behavior

---

## 5. Testing Strategy

### Unit Tests (Vitest)

| Test | Input | Expected Output |
|------|-------|----------------|
| Door transition (right) | Snake moved right to right-door cell | `checkRoomTransition()` returns `{entered: true, roomX: current+1}` |
| Self-collision avoidance | 15-cell snake through door | No `'self'` in collision results |
| Locked door (no key) | `doors.right.locked=true, inventory.keys=[]` | `checkDoorPassable()` returns `{passable: false, reason: 'need_key'}` |
| Locked door (with key) | `doors.right.locked=true, inventory.keys=['key_0']` | `checkDoorPassable()` returns `{passable: true}` |
| Size gate (too short) | `sizeGate.requiredLength=10, snake.length=3` | Blocked |
| Size gate (sufficient) | `sizeGate.requiredLength=10, snake.length=15` | Passes |
| Direction mismatch | Moving UP into RIGHT door | `checkRoomTransition()` returns `{entered: false}` |
| No-build zone | Wall at door-adjacent cell | Wall is not placed in `generateRoomTiles()` |
| addRandomDoors pair matching | Generated 5x5 world | Every door has matching pair in adjacent room |

### E2E / Play Test
- Run `node tests/play-test.mjs` to verify no runtime errors in browser
- Manual: launch `gameboy.html`, traverse rooms through doors

### Test Data
- Create a **deterministic map** with known door positions for reproducible tests
- Use a seeded generator to produce the same map every time

---

## 6. File Change Summary

| File | Status | Lines Changed | Complexity |
|------|--------|---------------|------------|
| `public/src/engine/generator.js` | **Modified** | ~50 lines | Medium |
| `public/src/engine/core.js` | **Modified** | ~30 lines | High |
| `public/src/engine/collision.js` | **Modified** | ~60 lines (new function + updates) | Medium |
| `public/src/engine/constants.js` | **Untouched** | 0 | — |
| `public/src/engine/world.js` | **Untouched** | 0 | — |
| `public/src/render/room.js` | **Modified** | ~20 lines | Low |
| `tests/metroidvania-snake.test.js` | **Modified** | ~120 lines (test cases) | Low |

**Total:** ~280 lines changed across 5 files

---

## 7. Estimated Effort

| Phase | Tasks | Est. Time | Notes |
|-------|-------|-----------|-------|
| Phase 1: Door redesign | 1.1-1.4 | 1.5-2h | Straightforward dimensional + structural changes |
| Phase 2: Collision rework | 2.1-2.5 | 2-3h | Most complex — core game loop changes |
| Phase 3: Safeguards | 3.1-3.3 | 0.5h | Simple exclusion checks |
| Phase 4: Tests | 4.1-4.8 | 1-1.5h | Write + run + debug |
| **Total** | **10 tasks** | **5-7h** | **Medium effort** |

### Risk Assessment
- **High risk:** Step 4 (reorder collision/transition) — could break all game mechanics if not done carefully
- **Medium risk:** Steps 5-6 (door enforcement, self-collision) — new logic paths with edge cases
- **Low risk:** Steps 1-3, 7-10 — mechanical or isolated changes

### Mitigation
1. Implement Step 4 first in isolation, verify with existing tests
2. Add each test BEFORE the corresponding fix (TDD approach)
3. Run the full test suite after each step
4. Use a deterministic seed for reproducible test worlds

---

## 8. Acceptance Criteria

- [ ] Snake passes through all 4 door directions safely
- [ ] Long snakes (15+ cells) pass through doors without self-collision
- [ ] Interior walls never block door approaches (no-build zone verified)
- [ ] Locked doors block passage without key, allow with key
- [ ] Size gates block snakes below minimum length
- [ ] Direction mismatches (e.g., moving UP into RIGHT door) are blocked
- [ ] `addRandomDoors()` produces only valid matching pairs
- [ ] Map boundary out-of-bounds transitions are blocked
- [ ] Food and enemies never spawn in door cells
- [ ] All 8 new test cases pass
- [ ] Play test shows no runtime errors
- [ ] Existing tests continue to pass
