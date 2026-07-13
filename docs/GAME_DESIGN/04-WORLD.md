# 4. 地图与关卡

> 世界地图为 5×5 的房间网格，通过生成树算法保证连通性，
> 钥匙和锁确保玩家的探索路径有明确的推进方向。

---

## 4.1 世界生成

```javascript
MAP_COLS = 5
MAP_ROWS = 5
ROOM_SIZE = 20   // 标准房间为 20×20 格
```

生成分为 6 个阶段：

```
1. 生成树（Spanning Tree）→ 保证所有房间连通
2. 随机额外门 → 增加路径多样性（density=0.3）
3. 分配房间类型 → START / BOSS / SAVE / GACHA 等
4. 放置钥匙 → KEY_SHRINE 房间
5. 放置锁 → 在通往 BOSS 的路线上锁门
6. 生成房间内部格子 → 墙壁/地板/装饰
```

生成后执行可解性验证（BFS with keys），最多重试 3 次，失败则 fallback 到预置地图。

## 4.2 房间类型

| 类型 | 用途 | 视觉 |
|------|------|------|
| `START` | 出生点（0,0），始终无锁 | 标准房间 |
| `NORMAL` | 普通探索 | 标准房间 |
| `SAVE` | 存档点，进入自动存档 | 蓝色标记 |
| `GACHA` | 抽奖机，消耗长度获取道具 | 金色标记 |
| `KEY_SHRINE` | 获取钥匙 | 浅蓝标记 |
| `BOSS` | BOSS 战，80×80 大房间 | BOSS 门（CELL.BOSS_DOOR） |
| `GOAL` | 胜利终点——目前由 BOSS 房间取代 | 金色标记 |
| `HIDDEN` | 隐藏房间（待扩展） | 标准外观 |

## 4.3 门系统

每个房间的四个方向可能有门，门可以有多种约束：

### 普通门
无约束，蛇头碰到直接切换到相邻房间。

### 锁门（LOCKED）
需对应钥匙才能通过。钥匙在 KEY_SHRINE 房间获取。

**放置策略：** 在 KEY_SHRINE 到 BOSS 房间的 BFS 路径上锁住一扇门，保证玩家必须先找到钥匙。

### 尺寸门（SIZE GATE）
需蛇身长度达到阈值才能通过（待实现）。

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
      → GOAL 房间 → 胜利
```

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

## 4.5 门生成安全机制

随机额外门生成时必须保持**成对（pair）** 添加，防止出现单向门导致蛇卡死。

```javascript
// pairs 数组：[[key1, key2], ...]
// key1 = "x,y:right", key2 = "x+1,y:left"
// 添加时必须两个同时加，保持双向通行
// 只 shuffle pairs 数组，不拆开单个 key
```
