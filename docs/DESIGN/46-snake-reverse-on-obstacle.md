# Design: #46 — 蛇撞到障碍后反向 (Snake Reverse on Obstacle)

> Parent Issue: #46
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

### Issue Summary

**#46:** 蛇撞到非即死障碍（WALL/STONE_WALL/room boundary）后，不应只是减少一段长度，而应：
1. 短暂 **stuck（停滞）**（~4-6 ticks），蛇不动，玩家可缓冲方向
2. 蛇尾变蛇头，整条蛇 **反向运动**
3. 保留已有反馈（屏幕震动、扣分）

### Research Summary

Research branch `research/46-snake-reverse-on-obstacle` was completed (committed as `9eb12b5`). The full PRD is in `docs/PRD/46-snake-reverse-on-obstacle.md`.

**Recommended approach: Approach A** — Stuck+Reverse state machine inside `tick()`
- Minimal change: add `stuckCounter`/`pendingReverse` to state, no new `gameState`
- Reuse existing `'damage'` collision return value from `checkSnakeCollision()`
- Stuck is synchronous (tick-count based), no async needed
- Direction buffering continues during stuck period

### Architecture Flow

```
tick N:   damaged → stuckCounter=5, snake frozen, screen shake
tick N+1: stuckCounter=4, frozen
tick N+2: stuckCounter=3, frozen
tick N+3: stuckCounter=2, frozen
tick N+4: stuckCounter=1, frozen
tick N+5: stuckCounter=0 → reverse! snake moves in new direction
```

Total stuck time: 5 ticks × 150ms = 750ms

---

## 2. Detailed Design

### 2.1 Phase 1: Core Logic — Stuck + Reverse State Machine

**Files:**
- `public/src/engine/constants.js` — Add `STUCK_TICKS = 5`
- `public/src/engine/core.js` — Core tick() changes (~50-60 lines)

**Detailed changes to `core.js`:**

1. **`createInitialState()`** — Add two new fields:
   ```js
   stuckCounter: 0,        // ticks remaining in stuck state
   pendingReverse: false,  // flag: reverse queued after stuck expires
   ```

2. **`tick()` top** — Add stuck handling **after** `gameState !== 'playing'` guard but **before** direction application:
   ```js
   if (s.stuckCounter > 0) {
     s.tickCount++;
     s.stuckCounter--;
     if (s.stuckCounter === 0) {
       // Execute reverse
       s.snake = s.snake.reverse();
       s.direction = { x: -s.direction.x, y: -s.direction.y };
       s.nextDirection = { x: s.direction.x, y: s.direction.y };
       s.pendingReverse = false;
       // Safety: if new head is in obstacle, push one more step
       const newHead = { x: s.snake[0].x + s.direction.x, y: s.snake[0].y + s.direction.y };
       const check = checkSnakeCollision(newHead, s.snake, { ...s });
       if (check.includes('damage') || check.includes('death')) {
         s.snake[0] = newHead;
       }
       // Decay screen shake
       if (s.screenShake) { s.screenShake = null; }
       return s;
     }
     return s; // still stuck, no movement
   }
   ```

3. **Damage branch** — Replace length-1 with stuck setup:
   ```js
   if (collidedDamage) {
     s.stuckCounter = STUCK_TICKS;
     s.pendingReverse = true;
     s.screenShake = { intensity: 4, duration: 8 }; // enhanced shake
     s.score = Math.max(0, s.score - 5);
     // Don't move head, don't remove tail
     return s; // skip rest of tick processing
   }
   ```

4. **`changeDirection()`** — No change needed; already accepts input regardless of state fields.

### 2.2 Phase 2: Rendering — Stuck Visual Feedback

**Files:**
- `public/src/render/renderer.js` ~5-10 lines
- `public/src/render/hud.js` ~5 lines (optional)

**renderer.js:**
- In `render()`, before rendering, check `state.stuckCounter > 0`:
  - Flash snake alpha (every other tick): `alpha = (stuckCounter % 2 === 0) ? 0.4 : 1.0`
  - Or tint snake segments with a warning color

**HUD (optional):**
- Show "⚠️ STUCK!" warning text when stuckCounter > 0

### 2.3 Phase 3: Classic Engine Sync — `src/gameboy-snake-engine.js`

**File:** `src/gameboy-snake-engine.js` ~30-40 lines

The simple engine currently treats ALL wall/self collisions as immediate `gameover`. To support the reverse feature:
- Add `STUCK_TICKS` constant
- Add `stuckCounter`, `pendingReverse` to state
- Modify `tick()`: wall collision → stuck+reverse instead of gameover
- Self collision remains gameover

