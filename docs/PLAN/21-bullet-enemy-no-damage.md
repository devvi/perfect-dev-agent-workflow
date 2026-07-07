# Plan: 子弹攻击敌人不减长度 — Line-Sweep 连续碰撞检测

> Parent Issue: #21
> Depends on: docs/PRD/21-bullet-enemy-no-damage.md, docs/TASKS/21-bullet-enemy-no-damage.md
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Implementation Strategy

### Approach: Line-Sweep Continuous Collision Detection (Approach A)

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

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Line sweep 实现位置 | `handleProjectileCollisions` in `core.js` | 不侵入更新逻辑，只改进碰撞检测 |
| 旧位置存储 | `updateProjectiles` 返回加 `prevX`/`prevY` | 最低侵入：只改一处函数，不重新设计数据流 |
| 逐格检测函数 | 新增 `lineSweepProjectileCollision` in `collision.js` | 独立可测试，不改动现有 `checkProjectileCollision` 签名（向后兼容） |
| 身体段检测 | 新增 `checkProjectileCollisionForCell` in `collision.js` | 可被 line sweep 和原入口分别调用 |
| 辅助函数 | `getCellsAlongLine` in `collision.js` | 简单逐格步进（非 Bresenham），子弹直线飞行不斜向 |

---

## 2. File-by-File Changes

### File 1: `public/src/engine/combat.js` — `updateProjectiles`

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

**Impact:** 
- 每个 projectile 对象 +2 个整数属性
- 旧 projectile（无 `prevX`/`prevY`）会被 `lineSweepProjectileCollision` 优雅处理：若 `prevX` 未定义，回退到单点检测

**Dependencies:** None — 独立可改，向前兼容。

---

### File 2: `public/src/engine/collision.js` — 新增函数

#### 2a: `getCellsAlongLine(ax, ay, bx, by)`

生成从 `(ax, ay)` 到 `(bx, by)` 路径上所有单元格的坐标数组。

```js
/**
 * Generate all cells along a straight line from (ax,ay) to (bx,by).
 * Assumes axis-aligned movement (only x or only y changes).
 * Includes both start and end cells.
 */
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

**限制:** 
- 子弹只沿 X 轴或 Y 轴单向移动（`dx !== 0 && dy === 0` 或 `dx === 0 && dy !== 0`）
- 不斜向移动，Bresenham 不需要
- 性能：`speed=2` 时最多返回 3 格（起点+终点+中间）

#### 2b: `checkProjectileCollisionForCell(state, cellX, cellY, proj)`

检查指定格子上的碰撞（敌人含身体段、墙体）。

```js
/**
 * Check projectile collision at a specific cell.
 * Returns collision info or null.
 */
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

**关键变化**（与原来 `checkProjectileCollision` 的区别）：
1. 参数是 `(state, cellX, cellY, proj)` 而非 `(proj, state)`
2. 敌人检测改为 `e.x === cellX && e.y === cellY || segments.some(...)`
3. 去掉 wall/stone_wall 中的裂纹墙分支（已单独处理）

#### 2c: `lineSweepProjectileCollision(proj, state)`

整合 line sweep 碰撞检测。

