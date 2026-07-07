# Plan: Issue #20 — 撞到红色敌人，自己不会掉血

> **Plan Agent:** `plan_issue-20`
> **Branch:** `plan_issue-20`
> **Research:** Merged via PR #25 (commit `1ec86a8`)
> **Status:** Planning complete → ready for implementation

---

## 1. Problem Analysis

### Bug Description
蛇头撞到红色敌人时，蛇身不会减少一格长度。敌人会持续追逐蛇头占据同一格，但永远不会触发伤害。

### Root Cause (confirmed by research)
`tick()` 的执行时序存在根本性漏洞：

```
tick() 执行时序（简化）：
  1. 计算 newHead（蛇头下一个位置）
  2. checkSnakeCollision(newHead)  ← 碰撞检测【仅检查蛇头即将到达的位置】
  3. 移动蛇到 newHead
  4. 处理碰撞伤害（使用步骤 2 的结果）
  5. updateEnemies(AI)  ← 敌人在此阶段移动！但碰撞已检查完毕
```

**两个独立漏洞叠加：**

**漏洞 A — AI 移动后的时序漏洞：**
- 步骤 5（AI）的敌人移动发生在所有碰撞检测（步骤 2、4）之后
- 如果敌人在 AI 阶段移动到蛇头所在格，**没有任何后续检查**，伤害丢失
- 实际场景：敌人与蛇头对角线相邻时，蛇先移动，敌人 AI 后移动到蛇头位置 → 零伤害

**漏洞 B — 蛇头碰撞仅检查 `e.x/e.y`，不检查 body segments：**
- `checkSnakeCollision()` 只匹配敌人中心坐标 `e.x, e.y`
- 渲染出来的敌人身体段（`e.segments[]`）没有碰撞体
- 蛇可以无伤穿越敌人身体段

### Affected Files
| File | Role | Change Scope |
|------|------|-------------|
| `public/src/engine/core.js` | 游戏主循环 `tick()` | 新增 AI 后碰撞重检 + 防止双重扣血 |
| `public/src/engine/ai.js` | 敌人 AI `updateEnemies()` | 阻止敌人移动到蛇身上 |
| `public/src/engine/collision.js` | 碰撞检测 | 扩展 enemy collision check 至 enemy body segments |
| `tests/metroidvania-snake.test.js` | 测试 | 新增 5 个测试用例 |

---

## 2. Solution Architecture

### Strategy: 三重保障联合修复

采用 **Approach A + Approach B1 + Approach C** 联合策略：

| Approach | 描述 | 解决的问题 | 文件 |
|----------|------|-----------|------|
| **A** | AI 移动后增加碰撞重检 | 漏洞 A：时序漏洞 | `core.js` |
| **B1** | AI 移动前检查目标格是否被蛇占据 | 漏洞 A：防御性措施 | `ai.js` |
| **C** | 扩展碰撞检测至敌人 body segments | 漏洞 B：身体段无碰撞 | `collision.js` |

### 架构决策

```
tick() 修正后执行时序：

  1. 计算 newHead（蛇头下一个位置）
  2. checkSnakeCollision(newHead)  ← 检查蛇头即将到达的位置（含 body segments）
  3. 移动蛇到 newHead
  4. 处理碰撞伤害（collidedEnemy 或 checkEnemyOverlap）
     → 设 _enemyDamageApplied = true 防止二次扣血
  5. updateEnemies(AI)  ← 敌人移动，但无法移动到蛇身上（B1 保障）
  6. Post-AI 碰撞重检  ← 如果 AI 移动仍然导致重叠，触发伤害
     → 跳过若 _enemyDamageApplied 已为 true
```

### 双重扣血防护
- `_enemyDamageApplied`: tick 级别的布尔标志
- 步骤 4 和 步骤 6 共享此标志，确保最多只扣一次血
- 每个新 tick 自动重置（纯函数式架构中默认不持久化）

---

## 3. Implementation Steps

### Step 1: 扩展碰撞检测至敌人 body segments

**文件：** `public/src/engine/collision.js`

**修改：** `checkSnakeCollision()` 函数中的敌人检测逻辑

```diff
- const enemyIdx = room.entities.enemies.findIndex(e => e.x === head.x && e.y === head.y);
+ const enemyIdx = room.entities.enemies.findIndex(e =>
+   e.x === head.x && e.y === head.y ||
+   e.segments.some(s => s.x === head.x && s.y === head.y)
+ );
```

**文件：** `public/src/engine/core.js`

**修改：** `checkEnemyOverlap()` 函数

```diff
- return room.entities.enemies.some(e => e.x === head.x && e.y === head.y);
+ return room.entities.enemies.some(e =>
+   e.x === head.x && e.y === head.y ||
+   e.segments.some(s => s.x === head.x && s.y === head.y)
+ );
```

**理由：** 渲染时敌人有 body（colored segments），玩家期望身体段也有碰撞体积。等价于"看到即受伤"。

---

### Step 2: 阻止敌人移动到蛇身上

**文件：** `public/src/engine/ai.js`

**修改：** `updateEnemies()` 中的敌人移动逻辑，在移动前检查目标格是否被蛇占据

