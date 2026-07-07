# Plan: 关卡障碍死亡惩罚迭代

> Parent Issue: #22
> Agent: plan-agent
> Date: 2026-07-07
> Derived from: `docs/PRD/22-obstacle-death-penalty.md`
> Reference: `docs/TASKS/22-obstacle-death-penalty.md`
> Approach: A — 最小改动（修改碰撞返回值 + 新增 DEATH_WALL）

---

## 1. Overview

### Goal
分三种碰撞惩罚级别：
1. **边界墙 & 普通障碍 (WALL, STONE_WALL)** — 扣 1 格蛇身 + 屏幕震动，不即死
2. **即死障碍 (DEATH_WALL 新类型)** — 立即 gameover
3. **长度归零** — 兜底 gameover 检查

同时对玩家碰撞反馈增加屏幕震动 (screen shake) 效果。

### Architecture Strategy
保持 Issue #15 的模块化架构，做最小增量改动。所有变更集中在 5-6 个核心文件，不改变数据流架构。

---

## 2. Implementation Strategy

### 2.1 总体策略

```
[当前架构]
tick() → checkSnakeCollision → ['wall'] → gameover
                              → ['enemy'] → length-1
                              → ['self']  → gameover

[新架构]
tick() → checkSnakeCollision → ['damage'] → length-1 + screenShake
                              → ['death']  → gameover (immediate)
                              → ['enemy']  → length-1
                              → ['self']   → gameover
                              → length===0 → gameover (兜底)
```

### 2.2 两个阶段
- **Phase 1: 碰撞逻辑改造** (T2, T3) — 先改 collision.js + core.js，使标准墙和室内障碍变成扣长度
- **Phase 2: 即死墙完整实现** (T1, T4, T5, T6, T7) — 加常量、渲染、震动、生成器、测试、文档

### 2.3 向后兼容
- `checkSnakeCollision()` 仍然返回 `['damage']` 数组（兼容现有 `['wall']` 数组格式）
- `tick()` 移除 `'wall'` 分支，增加 `'damage'`/`'death'` 分支
- 现有测试中依赖 `'wall'` 碰撞结果的用例需要更新

---

## 3. File-by-File Changes

### T1 — `public/src/engine/constants.js` — 新增 CELL.DeathWall 常量

**变更:**
- CELL 枚举新增 `DEATH_WALL: 5`
- (可选) 新增 `PALETTE.DEATH_WALL` 颜色常量（红色/熔岩色）

**代码位置:** CELL 对象末尾，STONE_WALL 之后

```js
export const CELL = {
  FLOOR:        0,
  WALL:         1,
  CRACKED_WALL: 2,
  DOOR:         3,
  STONE_WALL:   4,
  DEATH_WALL:   5,   // ← NEW: 即死障碍
};
```

**复杂度:** ⭐ 极低（新增 1 行常量 + 可选调色板条目）
**无依赖**

---

### T1 — `public/src/render/room.js` — DEATH_WALL 渲染 + 视觉区分

**变更:**
1. 在 tile 渲染 switch 中增加 `CELL.DEATH_WALL` 分支
2. DEATH_WALL 渲染为红色/熔岩风格（区别于深绿 WALL）
3. 确认 STONE_WALL 渲染调整为中性（不再是即死暗示）

**代码位置:** `renderRoom()` → tile switch → case CELL.STONE_WALL 之后

```js
case CELL.DEATH_WALL:
  // 熔岩红 — 明显区别于普通墙
  ctx.fillStyle = '#cc3300';  // 或 PALETTE.DEATH_WALL
  ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
  // 螺旋/尖刺装饰
  ctx.strokeStyle = '#ff6600';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px + CELL_SIZE/2, py + CELL_SIZE/2, 6, 0, Math.PI * 2);
  ctx.stroke();
  break;
```

**复杂度:** ⭐ 低（新增 ~15 行渲染代码）
**依赖:** T1 常量定义完成后

