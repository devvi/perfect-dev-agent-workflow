# Design: #21 — 子弹攻击敌人不减长度 — Line-Sweep 连续碰撞检测

> Parent Issue: #21
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

### Approach: Line-Sweep Continuous Collision Detection

**Chosen over alternatives because:**
- **根本性解决离散跳跃问题**，支持任意 `projectileSpeed`
- **身体段碰撞同步修复**
- **裂缝墙**命中同样受益
- **CPU 代价极小**（每 tick < 0.3ms，远低于 16ms 帧预算）
- **未来扩展不受限**（power-up 加速、穿甲弹等）

### Architecture Change

```
[tick() 当前流程]
  updateProjectiles(跳跃2格) → handleProjectileCollisions(仅检查终点)
  → 50%+ 概率 miss

[tick() 修复后流程]
  updateProjectiles(跳跃,保存prevX/prevY)
  → handleProjectileCollisions(对每个子弹做 line sweep)
    → getCellsAlongLine(prev → current) 逐格检查
    → checkProjectileCollisionForCell(含 body segments)
    → 100% 命中路径上的敌人/墙
```

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Line sweep 实现位置 | `handleProjectileCollisions` in `core.js` | 不侵入更新逻辑，只改进碰撞检测 |
| 旧位置存储 | `updateProjectiles` 返回加 `prevX`/`prevY` | 最低侵入：只改一处函数，不重新设计数据流 |
| 逐格检测函数 | 新增 `lineSweepProjectileCollision` in `collision.js` | 独立可测试，不改动现有 `checkProjectileCollision` 签名（向后兼容） |
| 身体段检测 | 新增 `checkProjectileCollisionForCell` in `collision.js` | 可被 line sweep 和原入口分别调用 |
| 辅助函数 | `getCellsAlongLine` in `collision.js` | 简单逐格步进（非 Bresenham），子弹直线飞行不斜向 |

---

## 2. Detailed Design

### 2.1 File 1: `public/src/engine/combat.js` — `updateProjectiles`

**Change:** 在返回的 projectile 对象中增加 `prevX`/`prevY` 字段。

```js
// BEFORE:
active.push({
  ...proj,
  x: proj.x + proj.dir.x * proj.speed,
  y: proj.y + proj.dir.y * proj.speed,
  remainingRange: remaining,
});

// AFTER:
active.push({
  ...proj,
  prevX: proj.x,           // ← 新增：保存移动前的位置
  prevY: proj.y,
  x: proj.x + proj.dir.x * proj.speed,
  y: proj.y + proj.dir.y * proj.speed,
  remainingRange: remaining,
});
```

**Impact:** Each projectile object +2 integer properties. Old projectiles (without `prevX`/`prevY`) will gracefully fall back to single-point detection.

### 2.2 File 2: `public/src/engine/collision.js` — 新增函数

#### 2a: `getCellsAlongLine(ax, ay, bx, by)`

生成从 `(ax, ay)` 到 `(bx, by)` 路径上所有单元格的坐标数组。

```js
export function getCellsAlongLine(ax, ay, bx, by) {
  const cells = [];
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  let cx = ax, cy = ay;

  while (true) {
    cells.push({ x: cx, y: cy });
    if (cx === bx && cy === by) break;
    cx += dx;
    cy += dy;
  }

  return cells;
}
```

**限制:** 子弹只沿 X 轴或 Y 轴单向移动；性能：`speed=2` 时最多返回 3 格。

#### 2b: `checkProjectileCollisionForCell(state, cellX, cellY, proj)`

检查指定格子上的碰撞（敌人含身体段、墙体）。

```js
export function checkProjectileCollisionForCell(state, cellX, cellY, proj) {
  const world = state?.world;
  if (!world) return null;

  // Check world bounds
  const maxX = world.cols * ROOM_SIZE;
  const maxY = world.rows * ROOM_SIZE;
  if (cellX < 0 || cellX >= maxX || cellY < 0 || cellY >= maxY) {
    return { collisionType: 'wall', target: null };
  }

  // Check cell type
  const cellType = getCellAt(world, cellX, cellY);
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
    return { collisionType: 'wall', target: null };
  }
  if (cellType === CELL.CRACKED_WALL) {
    return { collisionType: 'cracked_wall', target: null, cellX, cellY };
  }

  // Check enemies (including body segments)
  const { rx, ry } = worldToRoomCoords(cellX, cellY);
  const room = getRoomAt(world, rx, ry);
  if (room) {
    const enemy = room.entities.enemies.find(e =>
      e.x === cellX && e.y === cellY ||
      e.segments.some(s => s.x === cellX && s.y === cellY)
    );
    if (enemy) {
      return { collisionType: 'enemy', target: enemy, projId: proj.id };
    }
  }

  return null;
}
```