```diff
+ // Check if target cell is occupied by snake
+ const occupiedBySnake = newState.snake.some(s => s.x === newX && s.y === newY);
+ if (!occupiedBySnake && cellType === 0 && !occupied) {
    enemy.x = newX;
    enemy.y = newY;
    // Also move segments
    if (enemy.segments.length > 0) {
      enemy.segments = [{ x: newX, y: newY }, ...enemy.segments.slice(0, -1)];
    }
  }
```

**理由：** 防御性措施，防止 AI 移动导致蛇敌重叠，降低后续碰撞重检的复杂度。

---

### Step 3: 添加 AI 后碰撞重检

**文件：** `public/src/engine/core.js`

**修改：** `tick()` 函数，在 `updateEnemies(s)` 之后添加：

```js
// Post-AI enemy collision check
if (s.world && s.gameState === 'playing' && !s._enemyDamageApplied) {
  const head = s.snake[0];
  const { rx, ry } = worldToRoomCoords(head.x, head.y);
  const room = getRoomAt(s.world, rx, ry);
  if (room) {
    const aiOverlap = room.entities.enemies.some(e =>
      e.x === head.x && e.y === head.y ||
      e.segments.some(seg => seg.x === head.x && seg.y === head.y)
    );
    if (aiOverlap) {
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

**理由：** 即使有 B1 防御，AI 逻辑可能有特殊情况（如敌人被追赶、房间过渡等）导致重叠。重检作为兜底。

---

### Step 4: 防止双重扣血

**文件：** `public/src/engine/core.js`

**修改：** 现有的敌人碰撞处理逻辑中设置标志：

```diff
  if (enemyDamage) {
    s.snake = s.snake.slice(0, -1);
    s.score = Math.max(0, s.score - 5);
+   s._enemyDamageApplied = true;
    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
    }
  }
```

---

### Step 5: 新增测试用例

**文件：** `tests/metroidvania-snake.test.js`

在 `Phase 4 — Enemy AI` 描述块中添加以下测试：

```js
describe('Issue #20 — Enemy Collision Damage', () => {
  describe('AI-phase enemy collision', () => {
    it('enemy moving onto snake head in AI phase causes damage', () => {
      // Setup: snake and enemy diagonal-adjacent
      // Expect: after tick, snake loses 1 length
    });
  });

  describe('Body segment collision', () => {
    it('snake head hitting enemy body segment causes damage', () => {
      // Setup: enemy body segment where snake head moves to
      // Expect: collision detection returns 'enemy'
    });
  });

  describe('No double-damage in same tick', () => {
    it('pre-move and post-AI collision do not double-stack', () => {
      // Setup: snake moves into enemy head position
      // Expect: snake length decreases by exactly 1, not 2
    });
  });

  describe('Snake length=1 collision death', () => {
    it('length-1 snake hitting enemy -> gameover', () => {
      // Setup: snake with 1 segment, enemy adjacent
      // Expect: gameState === 'gameover'
    });
  });

  describe('Multiple enemies collision', () => {
    it('two enemies overlapping snake in same tick -> one damage event', () => {
      // Setup: two enemies adjacent to snake
      // Expect: one damage tick, snake length -1
    });
  });
});
```

---

## 4. Testing Strategy

### Pre-implementation Baseline
```
npm test  -> 确认所有现有测试通过
```

### Test Categories

| Category | Tests | Verification |
|----------|-------|-------------|
| Unit: Collision | Body segment detection | `checkSnakeCollision` returns `'enemy'` |
| Unit: AI Behavior | Enemy blocked by snake | `updateEnemies` does not move enemy onto snake |
| Integration: Tick | AI post-move collision | `tick()` causes snake length -1 |
| Edge: No double damage | One tick, one damage | `_enemyDamageApplied` flag works |
| Edge: Length=0 death | Game over on zero | `gameState === 'gameover'` |
| Regression | Full test suite | All 50+ tests pass |

### Manual Verification
- Open `index.html`, enter a room with enemies
- Verify: 1) Snake head hits enemy -> damage  2) Enemy AI chase also triggers damage  3) Not instant death

---

## 5. Implementation Order

| Step | Task | File | Effort | Depends On |
|------|------|------|--------|------------|
| 1 | Extend collision to body segments | `collision.js`, `core.js` | 15min | - |
| 2 | Block AI from moving onto snake | `ai.js` | 15min | - |
| 3 | Add post-AI collision re-check | `core.js` | 20min | 1, 2 |
| 4 | Double-damage prevention flag | `core.js` | 5min | 3 |
| 5 | New test cases | `tests/*.test.js` | 30min | 1-4 |
| 6 | Run full tests and fix | - | 15min | 5 |
| 7 | Manual gameplay test | `index.html` | 15min | 6 |

**Total estimate: ~2 hours**

---

## 6. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-----------|--------|------------|
| Double damage in same tick | Medium | High | `_enemyDamageApplied` flag + unit tests |
| Body segment collision regressions | Low | Medium | Unified changes in collision.js + checkEnemyOverlap |
| Projectile collision regression | Low | Low | Projectiles use independent detection path |
| AI trapped by snake body | Low | Low | AI already has idle state for future iteration |

---

## 7. Acceptance Criteria

1. Snake head moves onto enemy cell -> length -1, score -5
2. Enemy AI moves onto snake head -> length -1 (post-AI re-check)
3. Snake head hits enemy body segment (not e.x/e.y) -> length -1
4. At most 1 damage per tick
5. Length reaches 0 -> game over
6. Projectile kills unaffected
7. Food system unaffected
8. All existing + new tests pass
