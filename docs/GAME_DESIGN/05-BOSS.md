# 5. Boss 系统

> BOSS "Blue Hammer" 是一条双排蓝色蛇（2 行 × 3 列 = 6 HP），
> 占据地图右下角的 BOSS 房间。击败 BOSS 即为通关。

---

## 5.1 BOSS 房间

BOSS 房间为 **80×80 格** 的大型场地（标准房间 20×20 的 16 倍）。

### 布局

```
┌─────────────────────────────────────────────┐
│ BOSS_DOOR (入口, tiles[0][40])               │
│                                              │
│   ■ (5,5)     ← 四根柱子              ■     │
│                 (CELL.STONE_WALL, HP=1)      │
│                                              │
│   ■                                  ■      │
│                                              │
└─────────────────────────────────────────────┘
```

- 四根柱子位于房间四角（距边 5 格）
- 柱子被撞碎后掉落带弹跳的食物
- 入口处同时存在标准门通道（`tiles[0][8..12]`，与相邻房间对齐）和 BOSS 门（`tiles[0][40]`，装饰性/出口）

### 进入流程

```
蛇进入 BOSS 房间 → gameState = 'bossIntro'
  → 播放介绍对话框（"Blue Hammer" + "Snake tasts GOOD !"）
  → 玩家按 Space/Enter/方向键 → changeDirection() 处理
    → 蛇头从 tiles[0][10]（WALL）重定位到 tiles[1][10]（FLOOR）
    → direction/nextDirection 重置为 {0, 0}
    → gameState = 'playing'
  → 战斗开始
```

**关键设计：** Space/Enter 和方向键使用同一入口函数 `changeDirection()`，保证行为一致。

## 5.2 Blue Hammer 战斗阶段

BOSS 有 3 个战斗阶段 + 1 个狩猎模式（覆盖所有阶段）：

```
HP 6-5 → Phase 1: Chase（追逐）
HP 4-3 → Phase 2: Charge（冲锋）
HP 2-1 → Phase 3: Normal Snake（普通蛇形态）
任意阶段 → 房间内有食物 → Hunting（狩猎食物）
```

### Phase 1 — Chase（追逐）

BOSS 使用贪心路径追踪蛇头（同普通敌人 AI）。HP降至 4 时进入 Phase 2。

### Phase 2 — Charge（冲锋）

BOSS 先进入 windup（蓄力 5 tick），然后沿锁定方向快速冲刺（2 格/tick），直到撞墙或柱子。

- 冲刺期间撞到柱子 → 柱子破碎 + 掉落食物
- 撞墙后 BOSS 短暂眩晕（chargeCooldown）
- 冲刺期间对蛇的伤害翻倍（2 HP/次）

### Phase 3 — Normal Snake（普通蛇形态）

BOSS 缩为 2 节的普通蛇，追逐蛇头。

- 只有 2 节，蛇头在两端交替（每次被击中后 swap headIndex）
- 如果 BOSS 吃够食物使 HP ≥ 4，则退回 Phase 2

### Phase 4 — Hunting（狩猎食物）

覆盖所有阶段。当 BOSS 房间内有食物时，BOSS 优先追踪食物而不是蛇头。吃食物可回复 HP（`boss.hp++`），HP 已满时 BOSS 进入"被撑住"状态（`stuffedTicks`）。

## 5.3 食物反弹与闪烁消亡

柱子破碎和受到攻击时掉落的食物带有物理效果：

```javascript
createBounceFood(x, y, source) {
  angle = random(0, 2π)
  dist = 1 + random(0, 3)
  x, y = 掉落原点
  isBouncing = true
  bounceTicks = 3          // 弹跳帧数
  despawnTicks = 30       // 总存活时间
}
```

- 食物掉落后弹跳 3 帧
- 剩余 10 tick 时开始闪烁（alpha 值交替），提示即将消失
- 30 tick 后自动消失

## 5.4 BOSS 数据

```javascript
BOSS_HP_SEGMENTS = 6      // 总 HP
BOSS_CHARGE_WINDUP = 5    // 冲锋蓄力 tick
BOSS_STUFFED_TICKS = 3    // 吃撑后暂停 tick
BOSS_CHARGE_COOLDOWN = 8  // 冲锋冷却 tick
FOOD_BLINK_START = 10     // 开始闪烁的剩余 tick
FOOD_DESPAWN_TOTAL = 30   // 食物总存活 tick
```

## 5.5 当前已知问题

| 问题 | 状态 | 相关 Issue |
|------|------|-----------|
| Space/Enter 在 bossIntro 阶段不重置 direction/nextDirection 导致卡死 | 已修复 | #142, #145 |
| BOSS 房间的门通道用 ROOM_SIZE mid(10) 而非 BOSS_ROOM_SIZE mid(40) | 已知设计 | — |
