# DESIGN: Fix 6 Stale Test Assertion Failures on Master (#46, #70)

> Parent Issue: #189
> Agent: plan-agent
> Date: 2026-07-14

---

## 1. Summary

Six test assertions from closed Issues #46 (stuck+reverse) and #70 (food on wall) are failing on master because they were written during the Plan phase, against the original PRD design, and never updated after the final implementation in Issues #150 (Wall Damage Single Segment) and #154 (Wall Damage Health Loss) was merged. The implementation introduced two key behaviors that diverge from the original test expectations: (1) tail segment removal on wall collision (`snake.slice(0, -1)`), and (2) immediate gameover when a length-1 snake hits a wall. This is a **test-only fix** — update the 6 stale assertions to match the current implementation. No production code changes needed.

## 2. Root Cause Analysis

### 2.1 Design Divergence After Test Authoring

Tests for #46 and #70 were authored during the Plan phase assuming:

- Wall collision preserves snake length (no tail removal)
- Length-1 snakes enter stuck+reverse state instead of gameover

The implementation in Issues #150 and #154 (merged after the tests) changed two things:

| Aspect | PRD Design (what tests expect) | Final Implementation (`core.js`) |
|--------|-------------------------------|----------------------------------|
| Length on wall damage | Preserved (unchanged) | **Tail popped** (`s.snake = s.snake.slice(0, -1)`) — Issue #150 |
| Single-segment wall hit | Stuck+reverse, direction flips | **Immediate gameover** (`s.gameState = 'gameover'`) — Issue #150 |
| Score penalty | `-5` on hit | `-5` on hit (matches) |
| StuckCounter | `STUCK_TICKS` (5) | Same: `STUCK_TICKS` (5) |

### 2.2 Mechanism in Context

In `core.js` lines 244–296:

```js
// Wall/Stone_Wall damage
if (collisions.includes('damage')) {
  // Single-segment snake hitting wall → game over (Issue #150)
  if (s.snake.length <= 1) {
    s.gameState = 'gameover';
    return s;  // Returns before food handling
  }
  // Tail pop (not length preservation)
  s.snake = s.snake.slice(0, -1);
  // ... stuck counter, score penalty ...
```

### 2.3 Test 4 and Test 6 — Fundamental Purpose Change

Tests 4 (length-1 direction flip) and 6 (length-1 food+wall) both expected stuck+reverse behavior for single-segment snakes. The implementation immediately gameovers any length-1 snake hitting a wall. These tests must be re-purposed from "verify reverse" to "verify gameover on length-1 wall collision."

For Test 6 (C4), the length-1 wall+food collision also means food is NOT removed — the damage handler returns before the food processing code at line 253. The test must remove its food-removal assertion.

## 3. Fix Inventory

| # | Test Name | File:Line (HEAD) | Fix Description | Lines Changed |
|---|---|---|---|---|
| 1 | wall collision triggers stuck+reverse — length preserved, stuckCounter set | `tests/metroidvania-snake.test.js:1283` | `expect(result.snake.length).toBe(state.snake.length)` → `expect(result.snake.length).toBe(2)` | 1 |
| 2 | snake length 1 hitting wall → stuck not gameover | `tests/metroidvania-snake.test.js:1304,1306` | `expect(result.gameState).toBe('playing')` → `toBe('gameover')`; remove `expect(result.stuckCounter).toBeGreaterThan(0)` | 2 (1 change, 1 delete) |
| 3 | Test 1: Basic stuck+reverse — snake hits WALL | `tests/metroidvania-snake.test.js:1459` | `expect(result.snake.length).toBe(state.snake.length)` → `expect(result.snake.length).toBe(2)` | 1 |
| 4 | Test 7: Edge case — snake length = 1 | `tests/metroidvania-snake.test.js:1602-1627` | Replace direction-flip assertions with gameover verification; see §3.1 | 4 (replace block) |
| 5 | C2: Food + enemy at same WALL cell | `tests/metroidvania-snake.test.js:1996` | `expect(result.snake.length).toBe(state.snake.length)` → `expect(result.snake.length).toBe(3)` | 1 |
| 6 | C4: Snake length 1 hits wall with food | `tests/metroidvania-snake.test.js:2038-2041` | `gameState` → `'gameover'`, remove stuckCounter & food-removed assertions; see §3.2 | 3 (2 changes, 1 delete) |

### 3.1 Test 4 — Full Replacement Block

**Current (lines 1615-1625):**
```js
let s = tick(state); // stuck
// Tick through stuck
// 5 ticks = stuck 5→0, reverse executes on 5th tick (no extra move)
for (let i = 0; i < 5; i++) {
  s = tick(s);
}
// Single segment: snake.reverse() on 1 element = same array
expect(s.snake).toHaveLength(1);
expect(s.snake[0]).toEqual({ x: 5, y: 5 });
// Direction flipped 180°
expect(s.direction).toEqual({ x: -1, y: 0 });
```

