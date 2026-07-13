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