**关键变化：** 敌人检测改为 `e.x === cellX && e.y === cellY || segments.some(...)`。

#### 2c: `lineSweepProjectileCollision(proj, state)`

整合 line sweep 碰撞检测。

```js
export function lineSweepProjectileCollision(proj, state) {
  if (proj.prevX === undefined || proj.prevY === undefined) {
    return checkProjectileCollision(proj, state);
  }

  const cells = getCellsAlongLine(proj.prevX, proj.prevY, proj.x, proj.y);
  for (const cell of cells) {
    const result = checkProjectileCollisionForCell(state, cell.x, cell.y, proj);
    if (result) return result;
  }

  return null;
}
```

#### 2d: 保留原有 `checkProjectileCollision`（向后兼容）

原有函数保留不变，作为回退路径和直接坐标测试入口。

### 2.3 File 3: `public/src/engine/core.js` — `handleProjectileCollisions`

**Change:** 调用 `lineSweepProjectileCollision` 代替 `checkProjectileCollision`。

```js
function handleProjectileCollisions(state) {
  let s = { ...state };
  const projectilesToRemove = [];

  for (const proj of s.projectiles) {
    const result = lineSweepProjectileCollision(proj, s);
    // ... rest unchanged
  }
}
```

同时更新 import: `import { lineSweepProjectileCollision } from './collision.js';`

### 2.4 File 4: `public/src/engine/entities.js` — `createProjectile`（可选）

```js
export function createProjectile(id, x, y, dir, speed, remainingRange, power) {
  return {
    id, x, y,
    prevX: x,    // ← 新增
    prevY: y,
    dir, speed, remainingRange, power,
  };
}
```

### 2.5 Dependencies Between Tasks

```
T1 (combat.js: updateProjectiles add prevX/prevY)
  │
  ├──→ T2 (collision.js: getCellsAlongLine, checkProjectileCollisionForCell)
  │        │
  │        └──→ T3 (collision.js: lineSweepProjectileCollision)
  │                   │
  │                   └──→ T4 (core.js: handleProjectileCollisions → use lineSweep)
  │                              │
  │                              └──→ T5 (verify cracked wall)
  │
  └──→ T6 (tests)
```

### 2.6 Edge Cases and Risks

| # | Scenario | Expected Behavior | Risk |
|---|----------|-------------------|------|
| 1 | 子弹路径上同时有裂缝墙和敌人 | 先遇墙 → 击碎墙 → 子弹消失 | Low |
| 2 | 子弹路径上同时有 2 个敌人 | 先遇 A → 伤害 A → 子弹消失 | Low |
| 3 | speed=0（静止子弹）| 不会产生 line sweep | Low |
| 4 | 子弹被裂缝墙阻挡，墙后还有敌人 | 墙碎 → 子弹消失 → 敌人不受影响 | Low |
| 5 | 子弹初始位置就有敌人 | prevX==x → getCellsAlongLine 返回单格 | Low |
| 6 | 大量子弹（max=10）+ speed=5 | line sweep 每 tick 检查 50-60 格 | Low < 0.5ms |

### 2.7 Implementation Order

- Phase A: Data Preparation (T1) — entities.js + combat.js, 3 lines
- Phase B: Collision Functions (T2+T3) — collision.js, ~50 lines new code
- Phase C: Integration (T4) — core.js, 2 lines
- Phase D: Verification (T5+T6) — tests

---

## 3. Files Changed

| File | Change Type | Lines Changed |
|------|-------------|--------------|
| `public/src/engine/combat.js` | Modify `updateProjectiles` | +2 |
| `public/src/engine/entities.js` | Modify `createProjectile` (optional) | +2 |
| `public/src/engine/collision.js` | Add 3 new functions | ~50 |
| `public/src/engine/core.js` | Modify `handleProjectileCollisions` + import | +2 |
| `tests/metroidvania-snake.test.js` | Add new describe block | ~120 |

---

## 4. Verification Checklist

- [ ] `prevX`/`prevY` saved on `updateProjectiles` — data propagation
- [ ] `getCellsAlongLine` generates correct cells — horizontal path
- [ ] `getCellsAlongLine` handles negative direction — reverse path
- [ ] `getCellsAlongLine` handles vertical movement — vertical path
- [ ] `getCellsAlongLine` handles no movement — zero-length path
- [ ] Line sweep detects enemy at intermediate cell (speed=2) — CORE TEST
- [ ] Line sweep detects body segment collision — body segment fix
- [ ] Line sweep prioritizes first collision (wall before enemy) — priority
- [ ] Handles missing `prevX`/`prevY` with graceful fallback — backward compat
- [ ] Full integration: bullet hits enemy and hp decreases — end-to-end
- [ ] Enemy dies when hp reaches 0 — death verification
- [ ] All existing tests still pass
- [ ] Manual play test: bullets consistently damage enemies and break cracked walls
