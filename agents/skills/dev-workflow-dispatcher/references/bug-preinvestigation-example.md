# Bug Pre-investigation Examples

> Two real-world traces showing the Bug Pre-investigation step (item #7 in Pre-Spawn Validation Checklist).

---

## Example 1: Coordinate Mismatch — Issue #132 (Boss Room Freeze)

### Source Analysis Performed

### Step 1: Check the error report
Issue #132: "[Bug] 进boss房间卡死" — entering boss room freezes
Error: CSP blocks eval (secondary), game freezes on boss room entry (primary)

### Step 2: Read the boss-relevant source files
Read in order: constants.js → world.js → collision.js → core.js → generator.js → entities.js → ai.js

### Step 3: Trace the entry path
- Boss room uses `BOSS_ROOM_SIZE = 80`, normal rooms use `ROOM_SIZE = 20`
- Snake enters boss room → `gameState = 'bossIntro'` (core.js:203-208) → player dismisses → next tick
- `getCellAt(world, head.x, head.y)` → `worldToRoomCoords(wx, wy)` → divides by `ROOM_SIZE (20)`
- Local coords `cx ∈ [0,19]` → indexes into `tiles[0][cx]` which is 80-wide — only accesses `tiles[0][0..19]`
- `tiles[0][0..19]` are all `CELL.WALL` (border wall loop goes `for i = 0 to 79`)
- Result: snake sees WALL at entrance → stuck+reverse loop

### Step 4: Check boss entity placement
- `createBossEnemy('blue_hammer', 40, 38)` — world coordinate (40,38)
- World is 5×5 rooms × 20 each = 100×100. Boss at (40,38) → room grid (2,1) — NOT boss room
- Boss AI never runs → boss fight never starts

### Step 5: Include in delegate_task context
```
## Pre-Investigation Findings
The boss room freeze is caused by a coordinate system mismatch...

## Root Cause (Pre-Analyzed)
### Bug 1: getCellAt() reads wrong tile indices
File: public/src/engine/world.js, line 87-93
- worldToRoomCoords() divides by ROOM_SIZE (20), producing cx,cy ∈ [0,19]
- Boss room tiles[][] is 80×80 — only top-left 20×20 portion is accessible
- BOSS_DOOR at tiles[0][40] is NEVER detected → snake enters through tiles[0][10]=CELL.WALL

### Bug 2: Snake stuck after boss intro
File: public/src/engine/core.js, line 203-208
- Entering boss room → bossIntro state → pause → player dismisses
- Next tick: getCellAt → CELL.WALL → stuckCounter=5, pendingReverse=true
- Snake perpetually stuck on invisible border wall

### Bug 3: Boss entity at wrong coords
File: public/src/engine/generator.js, line 462
- createBossEnemy('blue_hammer', 40, 38) uses tile-local coords as world coords
- World is 100×100 (5 rooms × 20), so boss.x=40 → room grid (2,0) — not boss room
- Boss AI never runs

### Bug 4: Pillar collision broken
Boss pillars at tiles[5][5], [74][5], [5][74], [74][74] are outside getCellAt's visible 0-19 range
```

---

## Example 2: Zero-Direction Self-Collision Death — Issue #158 (boss_stability)

### Source Analysis Performed

### Step 1: Check the error report
Issue #158: "[CI] Pre-existing E2E play-test failure on master (regression_boss_stability)"
Failing scenario: `regression_boss_stability` in `tests/play-test.mjs:165`
After entering boss room and dismissing intro, snake dies within 30 ticks (gameover).

### Step 2: Read source files
Read in order: play-test.mjs → core.js (tick, changeDirection) → collision.js (checkSnakeCollision) → entities.js (createSnake) → generator.js (generateBossRoomTiles) → constants.js → world.js (getCellAt)

### Step 3: Trace the crash sequence

```
Boss room entry:
  tick: newHead = head + direction = INSIDE boss room
       → checkRoomTransition detects room change
       → newRoom.type === BOSS → gameState = 'bossIntro', RETURN EARLY
       → Snake array NOT modified (old head still in neighbor room)

Boss intro dismiss (changeDirection line 426-448):
  head placed at (roomX*20 + 10, roomY*20 + 1)  ← tiles[1][10], should be FLOOR
  direction set to {x:0, y:0} (zero movement)
  snake = [head_at_center, old_head_in_neighbor, old_body_in_neighbor]
  → Body segments straddle rooms!

Tick 1 (no movement — direction {0,0}):
  newHead = head_at_center (same position)
  checkSnakeCollision: FLOOR, no self-collision yet (segments at different coords)
  s.snake = [head_at_center, head_at_center, old_head_in_neighbor]
  ← Head duplicated in array!

Tick 2 (still {0,0}):
  newHead = head_at_center (same position)
  checkSnakeCollision: self-collision! snake[1] === snake[0]
  s.snake.pop() → length 2: [head_at_center, head_at_center]
  stuckCounter = 5, pendingReverse = false

Ticks 3-7 (stuck handler):
  tickCount++, stuckCounter--, early return (no updates)

Tick 8 (stuck expired):
  newHead = head_at_center → self-collision again
  s.snake.pop() → length 1: [head_at_center]
  s.gameState = 'gameover'  ← length <= 1
```

**Total: ~8 ticks → gameover** (well within the 30-tick test window)

### Step 4: Check secondary coordinate mismatch
- Boss room is 80×80 tiles (`BOSS_ROOM_SIZE = 80`), but world coordinates use `ROOM_SIZE = 20`
- Boss placed at world coords `(roomX * 80 + 40, roomY * 80 + 38)` — OUTSIDE the 20×20 room's world bounds
- Boss never collides with snake via normal collision checks (different coordinate spaces)

### Step 5: Fix approaches identified
1. **Direction fix**: After dismiss, set direction to `{0, 1}` (down into room) — prevents head duplication
2. **Fresh snake**: Reset to single head segment (body was left in neighbor room anyway)
3. **Clean segments**: Remove body segments outside boss room bounds
4. **Skip shift on zero-direction**: Special-case to not duplicate head when direction is zero

### Step 6: Include in delegate_task context
```
## Pre-Investigation Findings
The boss_stability regression is caused by a zero-direction self-collision death spiral...

## Crash Sequence (Pre-Analyzed)
### Root Cause: direction {0,0} after boss dismiss
File: public/src/engine/core.js, line 426-448 (changeDirection)
- Snake body straddles boss room + neighbor room after dismiss
- Direction {0,0} prevents head movement
- Self-collision on duplicate head position in ~8 ticks → gameover
    tick 1: snake shift duplicates head
    tick 2: self('self') pop tail → length 2
    ticks 3-7: stuck counter (5 ticks)
    tick 8: self-collision again → pop → length 1 → gameover

### Secondary Issue: Coordinate mismatch
File: public/src/engine/generator.js, line 435-498
- BOSS_ROOM_SIZE=80 vs ROOM_SIZE=20
- Boss at (roomX*80+40, roomY*80+38) outside world coords
```

## Pre-investigation Pattern Summary

| Aspect | #132 (Coordinate Mismatch) | #158 (Zero-Direction Death) |
|--------|---------------------------|-----------------------------|
| **Bug class** | Tile index arithmetic | State-machine edge case |
| **Entry point** | `getCellAt` returns wrong cell | Boss dismiss leaves direction=0 |
| **Death mechanism** | Stuck+reverse on invisible wall | Self-collision from duplicated head |
| **Coord system** | 80×80 tiles vs 20×20 indexing | 80×80 tiles vs 20×20 coordinates |
| **Trace duration** | tick-level path analysis | tick-by-tick execution trace |
| **Fix scope** | global getCellAt → 80-aware | single changeDirection method |

## Time Saved

Without pre-investigation, the research agent would need 10-15 additional tool calls to:
1. List all source files (1 call)
2. Read constants.js (1 call)
3. Read world.js (1 call)
4. Read collision.js (1 call)
5. Read core.js (1-2 calls)
6. Read generator.js (1-2 calls)
7. Trace tick loop mentally (expensive reasoning)
8. Read entities.js (1 call)
9. Verify each finding (uncertain — may re-read files)

With pre-investigation: all findings are in the context. Agent validates and writes PRD.
