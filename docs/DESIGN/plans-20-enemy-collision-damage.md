# Design: #20 — 撞到红色敌人不会掉血 — 敌人碰撞伤害修复

> Parent Issue: #20
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

### Approach: Approach B — Collision Detection Extension + Timing Fix

**Chosen over alternatives because:**
- **Approach A** 只修了蛇主动撞敌（查 body segments），但没修敌人移过来撞蛇的时序问题
- **Approach C** 把伤害逻辑分散到 AI 模块，耦合增加
- **Approach B** 解决了两个根本原因：身体段未检测 + 敌人移动后未重检查

### Architecture Change

```
[tick() 当前流程]
  collisionCheck(仅检查敌人头部) → move snake
  → damage(if head hit) → updateEnemies(敌人才移动)
                                           ↑ damage 发生在敌人移动前，时序漏洞

[tick() 修复后流程]
  collisionCheck(检查敌人头部+body segments) → move snake
  → damage (蛇撞到任何敌人段)
  → updateEnemies(敌人移动)
  → post-move overlap check (敌人移到蛇位置 → 再触发伤害)
  → 帧内冷却标记，防止单帧多次扣血
```

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 碰撞检测修改 | 扩展 `checkSnakeCollision` + `checkEnemyOverlap` 检查 body segments | 最少改动，利用现有架构 |
| 时序修复 | 在 `updateEnemies` 后添加 `checkEnemyOverlap` 二次检查 | 不侵入 AI 模块，只在核心循环加一段逻辑 |
| 单帧多次扣血 | 引入 `enemyDamagedThisTick` 布尔标记 | 防御性编程，防止一帧扣多次 |
| 二次检查 body segments | `checkEnemyOverlap` 统一检查 segments | 与碰撞检测逻辑一致 |

---

## 2. Detailed Design

### 2.1 File 1: `public/src/engine/collision.js` — `checkSnakeCollision`

**Change:** 修改敌人碰撞检测行，加入 body segments 检查。

```js
// BEFORE (line ~42-43):
const enemyIdx = room.entities.enemies.findIndex(e => e.x === head.x && e.y === head.y);
if (enemyIdx >= 0) results.push('enemy');

// AFTER:
const enemyIdx = room.entities.enemies.findIndex(e =>
  e.x === head.x && e.y === head.y ||
  (e.segments && e.segments.some(s => s.x === head.x && s.y === head.y))
);
if (enemyIdx >= 0) results.push('enemy');
```

**Impact:** 现有逻辑不变，增加 body segments 的匹配。`e.segments &&` 是防御性检查。

### 2.2 File 2: `public/src/engine/core.js` — `checkEnemyOverlap`

**Change:** 同样修改 `checkEnemyOverlap` 函数，加入 segments 检查。

```js
// BEFORE:
return room.entities.enemies.some(e => e.x === head.x && e.y === head.y);

// AFTER:
return room.entities.enemies.some(e =>
  e.x === head.x && e.y === head.y ||
  (e.segments && e.segments.some(s => s.x === head.x && s.y === head.y))
);
```

### 2.3 File 3: `public/src/engine/core.js` — `tick()` 时序修复

**Change:** 在 `tick()` 开头重置 `enemyDamagedThisTick`，在现有伤害处理后设置该标记，在 `updateEnemies(s)` 后添加二次检查。

```js
// tick() 中，tickCount++ 后：
s.enemyDamagedThisTick = false;

// 现有敌人伤害处理处：
if (enemyDamage) {
  s.snake = s.snake.slice(0, -1);
  s.score = Math.max(0, s.score - 5);
  s.enemyDamagedThisTick = true; // ← 新增

  if (s.snake.length === 0) {
    s.gameState = 'gameover';
    return s;
  }
}

// updateEnemies 之后，新增：
if (s.world && !s.enemyDamagedThisTick) {
  const postMoveOverlap = checkEnemyOverlap(s);
  if (postMoveOverlap) {
    s.snake = s.snake.slice(0, -1);
    s.score = Math.max(0, s.score - 5);
    s.enemyDamagedThisTick = true;
    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
    }
  }
}
```

