# Design: #91 — 胜利条件迭代 (Boss 房间战斗)

> Parent Issue: #91
> Agent: plan-agent
> Date: 2026-07-09

---

## 1. Architecture Overview

### Core Idea

将 GOAL 房间从「进入即胜利」改造为「封闭 Boss 战斗竞技场」：蛇头进入 GOAL 房间后，所有入口关闭，一只 Boss 蓝色蛇出现，击败 Boss 后才是真正胜利。

### Data Flow

```
[进入 GOAL 房间] ──→ gameState 保持 'playing'
                         │
                    ┌────┴────┐
                    │ tick()  │  (加入 boss 分支)
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         Boss AI     Boss子弹     FlyingFood
       (追逐/射击)    (碰撞)      (物理弹飞)
              │          │          │
              └──────────┼──────────┘
                         ▼
               Boss length <= 0 ?
                    ┌───┴───┐
                   YES      NO
                    │       继续战斗
                    ▼
              gameState = 'won'
```

### Key Architectural Decisions

| 决策 | 选择 | 理由 |
|------|------|------|
| Boss 战场 | 复用现有 GOAL 房间 | 最小改动、最佳体验一致性；无需新增房间类型或 Canvas |
| 入口关闭 | 进入后 room.doors 全部标记为 blocked | snake 无法退出；tile 渲染替代 door 为 WALL 风格 |
| Boss 数据结构 | 继承 Enemy 结构 + 扩展属性 | 复用现有 segments、tickCounter、chaseRange 系统 |
| 子弹系统 | 复用 projectile 系统，加 source 标记 | 同一碰撞系统处理玩家和 Boss 子弹 |
| FlyingFood | 新实体类型，纯 JS 物理模拟 | 不依赖外部物理引擎，与现有 food 系统解耦 |
| 自动食物生成 | state 级别定时器，每 N tick 生成 | 独立于现有 emergencyFoodRespawn 系统 |

---

## 2. Detailed Design

### 2.1 State Additions (`core.js`)

```js
// 新增到 game state
{
  bossFightActive: false,    // 是否激活 Boss 战斗
  boss: null,                // Boss 实体 (Boss 结构)
  flyingFoods: [],           // 弹飞食物列表
  autoFoodTimer: 0,          // 自动食物生成计时器
  bossDefeated: false,       // Boss 是否已被击败

  // 新增到 GOAL 房间
  bossSpawnedAt: null,       // Boss 生成时间戳 (tickCount)
  roomEntranceBlocked: false,// 入口是否已关闭
}
```

### 2.2 Boss 数据结构 (`constants.js` + `entities.js`)

**常量新增：**
```js
export const BOSS_TYPE = {
  BLUE_SNAKE: 'blue_snake',
};

export const BOSS_DEFAULTS = {
  BLUE_SNAKE: {
    length: 10,
    speedTicks: 3,
    shootInterval: 6,    // ticks between shots
    chaseRange: 30,      // whole room coverage
  },
};

export const FLYING_FOOD_DEFAULTS = {
  MAX_COUNT: 12,
  LIFETIME: 60,          // ticks
  MAX_BOUNCE: 3,
  FRICTION: 0.95,
  INITIAL_SPEED: { min: 0.5, max: 2.0 },
};

export const AUTO_FOOD_INTERVAL = 30;  // auto spawn every N ticks
export const MAX_AUTO_FOOD = 5;        // max auto-spawned food in GOAL room

// 调色板扩展
PALETTE.BOSS = '#3060e0';        // 蓝色蛇
PALETTE.BOSS_HEAD = '#2040b0';   // 深蓝头
PALETTE.BOSS_BULLET = '#6090ff'; // 浅蓝子弹
PALETTE.FLYING_FOOD = '#f0a040'; // 弹飞食物 (橙金色)
```

**Boss 实体工厂 (`entities.js`):**
```js
export function createBoss(type, x, y, length = 10) {
  const segments = [];
  for (let i = 0; i < length; i++) {
    segments.push({ x: x - i, y });
  }
  return {
    id: 'boss_main',
    type,               // BOSS_TYPE.BLUE_SNAKE
    x, y,               // 头部世界坐标
    segments,           // 身体段
    length,             // 当前长度 (与 segments.length 同步)
    hp: length,         // 当前血量 (≈ 长度)
    maxHp: length,      // 最大血量 (用于 HUD 百分比)
    speedTicks: BOSS_DEFAULTS.BLUE_SNAKE.speedTicks,
    tickCounter: 0,
    shootCooldown: 0,
    shootInterval: BOSS_DEFAULTS.BLUE_SNAKE.shootInterval,
    aiState: 'chase',   // 'chase' | 'eating'
    roomX: 0,           // 所在房间 X
    roomY: 0,           // 所在房间 Y
    chaseRange: BOSS_DEFAULTS.BLUE_SNAKE.chaseRange,
  };
}
```

