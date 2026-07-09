# Tasks: #21 — 子弹攻击敌人不减长度

| 字段 | 值 |
|------|----|
| Issue | #21 |
| 优先级 | P0 |

## Overview

修复 #21 子弹跳跃穿过敌人/裂缝墙的问题，实现子弹路径逐格碰撞检测（line-sweep continuous collision detection），同时检测敌人身体段。Root Cause: `updateProjectiles` 按 `speed` 格（默认 2）离散跳跃子弹位置，`checkProjectileCollision` 仅检查终点位置，导致中间格的敌人/墙被跳过。同时仅检测敌人头部，未检测身体段。推荐方案: Approach A — Line-Sweep Continuous Collision Detection。Depends on: docs/PRD/21-bullet-enemy-no-damage.md.

## Phase 1: Add `prevX`/`prevY` to Projectile Data (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/combat.js` | `updateProjectiles` — 在返回的 projectile 对象中增加 `prevX`/`prevY` 字段，记录跳跃前的旧位置 | 无 | P0 |

### Step Detail

```js
// Before:
active.push({
  ...proj,
  x: newX,
  y: newY,
  remainingRange: remaining,
});

// After:
active.push({
  ...proj,
  prevX: proj.x,
  prevY: proj.y,
  x: newX,
  y: newY,
  remainingRange: remaining,
});
```

**Acceptance:** 每个 projectile 对象包含 `prevX` 和 `prevY`，值为移动前的位置。

## Phase 2: Add Line-Sweep Collision Function (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/src/engine/combat.js` | 新增 `lineSweepProjectileCollision(proj, state)` 函数，从起始点逐格步进到终点检查碰撞 | 1.1 | P0 |

### Step Detail

**逻辑：**
```
1. 读取 proj.prevX, prevY (起始点) 和 proj.x, proj.y (终点)
2. 确定主步进方向 (dx = sign(newX - prevX), dy = sign(newY - prevY))
3. 从起始点开始逐格步进到终点（含终点）
4. 对每格调用 checkProjectileCollision → 发现碰撞立即返回
5. 如果走到终点无碰撞 → 返回 null
```

**限制：** 子弹只沿 X 轴或 Y 轴单向移动（不斜向），步进算法极为简单。

```js
export function lineSweepProjectileCollision(proj, state) {
  const dx = Math.sign(proj.x - proj.prevX);
  const dy = Math.sign(proj.y - proj.prevY);
  let cx = proj.prevX, cy = proj.prevY;

  while (true) {
    // Check at current cell
    const result = checkProjectileCollisionForCell(
      state, cx, cy, proj
    );
    if (result) return result;

    if (cx === proj.x && cy === proj.y) break;
    cx += dx;
    cy += dy;
  }

  return null; // no collision along the entire path
}
```

## Phase 3: Extend `checkProjectileCollision` to Check Body Segments (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/engine/collision.js` | 新增 `checkProjectileCollisionForCell(state, cellX, cellY, proj)`，检查指定格子上的敌人（含身体段）和墙体 | 2.1 | P0 |

### Step Detail

**核心变化：**
```js
// Check enemies — now includes body segments
const enemy = room.entities.enemies.find(e =>
  e.x === cellX && e.y === cellY ||
  e.segments.some(s => s.x === cellX && s.y === cellY)
);
```

保持原有 `checkProjectileCollision(proj, state)` 的签名作为调用线，内部调用新的逐格函数。

**Acceptance:**
- 子弹落在敌人身体段上时 → 命中返回
- 子弹落在敌人头部时 → 命中返回
- 子弹落在裂缝墙上 → 命中返回
- 子弹落在普通墙上 → 命中返回

## Phase 4: Update `handleProjectileCollisions` in `core.js` (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `public/src/engine/core.js` | `handleProjectileCollisions` — 调用 `lineSweepProjectileCollision` 代替直接 `checkProjectileCollision` | 2.1, 3.1 | P0 |

### Step Detail

```js
// Before:
const result = checkProjectileCollision(proj, s);

// After:
const result = lineSweepProjectileCollision(proj, s);
```

**Acceptance:** 游戏循环中子弹路径上的敌人（含身体段）和墙体均可被检测命中。

## Phase 5: Verify Cracked Wall Collision (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 5.1 | `public/src/engine/combat.js` / `collision.js` | 确认裂缝墙检测也走 line sweep 路径，不会因跳跃而跳过 | 2.1 | P0 |

**验证方式：** 子弹路径穿越有裂缝墙的格子 → 击中 → 墙变为 `CELL.FLOOR`。

## Phase 6: Add Tests (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 6.1 | `tests/metroidvania-snake.test.js` | 子弹跳过格子命中敌人（line sweep）：子弹从 (11,10) 移动到 (13,10)，敌人在 (12,10) → 命中 | 2.1, 3.1 | P0 |
| 6.2 | `tests/metroidvania-snake.test.js` | 子弹命中敌人身体段：敌人在 (15,10)，段 [{15,10},{14,10},{13,10}]，子弹落在 (14,10) → 命中 | 3.1 | P0 |
| 6.3 | `tests/metroidvania-snake.test.js` | 子弹经过裂缝墙再碰到敌人：子弹路径上有裂缝墙 → 先击中墙（子弹消失），不继续检查敌人 | 2.1, 5.1 | P0 |
| 6.4 | `tests/metroidvania-snake.test.js` | 速度 3 时 line sweep 检查所有中间格：子弹从 (11,10) 到 (14,10) → 检查 (12,10)(13,10)(14,10) | 2.1 | P0 |
| 6.5 | `tests/metroidvania-snake.test.js` | 多颗子弹同 tick 各扫描路径：每个子弹独立 line sweep | 4.1 | P0 |

## Verification

| # | Verification | Method |
|---|-------------|--------|
| 1 | `updateProjectiles` 返回的 projectile 含 prevX/prevY | 单元测试 |
| 2 | line sweep 检测到中间格的敌人 | 单元测试（场景：speed=2, 敌人在中间格） |
| 3 | line sweep 检测到身体段 | 单元测试（子弹落在 segments 中间） |
| 4 | 裂缝墙检测通过 line sweep | 集成测试（子弹路径经过墙） |
| 5 | 原 106 测试全部通过 | `npx vitest run` |
| 6 | 手动验证：开游戏射击敌人 | 浏览器测试 |

## Dependency Graph

```
Phase 1 (prevX/prevY)
  │
  ▼
Phase 2 (lineSweepProjectileCollision)
  │
  ├──► Phase 3 (body segment check)
  │
  └──► Phase 5 (cracked wall verify)
          │
          ▼
      Phase 4 (core.js integration)
          │
          ▼
      Phase 6 (Tests)
  │
All done
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估时间 |
|------|----------|----------|
| `public/src/engine/combat.js` | 修改（+ prevX/prevY, + line sweep 函数） | 45 min |
| `public/src/engine/collision.js` | 修改（+ body segment check） | 15 min |
| `public/src/engine/core.js` | 修改（替换调用） | 10 min |
| `tests/metroidvania-snake.test.js` | 修改（+5 个测试用例） | 30 min |
