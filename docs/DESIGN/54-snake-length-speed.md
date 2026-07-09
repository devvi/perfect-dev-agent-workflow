# Design: #54 — Snake Length-Speed Relationship Tuning

> Parent Issue: #54
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

### Overview

This design doc covers the tuning of the length-based speed system introduced in Issue #50. The current linear slope (`SPEED_SLOPE = 0.02`) makes the speed-length relationship barely perceptible during normal gameplay. This design proposes a **steeper linear slope** (`0.05`) with a **speed floor cap** (`MAX_TICK_INTERVAL = 800ms`) across both engines.

### Module Architecture

#### Engine B — Metroidvania Snake (Main Engine)

```
public/src/engine/
├── constants.js    ← SPEED_SLOPE, MAX_TICK_INTERVAL, BASE_TICK_INTERVAL
├── core.js         ← calculateSpeed(), tick() game loop hook
└── ... (collision, ai, combat, entities, etc.)

public/gameboy.html ← Recursive setTimeout game loop
    └── scheduleNextTick() reads state.currentTickInterval each frame
```

| Module | Export | Role |
|--------|--------|------|
| `constants.js` | `SPEED_SLOPE`, `BASE_TICK_INTERVAL`, `MAX_TICK_INTERVAL` | Single source of truth for speed curve params |
| `core.js` | `calculateSpeed(length, baseInterval)` → number | Pure function: length → tick interval |
| `core.js` | `tick(state)` → state | Calls `calculateSpeed()` during each game tick and stores result in `state.currentTickInterval` |
| `gameboy.html` | `scheduleNextTick()` | Reads `state.currentTickInterval` each frame to compute setTimeout delay |

#### Engine A — Classic GameBoy Snake (Standalone)

```
src/
├── gameboy-snake-engine.js  ← No speed-length logic currently
```

| Function | Export | Role |
|----------|--------|------|
| `calculateSpeed(length, baseInterval)` | ✅ Export | Pure function (same formula as Engine B) |
| `tick(state)` → state | existing | Internal call to `calculateSpeed()` after movement |
| `BASE_TICK_INTERVAL` / `SPEED_SLOPE` / `MAX_TICK_INTERVAL` | ✅ Export | Constants (identical values to Engine B) |

**Note:** Engine A's copy at `public/src/gameboy-snake-engine.js` already has the #50 fix. The engine source at `src/gameboy-snake-engine.js` must be brought to parity first.

### Engine Disparity (Critical Note)

Engine A (`src/gameboy-snake-engine.js`) currently has **no speed-length logic** at all. Its copy at `public/src/gameboy-snake-engine.js` received the #50 fix (constants + calculateSpeed + tick hook). The source engine must be:

1. Backported with the #50 logic first (BASE_TICK_INTERVAL, SPEED_SLOPE, calculateSpeed, currentTickInterval in state + tick hook)
2. Then tuned with the new values (SPEED_SLOPE = 0.05, MAX_TICK_INTERVAL = 800)

This is a two-step process.

---

## 2. Detailed Design

### 2.1 Constants (`constants.js`)

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

### 2.2 calculateSpeed() — Pure function interface

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

### 2.3 Game Loop Integration

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

### 2.4 Data Flow

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

### 2.5 Edge Cases

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
| Enemy collision at length=1 | Snake dies before speed matters | Handled by existing combat logic |

### 2.6 Known Code Issues to Fix

The `public/gameboy.html` file has two remaining `clearInterval` calls (lines ~207, ~214) that should have been converted to `clearTimeout` during the #50 fix. These are in the mobile/touch event handlers. They don't cause runtime errors but should be corrected for clarity and consistency.

### 2.7 Optional Enhancement: Speed HUD Indicator

Displaying the current tick interval (or a speed bar) would help players perceive the change. Consider adding a small readout in the HUD for debugging or as an optional display toggle. This is a **P2** enhancement.

---

## 3. Files Changed

| File | Change Description | Est. Lines |
|------|--------------------|------------|
| `public/src/engine/constants.js` | Change `SPEED_SLOPE` from 0.02 to 0.05; add `MAX_TICK_INTERVAL = 800` | ±2 |
| `public/src/engine/core.js` | Add clamping to `calculateSpeed()`: upper cap at MAX_TICK_INTERVAL, lower cap at BASE_TICK_INTERVAL | ~3 |
| `src/gameboy-snake-engine.js` | Backport #50 logic + tune with new values (SPEED_SLOPE = 0.05, MAX_TICK_INTERVAL = 800) | ~25 |
| `public/gameboy.html` | Fix remaining `clearInterval` → `clearTimeout` in mobile/touch handlers | ±2 |
| `tests/gameboy-snake.test.js` | 10 new unit tests for calculateSpeed with new values | ~80 |
| `tests/metroidvania-snake.test.js` | 6 new unit tests for state integration + clamping | ~40 |

---

## 4. Verification Checklist

- [ ] `calculateSpeed(1, 150)` = 150 (clamped, not 144)
- [ ] `calculateSpeed(3, 150)` = 150 (baseline)
- [ ] `calculateSpeed(10, 150)` = 202 (noticeable slowdown)
- [ ] `calculateSpeed(20, 150)` = 277 (significant)
- [ ] `calculateSpeed(35, 150)` = 390 (enemy threat zone)
- [ ] `calculateSpeed(50, 150)` = 502 (very slow)
- [ ] `calculateSpeed(90, 150)` = 800 (speed floor)
- [ ] `calculateSpeed(400, 150)` = 800 (capped)
- [ ] `currentTickInterval` increases after eating food (length 3 → 4)
- [ ] `currentTickInterval` decreases after losing tail segment
- [ ] `currentTickInterval` resets on game restart
- [ ] Existing SNES-12 play test passes
- [ ] Stuck+reverse still works (no #46 regression)
- [ ] Room transitions still trigger at any speed (no #19 regression)
- [ ] Self-collision still insta-kills at slow speed (no #55 regression)
- [ ] `clearInterval` → `clearTimeout` fix applied in mobile/touch handlers
