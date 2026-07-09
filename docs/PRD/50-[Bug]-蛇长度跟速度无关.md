# Research: [Bug] 蛇长度跟速度无关

> Parent Issue: #50
> Agent: research-agent
> Date: 2026-07-08
> Status: Open
> Priority: Low

---

## 1. Problem Definition

### Current Behavior

蛇移动速度不受蛇身长度影响。蛇在长度为 3 或长度为 100 时，移动速度完全一致。

当前默认移动速度（最小长度=3 时）是基础速度，但蛇变长后速度应该变慢。

- **Engine A (Classic GameBoy):** 速度恒定，没有速度/长度逻辑
- **Engine B (Metroidvania):** 游戏循环未使用动态间隔变化

### Expected Behavior

根据原始设计意图：
- 蛇身越长，移动越慢
- 蛇身越短，移动越快
- 当长度从 3（最短）增长时，速度应逐渐降低
- 速度变化应在游戏中可感知

### User Scenarios

- **Scenario A（游戏内感知）：** 玩家从长度 3 增长到长度 50 过程中，应能明显感觉到蛇的移动变慢。目前完全无变化。
- **Scenario B（策略权衡）：** 长蛇意味着实力（更多食物储备），但速度变慢增加被敌人追上的风险。玩家需要权衡是否主动消耗长度来提速。
- **Frequency:** 每次游玩全程，每个 tick 都应该有速度变化。

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

两个引擎各有不同的问题表现：

### Engine A: Classic GameBoy Snake (`src/gameboy-snake-engine.js`)

- **Bug: 完全缺失实现。** 此引擎完全没有速度/长度逻辑。
- `tick()` 函数只移动蛇，从未根据蛇长度调整 tick 间隔。
- 不存在 `calculateSpeed()` 函数、`currentTickInterval` 字段或对基于长度的速度调用的任何引用。

### Engine B: Metroidvania Snake (`public/src/engine/core.js`)

- **Bug: 游戏循环未采用动态间隔变化。** 引擎确实有 `calculateSpeed()` 并在 `tick()` 中调用：
  ```js
  // core.js:256
  s.currentTickInterval = calculateSpeed(s.snake.length, s.baseTickInterval);
  ```
  ```js
  // core.js:382
  export function calculateSpeed(length, baseInterval) {
    return Math.floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE));
  }
  ```
  
  **但**，`public/gameboy.html` 中的游戏循环使用 `setInterval`，它在创建时**捕获间隔延迟**，不会动态重新读取：
  ```js
  // gameboy.html:125
  gameLoop = setInterval(tickFn, state.currentTickInterval);
  ```
  
  `tick()` 更新 `state.currentTickInterval`（如从 150 → 153 → 156...）后，正在运行的 `setInterval` 继续以**原始**捕获的延迟触发。新值从未应用于定时器。

### `calculateSpeed` Formula

```js
export const BASE_TICK_INTERVAL = 150;  // ms at length 3
export const SPEED_SLOPE = 0.02;         // multiplier per extra length unit

calculateSpeed(length, baseInterval)
  = floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE))
```

示例输出（`BASE_TICK_INTERVAL = 150`）：

| Snake Length | Tick Interval (ms) | Effective Slowdown |
|---|---|---|
| 3 | 150 | baseline |
| 4 | 153 | +3 ms (+2%) |
| 10 | 171 | +21 ms (+14%) |
| 20 | 201 | +51 ms (+34%) |
| 50 | 291 | +141 ms (+94%) — nearly double |
| 100 | 441 | +291 ms (~3× slower) |
| 400 (max) | 1341 | +1191 ms (~9× slower) |

公式**数学上是正确的**——它产生了一个有意义的曲线。问题是这个值**从未被游戏循环定时器实际使用**。

### Observed Behavior

- 不管蛇长度如何，速度保持不变
- 长度 3 和长度 100 之间没有视觉或游戏性差异
- 游戏循环始终以原始 `BASE_TICK_INTERVAL` (150ms) 触发 tick

### Why Change Now?

这是核心设计原则（长蛇慢、短蛇快）的实现 bug。没有此功能，长度/速度权衡策略无法生效，攻击系统（消耗长度获取速度和子弹）也失去一个关键维度。

### Previous Constraints

- `BASE_TICK_INTERVAL = 150ms`（长度 3 时）是预期的**最快**速度，不应更改
- `SPEED_SLOPE = 0.02` 乘子产生平缓曲线——约 50 个格后翻倍。似乎合理但可调整
- 游戏循环必须支持**动态间隔更新**——每个 tick 应能更改下一个 tick 的延迟
- 两个入口点：经典 GameBoy 引擎和 metroidvania 引擎

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `src/gameboy-snake-engine.js` | Classic GameBoy Engine | 添加 `BASE_TICK_INTERVAL`、`SPEED_SLOPE`、`calculateSpeed()`、`currentTickInterval` |
| `public/src/engine/core.js` | Metroidvania Engine (tick) | 已正确实现，无需修改 |
| `public/gameboy.html` | Game Loop | 将 `setInterval` 替换为递归 `setTimeout` 以支持动态间隔 |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `tests/gameboy-snake.test.js` | Tests | 需为 `calculateSpeed()` 添加测试 |
| `public/src/engine/constants.js` | Constants | 已有 `BASE_TICK_INTERVAL` 和 `SPEED_SLOPE`（无需修改） |

### Data Flow Impact

```
Current (broken):
  Timer:  [150ms][150ms][150ms][150ms][150ms][150ms] ← never changes
  Length:   3      4      5      6      7      8

Fixed (recursive setTimeout):
  Timer:  [150ms][153ms][156ms][159ms][162ms][165ms] ← increases with length
  Length:   3      4      5      6      7      8
```

