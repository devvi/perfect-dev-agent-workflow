# Research: 胜利条件迭代 — Boss 房间战斗

> Parent Issue: #91
> Agent: research-agent
> Date: 2026-07-09

---

## 1. Problem Definition

### Current Behavior

当前游戏胜利条件仅需蛇头进入 GOAL 类型房间即立即胜利：

```js
// public/src/engine/core.js tick()
if (newRoom.type === ROOM_TYPE.GOAL) {
  s.gameState = 'won';
  return s;
}
```

- GOAL 房间只是一个普通房间，带 `★ GOAL` 标记和金色半透明背景
- 玩家进入后没有任何战斗或挑战，立即弹出胜利画面
- 游戏流程简单线性：探索 → 收集钥匙 → 开门 → 进入 GOAL → 通关
- 地图生成器对 GOAL 房间的特殊处理仅为：在中心区域（5×5 范围）清除所有障碍物、移除敌人实体、放置基础食物
- 现有战斗系统（子弹、碰撞检测、长度增减）仅在普通房间的敌人上使用，GOAL 房间完全未利用

### Expected Behavior

根据 Issue #91 描述，胜利条件应迭代为：

1. **玩家到达 GOAL 房间后**，房间入口关闭（蛇穿过的门变为不可通行墙面）
2. **BOSS 战触发**：房间内出现 BOSS（第一关 BOSS 为蓝色蛇），击败后才是真正胜利
3. **BOSS 攻击机制**：BOSS 会吐子弹攻击玩家，每次吐子弹自身长度减一
4. **玩家被 BOSS 子弹击中**：玩家身体长度减一，断掉的身体块会遵循物理「弹飞」，成为可拾取的「食物」
5. **玩家攻击 BOSS**：子弹击中 BOSS 后，BOSS 身体断掉一块，变为「弹飞食物」
6. **BOSS 吃食物**：BOSS 长度增加一（如同玩家吃食物一样增长）
7. **房间内被动食物生成**：房间任意位置，每隔一段时间自动生成一个食物
8. **BOSS 长度归零** → `gameState = 'won'`

### User Scenarios

- **Scenario A（初次 BOSS 战）：** 玩家探索地图收集钥匙 → 到达 GOAL 房间 → 入口关闭 → BOSS 出现 → 战斗。胜利的成就感大幅提升。
- **Scenario B（BOSS 战策略）：** 玩家需要平衡射击频率（消耗自身长度）和吃食物恢复长度，同时躲避 BOSS 子弹——形成了「攻击—消耗—补给」的循环。
- **Scenario C（多周目/多关卡扩展）：** 蓝色蛇为第一关 BOSS，未来可扩展更多 BOSS 类型（不同颜色、不同攻击模式）。
- **Frequency:** 每局游戏一次 BOSS 战（标准流程），BOSS 战长度决定了通关所需的核心操作量。

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

#15 银河城重构时，胜利条件被设计为「到达 GOAL 房间即胜利」。这是一个 MVP 设计决策：

- 核心游戏循环（探索 → 战斗 → 成长 → 通关）已跑通
- GOAL 房间已作为特殊房间类型存在于体系内（`ROOM_TYPE.GOAL`）
- 房间数据结构（`tiles`, `doors`, `entities`）支持扩展 BOSS 实体
- 战斗系统（projectile 子弹系统、碰撞检测、敌人 hp/segments）已就绪
- 目的是先让完整游戏循环上线，再迭代 BOSS 战提升终局体验

### Why Change Now?

1. **游戏高潮缺失**：GOAL 房间通行即胜利，缺乏最终挑战，体验虎头蛇尾
2. **战斗系统未充分利用**：现有的子弹、碰撞、长度增减系统在普通房间敌人上体现有限，需要 BOSS 这种高强度战斗场景来验证系统的完备性
3. **可扩展性**：BOSS 战斗是内容扩展的基石——不同 BOSS 对应不同关卡，使游戏从「demo」向「正式版」迈进
4. **「弹飞」物理机制**：身体断裂块遵循物理飞出的设定引入新的动态机制，增加战斗的可变性和策略深度

