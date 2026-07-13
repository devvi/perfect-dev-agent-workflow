# PRD: Boss Room Stability — E2E Play-Test Regression

> Parent Issue: #158
> Parent Issue URL: https://github.com/devvi/perfect-dev-agent-workflow/issues/158
> Agent: research-agent
> Date: 2026-07-14
> Status: Open
> Priority: High

---

## 1. Problem Definition

### Current Behavior

The `regression_boss_stability` scenario in the E2E play test (`tests/play-test.mjs:163-165`) consistently fails. The test:
1. Walks the snake through a real door into the boss room (state becomes `bossIntro`)
2. Dismisses the boss intro with Space (`changeDirection` is called)
3. Runs 30 ticks

After ~8 ticks, the snake is dead (state = `gameover`). The test expects `state.gameState === 'playing'` or `'won'` after 30 ticks.

**Crash trace:**
```
tick 1 (dismiss): snake = [head_at_center, seg1_neighbor, seg2_neighbor]
                   direction = {0,0}
tick 2:            newHead = head (same position, dir={0,0})
                   → snake = [head, head, seg1_neighbor]  ← head duplicated!
                   Self-collision: head === snake[1] → pop tail
                   → snake = [head, seg1_neighbor], stuckCounter = 5
ticks 3-7:         stuckCounter counts down (5→0). pendingReverse=false, nothing happens.
tick 8:            stuckCounter = 0, same {0,0} direction
                   → Self-collision again → pop tail
                   → snake = [head] → length ≤ 1 → gameover
```

**Total: ~8 ticks → gameover**, well within the 30-tick test window.

### Expected Behavior

After dismissing the boss intro, the snake should survive in the boss room for at least 30 ticks without gameover. The player should be able to play normally — move around, fight the boss, eat food, etc.

### User Scenarios

- **Scenario A (Normal Play):** Player enters boss room → sees intro → presses Space to dismiss → snake starts moving in boss room → player controls snake normally
- **Scenario B (Testing):** CI runs E2E play-test → boss_stability scenario passes → regression is caught before merge
- **Frequency:** Every boss room entry — 100% reproducible

---

## 2. Root Cause Analysis

### Primary Bug: Head Duplication from Zero Direction

In `public/src/engine/core.js`, `changeDirection()` lines 426–448:

```js
if (state.gameState === 'bossIntro') {
    // ...
    const head = { x: spawnX, y: spawnY };
    return {
        ...state,
        gameState: 'playing',
        snake: [head, ...state.snake.slice(1)],  // ← keeps old body segments!
        direction: { x: 0, y: 0 },                // ← zero-movement direction
        nextDirection: { x: 0, y: 0 },
    };
}
```

**Two interacting bugs:**

