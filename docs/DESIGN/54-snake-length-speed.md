# DESIGN: Snake Length-Speed Relationship Tuning

| Field | Value |
|-------|-------|
| Issue | #54 |
| Priority | Medium |
| Status | Plan |
| Labels | enhancement, workflow/research |

## 1. Overview

This design doc covers the tuning of the length-based speed system introduced in Issue #50. The current linear slope (`SPEED_SLOPE = 0.02`) makes the speed-length relationship barely perceptible during normal gameplay. This design proposes a **steeper linear slope** (`0.05`) with a **speed floor cap** (`MAX_TICK_INTERVAL = 800ms`) across both engines.

## 2. Module Architecture

### 2.1 Engine B — Metroidvania Snake (Main Engine)

```
public/src/engine/
├── constants.js    ← SPEED_SLOPE, MAX_TICK_INTERVAL, BASE_TICK_INTERVAL
├── core.js         ← calculateSpeed(), tick() game loop hook
└── ... (collision, ai, combat, entities, etc.)

public/gameboy.html ← Recursive setTimeout game loop
    └── scheduleNextTick() reads state.currentTickInterval each frame
```

**Interfaces & responsibilities:**

| Module | Export | Role |
|--------|--------|------|
| `constants.js` | `SPEED_SLOPE`, `BASE_TICK_INTERVAL`, `MAX_TICK_INTERVAL` | Single source of truth for speed curve params |
| `core.js` | `calculateSpeed(length, baseInterval)` → number | Pure function: length → tick interval |
| `core.js` | `tick(state)` → state | Calls `calculateSpeed()` during each game tick and stores result in `state.currentTickInterval` |
| `gameboy.html` | `scheduleNextTick()` | Reads `state.currentTickInterval` each frame to compute setTimeout delay |

### 2.2 Engine A — Classic GameBoy Snake (Standalone)

```
src/
├── gameboy-snake-engine.js  ← No speed-length logic currently
```

**Interfaces (to be added):**

| Function | Export | Role |
|----------|--------|------|
| `calculateSpeed(length, baseInterval)` | ✅ Export | Pure function (same formula as Engine B) |
| `tick(state)` → state | existing | Internal call to `calculateSpeed()` after movement |
| `BASE_TICK_INTERVAL` / `SPEED_SLOPE` / `MAX_TICK_INTERVAL` | ✅ Export | Constants (identical values to Engine B) |

**Note:** Engine A's copy at `public/src/gameboy-snake-engine.js` already has the #50 fix (constants + calculateSpeed + tick hook). The engine source at `src/gameboy-snake-engine.js` must be brought to parity first.

## 3. Component/Module Design

### 3.1 Constants (`constants.js`)

```js
// Both engines share these values:
BASE_TICK_INTERVAL = 150    // ms at length 3 (fastest)
SPEED_SLOPE         = 0.05  // was 0.02 (2.5× steeper)
MAX_TICK_INTERVAL   = 800   // NEW — cap max slowdown
```

**Why 800ms cap:**
- Prevents extreme lengths (400) from becoming unplayable (~3000ms uncapped)
- At ~5.3× baseline, enemies comfortably catch up
- Length ≈90 reaches the floor, so the last ~310 length units provide no further speed penalty
- Keeps the game playable for achievement-hunters collecting max length

### 3.2 calculateSpeed() — Pure function interface

```
Input:  { length: number, baseInterval: number }
Output: { tickInterval: number (clamped to [BASE_TICK_INTERVAL, MAX_TICK_INTERVAL]) }
Logic:
  1. raw = floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE))
  2. clamped = min(raw, MAX_TICK_INTERVAL)
  3. result = max(clamped, BASE_TICK_INTERVAL)  // lower bound guard
```

**Clamping rationale:**
- **Upper cap** (`MAX_TICK_INTERVAL`): Prevents unplayable slowdown at extreme lengths
- **Lower cap** (`BASE_TICK_INTERVAL`): Prevents sub-length-3 speeds from being faster than the baseline (relevant after combat damage where length may drop to 1–2)

### 3.3 Game Loop Integration