---

### T2 — `public/src/engine/collision.js` — 修改碰撞检测

**变更:**
1. `checkSnakeCollision()`: WALL 和 STONE_WALL 从 `'wall'` 改为 `'damage'`
2. `checkSnakeCollision()`: 新增 `DEATH_WALL` → `'death'`
3. `checkProjectileCollision()`: 子弹撞到 DEATH_WALL 也消失（与 WALL 同逻辑）
4. 确认边界墙（坐标越界）也返回 `'damage'`（不是即死）

**代码位置:**

```js
// 修改前 (world bound check)
if (head.x < 0 || head.y < 0) return ['damage'];   // was ['wall']
if (world && (head.x >= maxX || head.y >= maxY)) return ['damage'];  // was ['wall']

// 修改前 (cell type check)
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  return ['damage'];  // was ['wall']
}

// 新增: DEATH_WALL 检查
if (cellType === CELL.DEATH_WALL) {
  return ['death'];
}
```

```js
// checkProjectileCollision 中同样处理 DEATH_WALL
// 在 WALL/STONE_WALL 检测后追加上 DEATH_WALL
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL || cellType === CELL.DEATH_WALL) {
  return { collisionType: 'wall', target: null };
}
```

**复杂度:** ⭐⭐ 低-中（修改 ~5 行，新增 ~3 行）
**关键风险:** 确保所有调用 `checkSnakeCollision` 的地方不硬编码 `'wall'`

---

### T3 — `public/src/engine/core.js` — 修改碰撞处理

**变更:**
1. `createInitialState()`: 新增 `screenShake: null`（或 `{ intensity: 0, duration: 0 }`）

```js
return {
  // ...existing fields...
  screenShake: null,    // ← NEW: { intensity, duration } or null
  currentTickInterval: BASE_TICK_INTERVAL,
  savePoint: null,
  // ...
};
```

2. `tick()`: 移除 `'wall'` → gameover 分支；增加 `'damage'` 和 `'death'` 分支

```js
// 原有 wall 分支 (删除)
// if (collisions.includes('wall')) { s.gameState = 'gameover'; return s; }

// 新增: damage 分支 — 扣长度 + 震动
if (collisions.includes('damage')) {
  s.snake = s.snake.slice(0, -1);
  s.screenShake = { intensity: 3, duration: 6 };  // 3px, 6 ticks (~300ms)
  // 注意: 蛇头不移动 (player 停在原地)
  // 更新速度
  s.currentTickInterval = calculateSpeed(s.snake.length, s.baseTickInterval);
  // 仍然继续处理 projectile/enemy 等更新，但 snake 已经扣过了
  // 在调整蛇位置之前跳出到更新逻辑

  // 处理食物、敌人、投影等...
}

// 新增: death 分支 — 即死
if (collisions.includes('death')) {
  s.gameState = 'gameover';
  return s;
}
```

3. 在 tick 末尾（或其他碰撞处理之后）添加 screenShake 衰减：

```js
// 在 tick 函数末尾
// 衰减 screen shake
if (s.screenShake) {
  s.screenShake = {
    ...s.screenShake,
    duration: s.screenShake.duration - 1,
    intensity: s.screenShake.intensity * 0.7,
  };
  if (s.screenShake.duration <= 0) {
    s.screenShake = null;
  }
}
```

4. 保留现有长度归零兜底检查（`s.snake.length === 0 → gameover`），它在 tick 末尾已经存在。

**关键逻辑:** 撞墙扣血后，蛇的**位置保持不变**（蛇头留在原地），避免蛇头嵌入墙内导致反复扣血。在 `'damage'` 分支中直接 `slice` 蛇身但不移动 newHead，跳过后面的 snake move 逻辑。

**复杂度:** ⭐⭐⭐ 中（修改 ~20 行逻辑，需小心处理控制流）
**依赖:** T2 完成后

---

