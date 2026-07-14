# 2. 移动与碰撞系统

> 蛇的基础移动采用经典贪吃蛇的方向驱动模式，
> 碰撞处理区分三种等级：死亡、伤害、普通。

---

## 2.1 方向移动

蛇由方向向量 `direction` 驱动，每 tick 按方向移动一格。输入不直接修改 direction，而是写入 `nextDirection`，在下一个 tick 开始时应用。

```javascript
DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
}
```

**反向保护：** `nextDirection` 不允许与当前 direction 完全相反（不能 180 度掉头）。

**视觉反馈（Issue #162）：** 蛇的眼睛渲染跟随 `nextDirection` 而非 `direction`——当玩家输入方向时，蛇眼立即转向新方向，即使蛇身尚未转向。这提供了即时输入反馈，改善手感。

- `render/room.js`: `drawSnake()` 使用 `nextDirection` 计算眼珠位置
- `gameboy.html`: CSS 动画为眼珠添加平滑过渡（`transition: left 150ms`）
- 当 `nextDirection` 反转被阻塞时，眼珠保持在原方向

## 2.2 Stuck+Reverse 机制（Issue #46）

当蛇头撞到墙壁或 STONE_WALL 时，不直接死亡——进入 **stuck 状态**：

```
撞墙 → stuckCounter = 5 tick
  → 5 tick 后自动 Reverse：
    蛇身反转（尾部变头）
    direction 取反
  → 蛇可以继续前进
```

这个机制代替了传统贪吃蛇的"撞墙即死"，降低了迷宫探索中的挫败感。

```javascript
// core.js tick() 中 stuck handler
if (s.stuckCounter > 0) {
  s.stuckCounter--;
  if (s.stuckCounter === 0 && s.pendingReverse) {
    s.snake.reverse();
    s.direction = { x: -s.direction.x, y: -s.direction.y };
  }
  return s;  // stuck 期间不处理其他逻辑
}
```

## 2.3 撞墙反弹食物掉落（Issue #193）

当蛇撞到 WALL/STONE_WALL 触发 Stuck+Reverse 时，会掉落一个**反弹食物**（bounce food）作为惩罚的补偿机制——玩家可以在 reverse 后主动拾取。

### 掉落位置：蛇头 vs 蛇尾

```javascript
// core.js tick() 中 damage 碰撞处理
// 掉落位置：蛇头当前坐标（s.snake[0]），即撞墙前最后一个有效位置
const headSeg = s.snake[0];
const dropPos = { x: headSeg.x, y: headSeg.y };
```

| 属性 | 值 |
|------|-----|
| 掉落坐标 | `s.snake[0]`（蛇头位置） |
| 触发条件 | 蛇撞墙且蛇身长度 > 1 |
| 设计意图 | reverse 后食物靠近蛇尾，玩家必须主动移动去拾取 |

### 为什么选蛇头而非蛇尾（Bug #193）

原始实现在 PR #157/#163 中使用了蛇尾 (`s.snake[length-1]`)，理由是蛇尾永远在可行走格子上。但这忽略了 `snake.reverse()` 的交互：

```
撞墙 → 食物掉在尾巴 [12,12]
  → stuckCounter 倒计时 5 tick
  → snake.reverse() → 头尾互换
  → 新蛇头落在 [12,12] → 自动吃掉食物 ❌
```

修复后使用蛇头位置 (`s.snake[0]`)：

```
撞墙 → 食物掉在蛇头 [5,5]（最后一个有效坐标）
  → stuckCounter 倒计时
  → snake.reverse() → 头尾互换
  → 新蛇头在 [12,12]，食物在 [5,5] → 需要主动移动去拾取 ✅
```

**关键设计决策：**

| 决策 | 选择 | 理由 |
|------|------|------|
| 掉落位置 | 蛇头 (`s.snake[0]`) | 蛇头永远是可行走的 FLOOR 格子；reverse 后食物不会自动被吃掉 |
| 保护机制 | `if (s.world)` 守卫 | 无 world 上下文（测试/gameboy 模式）时不生成食物 |
| 边界情况 | 蛇长 = 1 | 已在上游处理——直接 gameover，不会触发食物掉落代码 |

### 保持不变的现有行为

- 屏幕震动（screenShake）
- 扣分（-5 分）
- 尾部切除
- stuckCounter 倒计时 + pendingReverse
- 食物创建后的世界坐标转换（worldToRoomCoords）

---

## 2.4 速度曲线

蛇的速度随长度变化，越长的蛇移动越慢：

```javascript
BASE_TICK_INTERVAL = 150ms    // 长度 3 时的间隔
SPEED_SLOPE = 0.05             // 每增加一节，间隔增加 5%
MAX_TICK_INTERVAL = 800ms      // 最大慢速上限
```

## 2.5 碰撞检测

碰撞检测返回一个结果数组，包含所有发生的碰撞类型：

| 碰撞类型 | 触发条件 | 效果 |
|----------|----------|------|
| `death` | 碰到 SPIKE / DEATH_WALL | 游戏结束 |
| `damage` | 碰到 WALL / STONE_WALL | 进入 Stuck+Reverse |
| `self` | 蛇头碰到自己身体 | 移除尾部一节 + Stuck（不 Reverse） |
| `food` | 蛇头碰到食物 | 蛇身增长 + 加分 |
| `enemy` | 蛇头碰到敌人 | 移除尾部一节 + 无敌帧 |
| `door` | 蛇头碰到门格 | 触发房间切换 |

**碰撞优先级：** `death > self > damage > food/enemy/door`

当蛇头同时踩到食物和墙壁时（例如食物刷新在墙边），`damage` 仍然触发 Stuck+Reverse，但食物也会被吃掉并加分。
