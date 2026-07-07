# Research: 子弹攻击到敌人，敌人长度不会减少

> Parent Issue: #21
> Agent: research-agent (subagent)
> Date: 2026-07-07

---

## 1. Problem Definition

### Current Behavior

当玩家发射子弹击中敌人时，敌人长度（段数）和 HP 不会减少。

- 子弹视觉上穿越敌人位置
- 敌人 HP 不变、视觉段数不变
- 敌人仍然持续追逐玩家
- 子弹偶尔看起来"穿过"敌人无效果

### Expected Behavior

根据 #15 Metroidvania 改造的设计：
- 敌人体长等于其 HP（`enemy.hp = enemy.segments.length`）
- 子弹击中敌人 → `enemy.hp -= 1` → `enemy.segments.pop()` → 敌人视觉减短
- HP 归零时从房间移除
- 玩家获得 5 分
- 测试用例 #15 已明确要求

---

## 2. Root Cause Analysis

### Root Cause #1: 碰撞检测在子弹移动之后进行（Ordering Bug）

`public/src/engine/core.js` 中 `tick()` 函数的执行顺序：

```javascript
// tick() in core.js — 第 145-151 行
s = updateProjectiles(s);          // 先移动子弹（跳跃 2 格）
if (s.world) {
  s = handleProjectileCollisions(s); // 后检查碰撞（只在终点）
}
```

子弹在同一 tick 内先被移动，然后才检查碰撞。这意味着：

**场景：蛇头 (30,30)，方向右，敌人在 (31,30) （蛇头正前方 1 格）**

```
tick N:  fire() 被调用
        子弹创建在 (31,30) ← 与敌人同格！
        → 无碰撞检查（fire() 不检查）

tick N+1:  updateProjectiles → 子弹从 (31,30) 移动到 (33,30)
           handleProjectileCollisions → 检查 (33,30) ← 敌人不在那！
           → 永远不会检测到碰撞！
```

子弹每次都是先走再检测，导致 **子弹初始位置和中间位置从未被检查**。

### Root Cause #2: Projectile Speed = 2 导致离散跳跃

默认 `projectileSpeed = 2`，子弹每 tick 跳跃 2 格。

`public/src/engine/combat.js` — `updateProjectiles`：

```javascript
x: proj.x + proj.dir.x * proj.speed,  // 一次跳跃 2 格
y: proj.y + proj.dir.y * proj.speed,
```

碰撞检测只检查终点：

```javascript
// collision.js — checkProjectileCollision
const enemy = room.entities.enemies.find(e => e.x === proj.x && e.y === proj.y);
```

示例：子弹起始于 (11,10)，敌人在 (12,10)
- 子弹路径: 11 → 13（跳过 x=12 的敌人！）
- 50% 概率 miss（速度为偶数时）

### Root Cause #3: 仅检查敌人头部，不检查身体段

`checkProjectileCollision` 只检查 `e.x === proj.x && e.y === proj.y`（头部），
不检查 `e.segments[]`（身体段）。

如果子弹击中敌人身体中间段，也不会触发碰撞。

### Broken Data Flow

```
fire() → createProjectile(蛇头前方1格)
  → tick()
    → updateProjectiles(子弹跳跃2格) ← 先动
    → handleProjectileCollisions(只检查终点) ← 后检
      → checkProjectileCollision(仅头部,100%精确坐标)
        → 50%+ 概率 miss
        → 命中时,applyProjectileDamage 正确减 HP 和 segments
```

**核心问题分为两个层面：**
1. **碰撞检测命中的概率很低**（约 <50%，取决于敌人位置），这是主要问题
2. **当碰撞命中时**，`applyProjectileDamage` 逻辑本身是正确的（已验证）

---

## 3. Affected Files

| File | Line | Issue |
|------|------|-------|
| `public/src/engine/core.js` | ~145-151 | `tick()` 中子弹先移动后检测碰撞，导致初始位置和中间位置被跳过 |
| `public/src/engine/combat.js` | ~54-63 | `updateProjectiles` 一次跳跃 `speed` 格，不保存旧位置 |
| `public/src/engine/collision.js` | ~100-104 | `checkProjectileCollision` 仅检查 `e.x === proj.x`，不检查 `segments[]` |
| `public/src/engine/core.js` | ~163-180 | `handleProjectileCollisions` 未做 line sweep 逐格检测 |
| `tests/metroidvania-snake.test.js` | — | 测试 #15 仅测直接调用 `applyProjectileDamage`，不测完整弹道→碰撞管道 |

---

## 4. Proposed Fix Approaches