### T4 — `public/src/render/renderer.js` — 屏幕震动

**变更:**
在 `render()` 函数中，`renderRoom()` 调用前插入 screenShake 偏移逻辑：

```js
export function render(ctx, state) {
  const { world } = state;
  if (!world) return;

  ctx.save();

  // 屏幕震动 — 在渲染当前房间前应用偏移
  if (state.screenShake) {
    const { intensity } = state.screenShake;
    const offsetX = (Math.random() - 0.5) * 2 * intensity;
    const offsetY = (Math.random() - 0.5) * 2 * intensity;
    ctx.translate(offsetX, offsetY);
  }

  // Clear
  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(-5, -5, CANVAS_SIZE + 10, CANVAS_SIZE + 10);  // 扩大清除区域避免边缘残留

  // Render current room
  renderRoom(ctx, state, world);

  // 震动结束后恢复
  if (state.screenShake) {
    // HUD 等不受震动影响 → 在震动恢复后渲染
    ctx.restore();
    // 但 HUD 等应在非震动状态下渲染
  }
  // ...
}
```

实际实现需要更精细处理 — 更好的方式是只在 room 渲染时应用偏移，HUD 和 minimap 不受影响：

```js
export function render(ctx, state) {
  const { world } = state;
  if (!world) return;

  // Clear (always outside shake)
  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ── 震动区: Room + 实体渲染 ──
  ctx.save();
  if (state.screenShake) {
    const { intensity } = state.screenShake;
    ctx.translate(
      (Math.random() - 0.5) * 2 * intensity,
      (Math.random() - 0.5) * 2 * intensity
    );
  }
  renderRoom(ctx, state, world);
  ctx.restore();

  // ── 非震动区: HUD, minimap, overlays ──
  renderHUD(ctx, state);
  renderMinimap(ctx, state, world);
  renderOverlay(ctx, state);
  renderScanlines(ctx);
}
```

**复杂度:** ⭐⭐ 低-中（修改 ~15 行）
**依赖:** T3 中 screenShake 状态定义

---

### T5 — `public/src/engine/generator.js` — DEATH_WALL 放置

**变更:**
在 `generateRoomTiles()` 中，为特定房间类型添加 DEATH_WALL 簇放置逻辑：

```js
// 在 generateRoomTiles() 末尾，放置完普通 WALL 之后

// 特定房间类型放置 DEATH_WALL
const isDangerRoom =
  (room.type === ROOM_TYPE.NORMAL && rng() < 0.3) ||  // 30% 普通房间
  (room.type === ROOM_TYPE.GACHA && rng() < 0.15) ||   // 15% gacha 房间
  (room.type === ROOM_TYPE.KEY_SHRINE && rng() < 0.2); // 20% 钥匙房

if (isDangerRoom) {
  const deathClusterCount = 1 + Math.floor(rng() * 2);  // 1-2 clusters
  for (let i = 0; i < deathClusterCount; i++) {
    placeDeathWallCluster(tiles, room, rng);
  }
}
```

辅助函数:

```js
/**
 * 在房间内放置 DEATH_WALL 簇，确保不阻挡门通道
 */
function placeDeathWallCluster(tiles, room, rng) {
  const mid = Math.floor(ROOM_SIZE / 2);
  // 避开门区域
  const safeZone = new Set();
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      // 标记门附近 3×3 为安全区
      for (let d = -2; d <= 2; d++) {
        if (dir === 'up') safeZone.add(`${mid + d},0`);
        if (dir === 'down') safeZone.add(`${mid + d},${ROOM_SIZE - 1}`);
        if (dir === 'left') safeZone.add(`0,${mid + d}`);
        if (dir === 'right') safeZone.add(`${ROOM_SIZE - 1},${mid + d}`);
      }
    }
  }

  for (let attempts = 0; attempts < 20; attempts++) {
    const cx = 3 + Math.floor(rng() * (ROOM_SIZE - 6));
    const cy = 3 + Math.floor(rng() * (ROOM_SIZE - 6));
    const key = `${cx},${cy}`;
    if (safeZone.has(key)) continue;
    if (tiles[cy][cx] === CELL.FLOOR) {
      const len = 1 + Math.floor(rng() * 2);  // 1-2 blocks
      for (let j = 0; j < len; j++) {
        const px = cx + (j % 2);
        const py = cy + Math.floor(j / 2);
        if (py < ROOM_SIZE - 1 && px < ROOM_SIZE - 1 && tiles[py][px] === CELL.FLOOR) {
          tiles[py][px] = CELL.DEATH_WALL;
        }
      }
      break;
    }
  }
}
```

