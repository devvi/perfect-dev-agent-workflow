# Research: 蛇撞到非即死障碍后反向运动

> Parent Issue: #46
> Agent: research-agent
> Date: 2026-07-08
> Status: Open
> Priority: Medium

---

## 1. Problem Definition

### Current Behavior

当前游戏中，蛇撞到非即死障碍物有两种处理方式：

**简单引擎 (`src/gameboy-snake-engine.js`)**：未集成障碍系统（只有 classic 贪吃蛇的 grid、食物、自我碰撞），所有边界碰撞直接 `'wall' → gameover`。

**Metroidvania 引擎 (`public/src/engine/`)**：已实现 Issue #22 的三层碰撞惩罚体系：
- `CELL.WALL` / `CELL.STONE_WALL` → `'damage'` → 蛇减少 1 段长度 + 屏幕震动 + 继续游戏
- `CELL.DEATH_WALL` / `CELL.SPIKE` → `'death'` → 立即 gameover
- 蛇长度归零 → gameover

目前的 `'damage'` 处理路径 (`core.js` tick 内)：
```js
// Damage: remove tail, don't move head to avoid wall embedding
s.snake = s.snake.slice(0, -1);
s.screenShake = { intensity: 3, duration: 6 };
s.score = Math.max(0, s.score - 5);
```

### Expected Behavior

蛇撞到非即死障碍物后：
1. **蛇尾变为蛇头**，整条蛇**反向运动**
2. 在反向运动之前，蛇进入短暂的 **stuck（停滞）状态**（~一段时间，让玩家准备好"即将反向"）
3. stuck 期间蛇不能移动，但方向输入可提前缓冲
4. stuck 结束后，蛇按反向运动

这解决了：
- 玩家撞到非即死障碍后，若继续同方向前进会再次撞到同一障碍物（产生吃帧或反复扣血）
- 提供更清晰的"你撞墙了"的反馈——不是扣血，而是强制反向，体验更直觉

### User Scenarios

- **Scenario A（贴墙探索）：** 蛇在墙边移动，不慎撞到非即死墙 → 蛇卡住片刻 → 蛇反向运动 → 玩家意识到贴墙危险，主动调整策略
- **Scenario B（房间死角）：** 蛇进入房间死角被障碍包围 → 撞到第一个障碍后反向 → 蛇朝反方向退出角落
- **Scenario C（快速连续碰撞）：** 玩家在狭窄通道快速移动 → 撞墙反向 → stuck 期间不能移动（防止连续碰撞）→ 反向结束后蛇脱困
- **Frequency:** 每局游戏中会触发多次，但每次 stuck + 反向给予玩家明确的"惩罚信号"

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

Issue #22 (obstacle death penalty) 的设计目标是"把撞墙即死改为扣血 + 继续游戏"。当时的决策是**最小改动**（Approach A），在 collision 返回 `'damage'` 后直接 `length - 1` 然后返回。没有引入"反向"机制，因为那超出了那个 issue 的范围。

### Why Change Now?

1. **游戏体验问题：** 当前"扣一段"的惩罚太隐性——玩家可能不知道自己撞墙了（只看到蛇尾少了一段）。反向运动+stuck 是更强的**惩罚信号**，且让玩家不得不立刻调整策略。
2. **防重复碰撞：** 不反向的话，玩家可能在狭窄通道连续撞墙，导致"撞→扣→撞→扣→死"的负面体验。反向+stuck 天然阻断了连续碰撞。
3. **机制一致性：** 很多经典 snake 变体（特别是 metroidvania 风格）都有"蛇撞墙反弹"或"蛇障反转"的机制。
4. **操作反馈增强：** stuck 阶段给了玩家"准备时间"，与之前 Issue #22 的屏幕震动一样，都让撞墙的"痛感"更具体。

### Previous Constraints

- **碰撞系统不可侵入：** 不能在 collision.js 里修改蛇的移动状态（collision 只检测不操作）
- **snake 数据格式不变：** `snake` 仍然是 `[{x,y}, ...]` 的有序数组，[0] 是蛇头
- **保留 damage/death 二分：** 不能破坏 Issue #22 的碰撞返回值体系
- **tick 函数的纯净性：** tick 不能有异步操作（setTimeout），stuck 要用 tickCount 计数实现
- **屏幕震动保留：** 反向 + stuck 应保留或增强已有的屏幕震动反馈

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js` | Main tick | **修改** `tick()`：damage 分支改为 stuck+reverse 逻辑；添加 stuck 计时器和状态转换；需初始化新状态字段 |
| `public/src/engine/constants.js` | Constants | **新增** STUCK_TICKS、方向反转辅助常量 |
| `src/gameboy-snake-engine.js` | Classic engine | **修改** 添加 obstacle collision 感知和新反向行为（若此引擎也需要支持该功能） |
| `tests/metroidvania-snake.test.js` | Tests | **新增** 反向碰撞测试用例 |
| `tests/gameboy-snake.test.js` | Tests | **新增** 经典引擎反向测试用例 |
| `public/src/engine/render/renderer.js` | Renderer | **可选修改** stuck 期间蛇的视觉反馈（闪烁/变暗） |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/save.js` | Save | 保存状态可能新增字段（如 stuckCounter）需要检查兼容性 |
| `public/src/engine/collision.js` | Collision | 无需修改返回值，但需确认 `'damage'` 返回路径在反向场景下仍正确 |
| `public/gameboy.html` | HTML | 可能需调整 stuck 状态的 UI 提示 |

