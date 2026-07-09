# Design: #22 — 关卡障碍死亡惩罚迭代 (Obstacle Death Penalty)

> Parent Issue: #22
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

### Goal
分三种碰撞惩罚级别：
1. **边界墙 & 普通障碍 (WALL, STONE_WALL)** — 扣 1 格蛇身 + 屏幕震动，不即死
2. **即死障碍 (DEATH_WALL 新类型)** — 立即 gameover
3. **长度归零** — 兜底 gameover 检查

同时对玩家碰撞反馈增加屏幕震动 (screen shake) 效果。

### Architecture Strategy
保持 Issue #15 的模块化架构，做最小增量改动。所有变更集中在 6 个核心文件，不改变数据流架构。

### Behavioral Change
```
[Before]
checkSnakeCollision → ['wall'] → gameover (immediate)
                    → ['enemy'] → length-1
                    → ['self']  → gameover

[After]
checkSnakeCollision → ['damage'] → length-1 + screenShake
                    → ['death']  → gameover (immediate)
                    → ['enemy']  → length-1
                    → ['self']   → gameover
                    → length===0 → gameover (兜底, tick 末尾)
```

---

## 2. Detailed Design

### 2.1 Phase 1: 核心碰撞逻辑改造 (T2, T3)

先改 collision.js + core.js，使所有碰撞变成扣长度而非即死。Phase 1 完成时：
- 所有 WALL/STONE_WALL/边界墙 → damage（扣长度 + 震动）
- `'death'` 碰撞路径已存在但尚未出现（无 DEATH_WALL）
- 屏幕震动状态已定义和衰减

### 2.2 Phase 2: 即死墙完整实现 (T1, T4, T5, T6, T7)

加常量、渲染、震动渲染、生成器放置、测试、文档。Phase 2 完成时：
- DEATH_WALL 在游戏中有视觉显示
- 生成器在特定房间放置 DEATH_WALL
- screenShake 在渲染层生效
- 测试覆盖所有路径

### 2.3 File-by-File Changes

#### T1 — `public/src/engine/constants.js` — 新增 CELL.DeathWall 常量

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

#### T1 — `public/src/render/room.js` — DEATH_WALL 渲染

在 tile 渲染 switch 中增加 `CELL.DEATH_WALL` 分支，渲染为红色/熔岩风格：

```js
case CELL.DEATH_WALL:
  ctx.fillStyle = '#cc3300';
  ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
  ctx.strokeStyle = '#ff6600';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px + CELL_SIZE/2, py + CELL_SIZE/2, 6, 0, Math.PI * 2);
  ctx.stroke();
  break;
```

#### T2 — `public/src/engine/collision.js` — 修改碰撞检测

```js
// 修改: 边界墙
if (head.x < 0 || head.y < 0) return ['damage'];       // was 'wall'
if (world && (head.x >= maxX || head.y >= maxY)) return ['damage']; // was 'wall'

// 修改: 室内墙
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  return ['damage'];  // was 'wall'
}

// 新增: 即死墙
if (cellType === CELL.DEATH_WALL) {
  return ['death'];
}
```

#### T3 — `public/src/engine/core.js` — 修改碰撞处理

1. **`createInitialState()`**: 新增 `screenShake: null` 字段
2. **`tick()` 碰撞分支改造**:
   - 移除: `collisions.includes('wall')` → gameover
   - 新增: `collisions.includes('damage')` → `s.snake = s.snake.slice(0, -1); s.screenShake = {...}`
   - 新增: `collisions.includes('death')` → `s.gameState = 'gameover'; return s`
3. **screenShake 衰减**（tick 末尾）:
```js
if (s.screenShake) {
  s.screenShake = {
    ...s.screenShake,
    duration: s.screenShake.duration - 1,
    intensity: s.screenShake.intensity * 0.7,
  };
  if (s.screenShake.duration <= 0) { s.screenShake = null; }
}
```
4. **蛇头位置**: damage 分支中蛇头不移动（stay in place）

#### T4 — `public/src/render/renderer.js` — 屏幕震动渲染

```js
export function render(ctx, state) {
  const { world } = state;
  if (!world) return;
  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

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

  renderHUD(ctx, state);
  renderMinimap(ctx, state, world);
  renderOverlay(ctx, state);
  renderScanlines(ctx);
}
```

#### T5 — `public/src/engine/generator.js` — DEATH_WALL 放置

规则:
- 仅 NORMAL 房间: 30% 概率含 DEATH_WALL
- GACHA 房间: 15% 概率
- KEY_SHRINE 房间: 20% 概率
- START/SAVE/GOAL 房间: 不放
- 每个房间最多 2 个 DEATH_WALL 簇（1-2 blocks/簇）
- 不阻塞门区域（3 格安全区）
- 总出现率不超过房间数的 20%

