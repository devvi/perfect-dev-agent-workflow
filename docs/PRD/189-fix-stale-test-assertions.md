# Research: Fix 6 Stale Test Assertion Failures on Master (#46, #70)

> Parent Issue: #189
> Agent: research-agent
> Date: 2026-07-14
> Status: Open
> Priority: High

---

## 1. Problem Definition

### Current Behavior

**`npx vitest run` → 332 passed, 6 failed, 15 todo**

Master has **6 stale test assertion failures** originating from closed Issues #46 and #70. These tests were written by the plan agent based on the original PRD designs, but never updated to match the final implementation. The implementation team made design decisions that diverged from the test expectations, and the tests were never reconciled.

**Target:** `npx vitest run` → 337 passed, 0 failed, 15 todo

### Failing Tests Summary

| # | Test Name | Original Issue | Error |
|---|-----------|---------------|-------|
| 1 | `wall collision triggers stuck+reverse — length preserved, stuckCounter set` | #46 | `expected snake.length(2) to be 3` |
| 2 | `snake length 1 hitting wall → stuck not gameover` | #46 | `expected 'playing' to be 'gameover'` |
| 3 | `Test 1: Basic stuck+reverse — should set stuckCounter...` | #46 | `expected snake.length(2) to be 3` |
| 4 | `Test 7: Edge case length=1 — direction flips` | #46 | `expected direction {x:1} to be {x:-1}` |
| 5 | `C2: Food + enemy at same WALL cell...` | #70 | `expected snake.length(3) to be 4` |
| 6 | `C4: Snake length 1 hits wall with food...` | #70 | `expected 'gameover' to be 'playing'` |

### Root Cause

The tests were authored during the Plan phase of Issues #46 and #70, assuming the **stuck+reverse** behavior would preserve snake length and that single-segment snakes would enter stuck state instead of gameover. However, the actual implementation in Issue **#150** (Wall Damage Single Segment) and **#154** (Wall Damage Health Loss) introduced two key changes after the tests were written:

1. **Tail segment removal on wall damage:** When hitting a WALL/STONE_WALL, the snake loses its last segment (`s.snake = s.snake.slice(0, -1)`) — see `core.js` line 286. This was a design change from Issue #150/#154 to add a health-loss penalty.

2. **Single-segment snake → immediate gameover on wall collision:** When `s.snake.length <= 1` hits a wall, the game immediately ends (`s.gameState = 'gameover'`) — see `core.js` line 246-248. This came from Issue #150's design that a single cell hitting a wall is lethal.

The Issue #70 tests inherit the same mismatches because they build on the same `tick()` damage handler in `core.js`.

---

## 2. Root Cause Analysis

### Why Do Stale Tests Exist?

