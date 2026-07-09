# Research: 关卡障碍死亡惩罚迭代

> Parent Issue: #22
> Agent: research-agent
> Date: 2026-07-07
> Status: Open
> Priority: Medium

---

## 1. Problem Definition

### Current Behavior

当前游戏（Issue #15 实现）中，蛇与任何障碍物碰撞的处理逻辑是**一刀切**的：

- `collision.js` / `checkSnakeCollision()`: 检测到 `CELL.WALL` 或 `CELL.STONE_WALL` → 返回 `['wall']`
- `core.js` / `tick()`: 收到 `'wall'` 碰撞结果 → 立即 `gameState = 'gameover'` → 游戏结束
- **所有墙壁（边界墙、室内障碍墙）都会导致玩家直接死亡**
- 敌人碰撞（`'enemy'`）当前会导致蛇减少 1 段长度，**不是即死**
- 没有任何「扣血扣长度」的减速带机制

现有的 5 种 Cell 类型：

| CELL 常量 | 值 | 含义 | 当前碰撞行为 |
|-----------|-----|------|-------------|
| `FLOOR` | 0 | 地面 | 可通行 |
| `WALL` | 1 | 普通墙 | 即死（gameover） |
| `CRACKED_WALL` | 2 | 可破坏墙 | 无碰撞处理（项目符号破坏后变 FLOOR） |
| `DOOR` | 3 | 门 | 触发房间切换 |
| `STONE_WALL` | 4 | 石墙 | 即死（gameover） |

### Expected Behavior

区分三种级别的碰撞惩罚：

1. **边界墙（Room 边框墙）**：玩家撞到 → 不会即死，扣除 1 格蛇身长度 + 镜头震动。蛇长度为 0 时才 gameover。
2. **普通室内障碍（室内 WALL 块）**：玩家撞到 → 不会即死，扣除 1 格蛇身长度 + 镜头震动。
3. **特殊即死障碍（DEATH_WALL / DEATH_PIT）**：玩家撞到 → 立即 gameover，无扣血机会。

此外，玩家撞到**非即死障碍**时，提供**镜头震动**反馈，让玩家感觉到"痛了"。

### User Scenarios

- **Scenario A（正常撞墙）：** 玩家探索房间时不小心撞到边界墙 → 蛇尾减 1 格，屏幕震一下 → 玩家意识到危险但继续游玩，不用重开游戏。
- **Scenario B（撞室内障碍）：** 玩家躲避敌人时撞到室内障碍块 → 掉 1 格长度 + 震动 → 蛇够长时只是小挫折，长度短时有紧迫感。
- **Scenario C（撞即死障碍）：** 玩家不幸钻入设有即死墙的房间 → 蛇头碰到特殊障碍 → 立即 gameover → 加载最近存档。玩家需要记住这些危险位置。
- **Scenario D（长度归零）：** 玩家多次撞墙导致蛇长度变为 0 → 触发 gameover（与当前一致，但归零过程更长，给玩家更多反应时间）。
- **Frequency:** 每局游戏中会发生多次。碰撞惩罚分层后，高频的非致死碰撞变为可接受体验。

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

Issue #15 的 MVP 实现中，碰撞检测保持了经典贪吃蛇的惯例——撞墙即死。设计重心放在了房间系统、地图生成、敌人 AI 和攻击系统上，碰撞惩罚体系被保留为"最简单版本"。

- 原始的 `checkSnakeCollision()` 对 WALL 和 STONE_WALL 一视同仁
- 没有引入"伤害"系统（damage/damageType）的概念
- 碰撞后处理路径只有两条：`'wall' → gameover` 或 `'enemy' → length - 1`
- 即死障碍的视觉区分尚未设计

### Why Change Now?

1. **游戏体验升级：** 将即死碰撞改为扣长度 + 震动，大幅提升单次游玩时间（玩家不会因一次小失误就重开）。
2. **地图设计表达：** 区分"普通墙"和"即死墙"让关卡设计更有层次。普通墙是减速带，即死墙是真正的危险区。
3. **视觉反馈系统：** 镜头震动是银河城/动作游戏的标配反馈，撞到东西有"痛感"让操作更"肉"。
4. **与现有系统兼容：** 扣长度与攻击系统（消耗长度发射子弹）在资源设计上一致——长度是玩家的生命值和资源。

