# Tasks: #118 — 敌人对玩家蛇的攻击迭代 (Enemy Attack on Player Snake Iteration)

| 字段 | 值 |
|------|----|
| Issue | #118 |
| 优先级 | P1 |

## Overview

迭代敌人对玩家蛇的攻击机制。核心改动：(1) 被敌人击中后，蛇身最后一格掉落变为食物 (2) 敌人 AI 会优先追逐掉落的食物 (3) 玩家有短暂的 invulnerability（闪烁）。Agent: research-agent, Date: 2026-07-11.

## Phase 1: Enemy Collision — Food Drop + Invulnerability (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/constants.js` | Add constant: `INVULNERABLE_TICKS = 10` (or similar) | 无 | P0 |
| 1.2 | `public/src/engine/core.js` | In `createInitialState()`, add `invulnerableTicks: 0` to initial state | 无 | P0 |
| 1.3 | `public/src/engine/core.js` | In `tick()`, modify the enemy collision block (line ~276-290): save last segment position before removal; call `room.entities.food.push({x, y})` at that position; set `s.invulnerableTicks = INVULNERABLE_TICKS`; add screen shake effect | 1.1, 1.2 | P0 |
| 1.4 | `public/src/engine/core.js` | In `tick()`, add invulnerability counter decrement each tick: `if (s.invulnerableTicks > 0) s.invulnerableTicks--` | 1.3 | P0 |
| 1.5 | `public/src/engine/core.js` | Guard enemy collision detection: skip damage if `s.invulnerableTicks > 0` | 1.4 | P0 |

## Phase 2: Enemy AI — Food Chase Behavior (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/src/engine/ai.js` | Add function `findNearestFood(enemy, room)` — scan food items in room, return closest one by Manhattan distance | 无 | P0 |
| 2.2 | `public/src/engine/ai.js` | In `updateEnemies()`, before the player-chase block: check if food exists in room. If yes, use `enemyChasePath()` targeting the nearest food instead of snake head | 2.1 | P0 |
| 2.3 | `public/src/engine/ai.js` | When enemy reaches food cell (enemy.x/y === food.x/y): `enemy.hp += 1`, `enemy.segments.push({x, y})`, remove food from `room.entities.food` | 2.2 | P0 |
| 2.4 | `public/src/engine/ai.js` | Fallback: if no food in room, chase player as before (current behavior) | 2.2 | P0 |

## Phase 3: Visual Feedback — Invulnerability Flashing (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/render/room.js` | During render, check `state.invulnerableTicks > 0`. If yes, toggle snake rendering visibility every 2 ticks (flashing effect) | 1.4 | P1 |
| 3.2 | `public/src/render/hud.js` | Optional: show invulnerability indicator icon/glow on HUD | 1.4 | P2 |

## Phase 4: Edge Case Tests (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `tests/metroidvania-snake.test.js` | Test: snake hits enemy → last segment drops as food at correct world position | 1.3 | P1 |
| 4.2 | `tests/metroidvania-snake.test.js` | Test: after hit, snake gains `invulnerableTicks > 0` → enemy collision on next tick deals no damage | 1.4, 1.5 | P1 |
| 4.3 | `tests/metroidvania-snake.test.js` | Test: invulnerability expires after N ticks → enemy collision deals damage again | 1.4, 1.5 | P1 |
| 4.4 | `tests/metroidvania-snake.test.js` | Test: enemy chases food when food exists in room → enemy pathfinds toward food, not player | 2.1, 2.2 | P1 |
| 4.5 | `tests/metroidvania-snake.test.js` | Test: enemy eats food → hp+1, segments length+1, food removed from room | 2.3 | P1 |
| 4.6 | `tests/metroidvania-snake.test.js` | Test: snake with length=1 hit by enemy → game over (food still drops but no snake to eat it) | 1.3 | P1 |
| 4.7 | `tests/metroidvania-snake.test.js` | Test: player eats dropped food → snake length+1, score+10 | 无 (existing food-eat logic) | P1 |

## Phase 5: Verification (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 5.1 | — (Manual: test suite) | Run full test suite — all existing + new tests pass | 4.1-4.7 | P1 |
| 5.2 | — (Manual: gameplay) | Manual gameplay test in browser — verify food drop, enemy chases food, invulnerability flashing works | 1.1-1.5, 2.1-2.4, 3.1 | P1 |
| 5.3 | — (Manual: regression) | Regression: projectile still kills enemies, enemy-snake collision still applies (when not invulnerable) | 1.3-1.5 | P1 |

## Total Effort Estimate

**~4-5 hours** (research already done; implementation + testing)

## Implementation Notes

### Food Drop Logic (core.js)