### Previous Constraints

- **零外部依赖**：物理弹飞需要纯 JS 模拟（无需物理引擎）
- **保持单 HTML 文件架构**（`public/gameboy.html`）：所有渲染和逻辑在现有 `public/src/` 目录下
- **模块化引擎结构**：新增 BOSS 逻辑放入现有模块的扩展（ai.js → boss AI、combat.js → boss 子弹、entities.js → boss/flyingFood 工厂）
- **现有 GOAL 房间数据结构不变**：在房间上叠加 BOSS 数据而非重构房间结构
- **GameBoy 调色板约束**：BOSS 需与现有敌人（红色 `#e94560`）视觉区分，使用蓝色系（`#3060e0`）

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js` | Core Game Tick | **重大修改**：GOAL 房间进入后触发 BOSS 战而非直接胜利。tick() 中新增 BOSS AI 调用、BOSS/玩家子弹碰撞处理、弹飞食物更新、BOSS 进食检测、自动食物生成计时器。 |
| `public/src/engine/generator.js` | Map Generator | **修改**：GOAL 房间生成时预留给 BOSS 战斗空间（已有清除中心 5×5 的逻辑）。新增 BOSS 初始状态数据生成。 |
| `public/src/engine/constants.js` | Constants | **新增常量**：`BOSS_TYPE` 枚举、`BOSS_DEFAULT_LENGTH`、`BOSS_SHOOT_INTERVAL`、`BOSS_SPEED_TICKS`、`FLYING_FOOD_BOUNCE`、`AUTO_FOOD_INTERVAL`、`MAX_FLYING_FOOD`。新增 `PALETTE.BOSS` 颜色。 |
| `public/src/engine/entities.js` | Entity Factories | **新增工厂函数**：`createBoss(type, x, y, length)`、`createBossProjectile(...)`、`createFlyingFood(x, y, vx, vy)`。 |
| `public/src/engine/ai.js` | AI System | **扩展/新增子模块**：`updateBoss(state)` — BOSS AI 主循环，包含 `bossChaseAI()`（追逐）、`bossShootAI()`（射击决策）、`bossFoodDetection()`（觅食 AI）。 |
| `public/src/engine/combat.js` | Combat System | **扩展**：玩家子弹碰撞检测增加 `source` 标记区分来源。新增 BOSS 子弹发射函数 (`fireBossProjectile`)，BOSS 子弹移动与衰减。新增 `applyBossDamage()` 弹飞食物生成逻辑。 |
| `public/src/engine/collision.js` | Collision System | **扩展**：新增 BOSS 子弹碰撞检测（对玩家 snake body 的行碰撞检测）、玩家子弹对 BOSS 身体的段碰撞检测、FlyingFood 与蛇/BOSS 的重叠检测。 |
| `public/src/render/room.js` | Room Renderer | **扩展**：新增 `drawBoss()`（蓝色蛇渲染 + 动画）、`drawBossProjectile()`、`drawFlyingFood()`（带旋转动画的弹飞块）、BOSS 血量指示器。 |
| `public/src/render/hud.js` | HUD | **新增**：BOSS 血量/剩余长度显示条（Boss 战期间替换或叠加显示在 HUD 上）。 |
| `public/src/render/overlays.js` | Overlay Screens | **扩展**：胜利画面可区分「BOSS 击败胜利」和「传统撑满胜利」（虽然当前只有 BOSS 击败一种触发）。 |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/gameboy.html` | HTML Entry | 底部 footer 胜利条件描述需更新为「在 GOAL 房间击败 BOSS 即可胜利」。 |
| `public/src/render/minimap.js` | Minimap | BOSS 战期间需保持 minimap 可视（入口关闭但地图不消失）。 |
| `tests/` | Test Suite | 需要新增 BOSS 战测试用例（击败流程、死亡流程、边界条件）。 |
| `docs/DESIGN/15-metroidvania-snake-overhaul.md` | Design Doc | 需补充 BOSS 战设计章节。 |

### Data Flow Impact