**FlyingFood 实体工厂 (`entities.js`):**
```js
export function createFlyingFood(x, y, vx, vy) {
  return {
    id: `ff_${++_ffIdCounter}`,
    x, y,
    vx, vy,
    lifetime: FLYING_FOOD_DEFAULTS.LIFETIME,
    bounceCount: 0,
    angle: Math.random() * Math.PI * 2,
    angularSpeed: (Math.random() - 0.5) * 0.2,
    settled: false,
  };
}
```

**Boss 子弹工厂 (`entities.js`):**
```js
export function createBossProjectile(id, x, y, dir) {
  return {
    id, x, y,
    prevX: x, prevY: y,
    dir: { ...dir },
    speed: 1,                    // Boss 子弹更慢
    remainingRange: 8,           // 射程 8 格
    power: 1,
    source: 'boss',              // 标记来源
  };
}
```

### 2.3 Core Game Tick — Boss 分支 (`core.js`)

```
tick() 修改流程:

1. 原有 snake 移动、food 碰撞、projectile 更新、enemy 更新 保留不变

2. [新增] 进入 GOAL 房间检测:
   if (roomTransition 且 newRoom.type === GOAL):
     →
     a. 不触发 victory (移除原有 gameState = 'won')
     b. 设置 s.bossFightActive = true
     c. 生成 Boss: s.boss = createBoss(...)
     d. 关闭入口: blockRoomEntrances(room)
     e. 重置 s.autoFoodTimer = 0

3. [新增] Boss 战斗 tick (在 updateEnemies 之后):
   if (s.bossFightActive && s.boss):
     a. updateBossAI(s)     — Boss 追逐 + 射击决策
     b. updateFlyingFoods(s) — FlyingFood 物理更新
     c. updateAutoFoodTimer(s) — 自动食物生成
     d. checkBossProjectileCollision(s) — Boss 子弹击中玩家
     e. checkFlyingFoodCollision(s)     — FlyingFood 被蛇/Boss 吃掉
     f. boss.length <= 0 → gameState = 'won'
```

### 2.4 Boss AI (`ai.js` — 新增函数)

```js
export function updateBossAI(state) {
  const boss = state.boss;
  if (!boss) return state;

  boss.tickCounter++;

  // 移动
  const move = bossChasePath(boss, state.snake[0], state);
  if (move && isValidBossMove(move, boss, state)) {
    boss.x += move.x;
    boss.y += move.y;
    boss.segments = [{ x: boss.x, y: boss.y }, ...boss.segments.slice(0, -1)];
  }

  // 射击决策
  boss.shootCooldown--;
  if (boss.shootCooldown <= 0 && boss.length > 2) {
    const dir = calcBossShootDir(boss, state.snake[0]);
    if (dir) {
      state.projectiles.push(createBossProjectile(nextProjId(), boss.x, boss.y, dir));
      boss.length--;
      boss.segments.pop();
      // 射击消耗的段变成 FlyingFood
      state.flyingFoods.push(createFlyingFood(...));
      boss.shootCooldown = boss.shootInterval;
    }
  }

  // 觅食
  tryBossEatFood(boss, state);

  return state;
}

// 判断 Boss 射击方向 (取曼哈顿距离较长的轴向)
function calcBossShootDir(boss, snakeHead) {
  const dx = snakeHead.x - boss.x;
  const dy = snakeHead.y - boss.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx === 0 && absDy === 0) return null;
  if (absDx >= absDy) return { x: Math.sign(dx), y: 0 };
  return { x: 0, y: Math.sign(dy) };
}
```

### 2.5 FlyingFood 物理更新 (`ai.js`)

