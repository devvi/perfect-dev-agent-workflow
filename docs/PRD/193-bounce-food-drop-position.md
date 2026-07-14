# PRD: Bounce Food Drop Position Fix

**Issue:** #193 — 蛇撞墙后反弹食物掉在蛇尾，reverse 后自动吃到

**Depth:** light

---

## 1. Problem

### Current Behavior

When the snake collides with a WALL or STONE_WALL (the `damage` collision path), a bounce food is dropped at the **tail** position (`s.snake[s.snake.length - 1]`). The code comment on line 272 explains the original developer intent was to avoid dropping food at `newHead` (which is inside the wall cell). However, the tail position produces a worse outcome:

```
Pre-collision:  Head=[5,5]  ...  Tail=[8,5]  (food dropped at [8,5])
  → stuckCounter countdown (5 ticks)
  → s.snake.reverse() fires    ← head/tail swap
Post-reverse:  Head=[8,5]  ...  Tail=[5,5]  (head lands on food → auto-eats)
```

After `snake.reverse()` completes, the swapped head lands exactly on the food position, causing the snake to **automatically eat** the bounce food without any player input. This defeats the design intent of a bounce food — it should be dropped at a position the snake must actively navigate toward.

### Expected Behavior

The bounce food should be dropped at the **last valid head position** (`s.snake[0]`, the cell the snake occupied immediately before attempting to move into the wall). This is in front of the snake (in the direction it was traveling), and after reverse, the food ends up near the tail — requiring the player to actively move to retrieve it:

```
Pre-collision:  Head=[5,5]  ...  Tail=[8,5]  (food dropped at [5,5])
  → stuckCounter countdown
  → s.snake.reverse()
Post-reverse:  Head=[8,5]  ...  Tail=[5,5]
  → food at [5,5] (near tail), snake must move to pick it up → meaningful gameplay
```

### User Scenario

- Player navigates snake into a wall → snake gets stuck → during stuck countdown, player plans next move
- After reverse completes, player expects to have to navigate toward the bounce food
- Current bug: food is auto-eaten on reverse, removing any gameplay consequence

### Frequency

Every wall collision with a snake length > 1. Not a rare edge case.

---

## 2. Root Cause

### Why Does Current Behavior Exist?

