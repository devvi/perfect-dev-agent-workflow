# Tasks: #54 — Snake Length-Speed Relationship Tuning

| 字段 | 值 |
|------|----|
| Issue | #54 |
| 优先级 | P0 |

## Overview

调整蛇长度与速度的关系曲线：增大 SPEED_SLOPE 使中等长度的蛇速度更慢，增加游戏挑战性。同步更新两个游戏引擎（经典引擎 + 银河城引擎）的公式，并添加 MAX_TICK_INTERVAL 上限防止极端长度下游戏无法进行。

## Phase 1: Constants & Formula Update (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/constants.js` | Change `SPEED_SLOPE = 0.02` → `0.05` | 无 | P0 |
| 1.2 | `public/src/engine/constants.js` | Add `export const MAX_TICK_INTERVAL = 800;` | 无 | P0 |
| 1.3 | `public/src/engine/core.js` | Update `calculateSpeed()` to clamp: `Math.min(raw, MAX_TICK_INTERVAL)` and `Math.max(result, BASE_TICK_INTERVAL)` | 1.1, 1.2 | P0 |

**Verification:**
- `calculateSpeed(10, 150)` returns 202 (was 171)
- `calculateSpeed(50, 150)` returns 502 (was 291)
- `calculateSpeed(90, 150)` returns 800 (capped)
- `calculateSpeed(400, 150)` returns 800 (capped, not 1341)
- `calculateSpeed(1, 150)` returns 150 (clamped to base)

## Phase 2: Engine A Backport & Tuning (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `src/gameboy-snake-engine.js` | Add imports/constants: `BASE_TICK_INTERVAL = 150`, `SPEED_SLOPE = 0.05`, `MAX_TICK_INTERVAL = 800` after `STUCK_TICKS` | 1.1, 1.2 | P0 |
| 2.2 | `src/gameboy-snake-engine.js` | Add `currentTickInterval: BASE_TICK_INTERVAL` to `createInitialState()` return | 2.1 | P0 |
| 2.3 | `src/gameboy-snake-engine.js` | Add `export function calculateSpeed(length, baseInterval)` with same formula + clamping as core.js | 2.1 | P0 |
| 2.4 | `src/gameboy-snake-engine.js` | Add `next.currentTickInterval = calculateSpeed(next.snake.length, BASE_TICK_INTERVAL);` at end of `tick()` (before `return next;`) | 2.2, 2.3 | P0 |

**Verification:**
- Engine A's `calculateSpeed()` matches Engine B's output at all test lengths
- `tick()` updates `state.currentTickInterval` after eating food
- Game loop (if any for Engine A) reads fresh interval

**Key detail:** The public copy (`public/src/gameboy-snake-engine.js`) already has the #50 fix. The source copy (`src/gameboy-snake-engine.js`) needs the full backport. After this phase, both files should be identical in speed logic.

## Phase 3: Tests (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `tests/gameboy-snake.test.js` | Update existing `calculateSpeed` test expectations (length=10: 171→202, length=50: 291→502, length=400: 1341→800) | 1.1, 2.1 | P0 |
| 3.2 | `tests/gameboy-snake.test.js` | Add new test: length=35 → 390 | 1.1 | P0 |
| 3.3 | `tests/gameboy-snake.test.js` | Add new test: length=90 → 800 (capped at MAX_TICK_INTERVAL) | 1.2 | P0 |
| 3.4 | `tests/gameboy-snake.test.js` | Add new test: length=0 → clamped to BASE_TICK_INTERVAL | 1.1 | P1 |
| 3.5 | `tests/gameboy-snake.test.js` | Add new test: length=-1 → clamped to BASE_TICK_INTERVAL | 1.1 | P1 |
| 3.6 | `tests/gameboy-snake.test.js` | Add new test: currentTickInterval at max length (400) = MAX_TICK_INTERVAL | 2.2 | P0 |
| 3.7 | `tests/gameboy-snake.test.js` | Add new test: currentTickInterval decreases after tail loss | 2.2 | P1 |
| 3.8 | `tests/metroidvania-snake.test.js` | Update existing test expectations for calculateSpeed (if any) | 1.1 | P0 |
| 3.9 | `tests/metroidvania-snake.test.js` | Add new test: currentTickInterval capped at MAX_TICK_INTERVAL | 1.2 | P0 |

**Verification:**
- All P0 tests pass
- Existing test suite (SNES-12 play test) passes without regression
- Test coverage includes: all tuned length points, clamping boundaries, edge cases

## Phase 4: Cleanup & Residual Fixes (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `public/gameboy.html` | Change `clearInterval(gameLoop)` → `clearTimeout(gameLoop)` in touch/mobile event handlers (lines ~207, ~214) | 无 | P1 |

**Verification:**
- No `clearInterval` calls remain in `gameboy.html` (the loop uses `setTimeout`)
- All `gameLoop` references consistently use `clearTimeout`

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

## Summary: Changed Files

| 文件 | 变更类型 | 风险 |
|------|----------|------|
| `src/gameboy-snake-engine.js` | 修改（backport #50 fix + apply #54 tuning） | 🟢 Low |
| `public/src/engine/constants.js` | 修改（更新 SPEED_SLOPE, 添加 MAX_TICK_INTERVAL） | 🟢 Low |
| `public/src/engine/core.js` | 修改（更新 calculateSpeed()） | 🟢 Low |
| `tests/gameboy-snake.test.js` | 修改（更新期望值，新增测试） | 🟢 Low |
| `tests/metroidvania-snake.test.js` | 修改（更新期望值，新增测试） | 🟢 Low |
| `public/gameboy.html` | 修改（clearInterval → clearTimeout） | 🟢 Low |