```
[Before — GOAL room = instant win]
tick() → roomTransition → newRoom.type === GOAL → gameState = 'won' → renderVictoryScreen

[After — GOAL room = boss fight state machine]
tick() → roomTransition → newRoom.type === GOAL →
  │
  ├─ [首次进入] ──→
  │    1. s.bossFightActive = true
  │    2. s.boss = createBoss('blue_snake', centerX, centerY, 10)
  │    3. closeRoomEntrances(room)  — 将所有门设为 WALL
  │    4. s.bossSpawned = true
  │    5. 正常游戏状态继续，但增加 BOSS 战斗循环
  │
  ├─ [BOSS 战 tick] ──→
  │    1. 蛇移动 + 吃普通食物（正常流程）
  │    2. BOSS AI: 追逐/射击/觅食决策
  │    3. BOSS 子弹: 发射 → 每 tick 移动 → 碰撞检测
  │    4. 玩家子弹: 发射 → 每 tick 移动 → 碰撞检测
  │    5. 碰撞结果:
  │       ├─ 玩家蛇身被 BOSS 子弹/身体击中
  │       │   → snake 长度 -1
  │       │   → 断裂块创建 FlyingFood(randomDir)
  │       │   → score 惩罚
  │       ├─ 玩家子弹击中 BOSS
  │       │   → BOSS 长度 -1
  │       │   → 断裂块创建 FlyingFood(randomDir)
  │       │   → score 奖励
  │       └─ FlyingFood 更新: 物理运动 → 落定/被吃
  │    6. BOSS 觅食: BOSS 经过 food/FlyingFood → 长度+1
  │    7. 自动食物生成: 每 N tick 生成一个食物（空闲位置）
  │    8. BOSS 长度检测:
  │       ├─ BOSS 长度 <= 0 → bossDefeated = true → gameState = 'won'
  │       ├─ 玩家长度 <= 0 → gameState = 'gameover'
  │
  └─ [BOSS 击败] ──→ gameState = 'won' → renderVictoryScreen
```

### Documents to Update

- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` — 补充 BOSS 战设计
- [ ] `docs/DESIGN/91-胜利条件迭代.md` — Plan 阶段创建详细设计
- [ ] `docs/PRD/issue-91-胜利条件迭代-PRD.md`（本文件）
- [ ] `docs/TASKS/91-胜利条件迭代.md` — Plan 阶段创建任务文件
- [ ] `public/gameboy.html` — 更新胜利条件描述文字
- [ ] `README.md` — 功能清单更新

---

## 4. Solution Comparison

> 3 种方案

### Approach A: 在现有 GOAL 房间基础上叠加 BOSS 战（推荐）

**Description:** 改造 GOAL 房间的处理逻辑，在同一个房间空间内触发 BOSS 战斗：

- **状态标记**：新增 `bossFightActive`（是否激活）、`boss`（BOSS 实体）、`roomEntranceClosed`（入口状态）、`flyingFood[]`（弹飞食物列表）、`bossFoodTimer`（自动生成食物计时器）
- **入口关闭**：蛇头进入 GOAL 房间后，将当前房间所有 door 单元格替换为 WALL，蛇无法退出
- **BOSS 数据结构**：

```js
Boss {
  id: 'boss_1',
  type: 'blue_snake',       // 使用常量 BOSS_TYPE.BLUE_SNAKE
  x, y,                     // 世界坐标（头部位置）
  segments: [{x,y}, ...],   // 身体段数组
  hp: 10,                   // 当前血量(≈ 长度)
  length: 10,               // 当前长度
  speedTicks: 3,            // 移动间隔（比普通敌人慢但更沉稳）
  tickCounter: 0,           // 移动计数
  shootCooldown: 0,         // 射击冷却当前值
  shootInterval: 6,         // 射击间隔（tick 数）
  aiState: 'idle',          // 'idle' | 'chase' | 'retreat' | 'eating'
  roomX, roomY,             // BOSS 所在房间
}
```

- **BOSS 射击 AI**：
  - 每 tick `shootCooldown--`
  - 当 `shootCooldown <= 0` 时：计算从 BOSS 头部到玩家头部的方向（取最近的曼哈顿轴向）→ 在该方向创建 BOSS 子弹 → `boss.length--` → `boss.segments.pop()` → 在 BOSS 位置创建一个 `FlyingFood`（模拟断掉的身体块飞出去）→ `shootCooldown = shootInterval`

- **BOSS 子弹结构**（复用现有 projectile 系统，添加 `source` 标记）：

```js
BossProjectile {
  id, x, y, prevX, prevY,
  dir,                      // 瞄准方向
  speed: 1,                 // BOSS 子弹稍慢（玩家是 2）
  remainingRange: 8,        // 最大射程 8 格（玩家是 10）
  power: 1,                 // 伤害 1
  source: 'boss',           // 标记来源
}
```

- **FlyingFood 结构**（新实体类型）：

```js
FlyingFood {
  id, x, y,                 // 世界坐标
  vx, vy,                   // 速度向量（0.5~2.0 随机，方向随机或垂直碰撞方向）
  lifetime: 60,             // tick 数后落定
  bounceCount: 0,           // 弹跳次数限制（最大 3 次）
  angle: 0,                 // 旋转角度
  angularSpeed: 0.1,        // 旋转速度（随机正负）
  settled: false,           // 是否已落定
}
```

- **FlyingFood tick 更新**：
  - `x += vx`, `y += vy`
  - `vx *= 0.95`, `vy *= 0.95`（摩擦力衰减）
  - `angle += angularSpeed`
  - 碰撞墙壁 → 反弹（`vx *= -0.5`）
  - `lifetime--`；`lifetime <= 0` 或 `|vx|+|vy| < 0.1` → 变为普通 food（放入 `room.entities.food[]`）
  - 检测蛇头/BOSS 头与 FlyingFood 重叠 → 被吃掉（视为食物）

- **自动食物生成**：
  - 每 `AUTO_FOOD_INTERVAL`（建议 30 tick）在房间空闲位置生成一个食物
  - 跳过蛇/BOSS/障碍物占据的格
  - 最多与房间内已有食物共存（不超上限）

- **胜利判定**：`boss.hp <= 0` → `bossDefeated = true` → `gameState = 'won'`

**用于 BOSS 颜色的 PALETTE 扩展：**

```js
// 新增
BOSS:       '#3060e0',     // 蓝色
BOSS_HEAD:  '#2040b0',     // 深蓝
BOSS_BULLET:'#6090ff',     // 浅蓝弹
```

**Pros:**
- 对现有 GOAL 房间基础设施改动最小（复用房间、门、坐标系统）
- BOSS 实体可以复用现有 enemy 的 `segments[]`、`hp` 数据结构并扩展
- BOSS 子弹复用现有 projectile 系统，仅添加 `source` 标记即可区分
- 入口关闭只需修改 `world.rooms[goalY][goalX].tiles` 中的 door 位置为 WALL
- FlyingFood 独立管理系统，不影响现有食物逻辑
- 与 Issue #91 描述完全吻合：「到达该房间后，房间入口关闭，要击败一个boss才能胜利」

**Cons:**
- `tick()` 函数复杂度增加（需要额外分支处理 BOSS 战状态）
- BOSS AI 需要独立子模块（虽可放 ai.js 中）
- FlyingFood 需要新实体的渲染支持（room.js 中新增 draw 逻辑）

**Risk:** Low-Medium — 架构清晰，与现有系统解耦良好，所有扩展都是追加式的
**Effort:** Medium（预计 6-10 小时）

### Approach B: 引入独立的 BOSS 房间类型（BOSS_ROOM）

**Description:** 新增 `ROOM_TYPE.BOSS`。地图生成器在 GOAL 房间的相邻位置强制生成一个独立的 BOSS 房间：

- **独立房间**：BOSS 房间与 GOAL 房间之间通过一个门连接
- **胜利条件保持**：「进入 GOAL 房间即胜利」不变
- **BOSS 房间必过**：GOAL 房间的入口门只有击败 BOSS 后才打开
- **地图生成修改**：`assignRoomTypes()` 中在 GOAL 旁边找一个 NORMAL 房间改为 BOSS 类型
- **BOSS 房间战斗**：和 Approach A 类似，但从 GOAL 解耦
- **Boss Defeated 标记**：`state.bossDefeated` true 后，GOAL 房间门才通行

**Pros:**
- 不修改现有胜利逻辑（纯扩展新房间类型）
- BOSS 房间逻辑完全独立，可单独维护
- 未来可添加多个 BOSS 房间（多关卡）
- BOSS 房间可以有完全不同的 tile 布局（如竞技场风格）

**Cons:**
- 地图需要额外一个房间——5×5 地图（25 房间）已较紧张，且 GOAL 通常在远方角落；必须相邻放置可能牺牲地图的拓扑多样性
- 地图生成器需要处理 BOSS 房间类型分配和连通性保证（需确保 BOSS→GOAL 联通且路径唯一）
- 维护两套胜利条件（GOAL 房间直接胜利 vs BOSS 房间中击败后才可进入 GOAL）导致逻辑分裂
- 与 Issue #91 描述「到达该房间后，房间入口关闭」不完全一致——这里到达 GOAL 的前一个房间就被拦截了
- 用户需要额外一次房间过渡（BOSS 房间→GOAL 房间），战斗结束后需要走一段门路才到最终胜利
- 如果 BOSS 房间和 GOAL 之间路由复杂，使用 key shrine 的路径上可能出现死锁

**Risk:** Medium — 地图生成器变更影响全局，连通性保证复杂
**Effort:** Medium（预计 6-8 小时）

### Approach C: BOSS 作为独立的顶级战场（新场景）

**Description:** 进入 GOAL 房间后，游戏切换到一个独立的 BOSS 战斗场景（新 Canvas 渲染、新游戏循环、全屏竞技场）：

- **场景切换**：进入 GOAL 房间 → 触发场景切换动画 → 渲染独立的 BOSS 战斗场景
- **独立战场**：不再受 20×20 网格和 tile 系统约束；纯背景竞技场，蛇可在任意方向自由移动
- **新渲染系统**：全屏 dark bg，蛇与 BOSS 在开放空间中战斗
- **结果同步**：战斗结束后，BOSS 长度归零 → 回到主游戏 → 胜利画面

**Pros:**
- 与主游戏引擎完全解耦
- BOSS 战场可不受限于 20×20 网格
- 视觉差异大（全屏战场），冲击力强
- 独立的渲染循环不受现有 GameBoy tile 风格约束

**Cons:**
- 需要维护两套渲染系统和两套游戏循环
- 状态在两个场景间传递复杂（蛇的长度、分数、物品如何同步？）
- 工程量翻倍（两个游戏合二为一的集成成本）
- 与现有 GameBoy 像素风格不一致（场景切换突兀）
- 玩家丢失房间上下文（食物、墙壁、门等交互都不存在了）
- 数据流动复杂，调试困难
- 与 Issue #91「到达此房间后…在房间内」的表述相悖

**Risk:** High — 本质上是一个新游戏场景，集成风险大、回归测试多
**Effort:** Large（预计 12-20 小时）

### Recommendation

→ **Approach A** 因为：

1. **最小改动、最大产出**：复用现有 GOAL 房间、门系统、碰撞系统、projectile 系统、tick 框架。无需新房间类型、无需新 Canvas
2. **最自然的体验**：蛇进入 GOAL 房间 → 入口关闭 → BOSS 出现 → 在同一空间战斗。视觉和叙事一致性高
3. **最容易理解**：玩家的蛇和 BOSS 蛇在同一网格中对战，视觉上清晰，操作逻辑一致
4. **扩展性强**：未来可添加更多 BOSS 类型（`boss.type` 枚举），不同 BOSS 有不同射击模式、速度、长度、颜色
5. **弹飞食物机制**丰富了战斗动态——它不仅是惩罚（被打到掉长度），也是机会（可以抢吃弹飞的食物）
6. **与 Issue #91 描述完全吻合**：「到达该房间后，房间入口关闭，要击败一个boss才能胜利」
7. **风险可控**：所有组件都是现有系统的扩展追加，没有架构变更

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. **玩家到达 GOAL 房间**：玩家探索地图、收集钥匙和食物 → 蛇头从任意方向进入 GOAL 房间
2. **入口关闭**：进入后所有门位置变为 WALL（或标记 blocked）。`doors` 全部设为不可通行状态
3. **BOSS 出现**：蓝色蛇 BOSS 在房间中心初始化。初始长度 = 10。`bossFightActive = true`
4. **BOSS 行为**：BOSS 在房间内追逐玩家、每隔约 6 tick 朝玩家方向射击一次
5. **玩家攻击**：玩家通过 Z 键发射子弹（消耗自身长度）→ 子弹击中 BOSS 身体 → BOSS 长度-1 → BOSS 身体断裂块变为 FlyingFood
6. **BOSS 攻击**：BOSS 子弹击中玩家身体（任何段）→ 玩家长度-1 → 玩家断裂块变为 FlyingFood
7. **食物补给**：玩家吃普通食物 + 吃 FlyingFood → 长度恢复。BOSS 经过食物或 FlyingFood 位置 → BOSS 长度恢复
8. **自动生成食物**：房间内每 30 tick 在空闲位置自动生成一个食物
9. **BOSS 生命归零**：反复攻击 BOSS → BOSS length <= 0 → bossDefeated = true → gameState = 'won'
10. **胜利画面**：`renderVictoryScreen()` 展示最终分数、长度
11. **玩家长度归零**：若玩家蛇 length <= 0 → gameState = 'gameover' → 可读档从最近 save point 重来

### Edge Cases

1. **BOSS 初始化时房间无空位**：GOAL 房间被障碍物占满 → 地图生成器已为 GOAL 房间清除中心 5×5 区域（参见 `generator.js` 对 `ROOM_TYPE.GOAL` 的处理），但需确保 BOSS 初始位置不在蛇身上。若蛇在中心，则 BOSS 偏移到最近空格。
2. **蛇进入 GOAL 房间时长度很短（< 3）**：BOSS 战对短蛇极不公平 → 方案一：在 GOAL 房间门口设置长度门槛（sizeGate）要求最小长度 5 才能进入；方案二：允许进入，但短蛇速度快的特性可作为天然平衡。
3. **BOSS 连续射击导致自身长度迅速归零**：防止 BOSS 自杀 → `shootCooldown` 最小值设为 3 tick，且 BOSS 在长度 ≤ 2 时停止射击（进入狂暴追逐模式）。
4. **FlyingFood 飞出房间边界**：到达瓦片边界时反弹（模拟物理碰撞）。反弹后方向取反、速度减半。反弹超过 3 次直接落定在当前最近 FLOOR 格。
5. **FlyingFood 落定在障碍物/墙上**：落定时若目标格非 FLOOR → 寻找最近的 FLOOR 格放置（BFS 搜索，最多 20 步）。
6. **FlyingFood 飞行中被蛇/BOSS 吃掉**：FlyingFood 在飞行状态下应可被蛇头或 BOSS 头部检测并吃掉（长度+1）。
7. **多 FlyingFood 同时存在的视觉/性能问题**：设置最大同时存在数 `MAX_FLYING_FOOD = 12`。超出时最旧的直接落定。
8. **BOSS 战中玩家暂停**：暂停时 BOSS 也应暂停（所有 `tickCounter`、`shootCooldown` 不更新），防止暂停解暂停时意外跳过攻击。
9. **BOSS 战中入口关闭时蛇尾在外**：蛇尾被夹在门间 → 方案：蛇头进入后延迟 1 tick 再关闭入口，确保蛇身完全通过。若蛇身长度 > 门到墙的可容纳距离（小于等于 ROOM_SIZE 即 20），尾段会被截断。
10. **BOSS 战中房间原有食物**：GOAL 房间内预置的 2 个食物保留作为初始补给。
11. **玩家贴墙时被击中**：如果玩家在某条边上被 BOSS 子弹击中且断块弹飞方向朝向墙外 → 弹飞方向取反（向内弹）。
12. **BOSS 子弹和玩家子弹对撞**：两发子弹碰撞 → 互相抵消（视觉上闪一下消失）。
13. **BOSS 蛇身环绕玩家**：BOSS 可能将玩家围住 → BOSS 应避免完全包围玩家的 AI 行为。若被围住 → 玩家可通过射击打开缺口（击中 BOSS 身体产生 FlyingFood，该段消失）。

### Failure Paths

1. **BOSS 战中途退出/刷新**：游戏未保存 BOSS 战进度。`saveGame()` 仅在 SAVE 房间触发。重新加载后需重新到达 GOAL 房间。
2. **FlyingFood 物理模拟性能退化**：大量 FlyingFood 同时存在（>12）。解决方案见 Edge Case #7。
3. **BOSS 子弹速度 > 玩家反应**：BOSS 子弹速度设为 1（玩家子弹速度为 2），玩家有足够时间闪避。同时 BOSS 射击有前摇（射击动画）。
4. **玩家子弹在 BOSS 战中射速过快**：Fire Rate 由 `DEFAULT_FIRE_RATE = 3` 决定。玩家无法无限制射击（需间隔 3 tick），且射击消耗长度可平衡。
5. **入口关闭后无法退出**：设计如此——GOAL 房间一旦进入，必须击败 BOSS 或 gameover。无退出途径（符合 roguelike 设计：boss room 是单行道）。
6. **存档点在 GOAL 房间**：不应出现在 GOAL 房间内生成存档点的情形（确认 generator.js 不会将 SAVE 房间分配在 GOAL 位置，已确认）。但如果玩家自己通过调试将存档点放在 GOAL 房间，读档后应重新触发 BOSS 战（`bossFightActive` 重置）。

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|-------|
| #21 (子弹碰撞修复 — line-sweep collision) | Resolved | Low — 子弹碰撞已实现，BOSS 子弹直接复用 |
| #15 (银河城引擎 — 房间系统/碰撞/敌人) | Stable | Low — 所有必要基础设施已就绪 |
| 现有 projectile 系统 (`combat.js`) | Stable | Low — 需要扩展 `source` 标记和 BOSS 子弹工厂 |
| 现有 enemy 数据结构 (`entities.js`) | Stable | Low — BOSS 继承自 `enemy` 结构并扩展 |
| GOAL 房间类型 (`ROOM_TYPE.GOAL`) | Stable | Low — 已有完备的房间类型系统 |
| 现有 tile 渲染 (`room.js`) | Stable | Low — 追加 BOSS/FlyingFood 渲染，不影响现有逻辑 |
| #54 (蛇长度与速度关联) | Resolved | Low — 速度曲线为 BOSS 平衡设计提供参考 |
| #46 (撞墙 stuck/reverse) | Resolved | Low — BOSS 也应支持 wall stuck 行为 |

### Blocks

| Future Work | Priority |
|-------------|----------|
| 多关卡/多 BOSS（BOSS 类型枚举 + 不同颜色/射击模式） | P1 |
| BOSS 战斗独特 BGM/音效 | P2 |
| BOSS 击败通关动画（场景淡出/粒子） | P2 |
| BOSS 战奖励系统（击败后掉落特殊物品） | P2 |
| 无存档 BOSS 连续战模式 | P3 |

### Preparation Needed

- [ ] 确认 `generator.js` 中 GOAL 房间的 tile 布局已预留 5×5 战斗空间（已有 `ROOM_TYPE.GOAL` 特殊清除逻辑）
- [ ] 确认 `entities.js` 中 `createEnemy` 函数可被 BOSS 扩展（额外参数 `type`, `shootInterval`, `speedTicks` 等）
- [ ] 确认 projectile 系统添加 `source` 标记后不影响现有碰撞检测逻辑（`checkSnakeCollision` 不关心 source，仅 `checkProjectileCollision` 需区分）
- [ ] 确认 `room.js` 渲染系统对新增 FlyingFood 动画的支持（旋转、alpha 衰减）
- [ ] 确认 `constants.js` PALETTE 中 `BOSS` 颜色与现有调色板协调

---

## 7. Spike / Experiment

### Question to Answer

FlyingFood 的物理弹飞模拟在纯 JS 中性能如何？在 20×20 房间内需要多少计算量？碰撞检测（FlyingFood ↔ 蛇/BOSS）是否成为瓶颈？

### Method

1. 实现原型：`FlyingFood` 数据结构 + tick 更新函数（不含渲染）：
   - 10-20 个 FlyingFood 同时运动
   - 每个带随机初始速度（`vx=±0.5~±2.0`, `vy=±0.5~±2.0`）
   - 摩擦力系数 0.95
   - 墙壁碰撞反弹（边界检测 + 速度反转 * 0.5）
   - 蛇/BOSS 重叠检测（蛇头/BOSS 头部坐标比对）
   - 运行 100 tick 模拟并统计平均耗时

2. 测试在 `gameboy.html` 环境中实际运行，使用 `performance.now()` 测量每 tick 的函数耗时

### Expected Result

| FlyingFood 数 | 每 tick 操作 | 碰撞检测（vs snake/boss） | 预计耗时 |
|--------------|-------------|--------------------------|---------|
| 5 | 15 次位置更新 + 5 次墙检测 | 5× (蛇长度 + BOSS 长度) 次比较 | < 0.1ms |
| 10 | 30 次位置更新 + 10 次墙检测 | 10×同上 | < 0.2ms |
| 20 | 60 次位置更新 + 20 次墙检测 | 20×同上 | < 0.4ms |

每次 FlyingFood 更新仅涉及：浮点乘法（摩擦力 `vx * 0.95`）+ 边界比较（4 次 int 比较）+ 蛇/BOSS 重叠检测（蛇/BOSS 长度最多~40，约 80 次 int 比较）。即使 20 个 FlyingFood + 40 长度蛇 + 10 长度 BOSS，每 tick 计算量也远低于 1ms。**无需性能优化。**

### Impact on Approach

如果 spike 确认 FlyingFood 物理模拟性能无瓶颈（预期结论成立），Approach A 的 FlyingFood 系统落地零风险。若碰撞检测开销意外过大，可优化为：仅检测 FlyingFood 与蛇头/BOSS 头的位置重叠，忽略身体段（用碰撞存活窗口补偿准确度）。

### Spike Implementation Sketch (Prototype)

```js
// Simple FlyingFood spike — pure JS, no render
const FLYING_FOOD_COUNT = 10;
const MAX_TICKS = 100;
const ROOM_SIZE = 20;

