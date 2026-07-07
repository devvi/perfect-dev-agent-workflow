# Research: 子弹攻击敌人不减长度

> Parent Issue: #21
> Agent: research-agent
> Date: 2026-07-07

---

## 1. Problem Definition

### Current Behavior

当玩家发射子弹击中敌人时，敌人长度（段数）不会减少。

- 子弹视觉上穿越敌人位置
- `checkProjectileCollision` 可能检测到碰撞并调用 `applyProjectileDamage`
- 但实际游戏中敌人段数不减少（HP 不降、视觉长度不变）
- 敌人仍然持续追逐玩家，看起来子弹穿过敌人无效果

### Expected Behavior

根据 #15 的设计意图：

- 敌人"血量等于自身长度"（PRD Section 5 / Design Part 1）
- 子弹击中敌人后，敌人 HP 减少 1，敌人段数（`enemy.segments`）减少 1
- 敌人长度或 HP 降至 0 时从房间移除
- 玩家获得 5 分
- **测试用例 #15** 明确要求："Projectile hits enemy → enemy hp -1"

### User Scenarios

- **Scenario A（向敌射击）：** 蛇朝向敌人发射子弹 → 子弹飞到敌人位置 → 视觉上似乎命中 → 但敌人长度不变 → 玩家困惑，认为攻击系统无效
- **Scenario B（反复射击）：** 玩家连续发射多颗子弹消耗自身长度（每次发射减少 1 格蛇身）→ 所有子弹都"穿过"敌人 → 蛇已缩短但敌人毫发无损 → 恶性亏损
- **Frequency:** 每次与敌人交战时都会触发

---

## 2. Root Cause Analysis

### Primary Root Cause: Projectile Movement Granularity Causes Position Skip

**`public/src/engine/combat.js` — `updateProjectiles` 函数：**

```js
export function updateProjectiles(state) {
  const active = [];
  for (const proj of state.projectiles) {
    const remaining = proj.remainingRange - proj.speed;
    if (remaining <= 0) continue;
    active.push({
      ...proj,
      x: proj.x + proj.dir.x * proj.speed,  // 一次跳跃 speed 格
      y: proj.y + proj.dir.y * proj.speed,
      remainingRange: remaining,
    });
  }
  return { ...state, projectiles: active };
}
```

默认 `projectileSpeed = 2`，子弹每 tick 跳跃 **2 格**。 碰撞检测仅检查跳跃后的终点位置：

**`public/src/engine/collision.js` — `checkProjectileCollision`：**

```js
const enemy = room.entities.enemies.find(e => e.x === proj.x && e.y === proj.y);
```

这意味着子弹跳过中间格子的敌人。

**示例一（奇偶 mismatch，跳过敌人）：**

```
子弹起始: x=11（蛇头前方 1 格）
敌人头位置: x=12
子弹路径: 11 → 13（跳过 x=12 的敌人！）
```

**示例二（偶奇 mismatch）：**

```
子弹起始: x=12
敌人头位置: x=13
子弹路径: 12 → 14（跳过 x=13）
```

只有当子弹终点恰好等于敌人头位置时才会命中。敌人有 50% 的概率被跳过（速度为偶数时）。

### Secondary Issue: Only Head Position Checked

`checkProjectileCollision` 仅检查敌人**头位置** (`e.x, e.y`)，不检查敌人身体段 (`e.segments[]`)。如果子弹击中敌人身体中间段而非头部，也不会触发碰撞。

```js
// collision.js line ~103  — only checks head
const enemy = room.entities.enemies.find(e => e.x === proj.x && e.y === proj.y);
```

需要同时检查身体段：
```js
const enemy = room.entities.enemies.find(e =>
  e.x === proj.x && e.y === proj.y ||                     // head
  e.segments.some(s => s.x === proj.x && s.y === proj.y)  // body
);
```

### Why Does Current Behavior Exist?

Issue #15 的实现中：

- `updateProjectiles` 的离散跳跃设计是为了保持引擎简单（不需要子 tick 插值）
- `checkProjectileCollision` 未考虑弹道连续性，这是典型的"离散碰撞检测"缺失
- 敌人身体段碰撞未被纳入设计，是疏忽
- 单元测试 (`applyProjectileDamage` 的测试) 通过了，因为测试直接调用该函数而不经过碰撞检测和弹道移动

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
| `public/src/engine/combat.js` | Combat | `updateProjectiles` — 需要改为逐格碰撞检查或 line sweep |
| `public/src/engine/collision.js` | Collision | `checkProjectileCollision` — 需要检查敌人身体段 |
| `public/src/engine/core.js` | Core | `handleProjectileCollisions` — 可能需调整 projectile → cracked wall 逻辑 |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `tests/metroidvania-snake.test.js` | Tests | 需要新增测试：子弹跳过场景、身体段命中场景 |
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
  → updateProjectiles(跳跃) → checkProjectileCollision(沿途逐格 + 身体段)
  → 命中 → applyProjectileDamage → enemy.hp-1, segments.pop()
  → 敌人长度减少 → 反馈正确