Each Issue (#46, #70) followed the workflow: Plan agent writes PRD → Plan agent writes tests → Implement agent writes code. But the tests were written early (Plan phase) against the PRD's expected behavior, not the final implementation. After implementation, the tests were never re-executed and updated. Since the CI pipeline wasn't enforcing test pass on PR merge (the tests were on master's merged PRs, not blocking), these stale assertions persisted.

### Why Do Tests Differ From Implementation?

**Issue #46 (Stuck+Reverse) — Original PRD Design vs Final Implementation:**

| Aspect | PRD Design (what tests expect) | Final Implementation (core.js) |
|--------|-------------------------------|-------------------------------|
| Length on wall damage | Preserved (`snake.length` unchanged) | Popped tail segment (`slice(0,-1)`) — Issue #150/#154 |
| Single-segment wall hit | Stuck+reverse, direction flips | `gameState = 'gameover'` — Issue #150 |
| Score penalty | `-5` on hit | `-5` on hit (matches) |
| StuckCounter | `STUCK_TICKS` (5) | Same: `STUCK_TICKS` (5) |
| Screen shake | Set | Set (intensity: 4, duration: 8) |

**Issue #70 (Food on Wall) — Same divergence:**

| Aspect | What tests expect | What implementation does |
|--------|------------------|------------------------|
| Length on food+wall hit | Preserved (no tail pop) | Tail popped (`slice(0,-1)`) |
| Single-segment food+wall | stuckCounter > 0, playing | `gameState = 'gameover'` |

### Key Design Decisions in Implementation

The implementation made these deliberate choices:

1. **Health loss as penalty:** Instead of just stuck+reverse with no segment loss, the implementation removes the last segment (`slice(0, -1)`) to make wall collision a meaningful "health" penalty. This is more aligned with the metroidvania genre where bumping into hazards costs HP.

2. **Single-segment = death:** A snake with only 1 segment left is critically wounded; hitting a wall kills it outright. This prevents a degenerate infinite loop where a 1-segment snake could keep bouncing off walls.

3. **Bounce food drop:** On wall collision, the implementation drops a "bounce food" item at the removed tail's position — this was not in the original #46 PRD at all.

---

## 3. Impact Analysis

### Directly Affected Files

| File | Nature of Change |
|------|-----------------|
| `tests/metroidvania-snake.test.js` | **6 test assertions** need expectation updates to match implementation; 2 test scenarios need logic revision for length=1 wall collision |
| `docs/PRD/189-fix-stale-test-assertions.md` | This document — research findings |

### Tests That Need Updates

#### From Issue #22 section (Phase 1c — Wall/Self/Food Collision)

**Test 1: `wall collision triggers stuck+reverse — length preserved, stuckCounter set (Issue #46)`** (line 1265)

Issue: Expects `result.snake.length === state.snake.length` (3 === 3), but implementation pops tail → length = 2.

Fix: Change `expect(result.snake.length).toBe(state.snake.length)` to `expect(result.snake.length).toBe(state.snake.length - 1)` (= 2). Or better: `expect(result.snake.length).toBe(2)`.

**Test 2: `snake length 1 hitting wall → stuck not gameover (Issue #46)`** (line 1288)

Issue: Expects `result.gameState === 'playing'` but implementation sets `'gameover'` for length ≤ 1 hitting wall.

Fix: Change expected `gameState` from `'playing'` to `'gameover'`. Remove `stuckCounter` assertion (never set). This test becomes a regression check that single-segment wall hit → gameover.

#### From Phase 4 — Stuck+Reverse (Issue #46)

**Test 3: `Test 1: Basic stuck+reverse — snake hits WALL`** (line 1444)

Issue: Same as Test 1 — expects `result.snake.length === state.snake.length` (3 === 3), but tail popped → length = 2.

Fix: Update expectation: `expect(result.snake.length).toBe(2)`.

The head-position assertion `expect(result.snake[0]).toEqual(state.snake[0])` should remain valid since the head doesn't move into the wall.

**Test 4: `Test 7: Edge case — snake length = 1`** (line 1602)

Issue: Expects direction to flip after stuck for length-1 snake. But implementation immediately gameovers length-1 snakes hitting walls. The tick loop never reaches the reverse phase, direction stays `{ x: 1, y: 0 }`.

Fix: This test scenario is fundamentally incompatible with the current implementation. Two options:
- **Option A (preferred):** Change test to verify gameover behavior on length-1 wall hit: expect `gameState === 'gameover'` after first tick, remove direction-flip assertion.
- **Option B:** Keep the stuck+reverse behavior for length-1 by modifying `core.js` — but this contradicts Issue #150's design intent and would require re-opening #150.

→ **Recommend Option A** — the test should match the implementation.

#### From Issue #70 — Food collision on wall cells

**Test 5: `C2: Food + enemy at same WALL cell — food removed, damage handler returns early`** (line 1970)

Issue: Expects `result.snake.length === state.snake.length` (4 === 4), but implementation pops tail → length = 3.

Fix: Change to `expect(result.snake.length).toBe(3)` or `expect(result.snake.length).toBe(state.snake.length - 1)`.

The test should still verify: food removed, stuckCounter > 0, gameState is 'playing'.

**Test 6: `C4: Snake length 1 hits wall with food — stuckCounter set, food removed, playing`** (line 2025)

Issue: Expects `result.gameState === 'playing'` + `stuckCounter > 0`. But implementation kills length-1 snakes hitting walls.

Fix: Change expected `gameState` to `'gameover'`. Remove `stuckCounter` assertion. Optionally verify food was removed before gameover. But verify: does the implementation remove food before checking length ≤ 1? Let's check.

Looking at `core.js` lines 244-296:
```
// Wall/Stone_Wall damage — stuck+reverse instead of tail removal
if (collisions.includes('damage')) {
    // Single-segment snake hitting wall → game over (Issue #150)
    if (s.snake.length <= 1) {
      s.gameState = 'gameover';
      return s;  // <-- returns HERE, before food handling
    }
    // ... food handling ...
```

So: length ≤ 1 hits damage wall → gameover immediately, **before** food chunk is processed. The food on that cell is NOT removed by the wall damage handler. However, if the snake was already on the food cell... wait, let me re-check. The `collisions` were already computed by `checkSnakeCollision(newHead, ...)` which included food detection. But the food removal + score award code happens AFTER the `if (s.snake.length <= 1)` check. So food is NOT removed, and no score is awarded.

Actually, let me look more carefully. The `checkSnakeCollision` function at line 34 returns `['damage', 'food']` for a wall+food cell. The tick() at line 221 calls `checkSnakeCollision(newHead, ...)`, which detects both damage and food. But the damage handler at line 244 returns immediately at line 248 for length≤1, before reaching the food processing code at line 253.

So for C4 with length=1: food on wall, snake hits it → collisions = `['damage', 'food']` → enters damage handler (line 244) → sees length ≤ 1 → gameover + return. Food never gets removed.

So the C4 test fix should:
- Change expected `gameState` to `'gameover'`
- Remove `stuckCounter` assertion
- The food-removed check will fail — the food is NOT removed when length≤1 hits wall
- The test purpose changes from "food removed + stuck" to "gameover on length-1 wall+food"

Actually, this introduces an edge case discussion: should we change the implementation to remove food before checking length ≤ 1? Or just update the test to reflect current behavior? Since this is a test-fix task, not a feature task, we should match the tests to the implementation (not the other way around), unless there's a clear bug. The current behavior could be argued as a bug (food should be eaten before checking death), but fixing the behavior would require changing source code, which is out of scope for this test-fix issue.

Wait, let me re-read the issue description more carefully: "fixing 6 stale test assertion failures on master". The deliverables are updates to the test expectations to match the implementation. So yes, the tests should be updated to match what the code actually does.

### Test Update Summary Table

| # | Test | Assertion to Fix | New Expected Value |
|---|------|-----------------|-------------------|
| 1 | wall collision stuck+reverse length preserved (line 1283) | `result.snake.length` | `2` (length-1) |
| 2 | snake length 1 hitting wall → stuck (line 1304) | `result.gameState` | `'gameover'` |
| 3 | Test 1: Basic stuck+reverse length preserved (line 1459) | `result.snake.length` | `2` (length-1) |
| 4 | Test 7: length=1 direction flip (line 1625) | `s.direction` | `{ x: 1, y: 0 }` (no flip — gameover) |
| 5 | C2: Food+enemy same WALL length preserved (line 1996) | `result.snake.length` | `3` (length-1) |
| 6 | C4: length=1 food on wall stuckCounter (line 2038) | `result.gameState` | `'gameover'` |

---

## 4. Solution Approach

### Approach A: Update Test Assertions (Recommended)

Update the 6 test assertions to match the current implementation behavior in `core.js`. This is the minimal change: update expected values in tests without touching production code.

**Changes:**

1. **Test 1 (line 1283):** `expect(result.snake.length).toBe(2)` instead of `toBe(state.snake.length)`
2. **Test 2 (line 1304):** `expect(result.gameState).toBe('gameover')` instead of `'playing'`; remove stuckCounter assertion
3. **Test 3 (line 1459):** `expect(result.snake.length).toBe(2)` instead of `toBe(state.snake.length)`
4. **Test 4 (line 1625):** Change entire test — verify gameover on length-1 wall hit instead of direction flip. Or remove the direction assertion since gameover state means direction is irrelevant.
5. **Test 5 (line 1996):** `expect(result.snake.length).toBe(3)` instead of `toBe(state.snake.length)`
6. **Test 6 (line 2038):** `expect(result.gameState).toBe('gameover')` instead of `'playing'`; remove stuckCounter; food-not-removed is expected behavior for length-1

**Pros:**
- Minimal change (6 line modifications across ~5 test blocks)
- Zero risk to production code
- Verified by running `npx vitest run` after changes
- Preserves all 15 todo tests

**Cons:**
- Test 4 and Test 6 become simpler — they no longer test reverse behavior for length-1
- Test 6's food-removal check becomes irrelevant (food not removed for length-1)

**Risk:** Very Low
**Effort:** Small (< 30 minutes)

### Approach B: Update Tests + Production Code to Match PRD Design

Modify `core.js` to restore the original PRD behavior (no tail pop, stuck+reverse for length-1) and adjust tests accordingly.

**Pros:**
- Aligns with original #46 PRD intent
- Tests become "what they were designed to test"

**Cons:**
- Contradicts Issue #150 (Wall Damage Single Segment) and #154 (Wall Damage Health Loss) which deliberately added these mechanics
- High risk of gameplay regressions
- Requires re-opening closed issues and additional QA
- NOT a test-fix — it's a feature change

**Risk:** Medium-High
**Effort:** Medium (2-4 hours)

### Recommendation

→ **Approach A. Update Test Assertions Only.**

The implementation in `core.js` is the result of multiple merged PRs (#46 → #150 → #154). The tail-pop and length-1 gameover behaviors are deliberate design choices from subsequent issues. The tests were written before those issues were implemented and never reconciled. Updating the tests to match the current, merged, and QA'd implementation is the correct fix.

---

## 5. Detailed Change Plan

### Test 1: `wall collision triggers stuck+reverse — length preserved, stuckCounter set`
**File:** `tests/metroidvania-snake.test.js`, line 1283

```diff
-      expect(result.snake.length).toBe(state.snake.length);
+      expect(result.snake.length).toBe(2);
```

### Test 2: `snake length 1 hitting wall → stuck not gameover`
**File:** `tests/metroidvania-snake.test.js`, line 1304

```diff
-      expect(result.gameState).toBe('playing');
+      expect(result.gameState).toBe('gameover');
```

Remove the stuckCounter assertion (line 1306) since it's never set for length ≤ 1:

```diff
-      expect(result.snake.length).toBe(1);
-      expect(result.stuckCounter).toBeGreaterThan(0);
+      expect(result.snake.length).toBe(1);
```

### Test 3: `Test 1: Basic stuck+reverse — snake hits WALL`
**File:** `tests/metroidvania-snake.test.js`, line 1459

```diff
-      expect(result.snake.length).toBe(state.snake.length);
+      expect(result.snake.length).toBe(2);
```

### Test 4: `Test 7: Edge case — snake length = 1`
**File:** `tests/metroidvania-snake.test.js`, line 1602

This test creates a length-1 snake heading RIGHT toward a WALL. The implementation immediately gameovers. The test's for-loop at lines 1618-1620 calls `tick()` which returns the state unchanged (gameover → early return). So the direction assertion at line 1625 should verify the gameover state instead:

```diff
-      // Single segment: snake.reverse() on 1 element = same array
-      expect(s.snake).toHaveLength(1);
-      expect(s.snake[0]).toEqual({ x: 5, y: 5 });
-      // Direction flipped 180°
-      expect(s.direction).toEqual({ x: -1, y: 0 });
+      // Single segment: wall hit → immediate gameover (Issue #150)
+      expect(s.gameState).toBe('gameover');
+      expect(s.snake).toHaveLength(1);
+      expect(s.snake[0]).toEqual({ x: 5, y: 5 });
```

The test description should also be updated (optional).

### Test 5: `C2: Food + enemy at same WALL cell`
**File:** `tests/metroidvania-snake.test.js`, line 1996

```diff
-      expect(result.snake.length).toBe(state.snake.length);
+      expect(result.snake.length).toBe(3);
```

### Test 6: `C4: Snake length 1 hits wall with food`
**File:** `tests/metroidvania-snake.test.js`, line 2038

Implementation returns gameover for length-1 wall hits before processing food. Update:

```diff
-      expect(result.gameState).toBe('playing');
-      expect(result.stuckCounter).toBeGreaterThan(0);
-      const roomAfter = getRoomAt(world, 0, 0);
-      expect(roomAfter.entities.food.find(f => f.x === 9 && f.y === 10)).toBeUndefined();
+      // Length 1 hitting wall → gameover (Issue #150); food not processed
+      expect(result.gameState).toBe('gameover');
```

### Verification

After changes:
```bash
cd /home/pi/workspace/.pda/perfect-dev-agent-workflow
npx vitest run
# Expected: 337 passed, 0 failed, 15 todo
```

---

## 6. Boundary Conditions & Acceptance Criteria

### Normal Path

- [ ] Test 1: `expect(result.snake.length).toBe(2)` — reflects tail-pop behavior
- [ ] Test 2: `expect(result.gameState).toBe('gameover')` — length-1 wall hit is lethal
- [ ] Test 3: `expect(result.snake.length).toBe(2)` — reflects tail-pop behavior
- [ ] Test 4: `expect(s.gameState).toBe('gameover')` — length-1 wall hit is lethal
- [ ] Test 5: `expect(result.snake.length).toBe(3)` — reflects tail-pop for 4-segment snake
- [ ] Test 6: `expect(result.gameState).toBe('gameover')` — length-1 wall+food hit is lethal
- [ ] `npx vitest run` passes: 337 passed, 0 failed, 15 todo
- [ ] All other non-stale tests remain green (no regression)

### Edge Cases Considered

| Case | Status | Reasoning |
|------|--------|-----------|
| Other length-matching assertions in Phase 4 tests | Still valid | Tests 2 (stuck duration), 3 (direction flip), 4 (post-reverse safety), 5 (input buffering), 6 (score penalty) all use longer snakes (length≥3) and do NOT check total length — they check direction, position, or score. These should pass. |
| Food entity state after length-1 wall hit | Implementation-dependent | Current code returns before food removal, so food persists. Test must not assert food removal. |
| Test name accuracy | Cosmetic | Test descriptions like "length preserved" become inaccurate. Consider updating `it()` descriptions but not strictly required for pass. |

### Out of Scope

| Item | Reason |
|------|--------|
| Modify `core.js` behavior | This is a test-fix task, not a feature task |
| Add new test cases | Issue #189 scope is fixing existing stale assertions |
| Change `checkSnakeCollision()` | Collision detection is correct — it's `tick()` that differs from test expectations |
| Update DESIGN docs | Tests are the deliverable; design docs already closed with their PRs |

---

## 7. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| Issue #46 closed PR (stuck+reverse mechanic) | Merged to master | None |
| Issue #70 closed PR (food collision fix) | Merged to master | None |
| Issue #150 closed PR (wall damage single segment) | Merged to master | **Key conflict driver** — this changed tail-pop behavior |
| Issue #154 closed PR (wall damage health loss) | Merged to master | **Key conflict driver** — reaffirmed length-1 gameover |
| `core.js` tick() implementation | Current on master | Stable reference for expectations |
| `collision.js` checkSnakeCollision() | Current on master | Used to verify return values |

### Preparation Needed

- [ ] Verify current test baseline: `npx vitest run` before changes
- [ ] Apply 6 assertion updates
- [ ] Run `npx vitest run` to confirm 337/0/15
- [ ] Create branch `research/189-fix-stale-test-assertions` from master
- [ ] Commit PRD + test changes (or PRD only if Plan phase handles test changes)
- [ ] Open PR with body `Parent #189`
