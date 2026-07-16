# 3. 战斗系统

> 战斗以射弹射击为核心，消耗蛇身长度作为代价，
> 通过抽奖机（Gacha）获取 Power-up 强化能力。

---

## 3.1 射弹系统

按下 Z 键从蛇头发射一枚射弹，沿当前方向前进。

### 核心参数

```javascript
DEFAULT_FIRE_RATE = 3           // 射击间隔（帧数）
DEFAULT_PROJECTILE_SPEED = 2    // 每帧移动格数
DEFAULT_PROJECTILE_DECAY = 10   // 最大射程
DEFAULT_PROJECTILE_POWER = 1    // 伤害
DEFAULT_MAX_PROJECTILES = 3     // 同时存在的射弹上限
```

### 代价机制

每次射击**移除蛇尾部一节**（`snake.slice(0, -1)`）。这意味着：
- 蛇需要至少 2 节才能射击
- 连续射击会不断缩短蛇身
- 攻击力 = 消耗生存资源，形成决策权衡

### 碰撞处理

射弹使用 **Line-sweep 连续碰撞检测**——检查从上一帧位置到当前位置经过的所有格子，防止速度过快穿透障碍物。

击中敌人时：移除射弹、减少敌人 1 HP、移除敌人尾部一节、加分 5 分。

## 3.2 Double Shot 模式

当 `doubleShot` 道具激活时，一次射击发射两枚平行射弹，消耗仍为尾部一节。

## 3.3 Power-up 系统（Gacha 抽奖）

地图中的 GACHA 房间提供抽奖机，消耗 5 节蛇长度随机获取一个 Power-up：

| 道具 | 权重 | 效果 | 持续时间 |
|------|------|------|----------|
| RAPID FIRE | 25 | 射速提升（fireRate -1） | 300-500 tick |
| DAMAGE UP | 20 | 伤害 +1 | 300-500 tick |
| DOUBLE SHOT | 15 | 双发射击 | 300-500 tick |
| RANGE UP | 25 | 射程 +5 格 | 300-500 tick |
| SPEED BOOST | 15 | 临时加速 | 300-500 tick |

所有道具均有持续时间，到期后自动移除。同类型道具可叠加（stack）。

## 3.4 无敌帧系统（Issue #118）

蛇碰到敌人或 BOSS 后进入无敌状态：

```javascript
INVULNERABILITY_DURATION = 10    // 无敌帧数
```

无敌期间：
- 蛇不会再次受伤
- 不显示扣血效果
- 无敌帧结束后恢复可被攻击状态

## 3.5 敌人体积与 HP

普通敌人有分段身体（segments），HP 等于分段数。射中任一节均可造成伤害。

```javascript
createEnemy(id, x, y, hp = 2, speedTicks = 2)
```

## 3.6 墙体碰撞伤害（Issue #154）

蛇撞到 `WALL` 或 `STONE_WALL` 后受到伤害惩罚：

### 流程

```
蛇头碰撞墙体
  ↓
单节检查 → 仅剩一节 → gameover（无额外操作）
  ↓
碰撞点有食物？→ 吃掉 +10 分（先处理）
  ↓
★ 记录蛇尾最后一节坐标（始终在可通行格上）
★ 在该坐标生成弹跳食物（createBounceFood）
★ 移除蛇尾一节（s.snake.slice(0, -1））
★ 长度归零？→ gameover
  ↓
stuckCounter = STUCK_TICKS、pendingReverse = true、屏幕震动、扣分 −5
  ↓
返回
```

### 设计意图

