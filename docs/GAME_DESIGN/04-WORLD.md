# 4. 地图与关卡

> 世界地图为 5×5 的房间网格，通过生成树算法保证连通性，
> 钥匙和锁确保玩家的探索路径有明确的推进方向。
> 尺寸门（Size Gate）为蛇身长度提供渐进式门槛。

---

## 4.1 世界生成

```javascript
MAP_COLS = 5
MAP_ROWS = 5
ROOM_SIZE = 20   // 标准房间为 20×20 格
```

生成分为 7 个阶段：

```
1. 生成树（Spanning Tree）→ 保证所有房间连通
2. 随机额外门 → 增加路径多样性（density=0.3）
3. 分配房间类型 → START / BOSS / SAVE / GACHA / KEY_SHRINE 等
4. 放置钥匙和锁 → KEY_SHRINE 房间 + 对应锁门
4a. 放置尺寸门 → 在 NORMAL 房间设置蛇身长度门槛
5. 生成房间内部格子 → 墙壁/地板/装饰
```

生成后执行可解性验证（BFS with keys），最多重试 3 次，失败则 fallback 到预置地图。

### 4.1.1 钥匙和锁的放置（Phase 4）

`placeKeysAndLocks()` 在 world 上建立 `keyAssignments` 数组，每个元素包含：

```javascript
{
  keyId: 'key_0',
  shrineRoom: { x: 2, y: 1 },     // 放钥匙的 KEY_SHRINE 房间
  lockRoom: { x: 2, y: 2 },       // 门被锁住的房间
  lockDoor: 'right'               // 锁在 lockRoom 的这个方向
}
```

**设计意图：** 锁放在 KEY_SHRINE 通往 GOAL/BOSS 方向的出口上。玩家的预期流程是：
1. 从 START 方向进入 KEY_SHRINE（入口方向无锁，自由进入）
2. 在 KEY_SHRINE 内部自动获得钥匙
3. 从出口（朝向 GOAL/BOSS）通过锁门离开

### 4.1.2 尺寸门的放置（Phase 4a）

`placeSizeGates()` 在所有阶段完成后、房间内部生成前调用。选择 1–2 个 NORMAL 房间（非 START/KEY_SHRINE/SAVE/GACHA/BOSS），在随机连通门上设置长度门槛。

```javascript
// 每个尺寸门的数据结构
room.sizeGate = {
  requiredLength: 5,    // 蛇身长度需求，随距离递增
  doorDir: 'right',     // 从该方向进入时会被挡住
  unlocked: false       // 进入后设为 true，永久可通行
}
```

**注意：** 初始蛇身长度为 2 节（参见 01-OVERVIEW.md 1.6 节），因此尺寸门的难度曲线实际起点为 `dist=1` 时 `requiredLength=3 > 2`——玩家必须至少吃 1 个食物才能通过相邻房间的尺寸门。

**难度曲线：** 基于房间的曼哈顿距离：
```javascript
const requiredLength = 3 + Math.floor(distFromStart / 3) * 2;
// 距离 1 → 3（初始长度即可通过）
// 距离 2 → 5（需吃 2 个食物）
// 距离 3 → 7（需吃 4 个食物）
// 距离 4 → 9（需吃 6 个食物）
```

## 4.2 房间类型

| 类型 | 用途 | 视觉 |
|------|------|------|
| `START` | 出生点（0,0），始终无锁，**含 2 个敌人** | 标准房间 |
| `NORMAL` | 普通探索 | 标准房间 |
| `SAVE` | 存档点，进入自动存档 | 蓝色标记 |
| `GACHA` | 抽奖机，消耗长度获取道具 | 金色标记 |
| `KEY_SHRINE` | 获取钥匙，进入时自动获得 | 浅蓝标记 |
| `BOSS` | BOSS 战，80×80 大房间 | BOSS 门（CELL.BOSS_DOOR） |
| `GOAL` | 胜利终点——目前由 BOSS 房间取代 | 金色标记 |
| `HIDDEN` | 隐藏房间（待扩展） | 标准外观 |

### KEY_SHRINE 的行为细节

玩家进入 KEY_SHRINE 房间时，游戏循环（`core.js`）在 `tick()` 的房间切换后自动处理：

```javascript
// 在 tick() 的房间切换处理块中，顺序为：
// GOAL → BOSS → SAVE → KEY_SHRINE → tile consistency → sizeGate unlock
if (newRoom.type === ROOM_TYPE.KEY_SHRINE) {
  const keyAssignment = s.world.keyAssignments.find(ka =>
    ka.lockRoom.x === newRoom.x && ka.lockRoom.y === newRoom.y
  );
  if (keyAssignment && !s.keysFound.has(keyAssignment.keyId)) {
    s.keysFound.add(keyAssignment.keyId);
    s.inventory.keys.add(keyAssignment.keyId);
    s.doorMessage = '🔑 KEY ACQUIRED!';
  }
}
```

**设计决策：**
- 钥匙是进入 KEY_SHRINE 时**自动获得**，不需要玩家手动拾取
- 重复进入同一个 KEY_SHRINE 不会重复获得钥匙（由 `keysFound.has()` 保护）
- `keyAssignment.lockRoom` 匹配指南：在世界生成时，`lockRoom` 的值等于 `shrineRoom` 的值（非同房间时通过坐标匹配）

## 4.3 门系统

每个房间的四个方向可能有门，门可以有多种约束。门的通行检测统一由 `checkDoorPassable()`（`collision.js`）处理。

### 普通门
无约束，蛇头碰到直接切换到相邻房间。

### 锁门（LOCKED）

需对应钥匙才能通过。钥匙在 KEY_SHRINE 房间获取。

