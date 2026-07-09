# Tasks: #55 — Snake Self-Collision Non-Lethal (Tail Removal + Stun)

| 字段 | 值 |
|------|----|
| Issue | #55 |
| 优先级 | P1 |

## Overview

实现非致命自碰撞机制（双引擎）：蛇头撞到身体段时，头部原地不动，移除尾部一节，应用眩晕计数器，扣分，保护性判断当蛇长度 ≤ 1 时触发 gameover。设计详见 `docs/DESIGN/55-snake-self-collision.md`。

## Phase 1: Core Implementation (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `src/gameboy-snake-engine.js` (lines 124–127) | Replace self-collision handler: `gameover` → tail pop + stun + score penalty + length-1 guard | 无 | P0 |
| 1.2 | `public/src/engine/core.js` (lines 199–201) | Replace self-collision handler: `gameover` → tail pop + stun + score penalty + screen shake + length-1 guard | 无 | P0 |
| 1.3 | Both engines | Re-run full test suites to confirm no existing functionality regressed | 1.1, 1.2 | P0 |

### Step 1.1 Detail — Engine A Handler

**File:** `src/gameboy-snake-engine.js`
**Location:** `tick()` function, self-collision `if` block (current lines 124–127)
**Change:**
- Remove the existing `next.gameState = 'gameover'` assignment
- Add length-1 guard: `if (next.snake.length <= 1) { next.gameState = 'gameover'; return next; }`
- Set `next.stuckCounter = STUCK_TICKS`
- Set `next.pendingReverse = false`
- Call `next.snake.pop()` to remove one tail segment
- Update score: `next.score = Math.max(0, next.score - 5)`
- Keep the early return pattern

### Step 1.2 Detail — Engine B Handler

**File:** `public/src/engine/core.js`
**Location:** `tickSnakeState()` function, self-collision `if` block (current lines 199–201)
**Change:**
- Retain the `!duringTransition` guard; do NOT remove it
- Remove the existing `s.gameState = 'gameover'` assignment
- Add length-1 guard: `if (s.snake.length <= 1) { s.gameState = 'gameover'; return s; }`
- Set `s.stuckCounter = STUCK_TICKS`
- Set `s.pendingReverse = false`
- Call `s.snake.pop()` to remove one tail segment
- Update score: `s.score = Math.max(0, s.score - 5)`
- Add screen shake: `s.screenShake = { intensity: 4, duration: 8 }`
- Keep the early return pattern

## Phase 2: Test Updates & Edge Case Coverage (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `tests/gameboy-snake.test.js:303` | Test `should set gameState to "gameover" on self collision` → rewrite: assert `gameState` stays `'playing'`, `snake.length` decreases by 1, `score` decreases by 5, `stuckCounter` is set | 1.1 | P0 |
| 2.2 | `tests/gameboy-snake.test.js:534` | Test `should still trigger gameover on self collision, not stuck` → rewrite: assert self-collision now triggers stun (not gameover, not stuck reverse) | 1.1 | P0 |
| 2.3 | `tests/metroidvania-snake.test.js` | If any test asserts `gameState === 'gameover'` on self-collision for Engine B, update to assert the new behavior | 1.2 | P0 |
| 2.4 | New test (Engine A) | Add test: length-1 guard — snake of length 2 self-collides → pop reduces to length 1 → gameover triggered | 1.1, 2.1 | P0 |
| 2.5 | New test (Engine B) | Add test: length-1 guard — snake of length 2 self-collides → pop reduces to length 1 → gameover triggered | 1.2, 2.3 | P0 |
| 2.6 | New test (Engine B) | Add test: duringTransition flag protects against false-positive self-collision | 1.2, 2.3 | P0 |
| 2.7 | New test (both) | Add test: self-collision at score 0 → score stays at 0 (no negative score) | 1.1, 1.2 | P1 |
| 2.8 | New test (Engine B) | Add test: simultaneous self-collision + food → self-collision handled, food not consumed | 1.2, 2.3 | P1 |

## Phase 3: Polish & Validation (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | Both engines | Run full test suite + manual playtest to verify wall, enemy, food, obstacle collisions not regressed | 2.1–2.6 | P1 |
| 3.2 | Both engines | Verify edge case: rapid successive self-collisions in a tight corridor (spiral pattern) | 1.1, 1.2 | P1 |
| 3.3 | Engine B | Verify that `duringTransition` protection still works after code change (test + visual inspection if possible) | 1.2, 2.6 | P1 |
| 3.4 | Engine A | Manual playtest — verify no visual glitch when snake length decreases mid-game | 1.1 | P1 |
| 3.5 | Engine B | Manual playtest — verify screen shake is noticeable but not disorienting with `intensity: 4, duration: 8` | 1.2 | P1 |
| 3.6 | Both engines | Confirm collision handler ordering: self-collision is placed before food collision (prevent eating-through-self) | 1.1, 1.2 | P1 |

### Collision Handler Ordering (Step 3.6)

**Engine A (gameboy-snake-engine.js):**
Check that `'self'` is handled before `'food'`. Current behavior checks `'wall'` → `'self'` → `'food'` → ... This order is correct: self-collision before food.

**Engine B (core.js):**
Check that `'self'` tag handling appears before food in the collision tag loop. If food is checked first, swap the order so self-collision takes priority.

## Dependency Graph

```
Phase 1 ──────────────────────────────────────────┐
  │                                                  │
  ├─ 1.1 (Engine A handler) ────┐                   │
  │                              ├── 1.3 (regression)│
  └─ 1.2 (Engine B handler) ────┘                   │
                                                     │
Phase 2 ──────────────────────────────────────────┐   │
  │                                                  ├── 3.1 (full suite)
  ├─ 2.1 (update Engine A test) ──┐                 │
  │                                ├── 2.4 (len guard A)│
  ├─ 2.2 (update Engine A test 2) ┘                 │   │
  │                                                  │   │
  ├─ 2.3 (update Engine B test) ──┐                 │   │
  │                                ├── 2.5 (len guard B)│   │
  │                                ├── 2.6 (transition) │   │
  │                                ├── 2.7 (score floor)│   │
  │                                └── 2.8 (self+food)  │   │
                                                     │   │
Phase 3 ──────────────────────────────────────────┘   │
  │                                                      │
  ├─ 3.1 (full regression suite) ← depends on everything│
  ├─ 3.2 (spiral edge case)                             │
  ├─ 3.3 (transition protection verify)                 │
  ├─ 3.4 (Engine A manual playtest)                     │
  ├─ 3.5 (Engine B manual playtest)                     │
  └─ 3.6 (collision order verify)                       │
                                                        │
  All done ──────────────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 |
|------|----------|
| `src/gameboy-snake-engine.js` | 修改（Handler logic: 3 lines replaced with ~8 lines） |
| `public/src/engine/core.js` | 修改（Handler logic: 3 lines replaced with ~10 lines） |
| `tests/gameboy-snake.test.js` | 修改（2 existing tests rewritten, 2 new tests added） |
| `tests/metroidvania-snake.test.js` | 修改（1 existing test updated, ~3 new tests added） |

**No new source files** — all changes are in-place modifications to existing files.
**No collision detection changes** — `collision.js` and the inline collision check remain untouched.