The recursive `setTimeout` pattern (fixed in #50) reads `state.currentTickInterval` each tick:

```
scheduleNextTick():
  1. If state is null or not 'playing', return (stop loop)
  2. interval = state.currentTickInterval (read fresh each call)
  3. setTimeout(() => { tickFn(); scheduleNextTick(); }, interval)

tickFn():
  1. state = tick(state)           ← internally updates currentTickInterval
  2. updateHUD()                   ← optionally display speed info
  3. render()
  4. If game over / won, clear timeout (stop)
```

No architectural changes to the game loop — it already correctly reads the dynamic interval.

## 4. Data Flow

```
Player eats food
    ↓
Snake length increases (state.snake.length)
    ↓
tick() calls calculateSpeed(length, BASE_TICK_INTERVAL)
    ↓
calculateSpeed() applies linear formula + clamp
    ↓
state.currentTickInterval is updated (ms)
    ↓
scheduleNextTick() reads state.currentTickInterval for setTimeout delay
    ↓
Next game tick fires at the new interval
    ↓
Player perceives slower movement
```

**Reverse flow** (shorter snake = faster):
```
Enemy collision → tail segment removed
    ↓
Snake length decreases
    ↓
tick() recalculates → lower currentTickInterval
    ↓
Next tick fires sooner → player moves faster
```

## 5. Edge Cases

| Case | Expected Behavior | Verification |
|------|-------------------|--------------|
| Length = 1 (after combat damage) | Clamped to 150ms (not faster than base) | `calculateSpeed(1, 150)` = 150 |
| Length = 3 (minimum normal) | 150ms baseline | `calculateSpeed(3, 150)` = 150 |
| Length = 10 | 202ms (+35%) — noticeable slowdown begins | `calculateSpeed(10, 150)` = 202 |
| Length = 20 | 277ms (+85%) — significant | `calculateSpeed(20, 150)` = 277 |
| Length = 35 | 390ms (~2.6×) — enemy threat zone | `calculateSpeed(35, 150)` = 390 |
| Length = 50 | 502ms (~3.3×) — very slow, enemies catch up | `calculateSpeed(50, 150)` = 502 |
| Length = 90 | 800ms — hits speed floor | `calculateSpeed(90, 150)` = 800 |
| Length = 400 (max) | 800ms — capped at floor | `calculateSpeed(400, 150)` = 800 |
| Game pause/unpause | Interval preserved in state; resume reads fresh | state.currentTickInterval unchanged |
| Game restart | Reset to length 3 → 150ms | createInitialState() resets snake |
| Room transition | currentTickInterval is part of state, persists across rooms | No special handling needed |
| Enemy collision at length=1 | Snake dies (length becomes 0 → gameover) before speed matters | Handled by existing combat logic |

## 6. Test Specifications (Text Only — No Code)

### 6.1 Unit Tests — calculateSpeed() (Engine A & B)

Scenarios to test:

| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 1 | Minimum normal length | length=3, base=150 | Returns 150 (BASE_TICK_INTERVAL) |
| 2 | Early game slowdown | length=10, base=150 | Returns 202 |
| 3 | Mid game significant slowdown | length=20, base=150 | Returns 277 |
| 4 | Enemy threat zone threshold | length=35, base=150 | Returns 390 |
| 5 | Danger zone — enemies catch up | length=50, base=150 | Returns 502 |
| 6 | Speed floor entry point | length=90, base=150 | Returns 800 (capped) |
| 7 | Max length (should be capped) | length=400, base=150 | Returns 800 (capped, not ~3000 uncapped) |
| 8 | Sub-minimum length after damage | length=1, base=150 | Returns 150 (clamped to base, not 144) |
| 9 | Very short snake | length=2, base=150 | Returns 150 (clamped) |
| 10 | Length exactly at floor threshold | Calculate expected floor value | Returns MAX_TICK_INTERVAL |

### 6.2 Unit Tests — State Integration (Tick Hook)

Scenarios to test:

| # | Scenario | Setup | Expected Behavior |
|---|----------|-------|-------------------|
| 1 | currentTickInterval increases after eating food | Snake at length=3 eats food → length=4 | currentTickInterval > BASE_TICK_INTERVAL |
| 2 | currentTickInterval unchanged without food | Snake moves without eating | currentTickInterval stays unchanged |
| 3 | currentTickInterval decreases after losing tail segment | Snake at length=4, simulate collision (tail removed) | currentTickInterval decreases |
| 4 | currentTickInterval at max length (400) | Create snake of length=400, tick once | currentTickInterval = MAX_TICK_INTERVAL |
| 5 | currentTickInterval preserved across game pause | Pause game, check currentTickInterval | Value unchanged |
| 6 | Reset on game restart | Create new game after game over | currentTickInterval = BASE_TICK_INTERVAL |

### 6.3 Edge Case Tests

| # | Scenario | Setup | Expected Behavior |
|---|----------|-------|-------------------|
| 1 | Zero length (shouldn't happen but safe) | length=0, base=150 | Clamped to BASE_TICK_INTERVAL (150) or game is already over |
| 2 | Negative length (defensive check) | length=-1, base=150 | Clamped to BASE_TICK_INTERVAL (150) |
| 3 | Non-integer length (float) | length=10.7, base=150 | Works correctly (JS coerces — test documents behavior) |
| 4 | Very large baseInterval | length=10, base=500 | Returns min of formula result and MAX_TICK_INTERVAL |
| 5 | Base interval = 0 (edge case) | length=10, base=0 | Returns 0 (no tick interval — game loop safety) |

### 6.4 Integration / Game Loop Tests

| # | Scenario | Setup | Expected Behavior |
|---|----------|-------|-------------------|
| 1 | Two food items in sequence | Place 2 food items on path, tick twice | currentTickInterval increases after 2nd food |
| 2 | Speed recovery after enemy collision | Snake at length=10, simulate enemy damage | After tail loss, currentTickInterval decreases |
| 3 | Full game loop regression | Run existing play test (SNES-12) | Same score as before (performance unchanged) |
| 4 | Engine A loop interval change | Mock setTimeout in test | setTimeout called with new interval after food |
| 5 | Engine B loop interval change | Schedule next tick after food | scheduleNextTick reads updated interval |

### 6.5 Regression Tests

| # | Scenario | Reason |
|---|----------|--------|
| 1 | Existing SNES-12 play test passes | Core game mechanics unchanged |
| 2 | Stuck+reverse still works after tick interval changes | #46 regression |
| 3 | Room transitions still trigger at any speed | #19 regression |
| 4 | Enemy AI speed unaffected by snake speed | PRD scope — enemy speed is separate |
| 5 | Self-collision still insta-kills at slow speed | #55 regression |

## 7. Engine Disparity (Critical Note)

Engine A (`src/gameboy-snake-engine.js`) currently has **no speed-length logic** at all. Its copy at `public/src/gameboy-snake-engine.js` received the #50 fix (constants + calculateSpeed + tick hook). The source engine must be:

1. Backported with the #50 logic first (BASE_TICK_INTERVAL, SPEED_SLOPE, calculateSpeed, currentTickInterval in state + tick hook)
2. Then tuned with the new values (SPEED_SLOPE = 0.05, MAX_TICK_INTERVAL = 800)

This is a two-step process because the #50 fix was only applied to the public copy.

## 8. Known Code Issues to Fix

The `public/gameboy.html` file has two remaining `clearInterval` calls (lines ~207, ~214) that should have been converted to `clearTimeout` during the #50 fix. These are in the mobile/touch event handlers. They don't cause runtime errors because calling `clearInterval` on a timeout ID is a no-op (and vice versa), but they should be corrected for clarity and consistency.

## 9. Optional Enhancement: Speed HUD Indicator

Displaying the current tick interval (or a speed bar) would help players perceive the change. Consider adding a small readout in the HUD for debugging or as an optional display toggle. This is a **P2** enhancement.

## 10. References

- Issue #50: Original implementation (speed-length relationship)
- Issue #46: Stuck+reverse mechanic (interacts with speed)
- PRD #54: Full product requirements for this change
- `public/src/engine/constants.js`: SPEED_SLOPE (0.02 → 0.05), add MAX_TICK_INTERVAL
- `public/src/engine/core.js`: calculateSpeed() to add clamping
- `src/gameboy-snake-engine.js`: Backport + tune
- `docs/DESIGN/50-snake-speed-length.md`: Previous implementation plan
- `tests/gameboy-snake.test.js`: Unit tests for Engine A
- `tests/metroidvania-snake.test.js`: Unit tests for Engine B
