# Tasks: #20 — 撞到红色敌人不会掉血

| 字段 | 值 |
|------|----|
| Issue | #20 |
| 优先级 | P0 |

## Overview

修复撞到红色敌人不掉血的问题。核心问题：AI 阶段的移动后碰撞检测缺失。修复方案：在 AI 移动后增加第二次重叠检查，防止 AI 阶段移动到蛇上，并防止同 tick 内重复扣血。Agent: research-agent, Date: 2026-07-07.

## Phase 1: Fix Core Collision Timing (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/core.js` | After `updateEnemies(s)` in `tick()`, add a second overlap check. If snake head overlaps any enemy after AI movement, apply same damage logic as the existing pre-move check. Must prevent double-damage with a flag | 无 | P0 |
| 1.2 | `public/src/engine/ai.js` | In `updateEnemies()`, before executing enemy move, check if target cell is occupied by any snake segment. If yes, skip the move (enemy stays in place) | 无 | P0 |
| 1.3 | `public/src/engine/core.js` | Use a flag (e.g., `_enemyDamageApplied`) to track if damage was already dealt in the current tick. Post-AI check only applies if flag is not set. Reset at tick start | 1.1 | P0 |

## Phase 2: Edge Case Tests (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `tests/metroidvania-snake.test.js` | AI-phase enemy collision test: enemy moves onto snake during AI phase → snake loses 1 length | 1.1, 1.2 | P0 |
| 2.2 | `tests/metroidvania-snake.test.js` | Enemy-snake head overlap persistence test: snake and enemy share same cell for multiple ticks → damage only on first tick (no double-damage) | 1.3 | P0 |
| 2.3 | `tests/metroidvania-snake.test.js` | Snake length=1 collision death test: snake with 1 segment hits enemy → gameover | 1.1 | P0 |
| 2.4 | `tests/metroidvania-snake.test.js` | Multiple enemies AI-collision test: two enemies move onto snake in same tick → both independently checked | 1.1, 1.2 | P0 |
| 2.5 | `tests/metroidvania-snake.test.js` | Food + enemy same cell test: cell has both food and enemy → enemy damage applied first | 1.1 | P0 |

## Phase 3: Verification (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | — (Manual: test suite) | Run full test suite — all 43 existing tests + new tests pass | 2.1-2.5 | P1 |
| 3.2 | — (Manual: gameplay) | Manual gameplay test — open `public/gameboy.html`, verify enemy collision works in actual gameplay | 1.1-1.3 | P1 |
| 3.3 | — (Manual: regression) | Regression: projectile collision still works — enemies still die from bullets | 1.1 | P1 |

## Total Effort Estimate

**~4 hours** (research already done; this is implementation + testing)

## Implementation Notes

### Approach Detail: Post-AI Collision Check (core.js)

```js
// In tick(), after updateEnemies(s):
s = updateEnemies(s);

// Post-AI enemy collision check
if (s.world && s.gameState === 'playing') {
  const head = s.snake[0];
  const { rx, ry } = worldToRoomCoords(head.x, head.y);
  const room = getRoomAt(s.world, rx, ry);
  if (room) {
    const aiOverlap = room.entities.enemies.some(e => e.x === head.x && e.y === head.y);
    if (aiOverlap && !s._enemyDamageApplied) {
      s.snake = s.snake.slice(0, -1);
      s.score = Math.max(0, s.score - 5);
      s._enemyDamageApplied = true;
      if (s.snake.length === 0) {
        s.gameState = 'gameover';
        return s;
      }
    }
  }
}
```

### Approach Detail: Prevent Enemy Moving onto Snake (ai.js)

In `updateEnemies()`, inside the enemy move block:

```js
const onSnake = newState.snake.some(s => s.x === newX && s.y === newY);
if (!onSnake && cellType === 0 && !occupied) {
  enemy.x = newX;
  enemy.y = newY;
  // ...
}
```

### Double-Damage Prevention

Set `_enemyDamageApplied` when pre-move collision applies damage. Check and respect this flag in the post-AI check. Reset at the top of `tick()` or simply don't carry it to the next tick.

## Dependency Graph

```
Phase 1 (Core Fix)
├─ 1.1 (post-AI collision check) ─────────┐
├─ 1.2 (prevent enemy onto snake) ────────┤
├─ 1.3 (double-damage flag)     ←── 1.1   │
                                            │
Phase 2 (Tests)                              │
├─ 2.1 (AI-phase test) ───────────────────┤
├─ 2.2 (persistence test)  ←── 1.3        │
├─ 2.3 (length=1 death)    ───────────────┤
├─ 2.4 (multi-enemy test)  ←── 1.1+1.2    │
├─ 2.5 (food+enemy cell)   ───────────────┤
                                            │
Phase 3 (Verification)                      │
├─ 3.1 (full test suite)   ←── 2.1-2.5    │
├─ 3.2 (manual playtest)   ←── 1.1-1.3    │
├─ 3.3 (projectile regression) ───────────┤
                                            │
All done ────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估时间 |
|------|----------|----------|
| `public/src/engine/core.js` | 修改（后AI碰撞检查 + 防重复扣血） | 0.75h |
| `public/src/engine/ai.js` | 修改（防敌人走到蛇上） | 0.5h |
| `tests/metroidvania-snake.test.js` | 修改（新增 5 个测试用例） | 2h |