The original developer (PR #157 / #163) chose the tail position because `newHead` is inside the wall cell. The thinking was: "tail is always on a valid traversable tile, so food is guaranteed reachable." This is correct for reachability but overlooks the interaction with `snake.reverse()`.

After wall collision, the game sets `stuckCounter = STUCK_TICKS` and `pendingReverse = true`. When the countdown expires, `snake.reverse()` fires, which swaps head and tail. If food was dropped at the old tail position, the new head lands on it → auto-eat.

### Why Fix Now?

The bug creates a gameplay experience that contradicts the design intent of bounce food (meant to be a challenge to retrieve). It's a clear logic bug in a mature code path.

### Previous Constraints

- `newHead` (the wall cell) is never a valid drop position — food on a wall tile is invisible and unreachable
- The food must land on a traversable tile
- The `s.snake[0]` position is always a floor/valid cell (snake can't occupy walls)
- All existing behaviors (stuck counter, pending reverse, screen shake, score penalty, tail pop) should remain unchanged

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js` | Tick/wall-damage handler | Change drop position from tail to head (lines 272-274) |
| `tests/metroidvania-snake.test.js` | Tests | Add test cases verifying drop position |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/entities.js` | `createBounceFood` | Not affected — position-agnostic |
| `public/src/engine/ai.js` | Boss food drops | Not affected — uses different pattern with boss segments |

### Data Flow Impact

Minimal. The only change is which snake segment's coordinates are used as the food drop position. The food creation, room lookup, and tail pop all remain identical.

### Documents to Update

- [x] `docs/PRD/193-bounce-food-drop-position.md` (this document)
- [ ] `docs/DESIGN/193-bounce-food-drop-position.md` (design phase, if applicable)

---

## 4. Solution

### Change Description

One logical change: use `s.snake[0]` (head) instead of `s.snake[s.snake.length - 1]` (tail).

| File | Line | Current | New |
|------|------|---------|-----|
| `public/src/engine/core.js` | 272 | `// Drop bounce food at tail's last segment (not at newHead, which is inside the wall)` | `// Drop bounce food at current head position (last valid pos before wall collision)` |
| `public/src/engine/core.js` | 273 | `const lastSeg = s.snake[s.snake.length - 1];` | `const headSeg = s.snake[0];` |
| `public/src/engine/core.js` | 274 | `const dropPos = { x: lastSeg.x, y: lastSeg.y };` | `const dropPos = { x: headSeg.x, y: headSeg.y };` |

### Refined Comment (proposed)

```javascript
// Drop bounce food at current head position (last valid pos before wall collision)
// After snake.reverse(), food ends up near tail — player must actively navigate to it
const headSeg = s.snake[0];
const dropPos = { x: headSeg.x, y: headSeg.y };
```

### Verification

`s.snake[0]` on line 273 is the snake's **head position before the wall collision**. The wall collision happens at `newHead` (computed from `s.snake[0] + direction`). The snake array has not been mutated between the collision check and this code block (no `.pop()`, no `.reverse()`, no mutation of the snake array), so `s.snake[0]` is always the last valid head position on a traversable tile.

### Pros and Cons

| Approach | Pros | Cons |
|----------|------|------|
| **A: Use head position `s.snake[0]`** (recommended) | Fixes the auto-eat bug; food is reachable; one-line change | None significant |
| **B: Use tail position with post-reverse food repositioning** | Avoids changing the drop logic | More complex; additional state tracking needed; fragile |
| **C: Remove food drop on wall collision entirely** | Simplest code | Removes intended gameplay mechanic |

### Recommendation

→ **Approach A** because it's a minimal, correct fix that preserves all existing gameplay mechanics.

---

## 5. Implementation Notes

### Files to Edit

| File | Change Type | Lines | Effort |
|------|------------|-------|--------|
| `public/src/engine/core.js` | Modify (3 lines: comment + 2 code lines) | 272-274 | ~2 min |
| `tests/metroidvania-snake.test.js` | Add test case(s) | New section | ~15 min |

### Test Cases to Add

1. **Wall collision drops bounce food at head position (not tail):**
   - Arrange: snake with head at (5,5), tail at (8,5), heading right toward WALL at (6,5)
   - Act: `tick(state)`
   - Assert: `room.entities.food` contains a bounce food at (5,5) (head position), not at (8,5) (tail position)

2. **Reverse does NOT auto-eat bounce food:**
   - Arrange: same setup as above, tick to create bounce food at head position
   - Act: advance ticks until `stuckCounter` reaches 0 and `snake.reverse()` fires
   - Assert: after reverse, head is NOT on the bounce food position; food still exists in the room

3. **Bounce food is still retrievable after reverse:**
   - Arrange: same setup, post-reverse state
   - Act: move snake toward the bounce food position (the old head)
   - Assert: snake successfully eats the bounce food, score increases

### Scope Check

- **Only `public/src/engine/core.js`** is modified in production code
- No other files reference `s.snake[s.snake.length - 1]` in the bounce food drop context
- The `ai.js` boss food drop uses a different pattern — not affected
- The `entities.js` `createBounceFood` function is position-agnostic — not affected
- No constants, types, or data structures change

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Food drops inside a wall cell if snake is 1-tile from wall and head is adjacent to wall | Low | `s.snake[0]` is always a FLOOR cell — the snake cannot occupy a wall cell |
| Food drops outside room boundaries | Low | The `worldToRoomCoords` + `getRoomAt` check verifies room exists before adding food |
| Snake length = 1 edge case | None | Already handled upstream (line ~246) — returns gameover before reaching bounce food code |

---

## 6. Boundary Conditions & Acceptance Criteria

### Normal Path

1. Snake collides with wall → bounce food dropped at `s.snake[0]` (head position)
2. `stuckCounter` countdown runs (5 ticks)
3. `snake.reverse()` fires → head/tail swap
4. Bounce food is NOT auto-eaten
5. Player actively navigates to retrieve the food
6. All existing wall collision behaviors preserved (stuck, screen shake, score penalty, tail pop)

### Edge Cases

1. **Single-segment snake hitting wall:** Already handled upstream — immediate `gameover`, no food drop code reached
2. **Snake with 2 segments hitting wall:** After tail pop, snake length = 1, no further issues — gameover check fires
3. **Snake hitting wall at room border:** The `worldToRoomCoords` + `getRoomAt` check handles correct room assignment
4. **Self-collision:** No bounce food dropped — unchanged
5. **No world context (test/gameboy mode):** `if (s.world)` guard — no food spawned, tail pop still executes

### Failure Paths

1. **Food still auto-eaten after reverse:** Fix didn't work → verify `s.snake[0]` is used, re-check tick order

---

## 7. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/core.js` | Current | Low |
| `tests/metroidvania-snake.test.js` | Current | Low |

### Blocks

| Future Work | Priority |
|-------------|----------|
| None | — |

### Preparation Needed

- [ ] Verify current test suite passes before making changes
- [ ] Create test branch from current master HEAD

---

## 8. References

- **Issue #193**: Original bug report (this issue)
- **PR #157** (commit `6ee7b57`): Original bounce food implementation
- **PRD #163** (`docs/PRD/163-wall-bounce-food-position.md`): Previous PRD for wall bounce food position (addressed food existing at all; this PRD addresses the drop position bug)
- **DESIGN #163** (`docs/DESIGN/163-wall-bounce-food-position.md`): Design doc for wall bounce food
- **`public/src/engine/core.js:272-274`**: The affected code
- **`public/src/engine/entities.js:111`**: `createBounceFood` factory function