### Previous Constraints

- **无外部依赖**：屏幕震动不能用 CSS `animation`（在 Canvas 中实现）或第三方库——在 render 层用 viewport offset 实现。
- **单 Canvas 渲染**：震动通过偏移 `ctx.translate()` 实现，不能移动 DOM 元素。
- **STONE_WALL 当前是室内装饰墙**：需决定是否将部分 STONE_WALL 改为即死墙，或者引入新类型。
- **生成器约束**：地图生成器 `generateRoomTiles` 在室内放置 WALL 形成障碍物——生成器需要区分"普通障碍"和"即死障碍"的放置规则。

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/constants.js` | Constants | **新增** `CELL.DEATH_WALL`（值=5）即死障碍类型；可选新增 `CELL.LAVA`/`CELL.SPIKE` 等视觉变体 |
| `public/src/engine/collision.js` | Collision | **修改** `checkSnakeCollision()`：WALL/STONE_WALL 返回 `'damage'` 而非 `'wall'`；`CELL.DEATH_WALL` 返回 `'death'`；不再直接返回 `'wall'` |
| `public/src/engine/core.js` | Core (tick) | **修改** 碰撞处理路径：收到 `'damage'` → length - 1 + 设置 `screenShake` 状态；收到 `'death'` → gameover；保留 `length === 0 → gameover` 兜底 |
| `public/src/render/room.js` | Room Rendering | **修改** `CELL.DEATH_WALL` 渲染为红色/熔岩色/尖刺视觉；`CELL.STONE_WALL` 可重新设计以区别于普通 WALL |
| `public/src/render/renderer.js` | Renderer | **修改** 集成屏幕震动：在 `renderRoom()` 中根据 `state.screenShake` 应用 `ctx.translate()` 偏移 |
| `public/src/engine/generator.js` | Generator | **修改** 在特定房间类型（危险/陷阱主题房间）放置 `DEATH_WALL`；STONE_WALL 可改为普通障碍（非即死） |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/render/hud.js` | HUD | 可考虑在扣长度时显示红色闪烁或伤害指示 |
| `public/src/engine/combat.js` | Combat | 子弹碰撞：子弹打到普通墙应消失但墙不损坏；打到 `CRACKED_WALL` 继续破坏逻辑 |
| `public/src/engine/world.js` | World | `generateDefaultTiles()` 需确认不影响（边框墙用 WALL，仍为非即死） |
| `tests/metroidvania-snake.test.js` | Tests | 需要新增测试用例验证三种碰撞惩罚路径 |
| `public/gameboy.html` | HTML | 无需结构性变更，但渲染调整可能需要确认 Canvas 大小 |

### Data Flow Impact

```
[Before: tick collision handling]
checkSnakeCollision → 'wall' → gameover (immediate)
                    → 'enemy' → length-1 (with check)
                    → 'self' → gameover

[After: tick collision handling]
checkSnakeCollision → 'damage' → length-1 + screenShake=true
                    → 'death'  → gameover (immediate)
                    → 'self'   → gameover
                    → 'enemy'  → length-1 + screenShake=true (可选项)
                    → length === 0 → gameover (兜底检查)
```

### Documents to Update

- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` — 添加 CELL 类型扩展和碰撞处理说明
- [ ] `docs/TASKS/22-obstacle-death-penalty.md` (本文件)
- [ ] `tests/metroidvania-snake.test.js` — 新增测试用例
- [ ] `docs/STATUS.md` — 更新进度

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: 最小改动 — 修改碰撞返回值 + 新增 DEATH_WALL（推荐）

**Description:** 在现有架构基础上做最小改动：
1. `constants.js` 新增 `CELL.DEATH_WALL = 5`
2. `collision.js` `checkSnakeCollision()`：将 WALL 和 STONE_WALL 的碰撞结果从 `'wall'` 改为 `'damage'`；新增 `DEATH_WALL → 'death'`
3. `core.js` `tick()`：处理 `'damage'` → length - 1 + 设 `screenShake` 标志；`'death'` → gameover；移除原有 `'wall'` 处理分支
4. `renderer.js`：读取 `state.screenShake` 在渲染时应用 `ctx.translate(randomOffset)`，持续数帧后衰减
5. `generator.js`：在特定房间（如陷阱房间）放置 `DEATH_WALL`；STONE_WALL 保留但改为非即死
6. `room.js`: 添加 `DEATH_WALL` 渲染（红色/熔岩效果）

**Pros:**
- 改动范围小，只涉及 5-6 个文件
- 不改变核心数据流（tick → collision → state update → render）
- 现有碰撞结果数组结构 `['damage']` 兼容之前的 `['wall']` 格式
- 屏幕震动可复用 `tickCount` 计时和衰减

**Cons:**
- 需要重新设计哪些墙是即死的（生成器逻辑增加条件）
- 屏幕震动的"余震"时间、强度需要调参
- 需要对室内 WALL 和室内 STONE_WALL 做渲染区分（否则玩家分不清）

**Risk:** Low — 改动路径清晰，与现有架构兼容
**Effort:** 小型（预计 1-2 小时）

### Approach B: 引入 Damage System（伤害数值化）

**Description:** 设计一个通用的伤害系统，碰撞不再是简单的"扣1格"，而是：
1. 每种碰撞类型（WALL, ENEMY, DEATH_WALL, 等）携带 `damage` 数值
2. 引入 `state.damageQueue` 或直接在碰撞结果中返回 `{ type, damage, isLethal, screenShake }` 结构
3. 伤害可能来自墙壁（dmg=1）、敌人（dmg=1）、即死墙（dmg=Infinity）、道具/陷阱（dmg=2-3）
4. 碰撞结果从字符串数组变为对象数组

**Pros:**
- 更灵活——后续可以轻易给陷阱、Boss、环境伤害设定不同数值
- 为未来扩展（血量系统、护甲道具）奠定基础
- 碰撞处理逻辑统一在 `applyDamage()` 函数中

**Cons:**
- 过度设计——当前需求仅需 3 种碰撞结果，无需数值化伤害
- 改动范围大——涉及 collision.js、core.js、combat.js、entities.js
- Issue #22 的需求不要求差异化的伤害数值，只要求是否即死
- 增加不必要的复杂度

**Risk:** Medium — 抽象层次较高，但当前需求简单
**Effort:** 中大型（预计 2-4 小时）

### Recommendation
→ **Approach A** 因为：
1. 需求明确只增加一个"即死 vs 非即死"的二分，不需要数值化伤害
2. 最小改动原则，在 Issue #15 刚部署完成时优先做增量式改进
3. 屏幕震动与碰撞处理解耦（震动只在 render 层处理）
4. 未来如需伤害数值化，可在 Approach A 基础上平滑升级（将 `'damage'` 替换为 `{ type: 'damage', amount: 1 }`）

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 玩家控制蛇撞到 Room 边界墙 → 蛇尾减 1 格 → 屏幕震动 300ms → 游戏继续
2. 玩家撞到室内普通障碍（CELL.WALL 块） → 蛇尾减 1 格 → 屏幕震动 → 游戏继续
3. 玩家撞到 STONE_WALL → 蛇尾减 1 格 → 屏幕震动 → 游戏继续（STONE_WALL 改为非即死）
4. 玩家撞到 DEATH_WALL（红色即死墙） → 立即 gameover → 加载存档或返回标题
5. 玩家多次撞墙导致蛇长度归零 → gameover

### Edge Cases
1. **蛇长度=1时撞墙：** 撞墙前蛇长度=1，撞墙后 `length-1=0` → gameover。与撞 DEATH_WALL 效果相同，但流程不同（先扣血再检测零长度）。
2. **撞墙同时吃食物：** 蛇长度=1 时同时撞墙并吃到食物 → 先处理碰撞（扣到 0，gameover）还是先处理食物？→ **策略：先处理碰撞惩罚，再处理食物。** 如果扣到 0 则 gameover 优先，食物不消耗。
3. **撞 DEATH_WALL 同时触发门的房间过渡：** 当门位置同时是 DEATH_WALL（不应发生，生成器应避免）→ 即死优先级高于门过渡。
4. **房间内所有障碍都是 DEATH_WALL：** 生成器确保每个房间至少留有安全通道，不会让玩家进入即被困死。
5. **屏幕震动累积：** 玩家连续快速撞墙（如卡在墙缝里）→ 震动不应叠加，每次重置震动计时/强度即可。

### Failure Paths
1. **震动导致实际画面偏移过强：** 玩家在震动时感到眩晕或不适 → 震动幅度限制在 ±3px 内，持续时间不超过 500ms。
2. **DEATH_WALL 与非即死墙视觉混淆：** 玩家无法区分类别是"掉血"还是"即死" → DEATH_WALL 必须使用明显不同的颜色/样式（熔岩红、尖刺图案、骷髅标记等）。
3. **撞墙扣血后蛇位置：** 蛇头撞到墙后停留在原位置（不向前移动），避免蛇头嵌入墙内导致反复扣血/卡住。

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| Issue #15 实现分支 (`implement/15-metroidvania-snake-overhaul`) | Merged to master | Low — #15 已完成并合并 |
| `collision.js` `checkSnakeCollision()` 返回结构 | Stable | Low — 从返回 `['wall']` 改为 `['damage']` 兼容现有数组格式 |
| `core.js` `tick()` 碰撞处理分支 | Stable | Low — 移除 `'wall'` 分支，增加 `'damage'`/`'death'` 分支 |
| Canvas 2D API `ctx.translate()` | Stable | Low — 所有浏览器支持 |
| 生成器（`generator.js`）的房间类型分配 | Stable | Low — 已有陷阱房间概念，扩展即可 |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Boss 房间 & Boss AI | Post-MVP (Phase 2) — Boss 的攻击可复用 damage 系统 |
| 道具系统（护甲、减伤） | Post-MVP (Phase 2) — 扣血机制奠定护甲数值基础 |
| 血量 UI 改进（Heart display） | Low — 当前长度即血量，无需额外 UI |

### Preparation Needed
- [ ] 确认现有测试 `gameboy-vercel.test.js` 和 `metroidvania-snake.test.js` 不因碰撞行为改变而失败
- [ ] 确认生成器 `generateRoomTiles()` 中 STONE_WALL 的放置逻辑：当前 STONE_WALL 是装饰，改为非即死后不需要改变生成逻辑
- [ ] 设计 DEATH_WALL 的视觉样式（红色/熔岩/尖刺），避免与现有 WALL 混淆

---

## 7. Spike / Experiment

### Question to Answer
屏幕震动（screen shake）的最佳参数是什么？震动的强度、持续时间、衰减曲线如何设计才能让玩家感受到"痛了"但不会导致眩晕或操作困难？

### Method
1. 在 render 层实现一个简易抖动函数：在 `renderRoom()` 调用前应用 `ctx.translate()` 偏移
2. 测试不同参数组合：
   - 强度：±2px / ±3px / ±5px
   - 持续时间：200ms / 300ms / 500ms
   - 衰减：线性衰减 / 指数衰减
   - 频率：每帧随机 / 每 2 帧随机
3. 在 `core.js` 中植入手动触发 `screenShake` 的简易条件（按 T 键触发测试）
4. 在实际游戏中撞墙体验，选择最舒服的参数

### Result
（Spike 结果将在 Plan 阶段实际运行后补充。Expected 推荐参数：强度 ±3px，持续时间 300ms（6 tick at 50FPS），指数衰减（乘因子 0.7 per tick），每次 tick 重新随机偏移方向。）

### Impact on Approach
如果震动参数测试结果良好（玩家反馈"痛了"但不影响操作），则 Approach A 中震动实现方案直接敲定。如果震动的实现复杂度超出预期（如需要单独震动状态机 vs 简化震动），可将震动作为一个独立子任务分离出来。Combat 场景（子弹击中敌人）的震动效果可留待后续扩展。