**关键约束:**
- 不超过总房间数的 20% 含即死墙（5×5 = 25 个房间中最多 5 个含即死墙）
- 每个即死墙房间至少保留 3 格宽的通行路径
- 不在门正前方放置即死墙
- 起始房间、存档房间、目标房间不放即死墙

**复杂度:** ⭐⭐⭐ 中（新增 ~40 行生成逻辑）
**依赖:** T1 常量定义

---

### T6 — `tests/metroidvania-snake.test.js` — 测试更新

**新增测试用例** (在原测试文件末尾的新 describe 块中):

```js
describe('Issue #22 — Obstacle Death Penalty', () => {
  // Test 1: 撞普通墙扣长度 + screenShake
  it('damage from normal wall reduces length and sets screenShake', () => {
    const world = generateWorldMap(3, 3);
    const state = createInitialState(world);
    state.gameState = 'playing';
    // 把蛇放在撞墙位置
    const head = state.snake[0];
    // 使蛇在下一帧撞墙（边框或室内 WALL）
    // ...
    const result = tick(state);
    // 确认扣长度
    expect(result.snake.length).toBeLessThan(state.snake.length);
    // 确认 screenShake 被设置
    expect(result.screenShake).not.toBeNull();
    // 确认不是 gameover（除非长度为 0）
    if (result.snake.length > 0) {
      expect(result.gameState).toBe('playing');
    }
  });

  // Test 2: 撞 DEATH_WALL 立即 gameover
  it('hitting DEATH_WALL causes immediate gameover', () => {
    const world = generateWorldMap(3, 3);
    // 在蛇的路径上放一个 DEATH_WALL
    const room = world.rooms[1][1];
    const head = state.snake[0]; // snake is in room (1,1)
    const { cx, cy } = worldToRoomCoords(head.x + head.direction.x, head.y + head.direction.y);
    if (cy >= 0 && cy < ROOM_SIZE && cx >= 0 && cx < ROOM_SIZE) {
      room.tiles[cy][cx] = CELL.DEATH_WALL;
    }
    const result = tick(state);
    expect(result.gameState).toBe('gameover');
  });

  // Test 3: 长度=1时撞普通墙 → length=0 → gameover
  it('snake with length 1 hitting normal wall dies', () => {
    const state = minimalState({
      snake: [{ x: 10, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
    });
    // 手动触发 damage 路径
    // ...
    // 或者直接在 tick 执行路径中验证
    expect(true).toBe(true); // placeholder
  });

  // Test 4: screenShake 随时间衰减
  it('screenShake decays over ticks and becomes null', () => {
    const state = minimalState({
      screenShake: { intensity: 3, duration: 3 },
    });
    // ...
  });

  // Test 5: 子弹撞 DEATH_WALL 消失（不改测试行为，仅确认）
  it('projectile hitting DEATH_WALL is removed', () => {
    // ...
  });

  // Test 6: 更新原有 wall 碰撞测试为 damage
  it('wall collision returns damage instead of wall', () => {
    const world = generateWorldMap(5, 5);
    const state = createInitialState(world);
    state.snake = [{ x: 0, y: 30 }, { x: 1, y: 30 }];
    state.direction = { x: -1, y: 0 };
    state.nextDirection = { x: -1, y: 0 };
    const result = checkSnakeCollision({ x: -1, y: 30 }, state.snake, state);
    expect(result).toContain('damage');
    expect(result).not.toContain('wall');
  });
});
```

