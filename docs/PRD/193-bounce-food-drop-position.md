# PRD: Bounce Food Drop Position Fix

**Issue:** #193 — 蛇撞墙后反弹食物掉在蛇尾，reverse 后自动吃到

**Depth:** light

---

## 1. Problem

### Current Behavior

When the snake collides with a WALL or STONE_WALL (the `damage` collision path), a bounce food is dropped at the **tail** position (`s.snake[s.snake.length - 1]`). The developer's original intent (documented in the code comment on line 272) was to avoid dropping it at `newHead`, which is inside the wall cell. However, the tail position produces a worse outcome:

```
撞墙前:  Head=[5,5]  ...  Tail=[12,12]  (food dropped at [12,12])
  → stuckCounter 倒计时 (5 ticks)
  → s.snake.reverse()    ← head/tail swap
撞墙后:  Head=[12,12]  ...  Tail=[5,5]  (head lands on food → auto-eats)
```

After `snake.reverse()` completes, the swapped head lands exactly on the food position, causing the snake to **automatically eat** the bounce food without any player input. This defeats the design intent of a bounce food — which should be dropped at a distant position that the snake must actively navigate toward.

### Expected Behavior

The bounce food should be dropped at the **last valid head position** (`s.snake[0]`, the cell the snake occupied immediately before attempting to move into the wall). This is in front of the snake (in the direction it was traveling), and after reverse, the food ends up near the tail — requiring the player to actively move to retrieve it:

```
撞墙前:  Head=[5,5]  ...  Tail=[12,12]  (food dropped at [5,5])
  → stuckCounter 倒计时
  → s.snake.reverse()
撞墙后:  Head=[12,12]  ...  Tail=[5,5]
  → food at [5,5] (near tail), snake must move to pick it up → meaningful gameplay
```

### User Scenario

- Player navigates snake into a wall → snake gets stuck → during stuck countdown, player plans next move
- After reverse completes, player expects to have to navigate toward the bounce food
- Current bug: food is auto-eaten on reverse, removing any gameplay consequence

---

## 2. Solution

### Root Cause

In `public/src/engine/core.js`, the bounce food drop position uses `s.snake[s.snake.length - 1]` (the tail segment) instead of `s.snake[0]` (the head segment, representing the last valid position before the wall collision).

### Replacement Map

| File | Line | Current Code | New Code |
|------|------|-------------|----------|
| `public/src/engine/core.js` | 272 | `// Drop bounce food at tail's last segment (not at newHead, which is inside the wall)` | `// Drop bounce food at current head position (last valid pos before wall collision)` |
| `public/src/engine/core.js` | 273 | `const lastSeg = s.snake[s.snake.length - 1];` | `const headSeg = s.snake[0];` |
| `public/src/engine/core.js` | 274 | `const dropPos = { x: lastSeg.x, y: lastSeg.y };` | `const dropPos = { x: headSeg.x, y: headSeg.y };` |

**Change:** One logical change — use head (`s.snake[0]`) instead of tail (`s.snake[s.snake.length - 1]`). The variable rename (`lastSeg` → `headSeg`) and comment update improve clarity.

### Verification

`s.snake[0]` on line 273 is the snake's **head position before the wall collision**. The wall collision happens at `newHead` (line 144-146), which is computed from `s.snake[0] + direction`. The snake has not been modified between the collision check and this code block (no `.pop()`, no `.reverse()`, no mutation of snake array), so `s.snake[0]` is always the last valid head position.

---

## 3. Implementation Notes

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
   - Assert: After reverse, head is NOT on the bounce food position; food still exists in the room

### Scope Check

- **Only `public/src/engine/core.js`** is modified in production code
- No other files reference `s.snake[s.snake.length - 1]` in the bounce food drop context
- The `ai.js` boss food drop uses a different pattern (`lastSeg` from built boss segments) — not affected
- The `entities.js` `createBounceFood` function is position-agnostic — not affected
- No constants, types, or data structures change

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Food drops inside a wall cell if snake is 1-tile from wall and head is adjacent to wall | Low | `s.snake[0]` is always a FLOOR cell — the snake cannot occupy a wall cell |
| Food drops outside the room boundaries | Low | The `worldToRoomCoords` + `getRoomAt` check on line 277-278 verifies the room exists before adding food; if head is on a room border, the food drops in the correct room |
| Snake length = 1 edge case already handled (line 246-249 sets gameover before reaching bounce food code) | None | Guard at line 246 checks `s.snake.length <= 1` and returns early |

### Acceptance Criteria

1. Wall collision drops bounce food at `s.snake[0]` (head position) — NOT at `s.snake[length-1]` (tail)
2. After `snake.reverse()` completes, the head does NOT land on the bounce food position
3. The bounce food is still retrievable — player must actively navigate to it
4. All existing wall/food collision tests (Groups B, C in test file) continue to pass
5. Single-segment snake hitting wall → gameover (no food drop) — unchanged
6. Self-collision → no bounce food dropped — unchanged
7. Boss enemy food drops (in `ai.js`) — unaffected
