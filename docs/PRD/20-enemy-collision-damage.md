# Research: 撞到红色敌人不会掉血

> Parent Issue: #20
> Agent: research-agent
> Date: 2026-07-07

---

## 1. Problem Definition

### Current Behavior
玩家蛇头碰到红色敌人时，不会受到伤害，蛇身长度不会减少，分数不会扣减。
具体表现：
- 蛇头撞到敌人头部 → 无任何反应（长度不变，分数不变）
- 蛇头撞到敌人身体段 → 无任何反应
- 敌人移动到蛇头位置 → 无任何反应
- 蛇身长度和分数完全不受影响

### Expected Behavior
根据 PRD #15 设计要求（Section 6: 敌人方块）：
- 玩家蛇头碰到敌人方块，蛇身减少 1 格长度（蛇尾消失一格）
- 分数扣减 5 分（最低为 0）
- 若蛇长度归零，游戏结束

### User Scenarios
- **Scenario A:** 蛇头直接撞向红色敌人 → 预期长度 -1，实际无变化
- **Scenario B:** 蛇头穿过敌人身体段 → 预期长度 -1，实际无变化
- **Scenario C:** 敌人在追逐过程中移动到蛇头位置 → 预期长度 -1，实际无变化
- **Frequency:** 每次玩家与敌人接触时

---

## 2. Root Cause Analysis

### Why Does Current Behavior Exist?
根因是**敌人碰撞检测只检查了敌人的头部位置，没有检查敌人的身体段**。

`collision.js` 中的 `checkSnakeCollision`（第 52 行）：
```js
const enemyIdx = room.entities.enemies.findIndex(e => e.x === head.x && e.y === head.y);
if (enemyIdx >= 0) results.push('enemy');
```

`core.js` 中的 `checkEnemyOverlap`（第 349 行）：
```js
return room.entities.enemies.some(e => e.x === head.x && e.y === head.y);
```

两处都只检查 `e.x` 和 `e.y`（敌人的**头部坐标**），但没有检查 `e.segments[]`（敌人的**身体段坐标**）。

实际上，敌人是有身体段的。`createEnemy` 创建的敌人包含 `segments` 数组，其长度等于 HP：
```js
export function createEnemy(id, x, y, hp = 2) {
  const segments = [];
  for (let i = 0; i < hp; i++) {
    segments.push({ x: x - i, y });
  }
  return { id, x, y, segments, hp, ... };
}
```

`updateEnemies` 更新敌人位置时也会移动身体段：
```js
enemy.segments = [{ x: newX, y: newY }, ...enemy.segments.slice(0, -1)];
```

这意味着蛇头撞到敌人的任何身体段都应该触发碰撞，但目前只有头部被检测。

### Additional Timing Issue
除了身体段检测缺失外，还有一个**时序问题**：

在 `tick()` 函数中，执行顺序是：
1. 检测蛇头碰撞（含敌人检测）
2. 移动蛇身
3. **应用敌人伤害**
4. 更新子弹
5. **更新敌人 AI（敌人移动）** ← 伤害检查之后
6. 更新冷却

由于敌人 AI 在伤害检查之后执行，如果敌人在前一个 tick 中移动到蛇头位置，伤害不会在当帧触发。蛇在下一帧已经移开，导致敌人的移动从未触发伤害。

### Why Change Now?
这是核心 gameplay 机制，直接影响游戏的可玩性和难度平衡。没有敌人碰撞伤害：
- 敌人成为完全无害的装饰物
- 游戏失去核心挑战
- 长度管理（攻击消耗 vs 碰撞损失）的策略平衡被破坏

### Previous Constraints
- 原有设计关注于地图生成和整体架构，碰撞检测的细化被延迟
- `checkSnakeCollision` 在重构时以"点击"（point check）方式实现，没有遍历敌人身体段

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/collision.js` | Collision Detection | `checkSnakeCollision()` 需扩展为检查敌人身体段 |
| `public/src/engine/core.js` | Game Loop | `checkEnemyOverlap()` 需扩展，同时需处理敌人 AI 移动后的二次碰撞检查 |
| `public/src/engine/ai.js` | Enemy AI | `updateEnemies()` 需添加"敌人移到蛇位时触发伤害"的逻辑 |
| `tests/metroidvania-snake.test.js` | Tests | 新增测试用例覆盖敌人身体段碰撞 |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/render/room.js` | Rendering | 如需可视化伤害反馈（闪红等），可能需要修改渲染 |
| `docs/TASKS/20-enemy-collision-damage.md` | Task Doc | 需更新任务列表 |

### Data Flow Impact
```
[Before]
collisionCheck (head only) → move snake → damage (if head hit) → move enemies
                                                                      ↑ snake has already moved past, damage missed

[After]
collisionCheck (head + body segments) → move snake → damage (on any segment hit)
                                                 → move enemies
                                                 → re-check overlap (if enemy steps onto snake)
```

### Documents to Update
- [ ] `docs/PRD/20-enemy-collision-damage.md` (本文件)
- [ ] `docs/TASKS/20-enemy-collision-damage.md` (Plan 阶段创建)
- [ ] `README.md` (可能)

---

## 4. Solution Comparison

### Approach A: 扩展碰撞检测以包含敌人身体段

**Description:** 修改 `checkSnakeCollision` 和 `checkEnemyOverlap`，让它们也检查敌人的身体段。

在 `collision.js` 中：
```js
// 当前：
const enemyIdx = room.entities.enemies.findIndex(e => e.x === head.x && e.y === head.y);

// 改为：
const enemyIdx = room.entities.enemies.findIndex(e =>
  e.x === head.x && e.y === head.y ||
  e.segments.some(s => s.x === head.x && s.y === head.y)
);
```