### Data Flow Impact

```
[Before: damage collision handling in tick()]
damage → length-1 + screenShake → continue

[After: damage collision handling in tick()]
damage → [if not already stuck] set stuckCounter=N, set pendingReverse=true
       → [on subsequent ticks, stuckCounter>0] decrement stuckCounter, freeze snake
       → [stuckCounter=0] reverse snake (tail becomes head), flip direction
       → continue game
```

### New State Fields in `core.js` state

```js
{
  // ... existing fields ...
  stuckCounter: 0,        // ticks remaining in stuck state (0 = not stuck)
  pendingReverse: false,  // flag: reverse is queued after stuck expires
}
```

### Documents to Update

- [ ] `docs/DESIGN/15-metroidvania-snake-overhaul.md` — 添加反向碰撞机制说明
- [ ] `docs/TASKS/46-snake-reverse-on-obstacle.md` (本文件)
- [ ] `tests/metroidvania-snake.test.js` — 新增反向碰撞测试
- [ ] `tests/gameboy-snake.test.js` — 经典引擎反向测试

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: tick 内的 stuck+reverse 状态机（推荐）

**Description:** 在 `core.js` 的 `tick()` 中，将 `'damage'` 碰撞处理从"length-1"改为"stuck+reverse"状态机：

1. 新增两个状态字段：`stuckCounter`、`pendingReverse`
2. 首次撞到非即死障碍：
   - 设置 `stuckCounter = STUCK_TICKS`（如 4 ticks = ~600ms 在 150ms/tick 下）
   - 设置 `pendingReverse = true`
   - 蛇不移动（冻结在原地）
   - 屏幕震动
3. stuck 逐 tick 倒数：
   - 蛇不能移动（方向输入可缓冲）
   - 每次 tick 递减 `stuckCounter`
4. `stuckCounter` 归零时：
   - 反转蛇：`snake.reverse()`，蛇尾变蛇头
   - 取反 direction：`direction = { x: -direction.x, y: -direction.y }`
   - `stuckCounter = 0`，`pendingReverse = false`
   - 蛇从新方向继续移动
5. 如果蛇在 stuck 期间再次撞障碍（不应该发生，因为蛇不动）→ 忽略

实现细节：
- stuck 期间方向输入仍允许改变 `nextDirection`（但不能移动）
- 反向时：`snake.reverse()` 后，蛇头在原来尾巴的位置，方向是原来方向的相反
- `nextDirection` 需要与 `direction` 一致反向
- 扣除 score 逻辑保留（撞一次扣 5 分）

**Pros:**
- 改动范围小（主要修改 `core.js` tick 40-60 行和 constants 1 行）
- 不改变 collision 返回值体系（复用 'damage'）
- stuck 用 tick 计数（同步），不引入异步
- 方向缓冲保持不变（stuck 期间仍可输入）

**Cons:**
- 反向时蛇的位置可能让蛇头进入另一个障碍物（需检查新蛇头位置是否安全）
- stuck 期间渲染层需要特殊处理（蛇闪烁/静止反馈）
- 经典引擎也需要同步修改

**Risk:** Low — 所有改动在现有 tick 体系内，不引入异步、不改变数据结构
**Effort:** 小型（预计 1-2 小时）

### Approach B: 引入新的 gameState "reversing"

**Description:** 将 "reversing" 定义为一个短暂的 gameState（类似 `'reversing'`），在 tick 中优先处理：

1. 新增 `gameState: 'reversing'`
2. 碰撞到非即死障碍 → gameState 切换到 `'reversing'`
3. reversing 状态的 tick 只做：计时 → 到时反转蛇 → 转换回 `'playing'`
4. reversing 期间渲染展示不同效果（如蛇闪烁、屏幕震动增强）

**Pros:**
- 状态机更清晰：gameState 本身表达了"蛇在反转中"
- gameState 检查点统一：`tick()` 最开始的 `gameState !== 'playing'` 自动跳过 reversing 期的蛇移动逻辑
- 更易扩展（如果后续需要不同 duration 的 stuck）

**Cons:**
- 改动更大：gameState 枚举增加 + 所有检查 `gameState !== 'playing'` 的地方需要确认 reversing 的行为
- 渲染层需要多一个 overlay 状态
- vue/react 等状态驱动的 UI 需要加 reversing 分支
- 纯功能层面，Approach A 已满足需求，不需要新增游戏状态

