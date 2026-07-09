# Research: 子弹攻击到敌人，敌人长度不会减少

> Parent Issue: #21
> Agent: research-agent (subagent)
> Date: 2026-07-07
> Status: Open
> Priority: High

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

### User Scenarios

- **Scenario A（面向敌人射击）：** 蛇朝向敌人发射子弹 → 子弹飞到敌人位置 → 视觉上似乎命中 → 但敌人长度不变 → 玩家困惑，认为攻击系统无效
- **Scenario B（反复射击战斗）：** 玩家连续发射多颗子弹消耗自身长度（每次发射减少 1 格蛇身）→ 所有子弹都"穿过"敌人 → 蛇已缩短但敌人毫发无损 → 恶性亏损
- **Frequency:** 每次与敌人交战时都会触发

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

#### Root Cause #1: 碰撞检测在子弹移动之后进行（Ordering Bug）

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

#### Root Cause #2: Projectile Speed = 2 导致离散跳跃

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

#### Root Cause #3: 仅检查敌人头部，不检查身体段

`checkProjectileCollision` 只检查 `e.x === proj.x && e.y === proj.y`（头部），
不检查 `e.segments[]`（身体段）。

如果子弹击中敌人身体中间段，也不会触发碰撞。

#### Broken Data Flow

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

### Why Change Now?

这是 #15 实现的游戏核心可玩性问题——一个无效的攻击系统会让 Metroidvania 玩法完全崩溃：
1. 玩家消耗自身长度发射子弹却无法伤害敌人
2. 玩家无法通过攻击破坏裂缝墙（子弹跳过墙位置时也失效）
3. 玩家无法通过攻击消耗自身长度来降低速度（失去核心策略维度）
4. Gacha 机系统和战斗系统耦合，战斗无效则整个游戏循环中断

### Previous Constraints

- 不能引入物理引擎或外部依赖
- 保持单 HTML 文件架构
- 保持 `public/src/engine/` 模块化结构

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js` | Game Engine (tick) | `tick()` 中子弹先移动后检测碰撞，导致初始位置和中间位置被跳过 |
| `public/src/engine/combat.js` | Combat | `updateProjectiles` 一次跳跃 `speed` 格，不保存旧位置 |
| `public/src/engine/collision.js` | Collision Detection | `checkProjectileCollision` 仅检查 `e.x === proj.x`，不检查 `segments[]` |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `tests/metroidvania-snake.test.js` | Tests | 测试 #15 仅测直接调用 `applyProjectileDamage`，不测完整弹道→碰撞管道 |
| `public/src/engine/entities.js` | Entities | 无需变更（数据结构正确） |
| `public/src/render/room.js` | Render | 无需变更（渲染已正确绘制 enemy.segments） |

### Data Flow Impact

```
[Current broken flow]
fire() → createProjectile(头前方1格) → tick()
  → updateProjectiles(跳跃2格) → checkProjectileCollision(仅终点)
  → 50%概率miss → 敌人不受伤 → 沮丧

[Fixed flow]
fire() → createProjectile(头前方1格) → tick()
  → updateProjectiles(跳跃) → handleProjectileCollisions(沿途逐格 + 身体段)
  → 命中 → applyProjectileDamage → enemy.hp-1, segments.pop()
  → 敌人长度减少 → 反馈正确
```

### Documents to Update

- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` — 增加子弹碰撞算法设计
- [ ] `docs/PRD/21-bullet-enemy-damage.md` (本文件)
- [ ] `docs/TASKS/21-bullet-enemy-damage.md` (任务文件，本阶段创建)

---

## 4. Solution Comparison

> At least 2 approaches required.

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

**Risk:** Low — 算法简单，逐格碰撞是标准做法
**Effort:** Small（预计 1-2 小时）

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

**Risk:** Low-Medium — 但如果未来需求变更则需要重新实现 line sweep
**Effort:** Small（30 分钟）

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
**Risk:** Medium — 速度=2 时约 50% 命中率问题仍然存在
**Effort:** Small（约 15 分钟）

### Recommendation

→ **Approach A（Line-Sweep）** 是最佳方案，因为：
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

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 蛇发射子弹 → 子弹飞出 → 子弹路径上遇到敌人（头或身体段）→ 敌人 HP-1、段数-1 → 敌人视觉长度减少
2. 多个敌人同排 → 子弹击中路径上第一个敌人 → 第一个敌人受伤害
3. 子弹同时命中敌人和裂缝墙 → 优先处理敌人碰撞（先注册）

