# Research: 银河城风格贪吃蛇重构

> Parent Issue: #15
> Agent: research-agent
> Date: 2026-07-07

---

## 1. Problem Definition

### Current Behavior
当前游戏是一个标准的贪吃蛇：
- 20×20 单屏网格，蛇在单一平面内移动
- 仅一种交互目标：吃食物增长，填满全屏或撞墙/撞自己结束
- 无地图、无关卡、无敌人、无存档、无攻击系统
- 游戏状态极简：`idle → playing → won/gameover`
- 渲染仅包括：背景网格 + 蛇身 + 食物 + 分数 + 覆盖层
- 游戏生命周期通常 30 秒至 2 分钟，单一目标（吃满 400 格）几乎不可能达到

### Expected Behavior
游戏应进化为一个**微型银河城（Metroidvania）地牢探索游戏**，包含以下 9 项核心特性：

1. **关卡拓展：** 单一网格变为多房间地图，房间之间有门/通道连接。部分房间需要特定钥匙（Key Lock）解锁。玩家目标是到达特定锁定的目标房间即可胜利。
2. **小地图：** 屏幕一角显示缩略地图，标明玩家当前位置及已探索房间。
3. **地图迷雾（Fog of War）：** 未探索的房间在地图上不可见（黑色覆盖）。玩家进入后房间永久显示。
4. **长度锁（Size Gate）：** 某些房间入口要求蛇的最小长度，蛇不够长则无法通过。
5. **攻击系统：** 蛇头可以发射"子弹"，每发射一次蛇身减少 1 格长度。子弹有攻击力、发射频率、飞行速度和衰减距离（子弹飞出若干格后消失）。长度归零即死亡。
6. **敌人方块：** 地图中生成的敌对实体，其"血量"等于自身长度。敌人有移动 AI（追逐玩家）。玩家蛇头碰到敌人方块减少 1 格长度（即蛇尾消失一格）。长度归零即死。
7. **食物系统：** 地图上生成的食物，蛇吃到增长 1 格。蛇越长移动速度越慢。敌人也可以抢吃食物——敌人吃到也会增长。
8. **存档房间：** 地图中存在特定存档点房间，蛇到达后自动存档。
9. **隐藏房间：** 某些房间隐藏在可破坏墙后（墙表面有裂纹提示）。隐藏房间内有抽奖机（Gacha Machine），玩家消耗自身长度来抽取道具。道具围绕攻击系统设计（攻速加成、攻击频度、双发子弹、衰减强化等）。

### User Scenarios
- **Scenario A（初次体验）：** 用户打开游戏，进入初始房间。小地图仅显示当前房间。用户探索相邻房间，发现长度锁阻止了前进道路 → 需要先找食物增长 → 游戏驱动自然。
- **Scenario B（卡关突破）：** 用户发现一扇需要钥匙的门，但地图已探索区域没有钥匙 → 用户意识到需要穿过隐藏房间的裂缝墙才能找到钥匙 → 利用攻击系统打破墙壁。
- **Scenario C（深度策略）：** 蛇已经很长 → 移动变慢，但攻击系统可以消耗长度换取子弹 → 玩家需要权衡：保留长度保证生存 vs 消耗长度攻击敌人/破坏墙壁/抽取道具。
- **Frequency:** 每次游玩均为完整的新地图生成（Roguelite 风格，每局随机生成地图拓扑），可重复性好。

---

## 2. Root Cause Analysis / Design Intent

### Why Does Current Behavior Exist?
当前的贪吃蛇是 Issue #5 的 MVP 实现，核心目标是在 1-2 小时内快速交付一个可玩的 GameBoy 风格游戏。设计上刻意保持最小功能集（移动、吃食物、碰撞、胜利），专注于视觉风格（GameBoy 4 色调色板、外壳、像素间隙、扫描线）。

### Why Change Now?
1. **可玩性不足：** 当前游戏单局体验单调，胜利条件（填满 400 格）几乎不可达成，失败则立刻回到起点，缺乏渐进式目标和成就感。
2. **差异化需求：** 将经典贪吃蛇进化成一个独特的"蛇系银河城"品类，在开源游戏项目中具有辨识度。
3. **SaaS 复用价值：** 本项目的意义在于作为自动化开发工作流的展示。一个更有深度的游戏能更好展示持续迭代的价值。

