# Research: 撞到红色敌人不会掉血

> Parent Issue: #20
> Agent: research-agent
> Date: 2026-07-07

---

## 1. Problem Definition

### Current Behavior
玩家蛇头撞到红色敌人时，蛇身不会减少一格长度。敌人会持续跟随蛇头占据同一格，但永远不会触发伤害。

**复现步骤：**
1. 进入有敌人的房间
2. 朝敌人方向移动（蛇头进入敌人所在格子）
3. 观察蛇身长度（不变）
4. 敌人 AI 使其追逐蛇头 —— 敌人移动到蛇头所在格子，但仍无伤害
5. 蛇继续前进，敌人继续"贴脸跟随"，始终不掉长度

**命令行验证（直接运行 core.js tick 逻辑）：**
- 蛇在 tick N 移动到 (31,30)，敌人在 tick N AI 阶段也从 (31,29) 移动到 (31,30)
- tick N+1: 蛇移动到 (32,30)，敌人 AI 阶段继续移动到 (32,30)
- 连续 3 个 tick，蛇始终有 3 段长度，**零伤害**

### Expected Behavior
根据 #15 的 PRD 规定：
> 玩家蛇头碰到敌人方块减少 1 格长度（即蛇尾消失一格）。长度归零即死。

应当：
- 蛇头与敌人占据同一格 → 蛇身减少 1 格长度
- 分数减少 5 分（不低于零）
- 若蛇长度归零 → 游戏结束

### User Scenarios
- **Scenario A（主动撞敌）：** 玩家直接朝敌人移动，蛇头进入敌人所在格子。预期掉一格，实际不掉。
- **Scenario B（敌人追尾）：** 玩家在房间内移动，敌人通过 AI 追逐蛇头并与之重叠。预期持续掉血，实际永远不会触发伤害。
- **Scenario C（无敌穿怪）：** 玩家可以无伤穿越敌人身体（因为敌人的 body segments 也不参与碰撞检测）。预期至少头部撞击应掉血。
- **Frequency:** 每次与敌人碰撞均触发，非偶发。

---

## 2. Root Cause Analysis (Bug)

### Why Does Current Behavior Exist?
经过深入分析 `core.js` 的 `tick()` 函数和 `ai.js` 的 `updateEnemies()` 函数，发现**时序漏洞**是根本原因：

```
tick() 中的执行顺序：
  1. apply direction
  2. compute newHead
  3. checkSnakeCollision(newHead)  ← 只检查 newHead（蛇头即将到达的位置）
  4. handle room transition
  5. move snake          ← 蛇移动到 newHead
  6. handle enemy damage  ← 使用步骤 3 的结果 (collidedEnemy)
  7. update projectiles
  8. update enemies (AI)  ← 敌人在此阶段移动！但碰撞已检查完毕
  9. cooldowns / food respawn
```

**关键问题：** 敌人的 AI 移动发生在步骤 8（`updateEnemies`），但所有碰撞检测（步骤 3 和 6）都在步骤 8 **之前**完成。这意味着：

1. **主动撞敌（直接走入敌人格子）：** 步骤 3 能检测到 → 可触发伤害 ✅
2. **敌人 AI 阶段移动到蛇身上：** 步骤 8 后没有任何重新检查 → 伤害漏检 ❌
3. **敌我重叠持续后续 tick：** 下一个 tick 的步骤 3 只检查蛇头**即将到达**的位置（newHead），而不是蛇头**当前**的位置 → 如果蛇继续移动，重叠永远不会被检测到 ❌

**重现场景（已验证）：**
- tick 1: 蛇在 (30,30)→(31,30)，敌人在 (31,29)→AI 阶段敌人移动到 (31,30) ✓ 重叠！但碰撞已检查完毕 → 无伤害
- tick 2: 蛇在 (31,30)→(32,30)，步骤 3 检查 newHead=(32,30) → 无敌人在此 → 无伤害。AI 阶段敌人移动到 (32,30) → 再次重叠
- tick 3: 重复，蛇永远不掉血

### Why Change Now?
可玩性关键缺陷——敌人不造成伤害，整个战斗系统形同虚设。攻击系统（消耗长度发射子弹）和敌人的存在失去意义。

