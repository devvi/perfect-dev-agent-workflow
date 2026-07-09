# Tasks: #91 — 胜利条件迭代 (Boss 房间战斗)

| 字段 | 值 |
|------|----|
| Issue | #91 |
| 优先级 | P1 |

## Overview

改造 GOAL 房间的胜利条件：蛇头进入后入口关闭，触发与蓝色蛇 Boss 的战斗。Boss 会追逐、射击（消耗自身长度）、吃食物。玩家和 Boss 互相攻击产生 FlyingFood（物理弹飞的食物）。击败 Boss（长度归零）后才是真正胜利。详见 `docs/DESIGN/issue-91-胜利条件迭代-DESIGN.md`。

---

## Phase 1: 基础设施与常量 (P0)

添加 Boss 战斗所需的常量、数据结构和实体工厂。此阶段不修改任何逻辑，纯新增。

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/constants.js` | 新增 BOSS_TYPE 枚举、BOSS_DEFAULTS 对象、FLYING_FOOD_DEFAULTS、AUTO_FOOD_INTERVAL、MAX_AUTO_FOOD；调色板新增 BOSS/BOSS_HEAD/BOSS_BULLET/FLYING_FOOD | 无 | P0 |
| 1.2 | `public/src/engine/entities.js` | 新增 createBoss()、createBossProjectile()、createFlyingFood() 工厂函数；新增 _ffIdCounter | 1.1 | P0 |

---

## Phase 2: Boss 战斗游戏循环 (P0)

核心逻辑：修改 core.js 的 tick() 函数，添加 Boss 战斗分支。这是最大的 Phase。

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/src/engine/core.js` | **tick()**: (a) 移除 GOAL 房间直接胜利的逻辑； (b) 新增「首次进入 GOAL → 触发 Boss 战」分支：设置 bossFightActive=true、生成 Boss、关闭入口； (c) 新增「Boss 战 tick」分支：调用 updateBossAI / updateFlyingFoods / updateAutoFoodTimer / checkBossProjectileCollision / checkFlyingFoodCollision； (d) 新增 boss.length≤0 → gameState='won' 检测 | 1.2 | P0 |
| 2.2 | `public/src/engine/ai.js` | 新增 updateBossAI()：bossChasePath（复用现有 enemyChasePath 扩展）、calcBossShootDir（计算射击方向）、tryBossEatFood（Boss 吃食物/ FlyingFood）；Boss length≤2 时停止射击 | 1.1 | P0 |
| 2.3 | `public/src/engine/ai.js` | 新增 updateFlyingFoods()：物理更新（位置、摩擦力、墙壁反弹）、落定检测（lifetime 耗尽/ bounce≥3/速度极低时转为普通 food）、数量上限 MAX_COUNT 裁剪；新增 convertFlyingFoodToFood() | 1.2 | P0 |
| 2.4 | `public/src/engine/ai.js` | 新增 updateAutoFoodTimer()：每 AUTO_FOOD_INTERVAL tick 在 GOAL 房间空闲格生成一个食物，上限不超过 MAX_AUTO_FOOD | 无 | P0 |

---

## Phase 3: 碰撞系统扩展 (P0)

