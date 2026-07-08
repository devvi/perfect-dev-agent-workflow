## Implementation Plan

### Issue Summary

**#50: 蛇长度跟速度无关**

Snake movement speed should be inversely proportional to its length — longer snakes should move slower, shorter snakes faster. Currently, speed remains constant regardless of length.

**Research Summary**

Research branch `research/50` was completed. The full PRD is in `docs/PRD/50-[Bug]-蛇长度跟速度无关.md`.

**Two engines are affected:**

1. **Engine A (Classic GameBoy, `public/src/gameboy-snake-engine.js`)** — Missing implementation entirely. No speed/length relationship exists. No `calculateSpeed()` function, no `currentTickInterval` field.

2. **Engine B (Metroidvania, `public/src/engine/core.js` + `public/gameboy.html`)** — `calculateSpeed()` is implemented and called in `tick()` (line 256 of core.js), but the game loop in `gameboy.html` uses `setInterval` which captures the delay at creation time and never re-reads the dynamically updated `state.currentTickInterval`.

**Root cause:** `setInterval` fixes its delay parameter at call time. After `tick()` updates `state.currentTickInterval` (e.g., 150 → 153 → 156…), the running `setInterval` continues firing at the original captured delay. The new value is never applied.

---

### Approach: Minimal, Two-Engine Fix

**Recommended approach:**
- Engine A: Add `calculateSpeed()` + `currentTickInterval` + call in `tick()` when food is eaten
- Engine B: Replace `setInterval` with recursive `setTimeout` in `gameboy.html` so interval is read fresh each tick

The `calculateSpeed` formula (already implemented in Engine B) is:
```
calculateSpeed(length, baseInterval) = floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE))
```

Where `BASE_TICK_INTERVAL = 150` and `SPEED_SLOPE = 0.02`.

---

### Phase 1: Engine A — Classic GameBoy Snake Speed Logic

**File:** `public/src/gameboy-snake-engine.js` (~15-20 lines added)

**1.1 — Add constants (after existing `STUCK_TICKS`):**
```js
export const BASE_TICK_INTERVAL = 150; // ms at length 3 (fastest)
export const SPEED_SLOPE = 0.02;       // multiplier per extra length unit
```

**1.2 — Add `currentTickInterval` to `createInitialState()`:**
```js
// In returned state object:
currentTickInterval: BASE_TICK_INTERVAL,
```

**1.3 — Add `calculateSpeed()` function (before `tick()`):**
```js
export function calculateSpeed(length, baseInterval) {
  return Math.floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE));
}
```

**1.4 — Call `calculateSpeed()` at end of `tick()` (after eating food, before returning):**
```js
// At end of tick(), before `return next;`:
next.currentTickInterval = calculateSpeed(next.snake.length, BASE_TICK_INTERVAL);
```
(Should also be called in the non-food branch, or placed once at the very end of `tick()` before return.)

**Key design decisions:**
- Formula is identical to Engine B's for consistency
- Minimum length (3) → `BASE_TICK_INTERVAL` (150ms, fastest)
- Each length unit adds +2% to interval (so length 100 → ~441ms)
- No upper clamp needed; game loop handles arbitrary intervals
- `currentTickInterval` exported for the game loop to read

---

### Phase 2: Engine B — Metroidvania Game Loop Fix

**File:** `public/gameboy.html` (~10 lines modified)

**2.1 — Replace `setInterval` with recursive `setTimeout` in `runTick()`:**

Current pattern (lines 96-126):
```js
function runTick() {
  if (gameLoop) clearInterval(gameLoop);
  const tickFn = () => { ... };
  tickFn();
  const interval = state ? state.currentTickInterval : 150;
  gameLoop = setInterval(() => {
    if (!state) return;
    if (gameLoop) clearInterval(gameLoop);
    gameLoop = setInterval(tickFn, state.currentTickInterval);
    tickFn();
  }, interval);
}
```

New pattern:
```js
function scheduleNextTick() {
  if (!state || state.gameState !== 'playing') return;
  const interval = state.currentTickInterval;
  gameLoop = setTimeout(() => {
    if (!state) return;
    tickFn();
    if (state.gameState === 'playing') {
      scheduleNextTick();
    }
  }, interval);
}

function runTick() {
  if (gameLoop) {
    clearTimeout(gameLoop);
    gameLoop = null;
  }
  const tickFn = () => {
    if (!state) return;
    state = tick(state);
    updateHUD();
    render(ctx, state);
    if (state.gameState === 'gameover' || state.gameState === 'won') {
      if (gameLoop) {
        clearTimeout(gameLoop);
        gameLoop = null;
      }
    }
  };
  tickFn();
  scheduleNextTick();
}
```