```js
export function updateFlyingFoods(state) {
  let foods = state.flyingFoods.filter(f => !f.settled);

  for (const f of foods) {
    f.x += f.vx;
    f.y += f.vy;
    f.vx *= FLYING_FOOD_DEFAULTS.FRICTION;
    f.vy *= FLYING_FOOD_DEFAULTS.FRICTION;
    f.angle += f.angularSpeed;
    f.lifetime--;

    // 墙壁反弹 (只有 GameBoy 房间内边界)
    const roomBorder = ROOM_SIZE;
    const rx = state.currentRoom.x * ROOM_SIZE;
    const ry = state.currentRoom.y * ROOM_SIZE;
    if (f.x <= rx) { f.x = rx; f.vx *= -0.5; f.bounceCount++; }
    if (f.x >= rx + roomBorder - 1) { f.x = rx + roomBorder - 1; f.vx *= -0.5; f.bounceCount++; }
    if (f.y <= ry) { f.y = ry; f.vy *= -0.5; f.bounceCount++; }
    if (f.y >= ry + roomBorder - 1) { f.y = ry + roomBorder - 1; f.vy *= -0.5; f.bounceCount++; }

    // 落定条件
    if (f.lifetime <= 0 || f.bounceCount >= 3 || (Math.abs(f.vx) + Math.abs(f.vy)) < 0.1) {
      f.settled = true;
      // 转为普通 food (找最近空闲格)
      convertFlyingFoodToFood(state, f);
    }
  }

  // 移除超过 MAX_COUNT 的最旧食物
  if (foods.length > FLYING_FOOD_DEFAULTS.MAX_COUNT) {
    const old = foods[0];
    convertFlyingFoodToFood(state, old);
  }

  state.flyingFoods = foods.filter(f => !f.settled);
  return state;
}
```

### 2.6 自动食物生成 (`ai.js`)

```js
export function updateAutoFoodTimer(state) {
  if (!state.bossFightActive) return state;
  state.autoFoodTimer++;
  if (state.autoFoodTimer >= AUTO_FOOD_INTERVAL) {
    state.autoFoodTimer = 0;
    const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
    if (!room) return state;
    // 计数当前食物 + FlyingFood
    const totalFood = room.entities.food.length + state.flyingFoods.length;
    if (totalFood < MAX_AUTO_FOOD + 2) {
      const pos = findEmptyFloorCell(room, state.world, Math.random);
      if (pos) {
        room.entities.food.push({ x: pos.wx, y: pos.wy });
      }
    }
  }
  return state;
}
```

### 2.7 碰撞检测扩展 (`collision.js`)

```js
/**
 * Boss 子弹对蛇身的碰撞检测 (line-sweep)
 * 玩家蛇身的任意段被 Boss 子弹击中 → 减一 + 生成 FlyingFood
 */
export function checkBossProjectileCollision(state) {
  let s = { ...state };
  const toRemove = [];

  for (const proj of s.projectiles) {
    if (proj.source !== 'boss') continue;

    // 对玩家蛇身每段做 line-sweep 检测
    const cells = getCellsAlongLine(proj.prevX, proj.prevY, proj.x, proj.y);
    let hit = false;
    for (const cell of cells) {
      for (let si = 0; si < s.snake.length; si++) {
        const seg = s.snake[si];
        if (seg.x === cell.x && seg.y === cell.y) {
          hit = true;
          // 玩家掉一段
          s.snake = s.snake.slice(0, -1);
          // 生成 FlyingFood
          const ff = createFlyingFood(
            seg.x, seg.y,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
          );
          s.flyingFoods.push(ff);
          s.score = Math.max(0, s.score - 5);
          s.screenShake = { intensity: 4, duration: 8 };
          break;
        }
      }
      if (hit) break;
    }
    if (hit) toRemove.push(proj.id);
  }

  s.projectiles = s.projectiles.filter(p => !toRemove.includes(p.id));
  if (s.snake.length === 0) s.gameState = 'gameover';
  return s;
}

/**
 * 玩家子弹击中 Boss 身体
 * 在现有 handleProjectileCollisions 中扩展：
 * 当 projectile 的 source 不是 'boss' 且目标 cell 与 Boss segments 重叠时
 */
export function checkBossHitByPlayerProjectile(state) {
  // 从 handleProjectileCollisions 中扩展：
  // 遍历玩家子弹 → 检测与 boss.segments 重叠
  // 击中片段 → boss.length--, boss.segments.pop()
  // → 生成 FlyingFood
  // → 移除该子弹
}
```

### 2.8 渲染扩展 (`room.js`)