Boss 子弹和玩家子弹的碰撞检测。

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/engine/collision.js` | 新增 checkBossProjectileCollision()：遍历 source='boss' 的子弹，对 snake 每段做 line-sweep 检测；击中 → 玩家长度-1 + 生成 FlyingFood | 2.1 | P0 |
| 3.2 | `public/src/engine/collision.js` | 新增 checkBossHitByPlayerProjectile()：在 handleProjectileCollisions 中扩展，检测玩家子弹与 boss.segments 重叠；击中 → boss 长度-1 + 生成 FlyingFood | 2.1 | P0 |
| 3.3 | `public/src/engine/collision.js` | 新增 checkFlyingFoodCollision()：FlyingFood 与蛇头/Boss 头的重叠检测 → 被吃掉（长度+1，移除该 FlyingFood） | 2.3 | P0 |
| 3.4 | `public/src/engine/collision.js` | 新增子弹对撞检测：玩家子弹与 Boss 子弹碰撞 → 两弹消失 | 3.1 | P1 |

---

## Phase 4: 渲染扩展 (P0)

Boss、FlyingFood、HUD 的视觉呈现。

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `public/src/render/room.js` | 新增 drawBoss()：渲染蓝色蛇，头部深蓝、身体蓝色 | 1.2 | P0 |
| 4.2 | `public/src/render/room.js` | 新增 drawFlyingFood()：渲染弹飞食物（带旋转动画的金色方块）；入口关闭时门位置绘制为 WALL | 1.2 | P0 |
| 4.3 | `public/src/render/room.js` | renderRoom() 中按顺序调用 drawBoss / drawFlyingFood；当 bossFightActive 时不绘制「★ GOAL」标记 | 4.1, 4.2 | P0 |
| 4.4 | `public/src/render/hud.js` | 新增 drawBossHP()：Boss 战期间底部中央显示 Boss HP 条（蓝→红渐变） | 1.1 | P0 |
| 4.5 | `public/src/render/hud.js` | renderHUD() 中 bossFightActive 时调用 drawBossHP() | 4.4 | P0 |

---

## Phase 5: 入口关闭与地图生成适配 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 5.1 | `public/src/engine/core.js` | 新增 blockRoomEntrances() 函数：将 GOAL 房间所有 door 的 tile 替换为 WALL，标记 door.blocked=true | 2.1 | P1 |
| 5.2 | `public/src/engine/generator.js` | GOAL 房间 tile 生成：确保有足够开阔空间（已有清除中心 5×5 逻辑，验证充足） | 无 | P1 |
| 5.3 | `public/src/engine/world.js` | collision.js / world.js 中检查 door.blocked 的通行逻辑 | 5.1 | P1 |

---

## Phase 6: 测试 (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 6.1 | `tests/metroidvania-snake.test.js` | 新增正常流程测试：T1 Boss 生成、T2 Boss 击败胜利、T3 Boss 射击消耗、T4 玩家被击中、T5 玩家击中 Boss、T6 Boss 吃食物 | 2.1, 3.1, 3.2 | P0 |
| 6.2 | `tests/metroidvania-snake.test.js` | 新增边界条件测试：B1 玩家 gameover、B2 FlyingFood 上限、B3 不自杀、B4 墙壁反弹、B5 生成偏移、B6 子弹对撞 | 3.3, 3.4 | P0 |
| 6.3 | `tests/metroidvania-snake.test.js` | 新增状态完整性测试：S1 暂停冻结、S2 分数更新、S3 非 GOAL 房间回归 | 2.1 | P0 |
| 6.4 | `public/gameboy.html` | 更新 footer 中胜利条件描述为「在 GOAL 房间击败 Boss 即可胜利」 | 无 | P1 |
| 6.5 | `tests/metroidvania-snake.test.js` | 入口关闭测试：T10 进入后无法退回 | 5.1 | P1 |

---

## Dependency Graph

```
Phase 1 ───────────
├─ 1.1 constants (+BOSS_TYPE, defaults, palette)
├─ 1.2 entities (createBoss, createBossProjectile, createFlyingFood)
│
Phase 2 ───────────  (depends on Phase 1)
├─ 2.1 core.js (tick() boss branch)    ←── 1.2
├─ 2.2 ai.js (boss AI)                 ←── 1.1
├─ 2.3 ai.js (flying food physics)     ←── 1.2
├─ 2.4 ai.js (auto food spawn)         ←── (none)
│
Phase 3 ───────────  (depends on Phase 2)
├─ 3.1 collision (boss bullet vs player)  ←── 2.1
├─ 3.2 collision (player bullet vs boss)  ←── 2.1
├─ 3.3 collision (flying food overlap)    ←── 2.3
├─ 3.4 collision (bullet vs bullet)       ←── 3.1, 3.2
│
Phase 4 ───────────  (depends on Phase 1, 2)
├─ 4.1 room.js (drawBoss)                ←── 1.2
├─ 4.2 room.js (drawFlyingFood)          ←── 1.2
├─ 4.3 room.js (renderRoom boss cal)     ←── 4.1, 4.2
├─ 4.4 hud.js (drawBossHP)              ←── 1.1
├─ 4.5 hud.js (boss HP display)          ←── 4.4
│
Phase 5 ───────────  (depends on Phase 2)
├─ 5.1 core.js (blockRoomEntrances)      ←── 2.1
├─ 5.2 generator.js (goal room space)    ←── (none)
├─ 5.3 world/collision (blocked door)    ←── 5.1
│
Phase 6 ───────────  (depends on all above)
├─ 6.1 tests (normal flow)              ←── 3.1, 3.2
├─ 6.2 tests (edge cases)               ←── 3.3, 3.4
├─ 6.3 tests (state integrity)           ←── 2.1
├─ 6.4 gameboy.html (footer update)      ←── (none)
├─ 6.5 tests (entrance close)           ←── 5.1

All Done ──────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `public/src/engine/constants.js` | 修改 | +30 |
| `public/src/engine/entities.js` | 修改 | +50 |
| `public/src/engine/core.js` | 修改 | +90 |
| `public/src/engine/ai.js` | 修改 | +120 |
| `public/src/engine/collision.js` | 修改 | +60 |
| `public/src/engine/world.js` | 修改 | +5 |
| `public/src/engine/generator.js` | 修改 | +3 |
| `public/src/render/room.js` | 修改 | +40 |
| `public/src/render/hud.js` | 修改 | +25 |
| `public/src/render/overlays.js` | 修改 | +3 |
| `public/gameboy.html` | 修改 | +3 |
| `tests/metroidvania-snake.test.js` | 修改 | +200 |

**合计预估: ~629 行新增**