### 2.4 File 4: `tests/metroidvania-snake.test.js` — 新增测试用例

Add test cases covering:
- Snake head colliding with enemy head → length -1
- Snake head colliding with enemy body segment → length -1
- Score -5 (min 0) on enemy collision
- Game over on length-1 snake hitting enemy
- Single damage per tick (帧内冷却)

**新增辅助函数：**
```js
function genTestWorld() {
  const room = createRoom(0, 0);
  for (let y = 0; y < ROOM_SIZE; y++) {
    for (let x = 0; x < ROOM_SIZE; x++) {
      room.tiles[y][x] = 0; // CELL.FLOOR
    }
  }
  return { rows: 1, cols: 1, rooms: [[room]] };
}
```

### 2.5 Dependencies Between Tasks

```
T1 (collision.js: checkSnakeCollision — add body segment check)
  │
  ├──→ T2 (core.js: checkEnemyOverlap — add body segment check)
  │         │
  │         └──→ T3 (core.js: tick() — add post-move overlap check + frame damage guard)
  │                    │
  │                    └──→ T4 (tests)
```

### 2.6 Edge Cases and Risks

| # | Scenario | Expected Behavior | Risk |
|---|----------|-------------------|------|
| 1 | 蛇头撞到敌人头部 + 身体段同时 | 只触发一次伤害 — `enemyDamagedThisTick` 保护 | Low |
| 2 | 蛇长度 = 1 时撞敌 | 长度 = 0 → gameover | Low |
| 3 | 蛇撞敌同时吃到食物 | 食物先增长，敌人再减 → 净效果不变 | Medium |
| 4 | 敌人在门附近撞到蛇 | 正常触发伤害 | Low |
| 5 | segments 数组为空 | 降级到只检查头部 — `e.segments &&` 防御 | Low |
| 6 | 敌人一次移动跨过蛇头 | 走完 tick 后重叠检查发现 | Low |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `enemyDamagedThisTick` 被其他代码路径影响 | Low | Medium | 修饰符作用域局域在 tick() 内 |
| 食物增长和扣血的顺序导致净效果不对 | Medium | Medium | 确认 tick 顺序后调整 |
| 现有测试因为修复而失败 | Medium | Low | 确保不改变已有正常行为 |

### 2.7 Implementation Order

- Phase A: Collision Detection Fix (T1) — collision.js, ~3 lines
- Phase B: Overlap Check Fix (T2) — core.js, ~3 lines
- Phase C: Tick Timing Fix (T3) — core.js, ~20 lines
- Phase D: Tests (T4) — test file, ~200 lines

---

## 3. Files Changed

| File | Change Type | Lines Changed |
|------|-------------|--------------|
| `public/src/engine/collision.js` | Modify `checkSnakeCollision` enemy detection | +3 |
| `public/src/engine/core.js` | Modify `checkEnemyOverlap` + `tick()` timing fix | ~25 |
| `tests/metroidvania-snake.test.js` | Add new describe block + helper | ~200 |

---

## 4. Verification Checklist

- [ ] Snake head colliding with enemy head → length -1, score -5
- [ ] Snake head colliding with enemy body segment → length -1, score -5
- [ ] Score does not go below 0 on enemy collision
- [ ] Game over when snake length becomes 0 after enemy collision
- [ ] Only one damage per tick even with multiple enemies (帧内冷却)
- [ ] Walk snake into red enemy head → length -1, score -5 (manual)
- [ ] Walk snake through enemy body segments → damage (manual)
- [ ] Stay still while enemy chases and steps onto snake head → damage (manual)
- [ ] Length-1 snake touching enemy → game over (manual)
- [ ] `npm test` all tests pass