```js
/**
 * 绘制 Boss (蓝色蛇风格)
 */
export function drawBoss(ctx, boss) {
  if (!boss) return;

  for (let i = boss.segments.length - 1; i >= 0; i--) {
    const seg = boss.segments[i];
    const px = (seg.x % ROOM_SIZE) * CELL_SIZE;
    const py = (seg.y % ROOM_SIZE) * CELL_SIZE;

    if (i === 0) {
      ctx.fillStyle = PALETTE.BOSS_HEAD;
    } else {
      ctx.fillStyle = PALETTE.BOSS;
    }
    ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  }
}

/**
 * 绘制 FlyingFood (带旋转动画的弹飞块)
 */
export function drawFlyingFood(ctx, food) {
  const rx = food.x;
  const ry = food.y;
  // 只在当前房间内绘制
  const px = ((rx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE * CELL_SIZE;
  const py = ((ry % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE * CELL_SIZE;

  ctx.save();
  ctx.translate(px + CELL_SIZE / 2, py + CELL_SIZE / 2);
  ctx.rotate(food.angle);
  ctx.fillStyle = PALETTE.FLYING_FOOD;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
}
```

### 2.9 HUD 扩展 (`hud.js`)

```js
/**
 * Boss HP 显示 (Boss 战期间)
 */
export function drawBossHP(ctx, boss) {
  if (!boss) return;
  const barWidth = 150;
  const barHeight = 8;
  const x = CANVAS_SIZE / 2 - barWidth / 2;
  const y = CANVAS_SIZE - 20;

  // Background
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, barWidth, barHeight);

  // HP fill
  const ratio = boss.length / boss.maxHp;
  ctx.fillStyle = ratio > 0.5 ? PALETTE.BOSS_HEAD : '#ff4444';
  ctx.fillRect(x, y, barWidth * ratio, barHeight);

  // Border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barWidth, barHeight);

  // Label
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BOSS', CANVAS_SIZE / 2, y - 4);
}
```

### 2.10 入口关闭机制 (`core.js`)

```js
function blockRoomEntrances(state, room) {
  // 将所有 door tile 替换为 WALL
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      // 标记 door 为 blocked
      room.doors[dir].blocked = true;
      // 物理层面：将 door 位置的 tile 改为 WALL
      const mid = Math.floor(ROOM_SIZE / 2);
      if (dir === 'up') {
        for (let dx = -2; dx <= 2; dx++) room.tiles[0][mid + dx] = CELL.WALL;
      }
      // ...down, left, right 类似...
    }
  }
  return state;
}
```

### 2.11 地图生成器修改 (`generator.js`)

```js
// 在 generateRoomTiles 中，对 GOAL 房间：
// 当前已有清除中心 5×5 区域的逻辑 → 保留
// 额外确保有足够的开阔战斗空间

// 在 placeEnemiesAndItems 中，对 GOAL 房间：
// 当前不放置敌人 → 保留（Boss 在运行时生成）
// 保留初始食物 (2 个) → 作为战斗前期补给
```

---

## 3. Test Spec

### 3.1 正常流程测试 (Unit)

| # | 测试名 | 输入 | 预期结果 |
|---|--------|------|----------|
| T1 | boss_spawn_on_goal_enter | 蛇头进入 GOAL 房间 | bossFightActive=true, boss 非空, 入口关闭 |
| T2 | boss_defeat_victory | Boss length 降至 0 | gameState='won' |
| T3 | boss_shoot_reduces_length | Boss 射击一次 | boss.length 减 1, projectile 出现 |
| T4 | player_hit_by_boss_bullet | Boss 子弹击中蛇身 | 玩家长度减 1, FlyingFood 出现 |
| T5 | player_hit_boss_with_bullet | 玩家子弹击中 Boss | Boss 长度减 1, FlyingFood 出现 |
| T6 | boss_eats_food | Boss 头部经过食物 | boss.length 加 1 |
| T7 | flying_food_settles | FlyingFood lifetime=0 | 转为普通 food |
| T8 | auto_food_spawn | 等待 AUTO_FOOD_INTERVAL tick | 房间内新增一个 food |
| T9 | boss_doesnt_shoot_when_short | Boss length≤2 | 不射击 |
| T10 | goal_room_entrance_blocked | 进入 GOAL 后尝试从原门返回 | 门为 WALL, 不可通行 |

### 3.2 边界条件测试

| # | 测试名 | 场景 | 预期 |
|---|--------|------|------|
| B1 | player_length_zero_during_boss | 玩家被减至 0 | gameState='gameover' |
| B2 | max_flying_foods | FlyingFood 已达 MAX_COUNT | 最旧的转为 food |
| B3 | boss_shoot_while_length_one | Boss length=1, 尝试射击 | 不射击 (保持长度 1) |
| B4 | flying_food_wall_bounce | FlyingFood 飞向墙壁 | 反弹, bounceCount++ |
| B5 | boss_spawn_on_snake_pos | 蛇恰好站在 Boss 初始化位置 | Boss 偏移到最近空闲格 |
| B6 | bullet_vs_bullet_collision | 玩家子弹与 Boss 子弹相遇 | 两弹均消失 |
| B7 | room_no_floor_spots | GOAL 房间无空闲格 | 自动食物生成失败 (不报错) |
| B8 | snake_tail_outside_on_entry_close | 蛇尾未完全进入即关闭 | 延迟 1 tick 关闭 |