### Edge Cases
1. **Speed = 2，敌人正好在中间格：** 子弹路径 `(11,10)→(13,10)`，敌人在 `(12,10)` → 逐格检测发现 `(12,10)` 有敌人 → 命中。之前 50% 概率 miss 的场景变为 100% 命中。
2. **Speed = 3（道具加速后）：** 子弹路径 `(11,10)→(14,10)` → 检查 `(12,10)` 和 `(13,10)` 和 `(14,10)` → 三个位置都检查敌人和墙。
3. **敌人身体段命中：** 子弹落在 `(9,10)`，敌人头在 `(12,10)`，身体段 `[{12,10},{11,10},{10,10},{9,10}]` → 检查发现 `(9,10)` 是 body segment → 命中。之前完全 miss。
4. **子弹同时经过两个敌人：** 路径上先遇到敌人 A → 命中敌人 A，子弹消失 → 敌人 B 不受影响（一颗子弹只伤害一个敌人）。
5. **子弹经过裂缝墙再经过敌人：** 路径上先遇到裂缝墙 → 击碎墙 → 子弹继续？→ 设计上应只处理第一个碰撞。

### Failure Paths
1. **updateProjectiles 不返回旧位置：** 需要在 `updateProjectiles` 返回的 projectile 对象中增加 `prevX`/`prevY` 字段。如果忘记添加，line sweep 无法进行。
2. **性能退化：** 极端路径（speed=10 时 10 格检查）在高频率多子弹下可能有性能问题。限制最大 speed 为 5 或限制单 tick 子弹数量可缓解。
3. **Bresenham 复杂度：** 使用简单逐格步进（沿单轴每次 ±1）比 Bresenham 更容易实现且满足需求，因为子弹只沿水平或垂直方向飞行（不斜向）。

> 这些将成为 Plan 阶段的测试用例。

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|-------|
| `updateProjectiles` in `combat.js` | Stable — 需要修改返回值 | Low |
| `checkProjectileCollision` in `collision.js` | Stable — 需要扩展检测逻辑 | Low |
| `handleProjectileCollisions` in `core.js` | Stable — 需要调用 line sweep | Low |

### Blocks

| Future Work | Priority |
|-------------|----------|
| #15 战斗系统完整验证 | P0 — 当前问题阻碍全部战斗测试 |
| Bullet power-up 测试（加速、双发） | P1 — 加速后跳跃问题更严重 |
| 裂缝墙摧毁的一致性 | P1 |

### Preparation Needed

- [ ] 确认 `updateProjectiles` 中 projectile 对象可携带 `prevX`/`prevY` 字段（向后兼容）
- [ ] 确认没有其他调用方依赖 `checkProjectileCollision` 的当前行为

---

## 7. Spike / Experiment

### Question to Answer

Line-sweep 碰撞检测在 `projectileSpeed=2`（默认）和 `projectileSpeed=5`（上限）下的性能表现如何？是否需要限制最大速度？

### Method

1. 实现 `lineSweepCollision(proj, prevX, prevY, newX, newY, state)` 原型
2. 模拟 60 tick 循环，每 tick 5 颗子弹同时飞行
3. 统计：每 tick 检查的格子数、命中率对比（line sweep vs. 离散点检）

### Result

（本 spike 在 Plan 阶段实际运行。预期结论：）

| Speed | 每 tick 检查格数 | 5 颗子弹/60 tick 总检查量 | 性能影响 |
|-------|-----------------|--------------------------|---------|
| 2     | 2-3             | 900                       | < 0.1ms |
| 3     | 3-4             | 1350                      | < 0.2ms |
| 5     | 5-6             | 2250                      | < 0.3ms |

与原来（每 tick 1 格检查）相比，line sweep 在最坏情况（speed=5, 5 子弹）下增加约 5x 检查量，但 2000+ 次整数比较在 JS 中耗时 < 0.3ms，远低于 16ms 帧预算。**无需限制速度上限。**

### Impact on Approach

如果 spike 证实性能影响可以忽略，Approach A（line-sweep）无风险。如果发现性能退化，可限制最大 `projectileSpeed <= 5` 或限定每 tick 最大碰撞检查数。预期不需要任何额外防护。
