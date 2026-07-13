# Design: #158 — Boss Room Stability — E2E Play-Test Regression Fix

> Parent Issue: #158
> Agent: plan-agent
> Date: 2026-07-14

---

## 1. Architecture Overview

### Core Idea

Fix the boss intro dismiss in `changeDirection()` by setting the initial direction to `{ x: 0, y: 1 }` (DOWN) instead of `{ x: 0, y: 0 }`. The zero direction causes head duplication → self-collision → gameover within ~8 ticks.

### Recommended Approach (PRD Section 4 — Approach A)

Change 2 lines in `public/src/engine/core.js` lines 438–439:

```js
// Before:
direction: { x: 0, y: 0 },
nextDirection: { x: 0, y: 0 },

// After:
direction: { x: 0, y: 1 },
nextDirection: { x: 0, y: 1 },
```

### Data Flow

```
Player enters boss room → tick() sets gameState='bossIntro', early return (core.js:108-111)
  → changeDirection() called with Space/Enter/ArrowKey (gameboy.html)
    → Detects state.gameState === 'bossIntro' (core.js:426)
    → Confirms room.type === ROOM_TYPE.BOSS (core.js:428)
    → Calculates spawnX = currentRoom.x * ROOM_SIZE + floor(ROOM_SIZE / 2)
    → Calculates spawnY = currentRoom.y * ROOM_SIZE + 1
    → Creates new head at (spawnX, spawnY) = tiles[1][10] → CELL.FLOOR
    → [FIX] Sets direction to { x: 0, y: 1 } instead of { x: 0, y: 0 }
    → Returns new state with gameState = 'playing'

Next tick (tick() at core.js):
  → newHead = head + {0, 1} = tiles[2][10] (one cell down, still FLOOR)
  → No head duplication → no self-collision
  → Body segments from neighbor room trail behind naturally, tail pops each tick
  → Within 2-3 ticks, body is normalized within the boss room
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fix location | `core.js:changeDirection()` | The direction value is set here — the root cause |
| Approach | Direction to DOWN (Approach A) | Minimal change (2 lines), proven by PRD analysis |
| Snake body segments | Preserved (no reset) | Dropping segments (Approach B) is a gameplay change needing design approval |
| Defensive zero-direction guard | Not implemented (Approach C) | Masks root cause; would need new code path in tick() |
| Bounds filtering of segments | Not implemented (Approach D) | Equivalent to Approach B in practice; more complex |

---

## 2. Engine Layer

### Primary Change: `core.js:438-439`

**File:** `public/src/engine/core.js`
**Function:** `changeDirection()` — bossIntro dismiss branch (lines 426–448)

```js
// Current (buggy):
direction: { x: 0, y: 0 },
nextDirection: { x: 0, y: 0 },