**复杂度:** ⭐⭐ 低-中（新增 ~80 行测试代码）
**依赖:** T2, T3 实现后

---

### T7 — `docs/DESIGN/15-metroidvania-snake-overhaul.md` — 文档更新

**变更:**
1. CELL 枚举表格加入 `DEATH_WALL = 5`
2. 碰撞处理流程描述更新
3. 屏幕震动参数记录

**具体位置:**
- CELL 定义段：加 `DEATH_WALL: 5 (即死障碍)`
- 碰撞处理段：从 `'wall' → gameover` 改为 `'damage' → length-1 + shake`
- 可选：新增屏幕震动参数记录块

**复杂度:** ⭐ 极低（修改 ~5 行文档）
**依赖:** T1-T6 确认后

---

## 4. Dependencies Graph

```
T1 (constants)
 ├──→ T2 (collision) 
 │    └──→ T3 (core/tick)
 │         └──→ T4 (renderer/shake)
 ├──→ T5 (generator) ──→ 一起测试
 └──→ T1 (room render)
 
T6 (tests) ← 依赖 T1-T5 全部完成
T7 (design doc update) ← 依赖 T1-T6 全部完成

线性执行路径: T1 → T2 → T3 → T4 → T5 → T6 → T7
```

**关键路径:** T1 → T2 → T3 (碰撞核心逻辑) 优先完成，之后 T4 (震动) 和 T5 (生成器) 可并行。

---

## 5. Screen Shake Parameters (Spike Result)

从 PRD spike 结果确认的推荐参数:

| 参数 | 值 | 说明 |
|------|-----|------|
| 初始强度 | ±3px | 够感受但不会晕眩 |
| 持续时间 | 6 ticks (~300ms at 50FPS) | 短暂冲击感 |
| 衰减因子 | 0.7 / tick | 指数衰减，快速减弱 |
| 采样频率 | 每 tick 重新随机 | 抖动不重复 |
| 衰减阈值 | intensity < 0.3 时清除 | 低于此值不可见 |

**实现:**
```js
// state.screenShake 结构
{ intensity: 3, duration: 6 }

// 每 tick 衰减
s.screenShake.intensity *= 0.7;
s.screenShake.duration -= 1;
if (s.screenShake.duration <= 0 || s.screenShake.intensity < 0.3) {
  s.screenShake = null;
}
```

---

## 6. Edge Cases & Risk Analysis

### Edge Cases

| # | Case | Expected Behavior | Risk |
|---|------|-------------------|------|
| EC1 | 蛇长度=1 撞普通墙 | length→0 → 兜底 gameover | Medium — 需确保兜底路径正确 |
| EC2 | 连续快速撞墙 | 每次重置震动（不叠加），每次扣 1 格 | Low — 重复操作自然消耗长度 |
| EC3 | 撞墙同时吃到食物 | 先处理碰撞（扣长度），再处理食物 | Medium — 控制流顺序 |
| EC4 | 撞墙同时撞敌人 | 只处理一次碰撞（墙优先？或叠加扣长度？） | Low — 设计上蛇不会同时撞到墙和敌人 |
| EC5 | DEATH_WALL 在门旁 | 生成器确保安全通道，蛇通过门时不受影响 | Low — 生成器约束 |
| EC6 | 震动导致画面裁剪 | 扩大清除区域或 clip 保护 | Low — ctx.translate 偏移量小 |
| EC7 | 蛇头嵌入墙内 | damage 分支不移动蛇头，stay in place | Medium — 需确保蛇头位置正确 |
| EC8 | 生成器 fallback 地图含 DEATH_WALL | fallback 地图不应含即死墙（保持简单） | Low — 显式控制 |

