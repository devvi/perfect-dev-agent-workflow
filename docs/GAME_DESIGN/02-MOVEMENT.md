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

## 2.3 速度曲线

蛇的速度随长度变化，越长的蛇移动越慢：

```javascript
BASE_TICK_INTERVAL = 150ms    // 长度 3 时的间隔
SPEED_SLOPE = 0.05             // 每增加一节，间隔增加 5%
MAX_TICK_INTERVAL = 800ms      // 最大慢速上限
```

## 2.4 碰撞检测

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