### Previous Constraints
- **零外部依赖**（无框架/引擎）
- **纯函数式状态管理**（状态不可变，tick 返回新状态）
- 敌人 AI 移动与被碰撞检测分离的架构设计

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js` | Game Engine (`tick()`) | **核心修复：** 需在 AI 阶段后增加碰撞重检，或修复 tick 时序 |
| `public/src/engine/collision.js` | Collision Detection | **可能扩展：** 增加蛇身段 → 敌人的全面碰撞检测 |
| `public/src/engine/ai.js` | Enemy AI (`updateEnemies()`) | **轻微修改：** 敌人移动前检查目标格子是否被蛇占据 |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `tests/metroidvania-snake.test.js` | Tests | 需增加 edge case 测试（敌人 AI 撞蛇） |
| `docs/PRD/15-metroidvania-snake-overhaul.md` | PRD | 如果碰撞规则有调整需同步 |

### Data Flow Impact
```
[Current - Buggy]
tick → [move snake → check enemy → AI moves enemy → enemy overlaps snake UNCHECKED]

[Fixed]
Option A: tick → [move snake → check enemy → AI moves enemy → RE-CHECK enemy overlap]
Option B: tick → [move snake → check enemy ← AI moves enemy ← cannot move onto snake]
```

### Documents to Update
- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` (如果碰撞规则明确化/扩大化)
- [ ] `docs/PRD/15-metroidvania-snake-overhaul.md` (无变化)
- [ ] `README.md` (无变化)

---

## 4. Solution Comparison

### Approach A: 碰撞重检（AI 后二次检测）（推荐）
- **Description:** 在 `tick()` 中移动敌人 AI 后，增加一个后置碰撞检查。如果 AI 阶段后蛇头与敌人重叠，执行与前置碰撞相同的掉血逻辑。
- **Pros:**
  - 修复彻底，覆盖所有时序漏洞
  - 实现简单：`tick()` 中在 `updateEnemies` 后加一个类似 `handlePostAiEnemyCollision()` 的检查
  - 不改动 AI 行为逻辑，保持 AI 追逐的自然性
- **Cons:**
  - 一个 tick 内可能触发两次碰撞（蛇主动撞进敌人 + AI 移动再撞），需防止双重扣血
  - 二次检测增加了 tick 循环的复杂度
- **Risk:** Low — 纯新增检查，不影响现有逻辑
- **Effort:** 小（约 0.5-1 小时）

### Approach B: AI 移动前检查蛇占据
- **Description:** 在 `updateEnemies()` 中，敌人尝试移动前检查目标格子是否被蛇的任何段占据。若被占据，则敌人不移动（或敌人移动但触发伤害）。
  - 子方案 B1: 敌人不移动到蛇身上（阻塞移动）
  - 子方案 B2: 敌人移动到蛇身上，并立即触发伤害（需向调用者返回信号）
- **Pros:**
  - B1: 最安全——敌人永远不会和蛇重叠，避免所有后续问题
  - 改动集中在 ai.js 一个文件
  - 逻辑直观：敌人不能"走进"蛇
- **Cons:**
  - B1: 玩家可以主动顶住敌人使其无法移动（卡位），减少 AI 追逐的真实感
  - B2: 需要跨模块通信（ai.js → core.js），增加耦合
  - B1: 如果敌人被蛇包围，可能完全无法移动
- **Risk:** Low-Medium（B1 偏低，B2 偏高）
- **Effort:** 小（约 0.5-1 小时）

### Approach C: 扩展碰撞检测至敌人全部 body segments
- **Description:** 修改 `checkSnakeCollision` 和 `checkEnemyOverlap`，使其不仅检查蛇头是否等于敌人中心坐标 `e.x, e.y`，还检查蛇头是否等于敌人 body segments 中的任意一段。
- **Pros:**
  - 视觉一致性更高——敌人渲染的 body segments 现在也有碰撞体积
  - 单纯看 collision.js 改动
- **Cons:**
  - 不解决时序漏洞（敌人 AI 撞蛇的问题仍然存在）
  - 敌人 body segments 的定位管理复杂（AI 移动段落后需要保持）
  - 与敌人的碰撞规则改变，可能需要调整游戏平衡
- **Risk:** Medium — 改动碰撞边界，可能影响游戏体验
- **Effort:** 中（约 1-2 小时）