1. **Direction set to {0, 0}:** The intent was to wait for player input (Issue #142 fix). But with zero direction, the `tick()` function computes `newHead = head + {0,0} = head`, then:
   - No room transition (no movement)
   - The snake array becomes `[head, head, old_segments]` (head duplicated)
   - Self-collision fires on the next tick

2. **Old body segments carried from neighbor room:** `state.snake.slice(1)` preserves body segments that were in the neighbor room. These are at completely different world coordinates from the new head position. They are effectively garbage — the segment positions don't correspond to any valid path in the boss room.

### Secondary Issue: Boss Room Coordinate Space Mismatch

- Boss room tiles are **80×80** (`BOSS_ROOM_SIZE = 80`)
- World coordinate grid is **20×20** (`ROOM_SIZE = 20`)
- Boss is placed at world coords `(roomX * 80 + 40, roomY * 80 + 38)` — in 80×80 tile space
- Snake head is placed at `(roomX * 20 + 10, roomY * 20 + 1)` — in 20×20 space
- These are in different coordinate spaces; boss and snake never collide through normal tile collision checks
- `getCellAt()` uses `wx % ROOM_SIZE` (always 20) for cell lookup, so the 80×80 tile array is accessed with 0-19 indices
- This means the snake only ever sees the first 20 columns/rows of the boss room's 80×80 tiles

> **Note:** The `checkBossPlayerCollision()` function (ai.js:417-450) handles boss-vs-player collision via direct segment comparison, not tile-based collision. So boss-snake combat works despite the coordinate mismatch — the collision is checked at the entity level, not the tile level. The mismatch primarily affects rendering and wall collision behavior.

### Why Change Now?

This is a **pre-existing CI failure on master** — the E2E play-test `regression_boss_stability` scenario is a tracking issue for a known regression. Every PR runs through this test and fails, blocking CI until the fix is merged.

### Previous Constraints

- Issue #142 original intent: prevent snake from immediately re-entering the door wall on dismiss
- The {0,0} direction was chosen to "wait for player input" (passive safety)
- The boss room's 80×80 tile system vs 20×20 world grid is a pre-existing design constraint

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js:426-448` | `changeDirection()` | Boss intro dismiss code — direction and snake handling |
| `tests/play-test.mjs:112-171` | E2E Play Test | Already tests the scenario; may need assertion updates |
| `.github/workflows/play-test.yml` | CI Workflow | Will unblock CI when fix is merged |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/entities.js` | Entity factories | Fresh-snake approach would need a `createBossSnake()` variant |
| `public/src/engine/generator.js:435-498` | Boss room generation | Coordinate space mismatch documented for future reference |
| `public/src/engine/world.js:97-109` | `getCellAt()` | Falls back to ROOM_SIZE=20 for cell lookup on 80×80 tiles |

### Data Flow

```
Player enters boss room → tick() sets gameState='bossIntro', early return
  → changeDirection() called with Space
    → Head placed at (roomX*20+10, roomY*20+1) = tiles[1][10] (FLOOR)
    → [BUG] direction = {0,0} → head duplicates on next tick
    → [BUG] neighbor-room body segments carried over
      → Self-collision → pop tail → gameover after ~8 ticks
```

### Documents to Update

- [x] `docs/PRD/158-boss-stability-prd.md` (this file)
- [ ] `docs/TASKS/158-boss-stability-tasks.md` (task file, Plan phase)
- [ ] `docs/DESIGN/` (if design decisions need recording)

---

## 4. Solution Comparison

### Approach A: Direction Fix — Set Initial Direction to DOWN (Recommended)

**Description:** Change the boss dismiss code to set `direction: { x: 0, y: 1 }` (DOWN) instead of `{ x: 0, y: 0 }`. The snake head is already at `tiles[1][10]` (one cell below top border). With DOWN direction, the next tick moves the head to `tiles[2][10]` (also FLOOR), preventing head duplication. The body segments from the neighbor room are naturally merged — the tail pops each tick as normal, and within 2-3 ticks the snake body is entirely within the boss room.

**Code change (core.js:438-439):**
```js
// Before:
direction: { x: 0, y: 0 },
nextDirection: { x: 0, y: 0 },

// After:
direction: { x: 0, y: 1 },
nextDirection: { x: 0, y: 1 },
```

**Why DOWN?** The boss room has a BOSS_DOOR at `tiles[0][40]` (top wall center). The snake head is always placed at `y = roomY * 20 + 1` (just below the top border). The natural movement direction after entering from the top is DOWN. The player can immediately override direction with any keypress.

**Pros:**
- Minimal change — 2 lines modified
- No gameplay disruption — snake immediately starts moving naturally
- Preserves snake length (keeps existing body segments, which normalize within 2-3 ticks)
- Zero new edge cases — direction override on any keypress is unchanged
- Player can still press Space + direction key immediately after dismiss

**Cons:**
- Snake moves automatically for 1 tick before player input can take effect
- If player takes time to press a direction key, snake might reach a wall (but at ~3 cells from top border, there's ample room)

**Risk:** Low
**Effort:** Trivial (~5 min code, ~15 min test verification)

### Approach B: Direction Fix + Head-Only Snake

**Description:** Reset the snake to just the head on boss dismiss, dropping all old body segments from the neighbor room. Combined with direction set to DOWN.

```js
snake: [head],  // instead of [head, ...state.snake.slice(1)]
direction: { x: 0, y: 1 },
nextDirection: { x: 0, y: 1 },
```

**Pros:**
- Cleanest state — no garbage body segments from neighbor room
- No possibility of self-collision from orphan segments
- Matches the visual expectation (snake enters the room "fresh")

**Cons:**
- **Major gameplay change:** Player loses all snake length on boss entry
- Boss rooms become "reset zones" — could be a feature (intended design) or a bug
- Changes the contract of what boss room entry means
- Player might feel punished for reaching the boss

**Risk:** Medium — gameplay change needs design approval
**Effort:** Trivial (~5 min code, ~30 min test updates)

### Approach C: Avoid Self-Collision on Zero Direction (Defensive Fix)

**Description:** In the `tick()` function, special-case direction `{0, 0}` to either:
- Not move the snake at all (no head duplication, no tail pop)
- Or treat it as a "pause" where the snake stays frozen until a real direction is set

```js
if (s.direction.x === 0 && s.direction.y === 0) {
    s.tickCount++;
    return s;  // no movement, no collision
}
```

**Pros:**
- Defensive — prevents any future regressions from {0,0} direction
- Works regardless of the head position or body segment state
- Conceptually clean: no direction = no movement

**Cons:**
- Masks the real bug (wrong direction) instead of fixing it
- Creates a new code path for "idle" state that could have unintended side effects (food loop, boss AI updates)
- Boss AI continues while snake is frozen — boss could reach and kill an immobile snake
- The tick() function already has a stuckCounter mechanism; this duplicates that concept

**Risk:** Medium — defensive fix that masks root cause
**Effort:** Small (~10 min code, ~15 min test)

### Approach D: Clean Body Segments — Drop Out-of-Room Segments

**Description:** Before returning from `changeDirection()`, filter the snake body segments to only those within the boss room's world coordinate bounds. Since body segments are in the neighbor room (different `roomX/roomY`), they would all be dropped, leaving a head-only snake. Then set direction to a non-zero value.

```js
const head = { x: spawnX, y: spawnY };
const bossRoomBounds = {
    minX: state.currentRoom.x * ROOM_SIZE,
    maxX: state.currentRoom.x * ROOM_SIZE + ROOM_SIZE - 1,
    minY: state.currentRoom.y * ROOM_SIZE,
    maxY: state.currentRoom.y * ROOM_SIZE + ROOM_SIZE - 1,
};
const cleanSegments = state.snake.slice(1).filter(seg =>
    seg.x >= bossRoomBounds.minX && seg.x <= bossRoomBounds.maxX &&
    seg.y >= bossRoomBounds.minY && seg.y <= bossRoomBounds.maxY
);
return {
    ...state,
    gameState: 'playing',
    snake: [head, ...cleanSegments],
    direction: { x: 0, y: 1 },
    nextDirection: { x: 0, y: 1 },
};
```

**Pros:**
- Correctly handles the body segment problem
- If the snake enters the boss room with body trailing through the door, some segments might be inside
- More robust than Approach A if body segments cross room boundaries

**Cons:**
- Complex bounds check for what should be a simple fix
- In practice, all body segments are in the neighbor room (snake entered from 1 tick ago), so this is equivalent to Approach B
- The 80×80 vs 20×20 coordinate space makes bounding calculations confusing

**Risk:** Low-Medium
**Effort:** Small (~15 min code, ~15 min test)

### Recommendation

→ **Approach A** because:
1. **Minimal change:** 2 lines modified — direction from `{0,0}` to `{0,1}`
2. **Fixes the root cause:** Head duplication is prevented because the snake moves on the next tick
3. **Preserves game behavior:** Snake length is preserved (body segments normalize naturally in 2-3 ticks)
4. **No gameplay disruption:** Snake moves down into the room, player can immediately override with any direction key
5. **Matches entry direction:** Snake enters from the top wall, so DOWN is the natural movement direction
6. **Validated by prior art:** The `fix-boss-intro-proper` branch removed the `{0,0}` direction entirely (though it preserved the entry direction instead of setting DOWN). The approach is proven.

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Boss entry + dismiss | Walk into boss room → Space dismiss | gameState = 'playing', snake head at tiles[1][10] |
| 2 | Snake stays alive | 30 ticks after dismiss | gameState = 'playing' or 'won' (not 'gameover') |
| 3 | Snake moves down | First tick after dismiss | Head at tiles[2][10] (one cell down) |
| 4 | Player overrides direction | Press ArrowLeft after dismiss | Direction changes to LEFT (normal input handling) |

### Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Multiple rapid Space presses | Second press handled by normal direction logic (playing state) — direction changes to Space's default mapping; no dual-dismiss |
| 2 | Boss already defeated | Boss intro skipped (room type still BOSS but `bossDefeated` true) — ensure dismiss code still runs |
| 3 | Empty snake (shouldn't happen) | Existing length check in tick() catches this |
| 4 | Body segments normalize into walls | Body segments from neighbor room are at random positions; they trail the head naturally as the snake moves — tail pops each tick, body re-aligns within 2-3 ticks |
| 5 | Coordinate space mismatch after move | After moving, head is at row 2-3 of the 80×80 tile array; `getCellAt()` maps `wy % 20` so `tiles[2][10]` = FLOOR. Correct. |

### Failure Paths

| # | Failure | Handling |
|---|---------|----------|
| 1 | Snake head placed on non-FLOOR cell | Invalid spawn position — verify in tests that `tiles[1][10]` is FLOOR for all boss rooms |
| 2 | Boss room has no top door passage | Boss room always has `tiles[0][bossDoorPos] = CELL.BOSS_DOOR` — verified in generator.js |
| 3 | Player direction input on same tick as dismiss | `changeDirection()` returns the new state with direction overwritten; tick() reads `s.nextDirection` on next call — correct ordering |

### Out of Scope

| Item | Reason |
|------|--------|
| Boss room 80×80 coordinate space redesign | Separate issue; the boss-snake combat works via direct segment comparison |
| Fresh snake on boss entry (Approach B) | Requires design approval; could be a separate feature |
| Boss room food/mechanics redesign | Beyond the stability fix scope |
| Other E2E play-test scenarios | Each scenario has its own tracking or will be addressed separately |

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/core.js` — `changeDirection()` | Stable | Low |
| `tests/play-test.mjs` — test framework | Stable | Low |
| Puppeteer / Playwright test runner | Stable | Low |

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Direction {0,1} sends snake into a wall | Low | Head at tiles[1][10]; wall at tiles[0] or tiles[19][]; 17 cells of vertical FLOOR before bottom wall |
| Body segments cause unexpected collision during normalization | Low | Old segments trail behind head; last one pops each tick; within 2 ticks only valid body segments remain |
| Boss AI collision during first 3 ticks | Low | CheckBossPlayerCollision uses direct segment comparison; body segments are at different positions in neighbor room space |

### Blocks

| Future Work | Priority |
|-------------|----------|
| CI pipeline unblocked | High |
| Further boss room enhancements | Post-fix |

### Preparation Needed

- [ ] Verify the fix with `npm run test` and `npm run test:e2e`
- [ ] Validate that all existing unit tests pass (the wall-collision single-segment test etc.)

---

## 7. SPIKE — Coordinate Space Verification

### Question to Answer

What exact tiles does the snake head traverse on ticks 1-3 after dismiss with direction {0,1}?

### Method

Trace the coordinate mapping for a boss room at `(roomX=0, roomY=0)`:
- Dismiss position: `(10, 1)` in world coordinates
- `getCellAt(world, 10, 1)` → `cx = 10 % 20 = 10`, `cy = 1 % 20 = 1` → `tiles[1][10]` = FLOOR ✓
- Tick 1: `(10, 2)` → `tiles[2][10]` = FLOOR ✓
- Tick 2: `(10, 3)` → `tiles[3][10]` = FLOOR ✓

For a boss room at `(roomX=1, roomY=2)`:
- Dismiss position: `(1*20+10, 2*20+1) = (30, 41)`
- `getCellAt(world, 30, 41)` → `cx = 30%20=10`, `cy = 41%20=1` → room at (1,2) → `tiles[1][10]` = FLOOR ✓

The modulo math with ROOM_SIZE ensures `tiles[1][10]` is always FLOOR for any room coordinate, because the boss room's 80×80 tile array has FLOOR at `tiles[1][8..12]` (standard door passage position on top wall).

### Result

The fix is geometrically correct for all boss room positions. The snake head is always on a FLOOR cell immediately after dismiss.

### Impact on Approach

No impact — approach A is confirmed correct.