**Replacement:**
```js
// Single segment: wall hit → immediate gameover (Issue #150)
const s = tick(state);
expect(s.gameState).toBe('gameover');
expect(s.snake).toHaveLength(1);
expect(s.snake[0]).toEqual({ x: 5, y: 5 });
```

Remove the 5-tick for-loop (line 1618-1620). Replace `let s = tick(state)` with `const s = tick(state)` at line 1615. The test now verifies that a length-1 snake hitting a wall immediately triggers gameover, before any stuck/reverse logic runs.

### 3.2 Test 6 — Replacement Block

**Current (lines 2037-2041):**
```js
const result = tick(state);
expect(result.gameState).toBe('playing');
expect(result.stuckCounter).toBeGreaterThan(0);
const roomAfter = getRoomAt(world, 0, 0);
expect(roomAfter.entities.food.find(f => f.x === 9 && f.y === 10)).toBeUndefined();
```

**Replacement:**
```js
const result = tick(state);
// Length 1 hitting wall → gameover (Issue #150); food not processed
expect(result.gameState).toBe('gameover');
```

StuckCounter and food-removal assertions are removed — the implementation returns before setting stuckCounter or processing food for length-1 snakes.

### 3.3 Update Test Descriptions (Cosmetic, Not Required for Pass)

Optionally update `it()` descriptions to match the new expected behavior:

| # | Current Description | Suggested Update |
|---|---|---|
| 1 | `wall collision triggers stuck+reverse — length preserved, stuckCounter set` | `wall collision triggers stuck+reverse — tail popped, stuckCounter set` |
| 2 | `snake length 1 hitting wall → stuck not gameover` | `snake length 1 hitting wall → gameover` |
| 3 | `should set stuckCounter to STUCK_TICKS and freeze movement` | (accurate — comment `/* no length loss */` at L1457 should be updated) |
| 4 | `should reverse a single-segment snake on wall collision...` | `should gameover a single-segment snake on wall collision` |
| 5 | `C2: Food + enemy at same WALL cell — food removed...` | (accurate — only length assertion changes) |
| 6 | `C4: Snake length 1 hits wall with food — stuckCounter set, food removed, playing` | `C4: Snake length 1 hits wall with food — gameover, food not processed` |

## 4. Verification

```bash
cd /home/pi/workspace/.pda/perfect-dev-agent-workflow
npx vitest run tests/metroidvania-snake.test.js
```

**Expected result:** All 6 previously failing tests pass. Pre-existing failures in other test files (if any) are outside scope and should not be attributed to these changes.

**Total expected:** 337 passed, 0 failed, 15 todo across the full suite.

## 5. Implementation Phases

Since this is a test-only fix with 6 highly targeted changes, implementation is a single phase:

| Phase | Description | Files | Lines Changed | Risk |
|---|---|---|---|---|
| 1 | Apply 6 assertion fixes per the Fix Inventory table above | `tests/metroidvania-snake.test.js` | 8 changed, 2 removed | Low |

**Steps:**
1. Branch from master: `plan/189-fix-stale-test-assertions`
2. Apply each fix in order (Tests 1→2→3→4→5→6)
3. Run `npx vitest run tests/metroidvania-snake.test.js` — verify all pass
4. Optionally update `it()` descriptions (cosmetic)
5. Push and open PR

## 6. Out of Scope

| Item | Reason |
|---|---|
| Modify `core.js` behavior | Test-only fix; production code changes would require separate issues |
| Add new test cases | Scope is fixing existing stale assertions, not expanding coverage |
| Fix other failing tests | Pre-existing failures unrelated to #46/#70 assertions are outside scope |
| Change `checkSnakeCollision()` | Collision detection logic is correct; only `tick()` differs from test expectations |
| Update DESIGN docs for #46 / #70 | Those issues are already closed with their own design docs |

## 7. Boundary Conditions & Edge Cases

| Case | Status | Reasoning |
|---|---|---|
| Other Phase 4 tests (Tests 2-6) with length≥3 snakes | ✅ Still valid | These tests use longer snakes and check direction/score/stuckCounter, not total length |
| Food entity state after length-1 wall hit (C4) | ✅ Correctly removed | Length-1 returns before food processing; test no longer asserts food removal |
| Test name accuracy | Cosmetic | Can optionally update descriptions for clarity |
| 10 consecutive runs | Potential flakiness | `generateWorldMap` is called in tests; if random gen happens to place tiles on collision cells, could cause flakiness. Fixed fixtures (current setup uses explicit tile placement) avoid this. |