// Fixed:
direction: { x: 0, y: 1 },
nextDirection: { x: 0, y: 1 },
```

**Why DOWN works:**
- Snake head is placed at `tiles[1][10]` (just below top border)
- Boss door is at `tiles[0][40]` (top wall center, 80×80 tile space)
- Modulo math: `getCellAt()` uses `wx % ROOM_SIZE` → `tiles[1][10]` for any room coordinate
- `tiles[1][10]` is always CELL.FLOOR in all boss rooms (verified by generator.js)
- First move: `tiles[2][10]` → CELL.FLOOR ✓
- Second move: `tiles[3][10]` → CELL.FLOOR ✓
- 17 cells of vertical FLOOR before bottom wall — ample room

### No Other Engine Changes Needed

- `tick()` (core.js line 108–111) correctly passes through `bossIntro` — no change needed
- `getCellAt()` in `world.js` — reference only, no change needed
- `generator.js:435-498` — boss room generation is correct, no change needed

---

## 3. Entity Layer

### No Entity Changes Needed

No new entity factories or variants required. The existing `createBossSnake` entity (if any) is not involved in the bug; the snake is created during normal gameplay and persists across room transitions.

---

## 4. Data Layer

### No Data Changes Needed

All necessary constants (`ROOM_SIZE`, `CELL.FLOOR`, `ROOM_TYPE.BOSS`) already exist. No new constants, config values, or save data changes.

---

## 5. Render Layer

### No Render Changes Needed

The render path is unaffected. `changeDirection()` returns a new state, and `render(ctx, state)` correctly renders the boss room with the snake at the new position. The boss intro overlay is dismissed because `gameState` transitions from `'bossIntro'` to `'playing'`.

---

## 6. Input/UI Layer

### No Input Changes Needed

Unlike Issue #142 (where the input handler itself was buggy), the keyboard handler and `simulateKey()` in `gameboy.html` already call `changeDirection()` correctly. The bug is purely in the direction value returned by `changeDirection()`.

Key input handling remains:
- Space/Enter → `changeDirection(state, { x: 0, y: 1 })` — unchanged behavior post-fix
- Arrow keys → `changeDirection(state, direction)` — unchanged
- Player can override direction on any subsequent keypress — unchanged

---

## 7. Implementation Phases

### Phase 1: Fix Direction in changeDirection()

| Aspect | Detail |
|--------|--------|
| Files | `public/src/engine/core.js` |
| Change | Lines 438–439: `{ x: 0, y: 0 }` → `{ x: 0, y: 1 }` for both `direction` and `nextDirection` |
| Risk | Low — minimal change, geometrically verified |
| Est. lines | 2 line changes |

### Phase 2: Add Unit Tests

| Aspect | Detail |
|--------|--------|
| Files | `tests/metroidvania-snake.test.js` |
| Change | Add 8–10 test cases covering the fix, edge cases, and regression |
| Risk | Low — tests document expected behavior |
| Est. lines | ~100 lines |

### Verification After Each Phase

Both phases are independent but should be committed together. Verification:
1. `npm run test` — all unit tests pass (vitest, no --watch)
2. The E2E play-test `regression_boss_stability` scenario should now pass
3. Manual: the existing E2E test can be run with `node tests/play-test.mjs`

---

## 8. Test Layer

### Test Strategy: Bug-Documenting + Post-Fix Assertions (Strategy A)

Since the fix modifies the direction value returned by `changeDirection()`, we use bug-documenting tests that capture the current broken behavior and post-fix expected behavior.

### New Test Cases (to be added in `tests/metroidvania-snake.test.js`)

#### Bug-Documenting Tests (assert current broken behavior — will break after fix)

| # | Test | What It Verifies |
|---|------|-----------------|
| T1 | `bossIntro dismiss sets direction to {0,0} (BUG)` | Using a `bossIntro` state and calling `changeDirection()`, the returned state has `direction.x === 0` and `direction.y === 0`. Documents the bug. |

#### Post-Fix Tests (assert correct behavior after the 2-line fix)

| # | Test | What It Verifies |
|---|------|-----------------|
| T2 | `bossIntro dismiss sets direction to DOWN` | `changeDirection()` returns direction `{ x: 0, y: 1 }` for a BOSS room in bossIntro state. |
| T3 | `Snake head placed at tiles[1][10] on dismiss` | Head position is `(roomX*20+10, roomY*20+1)` after dismiss. |
| T4 | `Snake survives 30 ticks after dismiss` | Using `tick()` 30 times, game state is still `'playing'` (or `'won'`), not `'gameover'`. |
| T5 | `Snake moves DOWN on first tick after dismiss` | After 1 tick, head is at `tiles[2][10]` — one cell below the dismiss position. |
| T6 | `Player can override direction after dismiss` | After dismiss, a `changeDirection()` call with `{ x: -1, y: 0 }` (LEFT) correctly sets direction. |

#### Regression Tests (assert behavior that must not change)

| # | Test | What It Verifies |
|---|------|-----------------|
| T7 | `Non-BOSS room with bossIntro still transitions safely` | If `gameState='bossIntro'` exists in a non-BOSS room, `changeDirection()` returns `gameState='playing'` without crash. |
| T8 | `Rapid Space presses only dismiss once` | First Space transitions to 'playing'; second press is no-op. |
| T9 | `Arrow keys continue to work normally during play` | Arrow key directional input unchanged during 'playing' state. |

### Edge Cases to Cover

1. **Boss already defeated** — If `bossDefeated` is true but the room type is still BOSS, `changeDirection()` still enters the BOSS branch correctly; head is repositioned, direction is DOWN. No crash.
2. **simulateKey called with null/undefined state** — Test API early-returns; no crash.
3. **No world object in state** — `changeDirection()` gracefully falls through to the non-BOSS room path.
4. **Direction override on the same tick as dismiss** — `changeDirection()` is called before `tick()`, so the direction override is processed correctly.

### Test Data Fixtures

Tests need a game state with:
- `gameState: 'bossIntro'`
- `currentRoom` set to a BOSS room's coordinates
- A BOSS room in the world at those coordinates (generated by `generateWorldMap()`)
- Optionally: a 3-segment snake (normal length after room transition)

Recommended: reuse or extend the `minimalState()` helper pattern from existing tests.

---

## 9. Files Changed (Per-Layer Summary)

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Engine | `public/src/engine/core.js` | Lines 438–439: direction `{0,0}` → `{0,1}` | ±2 |
| Test | `tests/metroidvania-snake.test.js` | New describe block: bug-documenting + post-fix + regression tests | ~100 |

### No changes to:

- `public/gameboy.html` — input handling already correct
- `public/src/engine/constants.js` — no new constants
- `public/src/engine/world.js` — no changes needed
- `public/src/engine/generator.js` — boss room generation correct
- `public/src/engine/entities.js` — no entity changes needed
- `tests/play-test.mjs` — E2E test already correct; will pass after fix

---

## 10. Verification Checklist

- [ ] Bug-documenting test (T1) confirms direction is `{0,0}` on current `master`
- [ ] Post-fix tests (T2–T6) verify direction is `{0,1}`, head position, 30-tick survival, movement, and overrides
- [ ] Regression tests (T7–T9) verify no regressions in edge cases
- [ ] All tests pass: `npm run test` (vitest run, no --watch)
- [ ] No files outside `docs/DESIGN/`, `docs/TASKS/`, `tests/`, and `public/src/engine/core.js` modified
- [ ] PR body is exactly `Parent #158` (no colon, no extra text)
- [ ] PR label is `workflow/plan`
- [ ] Branch naming convention: `plan/158-boss-stability`
