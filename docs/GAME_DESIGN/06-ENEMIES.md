# 6. 普通敌人系统

> 分布在普通房间中的分段蛇形敌人，具有追逐和抢食物行为。

---

## 6.1 敌人数据结构

```javascript
{
  id: number,
  x, y: number,                // 世界坐标
  segments: [{x, y}, ...],     // 分段身体
  hp: number,                  // 生命值 = 分节数
  speedTicks: 2,               // 每 N tick 移动一次
  tickCounter: 0,
  roomX, roomY: number,        // 归属房间
  chaseRange: 20,              // 追逐范围
  aiState: 'idle',             // 当前 AI 状态
  returnCount: 0,              // 返回计数
  boss: false,                 // 是否 BOSS
}
```

## 6.2 AI 行为

### 追逐模式
当蛇头与敌人在同一房间时，敌人进入 chase 模式进行贪心路径追逐：

```
计算到目标的曼哈顿距离
优先沿距离更大的轴移动
尝试移动到 FLOOR 格（避开墙壁）
如果所有方向都被阻挡 → 停留
```

追逐优先级：**食物 > 蛇头**。如果房间内有食物，敌人优先抢食物。

### 偷食物
敌人走到食物格上即可吃掉食物（`tryStealFood`），吃掉后：
- 移除食物
- 敌人 HP +1
- 敌人身体加一节

### 返回机制
当敌人与归属房间的距离 ≥ 2 个房间时，自动传送回原位（防蛇把敌人拉到太远）。

## 6.3 紧急食物重生

如果所有房间的食物都被吃光，在当前房间随机刷新一个食物（`emergencyFoodRespawn`），保证玩家不会被困死。

## 6.4 参数

```javascript
DEFAULT_ENEMY_SPEED_TICKS = 2   // 移动间隔 tick
DEFAULT_CHASE_RANGE = 20        // 追逐范围（格数）
ENEMY_RETURN_AFTER_ROOMS = 2    // 离开归属房间数阈值
```

## 6.5 起始房间敌人

从 Issue #222 开始，**START 房间不再被排除在敌人放置之外**。每次世界生成时，`placeEnemiesAndItems()` 在 START 房间额外放置 2 个敌人：

```javascript
if (room.type === ROOM_TYPE.START) {
  placeFoodInRoom(room, 3, world, rng);
  for (let e = 0; e < 2; e++) {
    const enemy = spawnEnemyInRoom(room, world, rng);
    if (enemy) room.entities.enemies.push(enemy);
  }
  continue;
}
```

**设计意图：**
- 防止玩家在出生点安全挂机——必须立刻移动或战斗
- 敌人数量固定为 2（过度可能导致新手挫败），食物保留 3 个提供恢复途径
- 使用现有 `spawnEnemyInRoom()` 函数，复用相同的 AI 行为和碰撞逻辑
- 若房间无可用地板格，`spawnEnemyInRoom()` 返回 null 自动跳过（优雅降级）
