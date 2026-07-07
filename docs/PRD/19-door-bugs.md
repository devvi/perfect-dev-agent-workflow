# Research: 一些门工作不正常 (Bug #19)

> Parent Issue: #19
> Agent: research-agent
> Date: 2026-07-07

---

## 1. Problem Definition

### Current Behavior
User reports that some doors cause the snake to die immediately upon entering ("像撞到了墙上"), while other doors work normally. The behavior is intermittent — the same game session can have both working and non-working doors.

### Steps to Reproduce
1. Launch the Metroidvania Snake game
2. Move the snake toward a visible door passage (3-cell-wide opening with arrow indicator)
3. Result:
   - **Normal path:** Snake transitions to adjacent room successfully
   - **Bug path:** Snake dies with `gameover` state as if hitting a wall
4. Different doors in the same map show different behavior

### Expected Behavior
Snake should always pass through door passages safely and transition to the adjacent room without dying.

---

## 2. Root Cause Analysis

### Primary Bug: Mismatched Door Pairs in `addRandomDoors()` (CRITICAL)

**Location:** `public/src/engine/generator.js`, function `addRandomDoors()`, lines ~143-178

The `addRandomDoors()` function adds extra doors between rooms (beyond the minimum spanning tree) to create loops. It stores door pair keys as a flat array, then **Fisher-Yates shuffles the entire flat array** before iterating in steps of 2.

**Bug mechanism:**
- `allPossible` is built as `[key1_A, key2_A, key1_B, key2_B, key1_C, key2_C, ...]` where each pair `(key1_N, key2_N)` represents the two directions of a door (e.g., `"0,0:right"` and `"1,0:left"`)
- The shuffle rearranges **all individual keys** — `[key2_C, key1_A, key2_B, key1_C, key1_B, key2_A, ...]`
- The iteration loop picks pairs at `(0,1), (2,3), (4,5)` from the shuffled array
- These are now **unrelated keys from different door pairs**
- One direction gets added to `allEdges` but the matching reverse direction is **not** added

**Consequence:**
- Room A gets `.doors.right = { connectedTo: roomB }` — visible as a door opening in A
- Room B does **not** get `.doors.left` — B's tiles remain as `CELL.WALL` at the entrance position
- When the snake moves through A's right door into B, B's tile at position `(0, mid)` returns `CELL.WALL`
- `checkSnakeCollision()` → `['wall']` → game over

**Verification:** A simulation of 10,000 trials found **100% always produces at least one mismatched door pair** in a 5×5 grid.

### Additional Issue 1: Door passage only 3 cells wide

**Location:** `public/src/engine/generator.js`, `generateRoomTiles()`

Doors are 3 cells wide (`mid-1, mid, mid+1` where mid = ROOM_SIZE/2 = 10). The snake head is 1 cell wide, but body segments (up to 20+) must compress through this narrow passage, enabling self-collision if the body loops back.

### Additional Issue 2: Interior walls can block door approaches

**Location:** `public/src/engine/generator.js`, `generateRoomTiles()`, wall placement loop

Interior walls are placed at random positions `wx ∈ [2, 17], wy ∈ [2, 17]` (for ROOM_SIZE=20). Since door passages are at the room edges (cx=0 or cx=19), walls at positions like `(17, mid)` or `(18, mid)` can block the approach path to a right-side door, making it appear the snake "died entering a door" when it actually hit a wall one cell before the door.

### Additional Issue 3: Unenforced door mechanics (locked doors, size gates)

**Location:** `public/src/engine/core.js`, `tick()`, and `public/src/engine/collision.js`

The room transition in `tick()` calls `checkRoomTransition()` which only checks if world coordinates changed rooms. It does **not**:
- Verify locked doors require a key
- Check size gates (minimum snake length)
- Validate that the snake is actually using a door (not crossing through a wall coincident with room boundary)

This means locked doors are functionally passable and size gates are non-functional in gameplay.

---

## 3. Affected Files

| File | Line(s) | Issue |
|------|---------|-------|
| `public/src/engine/generator.js` | 156-177 | `addRandomDoors()` shuffle breaks matching door pairs — **PRIMARY BUG** |
| `public/src/engine/generator.js` | 440-459 | Interior walls can block door approach paths |
| `public/src/engine/generator.js` | 410-437 | Door passages only 3 cells wide — no self-collision protection |
| `public/src/engine/collision.js` | 33-34 | `'door'` collision result computed but **never consumed** by game loop |
| `public/src/engine/core.js` | 73-79 | `checkSnakeCollision()` runs **before** `checkRoomTransition()` — DOOR cells on the boundary of the current room are handled as regular cells, not as transition triggers |
| `public/src/engine/core.js` | 85-101 | Room transition has zero constraint validation (locked, size, direction) |
| `public/src/engine/generator.js` | 368-395 | `verifySolvability()` checks door connectivity via the `doors` data structure but does **not** verify that both sides have matching tile representations |

---

## 4. Proposed Fix Approaches

### Approach A: Fix addRandomDoors + Safe Door Generation (Recommended)

1. **Fix `addRandomDoors()`** — Shuffle **pairs** instead of individual keys. Store door pair objects and shuffle the array of pairs, always adding both directions together.
2. **Widen door passages** from 3 cells to 5 cells (`mid-2` to `mid+2`)
3. **Add 1-cell clear zone** around doors — prevent interior walls in cells immediately adjacent to door passages
4. **Implement door constraint checks** in `checkRoomTransition()` for locked doors and size gates
5. **Validate direction** — only allow room transitions that align with the door direction (e.g., snake moving RIGHT can only use a RIGHT-direction door)

**Effort:** Medium (3-5 hours)
**Risk:** Medium (fixes the core generation bug and improves gameplay)

### Approach B: Minimal Quick Fix

1. **Fix `addRandomDoors()`** only — use pair-based shuffling
2. Widen doors to 5 cells

**Effort:** Small (1-2 hours)
**Risk:** Low
**Limitation:** Only addresses the generation bug, not the UX issues with narrow passages and wall adjacency

---

## 6. Key Verification Steps

- [x] Confirmed `addRandomDoors()` shuffle creates mismatched pairs at 100% rate (10,000 trials)
- [x] Confirmed `verifySolvability()` passes for maps with mismatched doors (BFS uses `doors` data structure, not tiles)
- [x] Confirmed `generateRoomTiles()` only places DOOR cells for directions where `room.doors[dir]` exists
- [ ] After fix: generate 500 maps and verify all room-pair doors are symmetric (both directions present)
- [ ] After fix: verify all doors are safely traversable (snake approaches from any angle within door region)
- [ ] After fix: verify locked doors and size gates block/pass correctly

---

## 7. Conclusion

The primary root cause is a **generation bug** in `addRandomDoors()` that creates one-way door pairs, causing snake death on entry. This is compounded by narrow door passages and nearby interior walls. The recommended fix (Approach A) addresses all layers: generation, collision, and gameplay enforcement.