### Recommendation
→ **Approach A + Approach B1 联合修复** 因为：
1. **Approach A** 修复了根本的时序问题：AI 移动后蛇与敌人重叠应触发伤害
2. **Approach B1** 作为防御性措施：防止敌人在同一 tick 的 AI 阶段走到蛇身上，避免二次重叠问题
3. 双重保障覆盖面广，代码量小，风险低
4. Approach C（body segments 碰撞）可作为后续增强，不是必须的

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 蛇头移动到敌人占据的格子 → 蛇长度 -1
2. 蛇与敌人战斗（多次碰撞）→ 每次碰撞损失 1 格
3. 蛇长度归零 → 游戏结束

### Edge Cases
1. **同一 tick 内蛇主动撞敌 + AI 敌人撞蛇：** 蛇在 tick 中移动到敌人格子（检测到碰撞 + 扣血）。随后 AI 阶段敌人移动到蛇原先所在的格子（蛇身非头部段）→ 不应额外扣血。→ 解决办法：Approach A 只检查蛇头位置的重叠，不检查全身。
2. **蛇长度=1 时撞敌：** 蛇只有 1 段长度，撞敌后长度归零 → 游戏结束。
3. **撞敌同时吃到食物：** 蛇移动到既有食物又有敌人的格子（理论上可能，通过生成或 AI 移动产生）→ 应优先处理碰撞（掉血），食物逻辑应同时生效？还是不应同时？→ 建议：碰撞检测按数组顺序，食物和敌人可能同时返回 — tick 中应先处理碰撞后处理食物？
   - 当前代码中：`collidedFood` 和 `collidedEnemy` 分别检查 → 若一个格子同时有食物和敌人，两者都加入 `results` → 蛇优先正常移动（非食物路径）再掉血。食物不会被吃掉（因为 non-food move）。
4. **敌人跟随蛇穿过门：** 蛇通过门进入新房间，敌人 AI 在穿门后阶段移动 → 应正确处理跨房间重叠。
5. **多次碰撞容限：** 玩家与同一敌人不应在连续 tick 上反复触发伤害（导致瞬间死亡）。敌我分离需要一个冷却或移动检查。
   - 当前设计：每个 tick 检查一次重叠 → 若蛇不移动（如撞墙）则不会进入 playing 状态的 tick，不会连续扣血。
   - 但在 Approach A 中：AI 后二次检查需要确保不会与前置检查重复扣血。

### Failure Paths
1. **AI 后二次检查导致双倍扣血：** 如果在步骤 6（handle enemy collision）已经扣血，步骤 8 后二次检查又扣一次 → 需要状态标记防止重复处理。
2. **AI 移动被阻塞导致敌人卡墙：** B1 方案阻止敌人移动到蛇上 → 若环境狭窄，敌人可能被蛇+墙夹住无法移动。
3. **大量敌人在同一 tick 移动到蛇上：** 多个敌人在同一 tick 的 AI 阶段都移动到蛇上 → 需要确保每次碰撞都单独处理。

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| `public/src/engine/core.js` | Stable (merged to master) | Low |
| `public/src/engine/collision.js` | Stable | Low |
| `public/src/engine/ai.js` | Stable | Low |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Boss 房间 & Boss AI (Phase 2) | Medium — 战斗系统必须先修复 |
| 道具平衡性调整 | Low — 依赖于战斗系统正常运作 |

### Preparation Needed
- [ ] 验证当前 implement 分支是否已合并到 master（确认最新 master 包含 #15 完整实现）
- [ ] 确认现有测试全部通过（Pre-implementation baseline）

---

## 7. Spike / Experiment

### Question to Answer
时序漏洞是否真的存在？AI 移动后蛇头与敌人重叠是否可以持续零伤害？

### Method
编写一个测试脚本，手动构建一个房间、一条蛇和一个敌人：
1. 蛇在 (30,30) 方向右，敌人在 (31,29)（对角线相邻）
2. tick 执行 3 次，观察每次 tick 后的蛇长度
3. 预期：除非 Approach A/B 被实现，否则蛇长度应该恒为 3（零伤害）

### Result
**漏洞确认！** 脚本输出：
```
Tick 1: snake head at (31,30), enemy at (31,30), snake length: 3
Tick 2: snake head at (32,30), enemy at (32,30), snake length: 3
Tick 3: snake head at (33,30), enemy at (33,30), snake length: 3
Total damage across 3 ticks: 0
```

敌人从 tick 1 开始就跟蛇头在同一格子，但蛇长度始终不变。敌人逐格跟随，成为无害的"尾巴"。

### Impact on Approach
漏洞确认后，Approach A + B1 联合修复的必要性确定。纯 Approach C（body segments 碰撞）不解决根本问题。