### Previous Constraints
- **零外部依赖：** 不使用框架、游戏引擎或第三方包（除 Vitest 测试外）
- **单 HTML 文件架构：** 引擎为独立 ES module (`src/`)，渲染集成在 `public/gameboy.html` 中
- **Canvas 2D 渲染：** 不使用 WebGL/Three.js，保持简单可维护
- **Vercel 部署友好：** 所有静态资源必须位于 `public/` 目录下（已通过 #11 修复）

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/gameboy-snake-engine.js` | Game Engine | **重大重构：** 从单屏 Snake 引擎变为房间地图引擎。新增：Room/TileMap 数据结构、敌人 AI、攻击弹道、门/锁机制、存档/抽奖机逻辑。几乎所有现有函数需要重写或扩展。 |
| `public/gameboy.html` | UI / Rendering / Input | **重大重构：** 新增小地图渲染、迷雾渲染、房间视角切换（scrolling/camera）、攻击输入（A/B 按钮）、敌人动画、道具 UI、存档提示。HTML 结构需扩展（新增地图画布、道具栏等）。 |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `tests/gameboy-snake.test.js` | Tests | 当前 25+ 测试用例基于单屏 Snake 逻辑。需要全面重写为新引擎的测试。 |
| `docs/DESIGN/5-gameboy-snake-game.md` | Design Doc | 现有设计文档不再反映架构。需要更新或取代。 |
| `README.md` | Documentation | 项目描述需要更新。 |

### Data Flow Impact
```
[Before]
keydown → changeDirection → tick → render