```js
// In tick(), replace the existing enemy damage block (lines 276-290):
if (enemyDamage) {
  // Record last segment position before removal
  const lastSeg = s.snake[s.snake.length - 1];
  const lastSegPos = { x: lastSeg.x, y: lastSeg.y };

  // Remove last segment
  s.snake = s.snake.slice(0, -1);

  // Drop food at last segment position (only if world exists)
  if (s.world) {
    const { rx, ry } = worldToRoomCoords(lastSegPos.x, lastSegPos.y);
    const room = getRoomAt(s.world, rx, ry);
    if (room) {
      room.entities.food.push({ x: lastSegPos.x, y: lastSegPos.y });
    }
  }

  // Set invulnerability
  s.invulnerableTicks = INVULNERABLE_TICKS;
  
  s.screenShake = { intensity: 3, duration: 6 };
  s.score = Math.max(0, s.score - 5);

  if (s.snake.length === 0) {
    s.gameState = 'gameover';
    return s;
  }
}
```

### Food Chase AI (ai.js)

```js
// In updateEnemies(), modify the snakeInRoom block:

if (snakeInRoom) {
  enemy.aiState = 'chase';
  
  // Check if food exists and should be chased
  const nearestFood = findNearestFood(enemy, room);
  let target;
  
  if (nearestFood) {
    // If invulnerableTicks > 0 (player just got hit), prioritize food
    // Otherwise, chase food if enemy is nearer to it than to player
    target = nearestFood;
  } else {
    target = snakeHead;
  }
  
  const move = enemyChasePath(enemy, target, room, world);
  // ... rest of move logic
}

// New helper:
function findNearestFood(enemy, room) {
  let nearest = null;
  let minDist = Infinity;
  for (const food of room.entities.food) {
    const dist = Math.abs(enemy.x - food.x) + Math.abs(enemy.y - food.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = food;
    }
  }
  return nearest;
}
```

### Invulnerability Guard (core.js)

```js
// At the top of tick(), or before enemy collision check:
// Don't apply enemy damage if invulnerable
if (enemyDamage && s.invulnerableTicks > 0) {
  // Skip damage, but still move snake normally
  // Don't eat food check for enemy collision if invulnerable
} else if (enemyDamage) {
  // Do damage (food drop logic above)
}

// Decrement invulnerability
if (s.invulnerableTicks > 0) {
  s.invulnerableTicks--;
}
```

### Flashing Visual (render)

```js
// In render, when drawing the snake:
if (state.invulnerableTicks > 0) {
  // Toggle visibility every 2 ticks
  const flashOn = Math.floor(state.invulnerableTicks / 2) % 2 === 0;
  if (!flashOn) {
    // Don't render snake body (or render with low alpha)
    return; // or skip drawing
  }
}
```

## Dependency Graph

```
Phase 1 (Food Drop + Invulnerability)
├─ 1.1 (INVULNERABLE_TICKS constant) ─────────────────┐
├─ 1.2 (invulnerableTicks in initialState) ────────────┤
├─ 1.3 (food drop on enemy collision)    ←── 1.1      │
├─ 1.4 (invulnerability tick decrement)  ←── 1.2,1.3  │
├─ 1.5 (invulnerability damage guard)    ←── 1.4      │
                                                       │
Phase 2 (Enemy AI Food Chase)                          │
├─ 2.1 (findNearestFood helper)         ──────────────┤
├─ 2.2 (food-priority pathfinding)      ←── 2.1       │
├─ 2.3 (enemy eats food → grows)        ←── 2.2       │
├─ 2.4 (fallback to player chase)       ←── 2.2       │
                                                       │
Phase 3 (Visual Flashing)                              │
├─ 3.1 (flashing render in room.js)     ←── 1.4       │
├─ 3.2 (HUD indicator — optional)       ←── 1.4       │
                                                       │
Phase 4 (Tests)                                        │
├─ 4.1 (food drop test)                 ←── 1.3       │
├─ 4.2 (invulnerability test)           ←── 1.4,1.5   │
├─ 4.3 (invulnerability expiry test)    ←── 1.4,1.5   │
├─ 4.4 (food chase test)                ←── 2.1,2.2   │
├─ 4.5 (enemy eats food test)           ←── 2.3       │
├─ 4.6 (length=1 death test)            ←── 1.3       │
├─ 4.7 (player reclaims food test)      ──────────────┤
                                                       │
Phase 5 (Verification)                                 │
├─ 5.1 (full test suite)                ←── 4.1-4.7   │
├─ 5.2 (manual playtest)                ←── 1-3       │
├─ 5.3 (projectile regression)          ──────────────┤
                                                       │
All done ───────────────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估时间 |
|------|----------|----------|
| `public/src/engine/core.js` | 修改（食物掉落 + invulnerability 管理） | 1.5h |
| `public/src/engine/ai.js` | 修改（食物追逐 AI + 敌人进食逻辑） | 1.5h |
| `public/src/engine/constants.js` | 修改（新增 INVULNERABLE_TICKS） | 0.25h |
| `public/src/render/room.js` | 修改（invulnerability 闪烁渲染） | 0.5h |
| `tests/metroidvania-snake.test.js` | 修改（新增 7 个测试用例） | 2h |