**Why recursive setTimeout:**
- `setTimeout` computes the delay *when invoked*, reading `state.currentTickInterval` fresh
- Each tick's interval is independently computed from the *current* snake length
- No interval clearing/restarting overhead
- Game loop stops naturally when `scheduleNextTick` early-returns on non-playing state

**Note:** `clearInterval` calls in `init()`, `start()`, and key handlers must become `clearTimeout`.

---

### Phase 3: Tests

**File:** `tests/gameboy-snake.test.js` — Add test suite (~8 test cases)

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | `calculateSpeed` length = 3 (minimum) | `calculateSpeed(3, 150)` | 150 |
| 2 | `calculateSpeed` length = 10 | `calculateSpeed(10, 150)` | 171 |
| 3 | `calculateSpeed` length = 50 | `calculateSpeed(50, 150)` | 291 |
| 4 | `calculateSpeed` length = 400 (max) | `calculateSpeed(400, 150)` | 1341 |
| 5 | `calculateSpeed` length = 4 | `calculateSpeed(4, 150)` | 153 |
| 6 | `calculateSpeed` length = 1 (after damage) | `calculateSpeed(1, 150)` | 150 (clamped) |
| 7 | `currentTickInterval` in state after tick with food | Snake eats food, check state | `currentTickInterval` > `BASE_TICK_INTERVAL` |
| 8 | `currentTickInterval` unchanged when no food eaten | Snake moves without eating | `currentTickInterval` = `BASE_TICK_INTERVAL` |

Note: Tests 7-8 require setting up a `tick()` call with controlled food position.

**File:** `tests/metroidvania-snake.test.js` — Add test suite (~4 test cases)

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | `calculateSpeed` export exists | Import `calculateSpeed` from core.js | Function is defined |
| 2 | `currentTickInterval` updates on tick | Create state, call `tick()` with food | `currentTickInterval` changes |
| 3 | Game loop reads fresh interval | (Playwright test) 2 food items in sequence | Tick interval increases after 2nd food |
| 4 | No regression: SNES-12 passes | Existing play test | Same score as before |

---

### File Change Summary

| File | Change | Lines | Risk |
|------|--------|-------|------|
| `public/src/gameboy-snake-engine.js` | Add constants + `calculateSpeed()` + state field + export | ~20 | 🟢 Low |
| `public/gameboy.html` | Replace setInterval with recursive setTimeout | ~15 | 🟡 Medium |
| `tests/gameboy-snake.test.js` | 8 new test cases for calculateSpeed | ~60 | 🟢 Low |
| `tests/metroidvania-snake.test.js` | 2 new test cases for tick interval | ~20 | 🟢 Low |

**Total:** ~115 lines across 4 files

---

### Edge Cases & Safety

| Edge Case | Behavior | Mitigation |
|-----------|----------|------------|
| Length 1 (after combat damage) | `calculateSpeed(1)` = 144, *faster* than baseline | Considering clamping to min(BASE_TICK_INTERVAL) |
| Length 400 (max) | ~1341ms interval — very slow | Intentional; design allows max slowdown |
| Game paused | `state.gameState` not 'playing', timer won't fire | Natural with recursive setTimeout |
| Game over during scheduled timeout | Timer fires when game over | tickFn returns early on non-playing state |
| Restart after game over | `init()` clears gameLoop, creates fresh state | Works correctly |
| Speed becomes extremely slow | Player can still buffer direction | Direction buffering is input-driven, not tick-driven |
| `clearTimeout` vs `clearInterval` in all code paths | Search-and-replace all 6 references | Manual check needed |

---

### Dependencies

| Depends On | Status |
|-----------|--------|
| Issue #46 (stuck+reverse) | ✅ Merged (adds `STUCK_TICKS`, `stuckCounter`, `pendingReverse` to engine state) |
| `BASE_TICK_INTERVAL` (150) in constants.js | ✅ Exists |
| `SPEED_SLOPE` (0.02) in constants.js | ✅ Exists |
| `calculateSpeed()` in core.js | ✅ Exists |

| Blocks | Priority |
|--------|----------|
| Future speed tuning (e.g., power-up speed boost) | Medium |
| HUD showing current tick interval | Low (optional enhancement) |

---

### Implementation Order

1. ✅ Research complete (branch `research/50`, PRD in `docs/PRD/`)
2. 📝 **THIS PLAN** — Plan review
3. Phase 1: Engine A speed logic (gameboy-snake-engine.js)
4. Phase 2: Engine B game loop fix (gameboy.html)
5. Phase 3: Tests
6. Run test suite & verify correctness

**Estimated effort:** 30-45 min implementation + 15 min testing
