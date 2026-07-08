# PRD: [Bug] 蛇长度跟速度无关

| Field | Value |
|-------|-------|
| Issue | #50 |
| Priority | Low |
| Labels | bug, workflow/research |
| Author | devvi |

## 1. Background

According to the original design intent, the snake should move **more slowly as its length increases**, and **more quickly when short**. Currently, movement speed is not affected by snake length at all.

The current default movement speed (at minimum length = 3) should be preserved as the base speed.

## 2. Root Cause Analysis

Two engines exist in the repository, each with different manifestations of this bug:

### Engine A: Classic GameBoy Snake (`src/gameboy-snake-engine.js`)

- **Bug: Missing implementation.** This engine has **no speed/length logic at all**.
- The `tick()` function only moves the snake; it never adjusts the tick interval based on snake length.
- There is no `calculateSpeed()` function, no `currentTickInterval` field, and no reference to length-based speed modulation.

### Engine B: Metroidvania Snake (`public/src/engine/core.js`)

- **Bug: Game loop does not pick up dynamic interval changes.** The engine *does* have a `calculateSpeed()` function and *does* call it inside `tick()`:

  ```js
  // core.js:256
  s.currentTickInterval = calculateSpeed(s.snake.length, s.baseTickInterval);
  ```

  ```js
  // core.js:382
  export function calculateSpeed(length, baseInterval) {
    return Math.floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE));
  }
  ```

  **However**, the game loop in `public/gameboy.html` uses `setInterval`, which **captures the interval delay at creation time** and does not dynamically re-read it:

  ```js
  // gameboy.html:125
  gameLoop = setInterval(tickFn, state.currentTickInterval);
  ```

  After `tick()` updates `state.currentTickInterval` (e.g., from 150 → 153 → 156…), the running `setInterval` continues firing at the **original** captured delay. The new value is never applied to the timer.

## 3. Current Behavior

### `calculateSpeed` Formula

```js
export const BASE_TICK_INTERVAL = 150;  // ms at length 3
export const SPEED_SLOPE = 0.02;         // multiplier per extra length unit

calculateSpeed(length, baseInterval)
  = floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE))
```

Example outputs for `BASE_TICK_INTERVAL = 150`:

| Snake Length | Tick Interval (ms) | Effective Slowdown |
|---|---|---|
| 3 | 150 | baseline |
| 4 | 153 | +3 ms (+2%) |
| 10 | 171 | +21 ms (+14%) |
| 20 | 201 | +51 ms (+34%) |
| 50 | 291 | +141 ms (+94%) — nearly double |
| 100 | 441 | +291 ms (~3× slower) |
| 400 (max) | 1341 | +1191 ms (~9× slower) |

The formula **is mathematically correct** — it produces a meaningful curve. The issue is that this value is **never actually used by the game loop timer**.

### Observed Behavior

- Speed remains constant regardless of snake length
- No visual or gameplay difference between length 3 and length 100
- Game loop fires ticks at the original `BASE_TICK_INTERVAL` (150ms) indefinitely

## 4. Constraints / Design Notes

- The `BASE_TICK_INTERVAL = 150ms` at length 3 is the intended **fastest** speed and should not be changed.
- The `SPEED_SLOPE = 0.02` multiplier produces a gentile curve — doubling time only after ~50 cells. This seems reasonable but could be tuned.
- The game loop must support **dynamic interval updates** — each tick should be able to change the delay for the *next* tick.
- Two entry points exist:
  1. The classic GameBoy engine (`src/gameboy-snake-engine.js`) — needs full implementation
  2. The metroidvania engine (`public/src/engine/core.js`) — needs game loop fix

## 5. Proposed Fix Strategy

### Engine A (Classic GameBoy, `src/gameboy-snake-engine.js`)

```
1. Add constants: BASE_TICK_INTERVAL, SPEED_SLOPE
2. Add state field: currentTickInterval (default to BASE_TICK_INTERVAL)
3. Add calculateSpeed() function (same formula as Engine B)
4. Call calculateSpeed() at end of tick() when food is eaten
5. Export currentTickInterval for use by the game loop
```

### Engine B (Metroidvania, `public/src/engine/core.js` + `public/gameboy.html`)

**Option 1 (Recommended): Replace `setInterval` with recursive `setTimeout`**

```js
function scheduleNextTick() {
  tickFn();
  if (state && state.gameState === 'playing') {
    gameLoop = setTimeout(() => {
      if (gameLoop) clearTimeout(gameLoop);
      scheduleNextTick();
    }, state.currentTickInterval);
  }
}
```

This reads `state.currentTickInterval` fresh each time, allowing `tick()` to dynamically change the delay.

**Option 2: Clear and recreate `setInterval` inside `tickFn`**

Less elegant but works: at the end of `tickFn()`, clear the current interval and create a new one with the updated `state.currentTickInterval`.

### Visualization (game loop vs. tick interval)

```
Current (broken):
  Timer:  [150ms][150ms][150ms][150ms][150ms][150ms] ← never changes
  Length:   3      4      5      6      7      8

Fixed (recursive setTimeout):
  Timer:  [150ms][153ms][156ms][159ms][162ms][165ms] ← increases with length
  Length:   3      4      5      6      7      8
```

## 6. Edge Cases

| Case | Expected |
|------|----------|
| Snake length = 1 (after combat damage) | Fastest speed (`calculateSpeed(1)`) — maybe too fast; consider clamp to min(BASE_TICK_INTERVAL) |
| Snake max length = 400 | Slowest speed — ~1341ms per tick |
| Game paused / resumed | Interval should be re-created on resume with current `currentTickInterval` |
| Game over → restart | Interval resets to fresh `currentTickInterval` (BASE_TICK_INTERVAL) |
| Speed becoming very slow at high lengths | Player can still control direction; test that the game remains playable |

## 7. Acceptance Criteria

- [ ] Engine A: `calculateSpeed()` implemented, called on every `tick()`, `currentTickInterval` exported
- [ ] Engine B: Game loop correctly uses dynamic interval (recursive `setTimeout` or equivalent)
- [ ] At length 3: tick interval = `BASE_TICK_INTERVAL` (150ms)
- [ ] At length 50: tick interval ≈ 291ms (94% slower than baseline)
- [ ] At length 400 (max): tick interval ≈ 1341ms
- [ ] No regression in existing test suite
- [ ] Tests added for `calculateSpeed()` with various length inputs
- [ ] HUD optionally displays current speed/tick interval

## 8. References

- Issue #50: [Bug] 蛇长度跟速度无关
- Issue #46: Stuck+Reverse on wall collision (affected engine structure)
- Engine A: `src/gameboy-snake-engine.js`
- Engine B: `public/src/engine/core.js` (tick logic) + `public/gameboy.html` (game loop)
- Constants: `public/src/engine/constants.js` (BASE_TICK_INTERVAL, SPEED_SLOPE)