[After]
keydown → [changeDirection / shoot / interact] → tick → [
  1. 蛇移动（房间内网格）
  2. 碰撞检测（蛇→食物、蛇→敌人、蛇→门、弹药→敌人、弹药→墙）
  3. AI 移动（敌人追踪）
  4. 房间切换（穿门时）
  5. 弹药飞行（衰减检测）
  6. 状态更新（长度增减、血量变化、道具效果）
] → render → [房间渲染 / 小地图渲染 / HUD 渲染]
```

### Documents to Update
- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` (Plan 阶段创建)
- [ ] `docs/PRD/5-gameboy-snake-game.md` (标记为 superseded by #15)
- [ ] `docs/TASKS/15-metroidvania-snake-overhaul.md` (本文件)
- [ ] `README.md`
- [ ] `docs/STATUS.md`

---

## 4. Solution Comparison

### Approach A: 全量重构为 Room-Based 引擎（推荐）

**Description:** 在现有代码基础上全面重写引擎。核心架构从单屏网格变为虚拟大地图 + 房间视口（viewport）。每个房间是一个 20×20 网格的子区域，房间之间通过门连接。地图拓扑在游戏开始时程序化生成。

**核心架构变化：**
```
WorldMap {
  dimensions: { cols: N, rows: M },
  rooms: Room[][],
  keys: Key[],
  playerPosition: { roomX, roomY, cellX, cellY },
}

Room {
  tiles: Cell[][],           // 20×20
  doors: { DIR: targetRoom },
  entities: { enemies, food, items, gachaMachine },
  state: { explored: bool, cleared: bool, visited: bool },
}

GameState {
  snake: Segment[],          // 蛇身坐标（世界坐标）
  currentRoom: { x, y },
  direction,
  ammo: { cooldown, speed, decay, power },
  inventory: { keys[], items[] },
  savePoint: { roomX, roomY },
  lengthRequired,             // 当前通过长度锁所需的最小长度
}
```

**Pros:**
- 完整的架构一致性，所有新功能基于同一数据模型
- Room 抽象天然支持所有需求（门、锁、敌人、存档点、隐藏房间）
- 易于扩展新房间类型（商店房间、Boss 房间、传送房间等）
- 测试可独立验证房间生成、路径连通性、AI 行为

**Cons:**
- 重构工作量大（引擎几乎全部重写）
- 现有测试几乎全部失效，需要重新编写
- 渲染管线复杂度大增（需处理 camera、视差滚动）

**Risk:** Medium — 架构清晰但实现细节多，需要逐步迭代验证
**Effort:** 大型（预计 8-15 小时分阶段实施）

### Approach B: 增量式扩展（在现有引擎上叠加特性）

**Description:** 保持现有 20×20 网格引擎基本不变，通过"叠加层"添加新特性：
- 关卡拓展：用 Room 对象的简单数组替代程序化地图，每次切换房间时替换当前网格内容
- 长度锁：在门位置增加简单长度判断
- 攻击系统：在 tick 中增加简单的弹道处理
- 敌人：作为移动的"特殊食物"实体，在 tick 中处理其移动
- 小地图/迷雾：独立的渲染层

**Pros:**
- 可以并行保留现有游戏和测试
- 每项特性可以单独开发、测试、合并
- 回滚粒度更细

**Cons:**
- 架构上无法很好地支持房间间连贯体验（蛇跨房间时状态连续性需特殊处理）
- 地图生成逻辑与房间切换逻辑分离，增加复杂度
- 后续扩展困难（房间大小不一致、Boss 房间等）
- 最终架构不如方案一干净，可能产生"缝合"代码

**Risk:** Medium-High — 增量叠加可能导致越来越多的技术债
**Effort:** 大型（预计 10-18 小时，因反复重构可能更长）

### Recommendation
→ **Approach A** 因为：
1. 游戏整体架构本质变化（从单场景到多场景）是范式转移，增量叠加并不节省时间，反而增加维护成本
2. 未来扩展性（更多房间类型、Boss、道具组合）需要统一的 Room 抽象
3. 测试层面的前置投入（验证地图生成算法、路径连通性、AI 行为）在 Approach B 中很难实现
4. 蛇的跨房间移动在 Approach A 中有自然的数据模型（世界坐标），Approach B 需要额外的桥接逻辑

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 游戏启动 → 程序化生成地图拓扑 + 房间内容 → 玩家出生在初始房间
2. 小地图显示当前房间已探索区域；相邻房间若已连接则显示门的位置
3. 探索相邻房间，吃食物增长蛇身
4. 遇到长度锁 → 意识到长度不足 → 回头探索其他房间获取更多食物
5. 蛇足够长后通过长度锁 → 进入新区
6. 找到钥匙 → 解锁对应门 → 最终到达目标房间
7. **胜利画面：** "DUNGEON CLEARED" + 统计数据（时间、长度、击杀数等）

### Edge Cases
1. **地图无解（Unsolvable Map）：** 程序化生成的地图因随机种子导致目标房间不可达（钥匙房间被长度锁阻挡，而增长路径又被另一把锁阻挡）。→ 地图生成算法需要保证**始终有解**：使用有向图生成 + 反向可达性验证。若不可解则重新生成（3 次尝试内几乎必定成功）。
2. **蛇长度缩减至 0：** 攻击过度消耗导致蛇身归零 → 立即游戏结束（死亡）→ 加载最近存档点 → 玩家损失上次存档以来的所有进度。
3. **蛇最大长度（400 格）逼近：** 蛇极长时移动极慢 → 此时开关长度锁应自动通过（长度锁判定为 >= 要求长度，长蛇自动满足）。同时，攻击系统消耗长度提供了自然的下行调节手段。
4. **房间内无剩余食物：** 敌人抢走了所有食物或食物数量不足 → 蛇需要通过门去其他房间补充 → 如果所有可到达房间的食物都被吃光了 → 玩家只能依赖攻击系统消耗长度或被敌人攻击减少长度来保持动态平衡（或者进入死路状态，此时需要触发"emergency food respawn"机制）。
5. **敌人在门附近追逐：** 蛇穿过门时，敌人跟随穿过门 → 需要决定敌人是否可以跨房间追踪（建议：敌人在离开其生成房间 2 个房间后返回，防止无限追击）。
6. **攻击系统全局冷却 vs 弹药飞行：** 如果玩家连续开火，子弹可能重叠或同时存在多枚 → 需要限制同时存在的子弹数量上限（建议：最多 3 枚）。

### Failure Paths
1. **地图生成超时：** 程序化生成持续失败（稀有种子导致无限循环）→ 设置最大重试次数（5 次），如果仍失败则回退到预置的"安全地图"。
2. **Canvas 渲染性能问题：** 多房间地图 + 迷雾渲染 + 敌人动画 + 小地图在低端设备上卡顿 → 可选的"简单模式"：关闭迷雾渲染，小地图更新频率降低。
3. **游戏存档损坏：** localStorage 存档数据格式不一致（上次版本遗留数据）→ 检测到格式不匹配时自动重置存档，不导致游戏崩溃。

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| Canvas 2D API | Stable | Low — 所有现代浏览器 |
| `localStorage` | Stable | Low — 所有现代浏览器 |
| 现有游戏引擎 (`public/src/gameboy-snake-engine.js`) | Stable | Medium — 将全面重写，需要确保不破坏已有功能直至新引擎就绪 |
| Vitest test runner | Stable | Low |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Boss 房间 & Boss AI | Post-MVP (Phase 2) |
| 道具组合系统（道具间联动效果） | Post-MVP (Phase 2) |
| 排行榜 (Leaderboard) | Post-MVP (Phase 3) |
| 每日挑战（指定种子） | Post-MVP (Phase 3) |

### Preparation Needed
- [ ] 确保现有 `gameboy.html` 的快照/测试在新引擎开发期间保持独立（创建 feature 分支）
- [ ] 验证程序化地图生成算法的理论基础（参考：Roguelike 房间生成、BSP、Random Walk）

---

## 7. Spike / Experiment

### Question to Answer
程序化地图生成算法是否能保证始终有解（即目标房间从起点可达）？地图规模需要多大才能提供足够的探索深度（15-30 分钟的游戏时长）？

### Method
1. 实现一个简化的地图生成原型（纯逻辑，无 UI）：
   - 定义房间类型：普通、钥匙房间、长度锁房间、目标房间、存档房间
   - 使用图生成（Random Walker 或 Prim 算法）生成连通图
   - 分配钥匙+锁的关系（保证解的存在性）
   - 验证 100 次生成中解的可用性
2. 统计地图生成时间、平均房间数、最短路径长度

### Result
（Spike 结果将在 Plan 阶段实际运行后补充。预期结论：5×5 至 7×7 的地图网格（25-49 个房间），使用 BFS/DFS 可达性验证可 100% 保证有解，生成时间 < 50ms。）

### Impact on Approach
如果 Spike 证实地图生成的高可靠性和低耗时，Approach A 的风险将进一步降低，且 5×5 规模的地图足以提供可观的探索内容（平均通关时间预计 15-25 分钟）。如果生成可靠性不理想，需要引入预置地图作为备选方案。