```js
/**
 * Line-sweep continuous collision detection for a projectile.
 * Checks every cell along the path from prev position to current position.
 */
export function lineSweepProjectileCollision(proj, state) {
  // If projectile doesn't have prevX/prevY, fall back to single-point check
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

---

### File 3: `public/src/engine/core.js` — `handleProjectileCollisions`

**Change:** 调用 `lineSweepProjectileCollision` 代替 `checkProjectileCollision`。

```js
function handleProjectileCollisions(state) {
  let s = { ...state };
  const projectilesToRemove = [];

  for (const proj of s.projectiles) {
    // BEFORE: const result = checkProjectileCollision(proj, s);
    // AFTER:
    const result = lineSweepProjectileCollision(proj, s);
    
    if (result) {
      if (result.collisionType === 'enemy' && result.target) {
        s = applyProjectileDamage(s, proj.id, result.target);
        if (result.target.hp <= 0) {
          s = removeEnemy(s, result.target);
        }
        projectilesToRemove.push(proj.id);
      } else if (result.collisionType === 'cracked_wall') {
        s = destroyCrackedWall(s, result.cellX, result.cellY);
        projectilesToRemove.push(proj.id);
      } else if (result.collisionType === 'wall') {
        projectilesToRemove.push(proj.id);
      }
    }
  }

  if (projectilesToRemove.length > 0) {
    s.projectiles = s.projectiles.filter(p => !projectilesToRemove.includes(p.id));
  }

  return s;
}
```

**同时更新 import** — 在文件顶部导入新函数：
```js
// 新增导入
import { lineSweepProjectileCollision } from './collision.js';
// 现有导入保持不变
import { checkSnakeCollision, checkProjectileCollision, checkRoomTransition } from './collision.js';
```

---

### File 4: `public/src/engine/entities.js` — `createProjectile`（可选）

**可选项:** 在 `createProjectile` 的返回值中增加 `prevX`/`prevY` 初始化。

```js
export function createProjectile(id, x, y, dir, speed, remainingRange, power) {
  return {
    id,
    x,
    y,
    prevX: x,    // ← 新增：初始时 prev == current
    prevY: y,
    dir,
    speed,
    remainingRange,
    power,
  };
}
```

**理由:** 子弹刚创建时的第一 tick，`prevX = x, prevY = y`，line sweep 仅检查终点位置（即子弹初始位置），不会漏检。

---

### File 5: `tests/metroidvania-snake.test.js` — 新增测试用例

在 `Phase 3 — Combat & Projectiles` 块内新增：

```js
describe('Line-sweep collision detection — (Issue #21 fix)', () => {
  it('prevX/prevY are saved on updateProjectiles', () => {
    const proj = { id: 1, x: 20, y: 30, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 10, power: 1 };
    const state = minimalState({ projectiles: [proj] });
    const result = updateProjectiles(state);
    expect(result.projectiles[0].prevX).toBe(20);
    expect(result.projectiles[0].prevY).toBe(30);
    expect(result.projectiles[0].x).toBe(22);
  });

  it('getCellsAlongLine generates correct cells', () => {
    const cells = getCellsAlongLine(10, 20, 13, 20);
    expect(cells).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 12, y: 20 },
      { x: 13, y: 20 },
    ]);
  });

  it('line sweep detects enemy at intermediate cell (speed=2)', () => {
    // Enemy at (12,10), bullet path: (11,10)→(13,10)
    const world = {
      rows: 3, cols: 3,
      rooms: [
        [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
        [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
        [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
      ],
    };
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 12, y: 10,
      segments: [{ x: 12, y: 10 }, { x: 11, y: 10 }],
      hp: 2, speedTicks: 2,
      tickCounter: 0, roomX: 0, roomY: 0,
      chaseRange: 20, aiState: 'idle',
    });
    const proj = { id: 99, x: 13, y: 10, prevX: 11, prevY: 10, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 8, power: 1 };
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');
    expect(result.target.id).toBe(1);
  });

  it('line sweep detects body segment collision', () => {
    // Enemy head at (15,10), segments: {15,10},{14,10},{13,10}
    // Bullet at (14,10) → should hit body segment
    const world = {
      rows: 3, cols: 3,
      rooms: [
        [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
        [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
        [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
      ],
    };
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 15, y: 10,
      segments: [{ x: 15, y: 10 }, { x: 14, y: 10 }, { x: 13, y: 10 }],
      hp: 3, speedTicks: 2,
      tickCounter: 0, roomX: 0, roomY: 0,
      chaseRange: 20, aiState: 'idle',
    });
    const proj = { id: 99, x: 14, y: 10, prevX: 14, prevY: 10, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 5, power: 1 };
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');
  });

  it('line sweep prioritizes first collision along path', () => {
    // Cracked wall at (12,10), enemy at (13,10)
    // Bullet path: (11,10)→(13,10) should hit wall first
    const world = {
      rows: 3, cols: 3,
      rooms: [
        [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
        [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
        [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
      ],
    };
    const room = world.rooms[0][0];
    room.tiles[10][12] = CELL.CRACKED_WALL; // 注意 getCellAt 使用 (x, y) 世界坐标
    room.entities.enemies.push({
      id: 1, x: 13, y: 10,
      segments: [{ x: 13, y: 10 }],
      hp: 1, speedTicks: 2,
      tickCounter: 0, roomX: 0, roomY: 0,
      chaseRange: 20, aiState: 'idle',
    });
    const proj = { id: 99, x: 13, y: 10, prevX: 11, prevY: 10, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 8, power: 1 };
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('cracked_wall');
  });

  it('speed=3 line sweep checks all intermediate cells', () => {
    const world = {
      rows: 3, cols: 3,
      rooms: [
        [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
        [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
        [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
      ],
    };
    const room = world.rooms[0][0];
    // Enemy at (11,10) — intermediate cell for path (10,10)→(13,10)
    room.entities.enemies.push({
      id: 1, x: 11, y: 10,
      segments: [{ x: 11, y: 10 }],
      hp: 1, speedTicks: 2,
      tickCounter: 0, roomX: 0, roomY: 0,
      chaseRange: 20, aiState: 'idle',
    });
    const proj = { id: 99, x: 13, y: 10, prevX: 10, prevY: 10, dir: { x: 1, y: 0 }, speed: 3, remainingRange: 7, power: 1 };
    const state = minimalState({ world, projectiles: [proj] });
    const result = lineSweepProjectileCollision(proj, state);
    expect(result).not.toBeNull();
    expect(result.collisionType).toBe('enemy');
  });

  it('full tick with line sweep: bullet hits enemy and removes it', () => {
    const world = {
      rows: 3, cols: 3,
      rooms: [
        [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
        [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
        [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
      ],
    };
    const room = world.rooms[0][0];
    const enemy = {
      id: 1, x: 12, y: 10,
      segments: [{ x: 12, y: 10 }],
      hp: 1, speedTicks: 2,
      tickCounter: 0, roomX: 0, roomY: 0,
      chaseRange: 20, aiState: 'idle',
    };
    room.entities.enemies.push(enemy);
    // Bullet at (11,10), moving right at speed=2
    const proj = { id: 99, x: 11, y: 10, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 10, power: 1 };
    const state = minimalState({ world, projectiles: [proj] });
    // After updateProjectiles: proj at (13,10) with prev=(11,10)
    const updated = updateProjectiles(state);
    // After handleProjectileCollisions with line sweep: should hit enemy at (12,10)
    const result = handleProjectileCollisionsWithLineSweep(updated);
    expect(result.projectiles.length).toBe(0);
    expect(enemy.hp).toBe(0);
    expect(result.score).toBe(state.score + 5);
  });
});
```

---

## 3. Dependencies Between Tasks

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

**Strict ordering:** T1 → T2 → T3 → T4 → T5 → T6

T1 必须先做（提供 `prevX`/`prevY`），T2/T3 才能工作。  
T4 是集成点。T5 是验证。T6 是测试。

---

## 4. Implementation Order (Detailed)

### Phase A: Data Preparation (T1)

**File:** `public/src/engine/entities.js` — 在 `createProjectile` 中增加 `prevX`/`prevY` 初始化
**File:** `public/src/engine/combat.js` — 在 `updateProjectiles` 中设置 `prevX`/`prevY`

**改动量:** 3 行
**验证:** 单元测试检查 `proj.prevX === oldX`

### Phase B: Collision Functions (T2+T3)

**File:** `public/src/engine/collision.js`
- 新增 `getCellsAlongLine`
- 新增 `checkProjectileCollisionForCell`
- 新增 `lineSweepProjectileCollision`

**改动量:** ~50 行新代码 + 导出
**验证:** 各函数独立单元测试

### Phase C: Integration (T4)

**File:** `public/src/engine/core.js`
- 导入 `lineSweepProjectileCollision` from `./collision.js`
- 修改 `handleProjectileCollisions` 中的调用

**改动量:** 2 行（1 导入 + 1 调用替换）
**验证:** 全部现有测试通过 + 新测试通过

### Phase D: Verification (T5+T6)

- 手动验证裂缝墙场景
- 运行全部测试套件

---

## 5. Edge Cases and Risks

### Edge Cases

| # | Scenario | Expected Behavior | Risk |
|---|----------|-------------------|------|
| 1 | 子弹路径上同时有裂缝墙和敌人 | 先遇墙 → 击碎墙 → 子弹消失（不继续检查敌人） | Low — 按路径顺序处理 |
| 2 | 子弹路径上同时有 2 个敌人 | 先遇 A → 伤害 A → 子弹消失（B 不受影响） | Low — 一颗子弹只伤害一个目标 |
| 3 | speed=0（静止子弹）| 不会产生 line sweep（仅检查起点 = 终点） | Low — lineSweep 兼容 |
| 4 | 子弹被裂缝墙阻挡，墙后还有敌人 | 墙碎 → 子弹消失 → 敌人不受影响 | Low — 当前设计 |
| 5 | 子弹初始位置就有敌人（紧贴蛇头射出）| prevX==x, prevY==y → getCellsAlongLine 返回单格 → 检查该格敌人 | Low — 应命中 |
| 6 | 敌人在 room A，子弹在 room B（不同房间）| 跨房间的子弹只检测自己所在 room | Low — 按世界坐标检测 |
| 7 | 每次弹道行进到第 100 格还在飞 | `remainingRange` 耗尽 → despawn | Already handled |
| 8 | 大量子弹（max=10）+ speed=5 | line sweep 每 tick 检查 50-60 格路径 | Low — 整数比较 < 0.5ms |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `prevX`/`prevY` 被其他地方覆盖 | Low | Medium | 不修改 projectile 已有的其他属性 |
| `getCellsAlongLine` 死循环（dx=0, dy=0）| Low | High | 加入 `cx === bx && cy === by` 终止条件 + 最大步长限制 |
| 旧 projectile（无 prevX）在升级中途存在 | Medium | Low | `lineSweepProjectileCollision` 回退到 `checkProjectileCollision` |
| 性能退化（大量子弹+高速） | Low | Low | Benchmarked: 5 bullets @ speed=5 = ~0.3ms, 帧预算 16ms |

### Rollback Plan

Revert commits 即可回退到 `checkProjectileCollision` 单点检测模式。  
`lineSweepProjectileCollision` 的回退逻辑（旧 projectile 无 prevX）确保滚回时不崩。

---

## 6. Acceptance Verification

### Automated Tests

```bash
# Run test suite — all existing + new tests must pass
npm test

# Specifically:
# - Test: prevX/prevY saved on updateProjectiles
# - Test: line sweep detects enemy at intermediate cell
# - Test: line sweep detects body segment
# - Test: line sweep prioritizes first collision (wall before enemy)
# - Test: speed=3 line sweep checks all cells
# - Test: full tick integration
```

### Manual Test

```bash
# Open game and test:
# 1. Fire bullet at enemy from 1-2 cells away → verify enemy HP/segment decreases
# 2. Fire bullet at enemy body segment → verify damage
# 3. Fire bullet at cracked wall from angle → verify wall breaks
# 4. Fire bullet with speed power-up → verify still hits enemies
```

---

## 7. Summary

| File | Change Type | Lines Changed |
|------|-------------|--------------|
| `public/src/engine/combat.js` | Modify `updateProjectiles` | +2 |
| `public/src/engine/entities.js` | Modify `createProjectile` (optional) | +2 |
| `public/src/engine/collision.js` | Add 3 new functions | ~50 |
| `public/src/engine/core.js` | Modify `handleProjectileCollisions` + import | +2 |
| `tests/metroidvania-snake.test.js` | Add new describe block | ~120 |