**通过逻辑（`checkDoorPassable`）：**
```javascript
// 锁可以放在当前房间的门上，也可以放在相邻房间的门上
// 检测两边的 door.locked
```

**设计决策：** 锁门的通行检测采用**双边检测**——既检查当前房间的门锁标志，也检查相邻房间的门锁标志。这确保无论锁被放置在哪一侧，检测都能正确工作。

### 尺寸门（SIZE GATE）

需蛇身长度达到阈值才能进入，一旦进入则永久解锁。

#### 通行检测逻辑

尺寸门是**单向关卡**——只阻挡进入（entry），不阻挡离开（exit）：

```javascript
// 检查目标（相邻）房间是否有尺寸门
const nextRoom = getRoomAt(world, currentRoom.x + dx, currentRoom.y + dy);
if (nextRoom && nextRoom.sizeGate) {
  const oppositeDir = oppositeDir(doorDir);
  if (nextRoom.sizeGate.doorDir === oppositeDir) {
    // 玩家正在进入一个有尺寸门的房间
    if (!nextRoom.sizeGate.unlocked) {
      if (state.snake.length < nextRoom.sizeGate.requiredLength) {
        return { passable: false, reason: 'size_gate' };
      }
    }
  }
}
```

**核心规则：**
- 检查的是**目标房间**的尺寸门，而不是当前房间的
- 门的方向与移动方向必须成**反方向**才触发阻挡（进入方向检测）
- 如果从尺寸门房间**离开**，不触发检测——始终可通行
- `oppositeDir()` 函数由 `world.js` 提供

#### 永久解锁机制

玩家成功进入有尺寸门的房间后，`sizeGate.unlocked` 立即设为 `true`：

```javascript
// 在 core.js 的房间切换后处理
if (newRoom.sizeGate && !newRoom.sizeGate.unlocked) {
  newRoom.sizeGate.unlocked = true;
}
```

这意味着：
- 即使之后蛇身长度因为受伤而缩短，也可以**自由进出**该房间
- `unlocked` 状态通过 `serializeWorld()` / `deserializeWorld()` 持久化保存——无需 schema 迁移
- 存档/读档后房间的永久解锁状态保持不变

#### 尺寸门与锁门的交互

同一扇门可以同时有锁和尺寸门，检测顺序为：
1. **先检查锁**——如无钥匙直接返回 `'locked'`
2. **再检查尺寸门**——有钥匙但长度不够则返回 `'size_gate'`
3. 两者都满足才返回 `{ passable: true }`

### BOSS 门

进入 BOSS 房间后，从内部无法离开（`checkDoorPassable` 阻止），直到 BOSS 被击败。

### 房间切换流程

```
蛇头移动到门格 → checkRoomTransition() 检测房间变更
  → checkDoorPassable() 验证门是否可通过
    → 锁住 → 显示 "NEEDS KEY"
    → 尺寸门 → 显示 "NEEDS LENGTH N+"
    → BOSS 门 → 阻止离开
    → 可通行 → 进入新房间
      → BOSS 房间 → gameState = 'bossIntro'
      → SAVE 房间 → 自动存档
      → KEY_SHRINE → 自动获取钥匙（加入 keysFound + inventory.keys）
        → doorMessage = '🔑 KEY ACQUIRED!'（显示在 HUD 通知区域）
      → 有尺寸门的房间 → sizeGate.unlocked = true（永久解锁）
      → GOAL 房间 → 胜利
```

### 尺寸门的视觉表现

- 门边缘显示 `'LEN N+'`（N = requiredLength）
- 小地图上：有尺寸门的房间以橙色标记
- HUD 上：钥匙计数在 `state.keysFound.size` 中，自动显示

## 4.4 小地图（Minimap）

右上角显示 5×5 的缩略地图，50% 透明度。

| 状态 | 颜色 |
|------|------|
| 未探索 | 黑色迷雾 |
| 已探索（普通） | 深绿 |
| GOAL / GACHA | 金色 |
| SAVE | 蓝色 |
| KEY_SHRINE | 浅蓝 |
| 当前房间 | 亮绿闪烁圆点 |
| 锁住的房间 | 红色标记 |
| 有尺寸门的房间 | 橙色标记 |

## 4.5 门生成安全机制

随机额外门生成时必须保持**成对（pair）** 添加，防止出现单向门导致蛇卡死。

```javascript
// pairs 数组：[[key1, key2], ...]
// key1 = "x,y:right", key2 = "x+1,y:left"
// 添加时必须两个同时加，保持双向通行
// 只 shuffle pairs 数组，不拆开单个 key
```

#### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 钥匙自动获取时机 | 进入 KEY_SHRINE 时通过 `tick()` 处理 | 不需要玩家手动交互，与存档/BOSS 房间的"进入即触发"规则一致 |
| 锁门位置 | 放在 KEY_SHRINE 朝向 BOSS 的出口上 | 玩家先自由进入获取钥匙 → 再用钥匙通过门向 BOSS 推进——流程自然 |
| 尺寸门检测方向 | 检查目标房间的尺寸门，反方向匹配 | 只阻挡进入不阻挡离开，避免玩家被困 |
| 永久解锁机制 | `sizeGate.unlocked` 运行时 boolean | 玩家进入后永久可通行，成长感强；不依赖长度实时计算 |
| 尺寸门难度曲线 | `3 + floor(dist / 3) * 2` | 初始长度 3 可通相邻房间；每远 3 格增加 2 长度需求，提供渐进式挑战 |
| 锁+尺寸门共存 | 锁先检测，尺寸门后检测 | 语义清晰：先有钥匙才能进门，再考虑长度门槛 |