### 3.3 状态完整性测试

| # | 测试名 | 场景 | 预期 |
|---|--------|------|------|
| S1 | boss_fight_state_persistence | 各 tick 间 boss 状态不丢失 | boss, flyingFoods 持续更新 |
| S2 | pause_pauses_boss | 暂停时 | boss tickCounter, shootCooldown 不递增 |
| S3 | score_updates_on_hit | 被击中+反击 | score 正确增减 |
| S4 | no_regression_normal_rooms | 非 GOAL 房间 | 不受 boss 系统影响 |

---

## 4. Files Changed

| 文件 | 变更说明 | 预估行数 |
|------|----------|----------|
| `public/src/engine/constants.js` | 新增 BOSS_TYPE, BOSS_DEFAULTS, FLYING_FOOD_DEFAULTS, AUTO_FOOD_INTERVAL, MAX_AUTO_FOOD; 调色板新增 BOSS/BOSS_HEAD/BOSS_BULLET/FLYING_FOOD | +30 |
| `public/src/engine/entities.js` | 新增 createBoss(), createBossProjectile(), createFlyingFood(); 新增 _ffIdCounter | +50 |
| `public/src/engine/core.js` | tick(): 移除 GOAL 房间直接胜利; 新增进入 GOAL 触发 Boss 战; 新增 Boss tick 调用; 新增 blockRoomEntrances(); 新增 checkBossGameOver() | +80 |
| `public/src/engine/ai.js` | 新增 updateBossAI(), bossChasePath(), calcBossShootDir(), tryBossEatFood(); 新增 updateFlyingFoods(), convertFlyingFoodToFood(); 新增 updateAutoFoodTimer() | +120 |
| `public/src/engine/combat.js` | fireProjectile(): 移除 snake 长度检查 (复用); updateProjectiles(): 兼容 boss 子弹; handleProjectileCollisions(): 扩展检测 Boss 身体碰撞 | +30 |
| `public/src/engine/collision.js` | 新增 checkBossProjectileCollision(); 新增 checkBossHitByPlayerProjectile(); checkProjectileCollisionForCell(): 兼容 Boss 子弹 | +60 |
| `public/src/render/room.js` | renderRoom(): 新增 drawBoss(), drawBossProjectile(), drawFlyingFood(); 入口关闭时绘制 WALL 覆盖 | +40 |
| `public/src/render/hud.js` | Boss 战期间显示 Boss HP 条; drawBossHP() 函数 | +25 |
| `public/src/render/overlays.js` | 胜利画面文字区分 Boss 击败 vs 传统通关 | +5 |
| `public/gameboy.html` | 更新底部 footer 胜利条件描述 | +3 |
| `tests/metroidvania-snake.test.js` | 新增 Boss 战测试用例 (T1-T10, B1-B8, S1-S4) | +200 |
| `docs/DESIGN/15-metroidvania-snake-overhaul.md` | 补充 Boss 战设计章节引用 | +5 |

### 合计预估行数: ~648 行

---

## 5. Verification Checklist

- [ ] T1: 蛇头进入 GOAL 房间触发 Boss 战 (bossFightActive=true)
- [ ] T2: Boss 被击败后 gameState='won'
- [ ] T3: Boss 射击消耗自身长度并生成子弹
- [ ] T4: Boss 子弹击中玩家产生 FlyingFood
- [ ] T5: 玩家子弹击中 Boss 产生 FlyingFood
- [ ] T6: Boss 吃食物增加长度
- [ ] T7: FlyingFood 物理运动并最终落定为普通 food
- [ ] T8: 自动食物生成正常工作
- [ ] T9: Boss 在长度过低时不射击
- [ ] T10: GOAL 房间入口关闭无法退出
- [ ] B1: 玩家长度归零触发 gameover
- [ ] B2: FlyingFood 数量上限正确
- [ ] B3: Boss 不自杀
- [ ] B4: FlyingFood 墙壁反弹行为正确
- [ ] S1: 暂停时 Boss 状态冻结
- [ ] S4: 非 GOAL 房间完全不受影响