### Risks

| # | Risk | Likelihood | Mitigation |
|----|------|------------|------------|
| R1 | 现有测试因 `'wall'` 返回变 `'damage'` 而失败 | High | 更新所有 wall 碰撞测试预期值 |
| R2 | `checkSnakeCollision` 在其他地方被调用且依赖 `'wall'` | Medium | 代码搜索 `'wall'` 字符串 |
| R3 | 屏幕震动使 HUD/minimap 也偏移 | Low | 只在 room 渲染区域加 ctx.save/restore |
| R4 | 连续 damage 导致蛇头卡住不移动 | Low | damage 分支只扣长度 + 重置震动，不移动蛇头，后续 tick 正常移动 |
| R5 | 玩家无法判断哪些墙是即死的 | Medium | DEATH_WALL 使用明显不同颜色 + 装饰 |
| R6 | 生成器放置 DEATH_WALL 把门堵死 | Medium | 安全区检查 + 门通道保留 |

### Failure Recovery
- 如果震动效果导致玩家不适 → 可增加震动开关（可选）
- 如果 DEATH_WALL 视觉混淆 → 增加骷髅/尖刺图标
- 如果生成器放置不合理 → 降低出现概率或手动固定房间类型

---

## 7. Verification Plan

### Unit Test Coverage
| Component | Tests | Priority |
|-----------|-------|----------|
| collision.js: damage vs death | 2 | P0 |
| core.js: damage handling (length-1) | 2 | P0 |
| core.js: death handling (gameover) | 1 | P0 |
| core.js: length 0 → gameover | 1 | P0 |
| core.js: screenShake decay | 1 | P1 |
| renderer.js: screenShake offset | 1 | P1 |
| generator.js: DEATH_WALL placement | 2 | P1 |
| Existing wall-collision tests | Update | P0 |

### Manual QA Checklist
1. 新建游戏 → 蛇撞边界墙 → 扣 1 格 + 屏幕震动
2. 蛇撞室内 WALL → 扣 1 格 + 震动
3. 蛇长度=1 时撞墙 → gameover
4. 进入含 DEATH_WALL 的房间 → 可分辨红色墙 → 撞到 gameover
5. 连续快速撞墙 → 每次震动重置
6. 子弹撞 DEATH_WALL → 消失
7. 游戏整体流程不受影响（吃食物、打敌人、使用道具、房间过渡）
8. minimap 和 HUD 在震动发生时保持稳定

---

## 8. Implementation Order

| Step | Task | Files | Est. Effort | Depends On |
|------|------|-------|-------------|------------|
| 1 | T1: DEATH_WALL 常量 + 渲染 | constants.js, room.js | 15min | — |
| 2 | T2: 碰撞检测修改 | collision.js | 15min | T1 |
| 3 | T3: tick 碰撞处理改造 | core.js | 30min | T2 |
| 4 | T4: 屏幕震动渲染 | renderer.js | 15min | T3 |
| 5 | T5: 生成器 DEATH_WALL 放置 | generator.js | 30min | T1 |
| 6 | T6: 测试更新 | metroidvania-snake.test.js | 30min | T1-T5 |
| 7 | T7: 文档更新 | DESIGN | 10min | T1-T6 |

**Total Estimated Effort:** ~2 小时（含测试和边界情况验证）

---

## 9. PR Checklist

Before marking the implement PR as ready:

- [ ] `npm test` 全部通过
- [ ] 手动测试 8 个 QA 场景全部通过
- [ ] 所有新 CELL 类型在 constants.js 中定义
- [ ] 所有碰撞路径在 core.js 中有处理
- [ ] screenShake 在 tick 中正确衰减
- [ ] 生成器不把 DEATH_WALL 放在门通道和玩家出生点
- [ ] 边界墙碰撞扣长度而非 gameover
- [ ] 旧测试更新为 `'damage'` 预期