| 方面 | 说明 |
|------|------|
| 弹跳食物 | 用 `createBounceFood` 而非普通食物，目的是制造紧迫感——食物有倒计时，玩家必须尽快回头拾取 |
| 生成位置 | **蛇尾最后一节**，而非碰撞格（newHead）。newHead 在墙内不可见不可拾取；蛇尾始终在可通行格上，保证食物一定可达 |
| 尾节移除 | 与射击代价机制（§3.1）一致，蛇长即生存资源 |
| 长度归零 | 2 节蛇撞墙后头被吞、尾被移除 → 0 节 → gameover，防止数组越界 |
| 经典模式 | 无 world 时不生成食物（跳过房间查询），但尾节移除仍然执行 |
| 同帧执行 | 尾节移除和扣分在同一帧完成，顺序不影响结果 |
| 不依赖已有 UI | 弹跳食物的渲染和倒计时由 `createBounceFood` 自带逻辑处理，无需额外工作 |

### 与射击代价的关系

| 操作 | 代价 | 收益 |
|------|------|------|
| 射击（Z 键） | 移除尾节 | 远程攻击能力 |
| 撞墙 | 移除尾节 + 扣 5 分 | 生成弹跳食物（可回血） |
| 撞敌人 | 无敌帧触发（§3.4） | — |

撞墙是惩罚（伤害）但附带弹跳食物作为补偿，形成「受伤但有恢复机会」的设计模式。

## 3.7 战斗房间（Arena / COMBAT Room）

战斗房间（`ROOM_TYPE.COMBAT`）是为玩家提供结构化战斗遭遇的独立房间。

### 核心机制

| 特性 | 说明 |
|------|------|
| 触发方式 | 玩家进入房间后自动触发 |
| 门锁机制 | 进入后所有门立即锁定，全部敌人消灭后解锁 |
| 敌人生成 | 首次进入时生成（非世界生成时），数量 3-5 |
| 周期食物 | 每 20 帧（`COMBAT_FOOD_SPAWN_INTERVAL`）在房间无食物时生成 1 个 |
| 重置 | 存档读档后重置战斗状态（允许公平重试） |

### 房间生成

- 每张地图 2-4 个战斗房间
- 距离起点至少 2 格（避免开局即陷入战斗）
- 使用 `assignRoomTypes()` 将 NORMAL 房间提升为 COMBAT 类型

### 进入流程

```
玩家穿过门进入 COMBAT 房间
  ↓
checkDoorPassable() 先检查可通过（刚进入时 combatActive = false）
  ↓
tick() 检测到 roomTransition + newRoom.type === COMBAT
  ↓
首次进入（!combatActive）：
  combatActive = true
  spawnCombatEnemies() — 生成 3-5 个敌人
  门锁定（所有方向 → passable: false, reason: 'combat_locked'）
  ↓
每帧检查存活敌人：
  alive > 0 → spawnCombatFood()（周期食物补充）
  alive = 0 → combatActive = false → 门解锁
```

### 门锁机制

```javascript
// collision.js - checkDoorPassable()
if (room.type === ROOM_TYPE.COMBAT && room.combatActive) {
  return { passable: false, reason: 'combat_locked' };
}
```

与 BOSS 门不同，战斗房间锁定**所有方向**的出口，而非仅某一扇门。玩家必须击败所有敌人才能离开。

### 敌人强度

```javascript
const dist = Math.abs(room.x) + Math.abs(room.y);  // 距起点距离
const difficulty = Math.min(1 + Math.floor(dist * 0.3), 3);
const enemyCount = 2 + difficulty;  // 3-5 个敌人
// 每个敌人 HP = 1 + floor(dist * 0.3)
```

距离起点越远，敌人数量和 HP 越高（自然难度曲线）。

### 设计意图

| 决策 | 选择 | 理由 |
|------|------|------|
| 生成时机 | 首次进入时 | 避免世界生成时敌人从门缝泄漏；存档边界清晰 |
| 门锁类型 | 锁定全部方向 | 强制玩家完成战斗，无法「探门就逃」 |
| 周期食物 | 房间无食物时每 20 帧生成 | 持续作战的续航保障；已有 boss 食物定时器模式复用 |
| 房间数量 | 2-4 / 地图 | 占据适当比例（8 种类型竞争 25 格），不过度饱和 |