### Approach A: Line-Sweep 连续碰撞检测（推荐）

**思路：** 改造 projectile 对象保存旧位置，在碰撞检测时遍历路径上所有单元格。

**具体改动：**

**combat.js — `updateProjectiles`：**
```javascript
active.push({
  ...proj,
  prevX: proj.x,           // ← 新增：保存移动前的位置
  prevY: proj.y,
  x: proj.x + proj.dir.x * proj.speed,
  y: proj.y + proj.dir.y * proj.speed,
  remainingRange: remaining,
});
```

**collision.js — `checkProjectileCollision`：**
```javascript
// 增加身体段检测
const enemy = room.entities.enemies.find(e =>
  e.x === cellX && e.y === cellY ||
  e.segments.some(s => s.x === cellX && s.y === cellY)
);
```

**core.js — `handleProjectileCollisions`：**
```javascript
function handleProjectileCollisions(state) {
  let s = { ...state };
  for (const proj of s.projectiles) {
    // Line sweep: check every cell from prev to current
    const cells = getCellsAlongLine(proj.prevX, proj.prevY, proj.x, proj.y);
    for (const cell of cells) {
      const result = checkProjectileCollisionAt({...proj, x: cell.x, y: cell.y}, s);
      if (result) { /* handle collision */ break; }
    }
  }
}
```

**Pros:**
- 根本性解决：离散跳跃问题完全消除
- 未来扩展不限：支持任意 `projectileSpeed`（power-up 加速到 3/4/5 都能工作）
- 裂缝墙碰撞同步修复
- 性能代价极小（speed=2 时每 tick 多检 1-2 格）

**Cons:**
- 需要修改 projectile 对象结构（加 `prevX`/`prevY`）
- 需要新辅助函数 `getCellsAlongLine`

### Approach B: Swap Order (先检后移) + Speed=1

**思路：** 在 `tick()` 中交换碰撞检测和移动的顺序，并将默认速度降为 1。

```javascript
// core.js — tick()
// 先检测碰撞（使用旧位置）
s = handleProjectileCollisions(s);
// 再移动子弹
s = updateProjectiles(s);
```

加 body segment 检测：
```javascript
// collision.js
const enemy = room.entities.enemies.find(e =>
  e.x === cellX && e.y === cellY ||
  e.segments.some(s => s.x === cellX && s.y === cellY)
);
```

**Pros:**
- 代码改动极小
- 初始位置碰撞问题完全解决（先检后移）
- 速度=1 时无跳跃

**Cons:**
- 速度锁定为 1，未来 bullet speed power-up 会重新引入跳过问题
- 战斗节奏变慢
- 不是根本性解决方案

### Approach C: 保留现有逻辑 + 额外检查初始位置

**思路：** 在 `tick()` 中，在 `updateProjectiles` 之前额外跑一次碰撞检测。

```javascript
// core.js
s = handleProjectileCollisionsAtCurrentPositions(s);  // 检查移动前位置
s = updateProjectiles(s);
s = handleProjectileCollisions(s);                     // 检查移动后位置
```

**Pros:** 代码改动极小

**Cons:** 中间格子仍然被跳过（speed=2 跳过的格子永远不被检查）

---

## 5. Recommendation

**Approach A: Line-Sweep 连续碰撞检测** 是最佳方案，因为：

1. **根本性解决离散跳跃问题**，不限于特定速度值
2. **敌人身体段碰撞**同步修复
3. **未来扩展不受限**：power-up 加速到 3/4/5 仍能正确工作
4. **性能代价极小**：JS 中 2000+ 次整数比较不到 0.3ms

**具体实施步骤（Plan/Implement 阶段）：**
1. 修改 `updateProjectiles` 保存 `prevX`/`prevY`
2. 新增 `getCellsAlongLine(prevX, prevY, newX, newY)` 辅助函数
3. 修改 `checkProjectileCollision` 接受坐标参数并检查 body segments
4. 修改 `handleProjectileCollisions` 做 line sweep
5. 添加测试：子弹跳过中间格、身体段命中、speed=3 场景

---

## 6. Test Cases to Add

1. **子弹跳过检测**：speed=2，敌人位于中间格，应命中
2. **身体段命中**：子弹击中 `segments[1]` 而非头部，应命中
3. **速速度为 3（power-up）**：子弹跳 3 格，敌人位于中间格，应命中
4. **极限命中**：子弹路径经过 2 个敌人，只命中第一个
5. **裂缝墙 + 敌人**：子弹路径上先墙后人，应击墙（或先人后墙）