### Documents to Update

- [ ] `docs/DESIGN/5-gameboy-snake-game.md` (如果速度逻辑被记录)
- [ ] `docs/PRD/50-[Bug]-蛇长度跟速度无关.md` (本文件)
- [ ] `docs/TASKS/50-[Bug]-蛇长度跟速度无关.md` (任务文件)

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: 用递归 setTimeout 替换 setInterval（推荐）

**Description:** 将游戏循环从 `setInterval` 改为递归 `setTimeout`，每次都读取最新的 `currentTickInterval`。

```js
function scheduleNextTick() {
  tickFn();
  if (state && state.gameState === 'playing') {
    gameLoop = setTimeout(() => {
      if (gameLoop) clearTimeout(gameLoop);
      scheduleNextTick();
    }, state.currentTickInterval);
  }
}
```

同时为 Engine A 添加 `calculateSpeed()` 的实现。

**Engine A 修改：**
```
1. 添加常量: BASE_TICK_INTERVAL, SPEED_SLOPE
2. 添加状态字段: currentTickInterval (默认 BASE_TICK_INTERVAL)
3. 添加 calculateSpeed() 函数（与 Engine B 相同公式）
4. 在 tick() 末尾吃到食物时调用 calculateSpeed()
5. 导出 currentTickInterval 供游戏循环使用
```

**Pros:**
- 根本性解决——每个 tick 都会重新读取 `currentTickInterval`
- `tick()` 可动态改变延迟
- 在两个引擎上都适用
- 简单，纯 JS，无需额外库

**Cons:**
- 需要为两个引擎实现
- Engine A 需要新增常量、函数和状态字段
- 经典引擎需要添加完整的实现（Engine A 当前完全缺失此逻辑）

**Risk:** Low
**Effort:** Small (~1 hour)

### Approach B: 在 tickFn 内部清除并重建 setInterval

**Description:** 在 `tickFn()` 末尾，清除当前 interval 并以更新的 `state.currentTickInterval` 创建新的 interval。

```js
function tickFn() {
  const s = tick(state);
  // ...render...
  clearInterval(gameLoop);
  gameLoop = setInterval(tickFn, state.currentTickInterval);
}
```

**Pros:**
- 思路简单，改动最小
- 保留 `setInterval` 模式

**Cons:**
- 每次 tick 都清除和重建定时器，可能产生微小的时间漂移
- 在快速 tick（如 150ms）时开销略有增加
- 与递归 setTimeout 相比，`setInterval` 的累积误差（drift）更明显

**Risk:** Low
**Effort:** Small (~30 minutes)

### Recommendation

→ **Approach A (递归 setTimeout)** 因为：
1. 递归 `setTimeout` 天然不会产生 `setInterval` 的累积误差
2. 代码更清晰——每次读取最新的 `currentTickInterval`
3. 暂停/恢复时更简单（clearTimeout 即可）
4. 是游戏开发中处理动态 tick 间隔的标准模式

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. Engine A: `calculateSpeed()` 已实现，在每个 `tick()` 上调用，`currentTickInterval` 已导出
2. Engine B: 游戏循环正确使用动态间隔（递归 `setTimeout` 或等效方式）
3. 长度 3: tick 间隔 = `BASE_TICK_INTERVAL` (150ms)
4. 长度 50: tick 间隔 ≈ 291ms（比基线慢 94%）
5. 长度 400（上限）: tick 间隔 ≈ 1341ms
6. 现有测试套件无回归
7. 为 `calculateSpeed()` 添加了各种长度输入的测试
8. HUD 可选显示当前速度/tick 间隔

### Edge Cases

| Case | Expected |
|------|----------|
| Snake length = 1 (after combat damage) | Fastest speed (`calculateSpeed(1)`) — maybe too fast; consider clamp to min(BASE_TICK_INTERVAL) |
| Snake max length = 400 | Slowest speed — ~1341ms per tick |
| Game paused / resumed | Interval should be re-created on resume with current `currentTickInterval` |
| Game over → restart | Interval resets to fresh `currentTickInterval` (BASE_TICK_INTERVAL) |
| Speed becoming very slow at high lengths | Player can still control direction; test that the game remains playable |

### Failure Paths

1. **gameLoop 引用冲突：** 递归 `setTimeout` 中如果 `clearTimeout` 时机不对，可能导致多个循环并行运行
2. **状态重置后 gameLoop 未清理：** `init()` 时需清除旧的 gameLoop
3. **性能问题：** 极高 tick 间隔（如 1341ms）下游戏可能感觉卡顿——视觉上没问题但玩家等待时间会很长

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `src/gameboy-snake-engine.js` | Stable | Low |
| `public/gameboy.html` | Stable | Low |
| `public/src/engine/core.js` | Stable | Low |

### Blocks

| Future Work | Priority |
|-------------|----------|
| #54 速度调整（斜率调优） | Medium — 依赖 #50 实现后才可调整 |
| HUD 显示当前速度 | Low |

### Preparation Needed

- [ ] 确认现有测试套件全部通过（基线）
- [ ] 创建 feature 分支

---

## 7. Spike / Experiment (Optional)

无必要。递归 `setTimeout` 替换 `setInterval` 是成熟的游戏开发模式，无需原型验证。

### Visualization (game loop vs. tick interval)

```
Current (broken):
  Timer:  [150ms][150ms][150ms][150ms][150ms][150ms] ← never changes
  Length:   3      4      5      6      7      8

Fixed (recursive setTimeout):
  Timer:  [150ms][153ms][156ms][159ms][162ms][165ms] ← increases with length
  Length:   3      4      5      6      7      8
```