```

### Documents to Update

- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` — 增加子弹碰撞算法设计
- [ ] `docs/PRD/21-bullet-enemy-no-damage.md` (本文件)
- [ ] `docs/TASKS/21-bullet-enemy-no-damage.md` (任务文件，本阶段创建)

---

## 4. Solution Comparison

### Approach A: Line-Sweep Continuous Collision Detection（推荐）

**Description:** 改造 `handleProjectileCollisions`（在 `core.js` 中），在子弹从旧位置移动到新位置的路径上逐格检测碰撞。同时在 `checkProjectileCollision` 中增加敌人身体段检测。

**核心变化：**
```
handleProjectileCollisions(state) {
  for each projectile:
    for each cell along path from (prevX,prevY) to (newX,newY):
      checkEnemyCollision(cell)  // 包括 segments
      checkCrackedWall(cell)
      checkWall(cell)
      → early break on first collision
}
```

**需要新函数** `lineSweepCollision(proj, prevX, prevY, newX, newY, state)`：
- 计算从 `(prevX, prevY)` 到 `(newX, newY)` 的所有中间单元格（使用 Bresenham 或简单逐格步进）
- 对每个中间格+终点格执行碰撞检测（enemy, cracked_wall, wall）
- 返回第一个碰撞结果

`checkProjectileCollision` 新增：
```js
const enemy = room.entities.enemies.find(e =>
  e.x === cellX && e.y === cellY ||
  e.segments.some(s => s.x === cellX && s.y === cellY)
);
```

**Pros:**
- 解决所有离散跳跃问题：子弹不会跳过任何敌人或裂缝墙
- 身体段碰撞：子弹击中敌人身体任何部分都有效
- 性能可接受：每 tick 最多检查 2 格（speed=2），计算量微乎其微
- 裂缝墙同样受益：之前子弹也可能跳过裂缝墙

**Cons:**
- 需要修改 `updateProjectiles` 的返回值以包含旧位置信息
- 需要新增函数和修改现有函数签名
- 子弹击中身体段而非头部的视觉反馈需要同步

**Risk:** Low — 算法简单，逐格碰撞是标准做法
**Effort:** Small（预计 1-2 小时）

### Approach B: Reduce Projectile Speed to 1

**Description:** 将默认 `projectileSpeed` 从 2 改为 1，使子弹每 tick 移动 1 格。

**变化：**
```js
// constants.js
export const DEFAULT_PROJECTILE_SPEED = 1;
```

**Pros:**
- 一行修改，消除奇偶跳过问题
- 不需要改造碰撞检测逻辑

**Cons:**
- 子弹变慢，游戏节奏受影响
- 不能完全解决敌人身体段碰撞问题（仍只检测头）
- 摧毁裂缝墙同样变慢
- 玩家躲避子弹更容易，战斗体验下降
- 如果将来需要子弹加速（道具/升级），问题会再次出现

**Risk:** Medium — 一行修改看似简单，但影响核心战斗手感
**Effort:** Trivial（15 分钟）

### Approach C: Hybrid — Speed=1 + Body Segment Check

**Description:** 结合 Approach B（speed=1）和 Approach A 中的身体段检查部分。

**变化：**
- `DEFAULT_PROJECTILE_SPEED = 1`
- `checkProjectileCollision` 增加敌人 segments 检查

**Pros:**
- 解决跳过问题（speed=1 时无跳跃）
- 解决身体段命中问题
- 代码改动最小

**Cons:**
- 子弹速度固定为 1，未来 fireRate/speed 升级受限
- 如果未来需要子弹加速（power-up SPEED 类型），又会回到离散跳跃问题
- 战斗节奏变慢可能与 #15 的快节奏设计不符

**Risk:** Low-Medium — 但如果未来需求变更则需要重新实现 line sweep
**Effort:** Small（30 分钟）

### Recommendation

→ **Approach A（Line-Sweep）** 因为：

1. **根本性解决：** 离散跳跃是根本问题，line sweep 是游戏开发中标准的连续碰撞检测方案
2. **未来扩展不限制：** 支持任意 `projectileSpeed` 值（包括 power-up 加速到 3/4/5 的情况）
3. **缝墙碰撞同步修复：** 裂缝墙和门的命中同样受益
4. **性能代价极小：** 针对速度为 2 的情况，每 tick 仅多检查 2 个单元格
5. **符合 #15 预期：** 设计文档中已测试用例 #15 要求"Projectile hits enemy → enemy hp -1"，line sweep 确保这个测试在游戏循环中也成立

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
| `updateProjectiles` in `combat.js` | Stable — 需要修改返回值 | Low — 现有接口小改 |
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