在 `core.js` 的 `checkEnemyOverlap` 中做同样的修改。

**Pros:**
- 改动最小，聚焦于核心 bug
- 向后兼容，不会破坏已有测试
- 容易验证

**Cons:**
- 未解决敌人 AI 移动后的时序问题（敌人移到蛇位不触发伤害）
- 需要确保 `segments` 数组总存在（防御性检查）

**Risk:** Low — 改动范围小，逻辑简单
**Effort:** 小型（约 30 分钟实现 + 测试）

### Approach B: 碰撞检测 + 时序修复

**Description:** 在 Approach A 的基础上，增加敌人移动后的二次碰撞检查。

在 `tick()` 中，在 `updateEnemies(s)` 之后，添加：
```js
if (s.world && s.snake.length > 0) {
  const overlapAfterEnemyMove = checkEnemyOverlap(s);
  if (overlapAfterEnemyMove) {
    s.snake = s.snake.slice(0, -1);
    s.score = Math.max(0, s.score - 5);
    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
    }
  }
}
```

或者在 `updateEnemies` 中，当敌人要移动到蛇头位置时，直接触发伤害（而不是移动后检查）。

**Pros:**
- 完整覆盖所有碰撞场景（蛇撞敌 + 敌撞蛇）
- 更符合直觉：无论谁移动到谁的位置，都应该触发伤害

**Cons:**
- 二次检查可能导致同一帧内蛇头同时撞到两个敌人时触发两次伤害（需防御）
- 需要引入冷却机制或标记，防止同一帧多次扣血

**Risk:** Medium — 需要仔细处理二次检查的边界条件
**Effort:** 中型（约 1-2 小时实现 + 测试）

### Approach C: 敌人移动时主动检测蛇位置并触发伤害（AI 层解决方案）

**Description:** 在 `updateEnemies` 中，当敌人要移动到一个格子时，检查该格子是否被蛇头占据。如果是，则在 AI 层直接触发伤害，而不是依赖碰撞检测系统。

```js
// 在 updateEnemies 中，尝试移动前：
const snakeHead = newState.snake[0];
if (newX === snakeHead.x && newY === snakeHead.y) {
  // 敌人在移动中撞到了蛇头 → 触发伤害
  // 不移动敌人（或移动后立即触发伤害）
}
```

**Pros:**
- 从源头解决问题：在敌人移动时主动检测
- 更精确的碰撞行为（敌人撞到蛇头时停止移动）

**Cons:**
- 伤害逻辑散布到 AI 模块，耦合增加
- 需要从 AI.js 中访问 snake 状态（已有 snakeHead，但需要修改 snake 数据）
- 与其他方法的伤害逻辑不一致

**Risk:** Medium — 跨模块耦合增加
**Effort:** 中型（约 1-2 小时）

### Recommendation
→ **Approach B** 因为：
1. Approach A 只修复了部分问题（蛇主动撞敌），但玩家更常见的体验可能是被敌人追逐时撞到
2. 时序问题（敌撞蛇）在实际游戏中更频繁发生，因为敌人 AI 会主动追逐玩家
3. 二次检查的成本忽略不计（仅检查当前房间的少量敌人）
4. 需要添加帧内伤害冷却标记防止单帧多次扣血

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 蛇头直接撞向敌人头部 → 长度 -1，分数 -5
2. 蛇头穿过敌人身体段 → 长度 -1，分数 -5
3. 敌人移动到蛇头位置 → 长度 -1，分数 -5

### Edge Cases
1. **蛇长度 = 1 时撞敌：** 长度归零，游戏结束
2. **蛇同时撞到多个敌人：** 应只触发一次伤害（每帧最多一次敌人伤害）
3. **蛇撞敌的同时也吃到食物：** 食物先增长，敌人再减少 → 净效果不变（长度不变）
4. **蛇撞到敌人身体段但头部不在同一格：** 身体段碰撞应触发伤害
5. **敌人在门附近撞到蛇：** 伤害应正常触发

### Failure Paths
1. **蛇头在敌人移动后（二次检查时）已不在原位：** 不需要触发伤害，蛇已经离开
2. **segments 数组为空：** 降级为只检查头部位置（防御性编程）

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/core.js` | Stable | Low |
| `public/src/engine/collision.js` | Stable | Low |
| `public/src/engine/entities.js` | Stable | Low |
| Metroidvania engine (#15) | Merged (PR #18) but not on master | Medium — 当前 research 基于 implement/15- 分支 |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Issue #21 (子弹打敌人不减长度) | Same area — may share fixes |
| Issue #22 (障碍物死亡惩罚) | Same area — collision system |

### Preparation Needed
- [ ] 确认 `implement/15-metroidvania-snake-overhaul` 分支已合并到 master（PR #18）
- [ ] 编写测试用例覆盖身体段碰撞

---

## 7. Spike / Experiment (Optional)

### Question to Answer
是否有必要在 tick 中引入"帧内伤害冷却"来防止单帧多次扣血？

### Method
分析在不同场景下，蛇头在同一帧内可能接触到多少个敌人：
- 敌人不会重叠放置（`placeEnemiesAndItems` 中有占位检查）
- 敌人移动不会走到另一个敌人的位置（`updateEnemies` 中有 `occupied` 检查）
- 潜在风险：蛇头同时处于"撞到敌人头部"和"撞到敌人身体段"的位置

### Result
最多同时触发两次（头部 + 身体段，但身体段包含头部坐标）。引入一个 `enemyDamagedThisTick` 布尔标记即可解决。

### Impact on Approach
对 Approach B 无重大影响，添加 t 标记即可。