### 2.4 Screen Shake Parameters

| 参数 | 值 | 说明 |
|------|-----|------|
| 初始强度 | ±3px | 可感受但不晕眩 |
| 持续时间 | 6 ticks (~300ms) | 短暂冲击 |
| 衰减因子 | 0.7/tick | 指数衰减 |
| 采样频率 | 每 tick | 抖动不重复 |
| 清除阈值 | intensity < 0.3 | 低于此值视觉不可见 |

### 2.5 Edge Cases & Risk Analysis

| # | Case | Expected Behavior | Risk |
|---|------|-------------------|------|
| EC1 | 蛇长度=1 撞普通墙 | length→0 → 兜底 gameover | Medium |
| EC2 | 连续快速撞墙 | 每次重置震动，不叠加；每次扣 1 格 | Low |
| EC3 | 撞墙同时吃到食物 | 先扣长度再吃食物 | Medium |
| EC4 | DEATH_WALL 在门旁 | 安全通道保留 | Low |
| EC5 | 震动使画面裁剪 | ctx.translate 偏移小，扩大填充即可 | Low |
| EC6 | 蛇头嵌墙不停扣血 | damage 分支不移动蛇头，stay in place | Medium |

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 现有测试因 'wall' 变 'damage' 失败 | High | Medium | 更新所有测试预期值 |
| 震动使 HUD 偏移 | Low | Medium | ctx.save/restore 隔离 room 渲染 |
| 生成器放 DEATH_WALL 堵死路径 | Medium | Medium | 安全区检查 + 门通道保留 |

### 2.6 Dependencies Graph

```
T1 (constants.js) ──→ T2 (collision.js) ──→ T3 (core.js) ──→ T4 (renderer.js)
  │                                                        │
  ├──→ T1b (room.js)                                       └── (no dep)
  └──→ T5 (generator.js)
                                                       
T6 (tests) ←── 依赖 T1-T5 全部完成
T7 (docs)   ←── 依赖 T1-T6 全部完成
```

### 2.7 Implementation Order & Effort

| Step | Task | Files | Est. Effort |
|------|------|-------|-------------|
| 1 | DEATH_WALL 常量 | constants.js | 5min |
| 2 | DEATH_WALL 渲染 | room.js | 10min |
| 3 | 碰撞检测修改 | collision.js | 15min |
| 4 | tick 碰撞处理改造 | core.js | 30min |
| 5 | 屏幕震动渲染 | renderer.js | 15min |
| 6 | 生成器 DEATH_WALL 放置 | generator.js | 25min |
| 7 | 测试更新 | metroidvania-snake.test.js | 25min |
| 8 | 文档更新 | DESIGN doc | 10min |

**Total Estimated Effort:** ~2 小时

---

## 3. Files Changed

| File | Change Description | Est. Lines |
|------|--------------------|------------|
| `public/src/engine/constants.js` | Add `CELL.DEATH_WALL = 5` | +1 |
| `public/src/engine/collision.js` | Modify return values: WALL → `'damage'`, DEATH_WALL → `'death'` | ~5 |
| `public/src/engine/core.js` | Replace `'wall'` branch with `'damage'`; add `'death'` branch; screenShake state | ~30 |
| `public/src/render/renderer.js` | Screen shake ctx.translate + ctx.save/restore | ~15 |
| `public/src/render/room.js` | DEATH_WALL visual (red/lava render) | ~20 |
| `public/src/engine/generator.js` | DEATH_WALL placement rules | ~25 |
| `tests/metroidvania-snake.test.js` | Update tests: 'wall' → 'damage'; add DEATH_WALL tests | ~80 |

---

## 4. Verification Checklist

- [ ] `checkSnakeCollision`: WALL → `['damage']`
- [ ] `checkSnakeCollision`: STONE_WALL → `['damage']`
- [ ] `checkSnakeCollision`: DEATH_WALL → `['death']`
- [ ] `checkSnakeCollision`: 边界墙 → `['damage']`
- [ ] `tick()`: 撞墙 → length-1, screenShake, 非 gameover
- [ ] `tick()`: 撞即死墙 → gameover
- [ ] `tick()`: 长度 0 → gameover 兜底
- [ ] `tick()`: screenShake 衰减
- [ ] 撞边界墙 → 扣 1 格 + 震动（手动验证）
- [ ] 撞室内 WALL → 扣 1 格 + 震动（手动验证）
- [ ] 长度=1 撞墙 → gameover（手动验证）
- [ ] 含 DEATH_WALL 房间显示红色墙（手动验证）
- [ ] 撞 DEATH_WALL → gameover（手动验证）
- [ ] 子弹撞 DEATH_WALL → 消失（手动验证）
- [ ] HUD/minimap 不受震动影响（手动验证）
- [ ] `npm test` 全部通过