**Design note:** The simple engine has no `CELL` types — only grid boundaries. So "non-lethal obstacle" = grid boundary (wall). Self collision = gameover (lethal).

### 2.4 Phase 4: Tests

**File:** `tests/metroidvania-snake.test.js` — Add test suite (~6 test cases)

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | Basic stuck+reverse | Snake hits WALL | `stuckCounter` set to STUCK_TICKS, no movement |
| 2 | Stuck duration | tick() called STUCK_TICKS times | After N ticks, snake reversed |
| 3 | Reverse direction | Snake moving RIGHT, hits WALL | After stuck, direction = LEFT |
| 4 | Post-reverse position safety | Snake tail near wall, reverse | New head not in obstacle cell |
| 5 | Input buffering during stuck | Key pressed during stuck | nextDirection updated, applied after reverse |
| 6 | Score penalty | Snake hits WALL | score -= 5 |
| 7 | Edge: snake length=1 | Single segment hits WALL | Reverse works (same cell, direction flips) |

**File:** `tests/gameboy-snake.test.js` — Add similar test suite for classic engine (~4 test cases)
**File:** `tests/play-test.mjs` — Unchanged (play test is pass/fail based on canvas rendering)

### 2.5 Edge Cases & Safety

| Edge Case | Behavior | Mitigation |
|-----------|----------|------------|
| Reverse head in obstacle | Push head one more step in new direction | After reverse, check `checkSnakeCollision()` on new head |
| Snake length = 1 | `snake.reverse()` on 1 element = same array. Direction flips, snake moves away | If opposite wall also present, re-trigger stuck |
| Stuck during room transition corner | Stuck only triggered by `'damage'` collision. Room transitions are `'door'` collision type | No conflict |
| Stuck period double-trigger | When `stuckCounter > 0`, stuck handler returns early before collision check | No double stuck |
| Pause during stuck | Stuck ticks should not decrement (future feature) | For now — no pause, OK |

### 2.6 Dependencies

| Depends On | Status |
|-----------|--------|
| Issue #22 (obstacle death penalty) | ✅ Merged (`9c5c2d5`) |
| `checkSnakeCollision()` returning `'damage'` | ✅ Stable |
| `tick()` damage branch | ✅ Present in `core.js` |

| Blocks | Priority |
|--------|----------|
| Enemy collision reverse | Medium (reuse same stuck+reverse logic) |
| Interactive obstacles | Low |

### 2.7 Implementation Order

1. ✅ Research complete (branch `research/46-snake-reverse-on-obstacle`)
2. 📝 Plan review
3. Phase 1: Core logic (constants.js + core.js)
4. Phase 2: Visual feedback (renderer.js)
5. Phase 3: Classic engine (gameboy-snake-engine.js)
6. Phase 4: Tests
7. Play test & verify

---

## 3. Files Changed

| File | Change Description | Est. Lines | Risk |
|------|--------------------|------------|------|
| `public/src/engine/constants.js` | Add `STUCK_TICKS = 5` | +1 | 🟢 Low |
| `public/src/engine/core.js` | Stuck+reverse state machine in tick() | ~60 | 🟡 Medium |
| `public/src/render/renderer.js` | Stuck visual (flash/alpha) | ~10 | 🟢 Low |
| `public/src/render/hud.js` | Optional: "STUCK!" text | ~5 | 🟢 Low |
| `src/gameboy-snake-engine.js` | Classic engine reverse support | ~40 | 🟡 Medium |
| `tests/metroidvania-snake.test.js` | 7 new test cases | ~80 | 🟢 Low |
| `tests/gameboy-snake.test.js` | 4 new test cases | ~40 | 🟢 Low |

**Total:** ~236 lines across 7 files

---

## 4. Verification Checklist

- [ ] Basic stuck+reverse: Snake hits WALL → `stuckCounter` set to STUCK_TICKS, no movement
- [ ] Stuck duration: tick() called STUCK_TICKS times → after N ticks, snake reversed
- [ ] Reverse direction: snake moving RIGHT, hits WALL → after stuck, direction = LEFT
- [ ] Post-reverse position safety: snake tail near wall, reverse → new head not in obstacle cell
- [ ] Input buffering during stuck: key pressed during stuck → `nextDirection` updated, applied after reverse
- [ ] Score penalty: snake hits WALL → score -= 5
- [ ] Edge: snake length=1 → reverse works (same cell, direction flips)
- [ ] Classic engine: wall collision → stuck+reverse instead of gameover; self collision remains gameover
- [ ] All existing tests pass
- [ ] Manual play test: game renders correctly, stuck visual feedback visible
