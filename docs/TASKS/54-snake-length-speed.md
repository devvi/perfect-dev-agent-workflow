# TASKS: #54 - Snake Length-Speed Relationship Tuning

| Field | Value |
|-------|-------|
| Issue | #54 |
| Phase | Implementation |

## File Change Summary

| # | File | Change Type | Lines | Risk |
|---|------|-------------|-------|------|
| 1 | `src/gameboy-snake-engine.js` | Backport #50 fix + apply #54 tuning | ~25 | 🟢 Low |
| 2 | `public/src/engine/constants.js` | Update SPEED_SLOPE, add MAX_TICK_INTERVAL | ~3 | 🟢 Low |
| 3 | `public/src/engine/core.js` | Update calculateSpeed() with clamping | ~5 | 🟢 Low |
| 4 | `tests/gameboy-snake.test.js` | Update expected values, add new tests | ~55 | 🟢 Low |
| 5 | `tests/metroidvania-snake.test.js` | Update expected values, add new tests | ~25 | 🟢 Low |
| 6 | `public/gameboy.html` | Fix residual clearInterval→clearTimeout (cleanup) | ~2 | 🟢 Low |

## Implementation Phases

### Phase 1: Constants & Formula Update (P0)

**Dependencies:** None

| Step | File | Change | Priority |
|------|------|--------|----------|
| 1.1 | `public/src/engine/constants.js` | Change `SPEED_SLOPE = 0.02` → `0.05` | P0 |
| 1.2 | `public/src/engine/constants.js` | Add `export const MAX_TICK_INTERVAL = 800;` | P0 |
| 1.3 | `public/src/engine/core.js` | Update `calculateSpeed()` to clamp: `Math.min(raw, MAX_TICK_INTERVAL)` and `Math.max(result, BASE_TICK_INTERVAL)` | P0 |

**Verification:**
- `calculateSpeed(10, 150)` returns 202 (was 171)
- `calculateSpeed(50, 150)` returns 502 (was 291)
- `calculateSpeed(90, 150)` returns 800 (capped)
- `calculateSpeed(400, 150)` returns 800 (capped, not 1341)
- `calculateSpeed(1, 150)` returns 150 (clamped to base)

---

### Phase 2: Engine A Backport & Tuning (P0)

**Dependencies:** Phase 1 (uses same constant values)

| Step | File | Change | Priority |
|------|------|--------|----------|
| 2.1 | `src/gameboy-snake-engine.js` | Add imports/constants: `BASE_TICK_INTERVAL = 150`, `SPEED_SLOPE = 0.05`, `MAX_TICK_INTERVAL = 800` after `STUCK_TICKS` | P0 |
| 2.2 | `src/gameboy-snake-engine.js` | Add `currentTickInterval: BASE_TICK_INTERVAL` to `createInitialState()` return | P0 |
| 2.3 | `src/gameboy-snake-engine.js` | Add `export function calculateSpeed(length, baseInterval)` with same formula + clamping as core.js | P0 |
| 2.4 | `src/gameboy-snake-engine.js` | Add `next.currentTickInterval = calculateSpeed(next.snake.length, BASE_TICK_INTERVAL);` at end of `tick()` (before `return next;`) | P0 |

**Verification:**
- Engine A's `calculateSpeed()` matches Engine B's output at all test lengths
- `tick()` updates `state.currentTickInterval` after eating food
- Game loop (if any for Engine A) reads fresh interval

**Key detail:** The public copy (`public/src/gameboy-snake-engine.js`) already has the #50 fix. The source copy (`src/gameboy-snake-engine.js`) needs the full backport. After this phase, both files should be identical in speed logic.

---

### Phase 3: Tests (P0)

**Dependencies:** Phase 1 + Phase 2 (tests need updated constants)

| Step | File | Change | Priority |
|------|------|--------|----------|
| 3.1 | `tests/gameboy-snake.test.js` | Update existing `calculateSpeed` test expectations (length=10: 171→202, length=50: 291→502, length=400: 1341→800) | P0 |
| 3.2 | `tests/gameboy-snake.test.js` | Add new test: length=35 → 390 | P0 |
| 3.3 | `tests/gameboy-snake.test.js` | Add new test: length=90 → 800 (capped at MAX_TICK_INTERVAL) | P0 |
| 3.4 | `tests/gameboy-snake.test.js` | Add new test: length=0 → clamped to BASE_TICK_INTERVAL | P1 |
| 3.5 | `tests/gameboy-snake.test.js` | Add new test: length=-1 → clamped to BASE_TICK_INTERVAL | P1 |
| 3.6 | `tests/gameboy-snake.test.js` | Add new test: currentTickInterval at max length (400) = MAX_TICK_INTERVAL | P0 |
| 3.7 | `tests/gameboy-snake.test.js` | Add new test: currentTickInterval decreases after tail loss | P1 |
| 3.8 | `tests/metroidvania-snake.test.js` | Update existing test expectations for calculateSpeed (if any) | P0 |
| 3.9 | `tests/metroidvania-snake.test.js` | Add new test: currentTickInterval capped at MAX_TICK_INTERVAL | P0 |

**Verification:**
- All P0 tests pass
- Existing test suite (SNES-12 play test) passes without regression
- Test coverage includes: all tuned length points, clamping boundaries, edge cases

---

### Phase 4: Cleanup & Residual Fixes (P1)

**Dependencies:** None (independent, can be done anytime)

| Step | File | Change | Priority |
|------|------|--------|----------|
| 4.1 | `public/gameboy.html` | Change `clearInterval(gameLoop)` → `clearTimeout(gameLoop)` in touch/mobile event handlers (lines ~207, ~214) | P1 |

**Verification:**
- No `clearInterval` calls remain in `gameboy.html` (the loop uses `setTimeout`)
- All `gameLoop` references consistently use `clearTimeout`

---

## Dependency Graph

```
Phase 1 (Constants & Formula)
    │
    ├──► Phase 2 (Engine A Backport)
    │
    └──► Phase 3 (Tests)
              │
              └── (tests need Phase 1 constant values)
    
Phase 4 (Cleanup) ── no dependencies
```

## Verification Checklist

After each phase, run:
- `npx vitest run` — all tests pass
- Manual play test (Engine B): verify speed decreases at mid lengths (20-35) and enemies become threatening
- Manual play test (Engine A): verify speed-length relationship works

## Rollback Plan

If the steeper slope makes early game feel too slow:
1. Restore `SPEED_SLOPE = 0.03` (middle ground) — 50% steeper instead of 150%
2. Or reduce `MAX_TICK_INTERVAL` to 600ms if extreme lengths feel unplayable
3. Or keep `SPEED_SLOPE = 0.02` and add a non-linear penalty only at mid lengths