**Risk:** Low-Medium — 新增状态会波及 view 层和存读档逻辑
**Effort:** 中型（预计 2-3 小时）

### Recommendation

→ **Approach A** 因为：
1. **最小改动原则：** 只新增 `stuckCounter`/`pendingReverse` 两个数字/布尔字段，不引入新的 gameState
2. **与 Issue #22 的 damage 体系无缝衔接：** `'damage'` 碰撞结果保持不变，只是 tick 内的处理方式从"扣血"改为"stuck+reverse"
3. **方向输入不变：** stuck 期间仍可缓冲方向，反向时自动同步 `nextDirection`
4. **可测试性：** stuck 用 tick 计数（同步），测试只需 `tick()` 若干次 = 预期 stuck 状态
5. **以后可扩展：** 若需敌人碰撞也触发反向，只需在 `collidedEnemy` 分支复用相同逻辑

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 蛇头撞到非即死障碍（WALL/STONE_WALL/boundary）→ stuckCounter 置为初始值
2. 后续 tick 中 stuckCounter > 0 → 蛇不动，递减 stuckCounter
3. stuckCounter 归零 → snake.reverse() → direction 取反 → 游戏继续
4. 玩家在新方向上控制蛇移动

### Edge Cases
1. **反向后的位置安全：** 反向完成后，蛇头（原蛇尾）的位置可能在一个障碍物内 → 需要检查新蛇头位置：如果反向后的蛇头在障碍物内，应再移动一格以确保脱困
2. **蛇长=1时撞墙：** snake 仅一个 segment，反转后蛇头=蛇尾（同一格），direction 取反 → 蛇向反方向移动 → 如果反方向也有障碍物，则立即再次触发 stuck
3. **stuck 期间再次撞墙：** 蛇在 stuck 期间原地不动，不应触发新的 stuck → 需检查 `if (stuckCounter > 0) skip collision`
4. **stuck 期间的输入缓冲：** 玩家在 stuck 期间按下方向键 → 正常存入 `nextDirection` → stuck 结束后 tick 消费该方向 → 如果新方向与原方向相反，应允许（150ms tick 内方向取反逻辑正常）
5. **多次快速撞墙：** 玩家撞墙→反向→又撞到同一面墙 → 如果蛇很短且在狭窄空间，可能反复 stuck → stuck 时间足够让玩家反应过来

### Failure Paths
1. **stuck 时间太短（<200ms）：** 玩家来不及反应，感觉像 bug → 推荐 stuck 4-6 ticks at 150ms/tick = 600-900ms
2. **stuck 时间太长（>1.5s）：** 玩家觉得游戏卡顿 → 不应超过 1s
3. **反向导致蛇头出现在障碍物内：** 如果蛇头和尾巴都在墙边，反转后蛇头嵌入墙内 → 应在反转后再移动一格蛇头（push newHead in new direction）
4. **stuck 期间视觉反馈不足：** 玩家不知道蛇被卡住了 → 渲染层应显示蛇闪烁或停顿指示

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| Issue #22 实现（障碍惩罚分层） | Merged to main (`9c5c2d5`) | Low — #46 拓展 #22 的 damage 处理 |
| `collision.js` `checkSnakeCollision()` 返回结构 | Stable | Low — 复用 `'damage'` 返回值 |
| `core.js` `tick()` 状态管理 | Stable | Low — tick 内增加 stuck 分支 |
| `constants.js` CELL 类型 | Stable | Low — 无需新增 CELL 类型 |

### Blocks
| Future Work | Priority |
|-------------|----------|
| 交互式障碍物（可推动的墙等） | Low — 需要稳定的碰撞-响应体系 |
| 敌人碰撞反向 | Medium — 可复用 stuck+reverse 逻辑 |

### Preparation Needed
- [ ] 确认 `core.js` tick 中方向取反的正确位置（反向后 direction 和 nextDirection 一致）
- [ ] 设计 stuck 期间的渲染视觉（蛇闪烁？蛇变红色？屏幕震动增强？）
- [ ] 确定 STUCK_TICKS 的最佳值（4-6 ticks at 150ms = 600-900ms）

---

## 7. Spike / Experiment (Optional — standard)

### Question to Answer
蛇反向后的位置安全如何保证？反向后蛇头可能钻进障碍物的风险有多大？

### Method
1. 查看现有 metroidvania 地图生成器的 WALL 布局模式
2. 计算典型摆放场景下，蛇尾在墙边的概率
3. 设计 if-reverse-head-in-wall → push one step 的兜底逻辑

### Result
- 大部分 WALL 是房间边界（1-cell thick）或室内孤立方块
- 蛇尾在最末格，与蛇头通常相距较远
- 反向风险较低但需要防御性检查：反转后检查 `checkSnakeCollision(newHead, ...)`，如果返回 `'damage'` 或 `'death'`，再推一格

### Impact on Approach
移除 Approach A 的一个风险点——反转后加一步安全检查即可解决。