const flyingFoods = [];
for (let i = 0; i < FLYING_FOOD_COUNT; i++) {
  flyingFoods.push({
    x: 5 + Math.random() * 10,
    y: 5 + Math.random() * 10,
    vx: (Math.random() - 0.5) * 3,
    vy: (Math.random() - 0.5) * 3,
    lifetime: 60,
  });
}

const snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10},{x:7,y:10}];
const bossHead = {x:15,y:15};

const start = performance.now();
for (let t = 0; t < MAX_TICKS; t++) {
  for (const f of flyingFoods) {
    if (f.lifetime <= 0) continue;
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= 0.95;
    f.vy *= 0.95;
    // Wall bounce
    if (f.x <= 0 || f.x >= ROOM_SIZE-1) f.vx *= -0.5;
    if (f.y <= 0 || f.y >= ROOM_SIZE-1) f.vy *= -0.5;
    f.lifetime--;
    // Collision check with snake head
    if (Math.abs(f.x - snake[0].x) < 0.5 && Math.abs(f.y - snake[0].y) < 0.5) { /* eaten */ }
    // Collision with boss head
    if (Math.abs(f.x - bossHead.x) < 0.5 && Math.abs(f.y - bossHead.y) < 0.5) { /* eaten by boss */ }
  }
}
const elapsed = performance.now() - start;
// Expected: << 1ms for 100 ticks of 10 flying foods
```
