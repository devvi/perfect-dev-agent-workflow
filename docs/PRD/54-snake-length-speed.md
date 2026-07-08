# PRD: 蛇身长度和速度的关系调整

| Field | Value |
|-------|-------|
| Issue | #54 |
| Priority | Medium |
| Labels | enhancement, workflow/research |
| Author | devvi |

## 1. Background & Problem Statement

The metroidvania snake game currently includes a length-based speed system (implemented per Issue #50), but the tuning makes the relationship barely perceptible during normal gameplay.

### Current Implementation

Two engines exist:

- **Engine B** (`public/src/engine/core.js` + `public/gameboy.html`): The main game engine. Already has `calculateSpeed()` and a recursive `setTimeout` game loop that dynamically reads `currentTickInterval`. **The game loop fix works correctly.**

- **Engine A** (`src/gameboy-snake-engine.js`): Standalone classic GameBoy engine. Does **not** have any speed-length logic. Its copy at `public/src/gameboy-snake-engine.js` has the fix applied (used by tests).

### Root Cause of the Design Issue

The current formula uses a **linear slope** with `SPEED_SLOPE = 0.02`:

```js
calculateSpeed(length, baseInterval)
  = floor(150 * (1 + (length - 3) * 0.02))
```

| Length | Tick Interval | Perception |
|--------|--------------|------------|
| 3 (min) | 150ms | — |
| 10 | 171ms | +14% — barely noticeable |
| 20 | 201ms | +34% — slightly noticeable |
| 50 | 291ms | +94% — noticeable but still fast |
| 100 | 441ms | ~3× — game feels slower |
| 400 (max) | 1341ms | ~9× — extremely slow |

**The problem:** The slope is too gentle. A player reaching length 20-30 (a typical mid-game range) experiences only 30-60% slowdown — not enough to create a meaningful trade-off decision. By the time the slowdown becomes significant (~length 50+), the player is already very experienced and enemies are still easily outrun.

The intended design is that **longer body = more risk** (slow speed means enemies catch up), creating a natural self-regulation mechanic where players may choose to deliberately lose length to regain speed.

## 2. Impact Assessment

| Area | Impact |
|------|--------|
| **Player Experience** | Currently minimal tension; no meaningful trade-off decision about snake length. Enemies rarely threaten long snakes. |
| **Game Balance** | Enemies' movement speed (`DEFAULT_ENEMY_SPEED_TICKS = 2`) is constant. With current tuning, long snakes still outrun enemies easily. |
| **Strategy Depth** | No incentive for players to manage length strategically (e.g., collision damage that reduces length becomes a benefit, not a penalty). |
| **Code Complexity** | Low — only constants and the formula need changing. No architectural modifications. |
| **Test Scope** | `calculateSpeed()` tests need new expected values. Integration tests should verify game loop picks up changes. |

## 3. Alternatives Considered

### Alternative A: Steeper Linear Slope (Recommended)

Increase `SPEED_SLOPE` from 0.02 to **0.05** (2.5× steeper).

**Formula:**
```js
calculateSpeed(length, baseInterval)
  = floor(150 * (1 + (length - 3) * 0.05))
```

**Behavior:**

| Length | Tick Interval | Perception |
|--------|--------------|------------|
| 3 | 150ms | — |
| 10 | 202ms | +35% — noticeable slowdown |
| 20 | 277ms | +85% — significant |
| 35 | 390ms | ~2.6× — slow; enemies begin to catch up |
| 50 | 502ms | ~3.3× — very slow; enemies can easily catch |
| 100 | 877ms | ~5.8× — extremely slow |

**Pros:**
- Simple parameter change, minimal code risk
- Creates clear trade-off zones: moderate speed at length 10-20, significant slowdown at 20-35, dangerous at 35+
- Players naturally feel the need to manage length around mid-game (length 20-35)
- Enemies become a real threat at length 35+ as intended

**Cons:**
- At max length (400): ~3,000ms (20×), which may be unplayably slow. Need a max-speed floor or soft cap.
- Linear throughout; no curve to the relationship.

### Alternative B: Logarithmic / Diminishing-Returns Curve

Use a logarithmic function so speed drops quickly at first then plateaus.

**Formula:**
```js
calculateSpeed(length, baseInterval)
  = floor(baseInterval * (1 + Math.log2(length - 2) * SLOPE_FACTOR))
```
Where `SLOPE_FACTOR` is tuned such that:
- At length 3: 150ms (baseline)
- At length 10: ~210ms (40% slower)
- At length 20: ~285ms (90% slower)
- At length 50: ~375ms (2.5×)
- At length 100: ~435ms (2.9×)
- At length 400: ~510ms (3.4×) — plateaus

**Pros:**
- Smooth, natural-feeling progression
- Never becomes unplayably slow even at extreme lengths
- Most noticeable change happens in the early and mid game where it matters most

**Cons:**
- More complex formula — harder to tune and explain
- At very high lengths, speed barely changes anymore, reducing the "danger zone" feeling
- Logarithmic costs more CPU (negligible but less elegant)
- Harder for players to intuitively understand the relationship

### Alternative C: Staged / Piecewise Linear

Define speed tiers by length intervals with different slopes:

```js
function calculateSpeed(length, baseInterval) {
  if (length <= 10) return baseInterval;                     // speedy early game
  if (length <= 20) return floor(baseInterval * 1.5);       // first drop
  if (length <= 35) return floor(baseInterval * 2.0);       // second drop
  if (length <= 50) return floor(baseInterval * 3.0);       // third drop
  return floor(baseInterval * 4.0);                          // capped max
}
```

**Pros:**
- Predictable, easy to understand and communicate to players
- Clear breakpoints create achievement-like markers
- Speed cap ensures playability

**Cons:**
- Discontinuous — abrupt speed jumps at breakpoints feel jarring
- Discrete tiers reduce granularity of player feedback per food eaten
- Harder to justify specific threshold values without playtesting

## 4. Recommended Approach: Alternative A (Steeper Linear Slope)

**Primary choice: Steeper linear slope with a speed floor.**

Rationale:
1. Simplest change — single constant modification `SPEED_SLOPE: 0.02 → 0.05`
2. Creates the exact desired behavior: moderate lengths = moderate slowdown, long = very slow, enemies catch up
3. Easy to tune further after playtesting
4. Consistent with the existing linear model — no architectural changes

### Additional Safeguard: Speed Floor

To prevent extreme lengths from becoming unplayable, add a **speed floor** that clamps the maximum tick interval:

```js
export const MAX_TICK_INTERVAL = 800; // ms — capped max interval (≈5.3× slowdown)

export function calculateSpeed(length, baseInterval) {
  return Math.min(
    Math.floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE)),
    MAX_TICK_INTERVAL
  );
}
```

With `SPEED_SLOPE = 0.05` and `MAX_TICK_INTERVAL = 800ms`:
- Length 3: 150ms (fast)
- Length 10: 202ms
- Length 20: 277ms
- Length 35: 390ms (enemy threat zone begins)
- Length 50: 502ms (enemies easily catch up)
- Length ≈90: 800ms (hits the floor)
- Length 100–400: 800ms (capped)

## 5. Boundary & Scope Items

### Scope

| Item | Description |
|------|-------------|
| **Engine B** (`public/src/engine/core.js`) | Update `SPEED_SLOPE` constant from 0.02 → 0.05. Add `MAX_TICK_INTERVAL = 800`. Update `calculateSpeed()` to clamp to max. |
| **Engine A** (`src/gameboy-snake-engine.js`) | This engine currently has no speed-length logic at all. Since #50 was filed as a bug and #54 is tuning, **Engine A should first be brought up to parity** with the #50 fix (add `BASE_TICK_INTERVAL`, `SPEED_SLOPE`, `calculateSpeed`, `currentTickInterval`), then tuned with the new values. |
| **Tests** | Update test expectations for `calculateSpeed()` with new slope and max clamp. Add edge-case tests. |
| **HUD / Feedback** | Optionally display current tick interval (or a visual speed indicator) so players can perceive the change. |

### Out of Scope

| Item | Reason |
|------|--------|
| **Enemy speed tuning** | Enemy movement (`DEFAULT_ENEMY_SPEED_TICKS = 2`) is a separate concern. If after this change enemies still cannot catch long snakes even at max speed floor, enemy speed should be a follow-up issue. |
| **Non-linear formulas beyond linear/log** | Alternatives A/B/C represent the main design space. Exponential or custom spline curves add unnecessary complexity. |
| **Visual snake length indicator** | UI changes beyond a simple HUD speed readout are out of scope for this PRD. |
| **Game loop architecture** | The recursive `setTimeout` fix from #50 is already deployed. No game loop changes are needed. |

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Snake length = 1 (after combat damage that reduces length) | Speed should not be faster than the base 150ms. Clamp lower bound: `currentTickInterval = max(BASE_TICK_INTERVAL, calculated)`. |
| Snake at max length (400) | Speed hits the floor at 800ms. Player moves very slowly — enemies should be able to catch up easily, enforcing the length-speed trade-off. |
| Game pause/unpause | `currentTickInterval` is preserved in state; on resume, game loop reads it fresh. No special handling required. |
| Game restart | New game resets length to 3, `currentTickInterval` returns to `BASE_TICK_INTERVAL` (150ms). |
| Very short snake (length 3) | Fastest possible speed. Player feels agile and can easily dodge enemies. |
| Multi-room transitions | `currentTickInterval` is part of state and persists across rooms. No change needed. |

## 6. Acceptance Criteria

- [ ] `SPEED_SLOPE` updated from 0.02 → 0.05 in Engine B (`public/src/engine/constants.js`)
- [ ] `MAX_TICK_INTERVAL = 800` added and `calculateSpeed()` clamps to it
- [ ] Engine A (`src/gameboy-snake-engine.js`) receives the speed-length logic from #50 (backport the `public/src/gameboy-snake-engine.js` changes)
- [ ] Engine A also tuned with the new slope (0.05) and max clamp
- [ ] At length 3: tick interval = 150ms
- [ ] At length 20: tick interval = 277ms (~1.85× baseline)
- [ ] At length 35: tick interval = 390ms (~2.6× baseline) — enemy threat zone
- [ ] At length 50: tick interval = 502ms (~3.3× baseline)
- [ ] At length ≥90: tick interval capped at 800ms
- [ ] Existing test suite passes
- [ ] New tests added for: `calculateSpeed()` with new slope, max clamp, edge lengths (1, 3, 35, 50, 90, 400)
- [ ] Game loop correctly reads updated `currentTickInterval` each tick (regression check per #50 fix)

## 7. References

- Issue #50: [Bug] 蛇长度跟速度无关 (original implementation)
- Issue #54: [Feature] 蛇身长度和速度的关系调整 (this issue — tuning)
- Engine B: `public/src/engine/core.js` (tick logic) + `public/src/engine/constants.js` (constants)
- Engine A: `src/gameboy-snake-engine.js` (standalone classic engine)
- Constants: `public/src/engine/constants.js` (BASE_TICK_INTERVAL, SPEED_SLOPE)
- Game loop: `public/gameboy.html` (recursive setTimeout)
