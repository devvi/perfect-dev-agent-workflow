# Plan: 撞到红色敌人不会掉血 — 敌人碰撞伤害修复

> Parent Issue: #20
> Depends on: docs/PRD/20-enemy-collision-damage.md
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Implementation Strategy

### Approach: Approach B — Collision Detection Extension + Timing Fix

**Chosen over alternatives because:**
- **Approach A** 只修了蛇主动撞敌（查 body segments），但没修敌人移过来撞蛇的时序问题
- **Approach C** 把伤害逻辑分散到 AI 模块，耦合增加
- **Approach B** 解决了两个根本原因：身体段未检测 + 敌人移动后未重检查

### Architecture Change

```
[tick() 当前流程]
  collisionCheck(仅检查敌人头部) → move snake
  → damage(if head hit) → updateEnemies(敌人才移动)
                                           ↑ damage 发生在敌人移动前，时序漏洞

[tick() 修复后流程]
  collisionCheck(检查敌人头部+body segments) → move snake
  → damage (蛇撞到任何敌人段)
  → updateEnemies(敌人移动)
  → post-move overlap check (敌人移到蛇位置 → 再触发伤害)
  → 帧内冷却标记，防止单帧多次扣血
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 碰撞检测修改 | 扩展 `checkSnakeCollision` + `checkEnemyOverlap` 检查 body segments | 最少改动，利用现有架构 |
| 时序修复 | 在 `updateEnemies` 后添加 `checkEnemyOverlap` 二次检查 | 不侵入 AI 模块，只在核心循环加一段逻辑 |
| 单帧多次扣血 | 引入 `enemyDamagedThisTick` 布尔标记 | 防御性编程，防止一帧扣多次 |
| 二次检查 body segments | `checkEnemyOverlap` 统一检查 segments | 与碰撞检测逻辑一致 |

---

## 2. File-by-File Changes

### File 1: `public/src/engine/collision.js` — `checkSnakeCollision`

**Change:** 修改敌人碰撞检测行，加入 body segments 检查。

```js
// BEFORE (line ~42-43):
const enemyIdx = room.entities.enemies.findIndex(e => e.x === head.x && e.y === head.y);
if (enemyIdx >= 0) results.push('enemy');

// AFTER:
const enemyIdx = room.entities.enemies.findIndex(e =>
  e.x === head.x && e.y === head.y ||
  (e.segments && e.segments.some(s => s.x === head.x && s.y === head.y))
);
if (enemyIdx >= 0) results.push('enemy');
```

**Impact:** 现有逻辑不变，增加 body segments 的匹配。`e.segments &&` 是防御性检查，防止旧数据无 segments。

---

### File 2: `public/src/engine/core.js` — `checkEnemyOverlap`

**Change:** 同样修改 `checkEnemyOverlap` 函数，加入 segments 检查。

```js
// BEFORE (line ~343-349):
function checkEnemyOverlap(state) {
  const head = state.snake[0];
  const { rx, ry } = worldToRoomCoords(head.x, head.y);
  const room = getRoomAt(state.world, rx, ry);
  if (!room) return false;

  return room.entities.enemies.some(e => e.x === head.x && e.y === head.y);
}

// AFTER:
function checkEnemyOverlap(state) {
  const head = state.snake[0];
  const { rx, ry } = worldToRoomCoords(head.x, head.y);
  const room = getRoomAt(state.world, rx, ry);
  if (!room) return false;

  return room.entities.enemies.some(e =>
    e.x === head.x && e.y === head.y ||
    (e.segments && e.segments.some(s => s.x === head.x && s.y === head.y))
  );
}
```

---

### File 3: `public/src/engine/core.js` — `tick()` 时序修复

**Change:** 在 `tick()` 开头重置 `enemyDamagedThisTick`，在现有伤害处理后设置该标记，在 `updateEnemies(s)` 后添加二次检查。

```js
// tick() 中，tickCount++ 后：
s.enemyDamagedThisTick = false;

// 现有敌人伤害处理处：
if (enemyDamage) {
  s.snake = s.snake.slice(0, -1);
  s.score = Math.max(0, s.score - 5);
  s.enemyDamagedThisTick = true; // ← 新增

  if (s.snake.length === 0) {
    s.gameState = 'gameover';
    return s;
  }
}

// updateEnemies 之后，新增：
if (s.world && !s.enemyDamagedThisTick) {
  const postMoveOverlap = checkEnemyOverlap(s);
  if (postMoveOverlap) {
    s.snake = s.snake.slice(0, -1);
    s.score = Math.max(0, s.score - 5);
    s.enemyDamagedThisTick = true;
    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
    }
  }
}
```

---

### File 4: `tests/metroidvania-snake.test.js` — 新增测试用例

```js
describe('Phase 3b — Enemy Collision Damage — (Issue #20)', () => {
  it('snake head colliding with enemy head reduces length by 1', () => {
    const snake = [
      { x: 25, y: 25 },
      { x: 24, y: 25 },
      { x: 23, y: 25 },
    ];
    const world = genTestWorld();
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 26, y: 25,
      segments: [{ x: 26, y: 25 }, { x: 25, y: 25 }],
      hp: 2, speedTicks: 2, tickCounter: 0,
      roomX: 0, roomY: 0, chaseRange: 20, aiState: 'idle',
    });
    const state = minimalState({
      world, snake: [...snake],
      currentRoom: { x: 0, y: 0 },
    });
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    const result = tick(state);
    expect(result.snake.length).toBe(snake.length - 1);
    expect(result.score).toBe(0);
  });

  it('snake head colliding with enemy body segment reduces length', () => {
    const snake = [
      { x: 28, y: 25 },
      { x: 27, y: 25 },
      { x: 26, y: 25 },
    ];
    const world = genTestWorld();
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 30, y: 25,
      segments: [{ x: 30, y: 25 }, { x: 29, y: 25 }, { x: 28, y: 25 }],
      hp: 3, speedTicks: 2, tickCounter: 0,
      roomX: 0, roomY: 0, chaseRange: 20, aiState: 'idle',
    });
    const state = minimalState({
      world, snake: [...snake],
      currentRoom: { x: 0, y: 0 },
    });
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    const result = tick(state);
    expect(result.snake.length).toBe(snake.length - 1);
  });

  it('score decreases by 5 on enemy collision', () => {
    const snake = [
      { x: 25, y: 25 },
      { x: 24, y: 25 },
      { x: 23, y: 25 },
    ];
    const world = genTestWorld();
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 26, y: 25,
      segments: [{ x: 26, y: 25 }, { x: 25, y: 25 }],
      hp: 2, speedTicks: 2, tickCounter: 0,
      roomX: 0, roomY: 0, chaseRange: 20, aiState: 'idle',
    });
    const state = minimalState({
      world, snake: [...snake],
      currentRoom: { x: 0, y: 0 }, score: 20,
    });
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    const result = tick(state);
    expect(result.score).toBe(15);
  });

  it('score does not go below 0 on enemy collision', () => {
    const snake = [
      { x: 25, y: 25 },
      { x: 24, y: 25 },
      { x: 23, y: 25 },
    ];
    const world = genTestWorld();
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 26, y: 25,
      segments: [{ x: 26, y: 25 }, { x: 25, y: 25 }],
      hp: 2, speedTicks: 2, tickCounter: 0,
      roomX: 0, roomY: 0, chaseRange: 20, aiState: 'idle',
    });
    const state = minimalState({
      world, snake: [...snake],
      currentRoom: { x: 0, y: 0 }, score: 3,
    });
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    const result = tick(state);
    expect(result.score).toBe(0);
  });

  it('game over when snake length becomes 0 after enemy collision', () => {
    const snake = [{ x: 25, y: 25 }];
    const world = genTestWorld();
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 26, y: 25,
      segments: [{ x: 26, y: 25 }],
      hp: 2, speedTicks: 2, tickCounter: 0,
      roomX: 0, roomY: 0, chaseRange: 20, aiState: 'idle',
    });
    const state = minimalState({
      world, snake: [...snake],
      currentRoom: { x: 0, y: 0 },
    });
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    const result = tick(state);
    expect(result.gameState).toBe('gameover');
  });

  it('only one damage per tick even with multiple enemies', () => {
    const snake = [
      { x: 25, y: 25 },
      { x: 24, y: 25 },
      { x: 23, y: 25 },
      { x: 22, y: 25 },
      { x: 21, y: 25 },
    ];
    const world = genTestWorld();
    const room = world.rooms[0][0];
    room.entities.enemies.push({
      id: 1, x: 26, y: 25,
      segments: [{ x: 26, y: 25 }, { x: 25, y: 25 }],
      hp: 2, speedTicks: 2, tickCounter: 0,
      roomX: 0, roomY: 0, chaseRange: 20, aiState: 'idle',
    });
    room.entities.enemies.push({
      id: 2, x: 26, y: 24,
      segments: [{ x: 26, y: 24 }, { x: 25, y: 24 }],
      hp: 2, speedTicks: 2, tickCounter: 0,
      roomX: 0, roomY: 0, chaseRange: 20, aiState: 'idle',
    });
    const state = minimalState({
      world, snake: [...snake],
      currentRoom: { x: 0, y: 0 }, score: 20,
    });
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    const result = tick(state);
    expect(result.snake.length).toBe(snake.length - 1);
    expect(result.score).toBe(15);
  });
});
```

**新增辅助函数：**

```js
// Helper: create a 1×1 test world with a single empty room
function genTestWorld() {
  const room = createRoom(0, 0);
  for (let y = 0; y < ROOM_SIZE; y++) {
    for (let x = 0; x < ROOM_SIZE; x++) {
      room.tiles[y][x] = 0; // CELL.FLOOR
    }
  }
  return { rows: 1, cols: 1, rooms: [[room]] };
}
```

---

## 3. Dependencies Between Tasks

```
T1 (collision.js: checkSnakeCollision — add body segment check)
  │
  ├──→ T2 (core.js: checkEnemyOverlap — add body segment check)
  │         │
  │         └──→ T3 (core.js: tick() — add post-move overlap check + frame damage guard)
  │                    │
  │                    └──→ T4 (tests — add test cases)
```

**Strict ordering:** T1 → T2 → T3 → T4

T1 必须先做，因为碰撞检测的根本修复在 collision.js。T2 是辅助检查函数。T3 是时序修复。T4 是测试。

---

## 4. Implementation Order (Detailed)

### Phase A: Collision Detection Fix (T1)

**File:** `public/src/engine/collision.js`
- 修改 `checkSnakeCollision` 中的敌人检测，加入 `e.segments.some(...)` 检查

**改动量:** ~3 行
**验证:** 单元测试（蛇头撞到敌人身体段触发 'enemy' 碰撞类型）

### Phase B: Overlap Check Fix (T2)

**File:** `public/src/engine/core.js`
- 修改 `checkEnemyOverlap` 的 `some()` 回调，加入 segments 检查

**改动量:** ~3 行
**验证:** checkEnemyOverlap 返回 true 当蛇头在敌人身体段上

### Phase C: Tick Timing Fix (T3)

**File:** `public/src/engine/core.js`
- 在 `tick()` 开头重置 `enemyDamagedThisTick = false`
- 在现有敌人伤害处理处设置 `enemyDamagedThisTick = true`
- 在 `updateEnemies(s)` 后添加 post-move overlap 检查

**改动量:** ~20 行
**验证:** 两次伤害不会在同一帧触发

### Phase D: Tests (T4)

**File:** `tests/metroidvania-snake.test.js`
- 新增 `genTestWorld` 辅助函数
- 新增 `Phase 3b` describe 块，覆盖 7 个测试用例

**改动量:** ~200 行

---

## 5. Edge Cases and Risks

### Edge Cases

| # | Scenario | Expected Behavior | Risk |
|---|----------|-------------------|------|
| 1 | 蛇头撞到敌人头部 + 身体段同时 | 只触发一次伤害 | Low — `enemyDamagedThisTick` 保护 |
| 2 | 蛇长度 = 1 时撞敌 | 长度 = 0 → gameover | Low — 已有处理逻辑 |
| 3 | 蛇撞敌同时吃到食物 | 食物先增长，敌人再减 → 净效果不变 | Medium |
| 4 | 敌人在门附近撞到蛇 | 正常触发伤害 | Low |
| 5 | segments 数组为空 | 降级到只检查头部 | Low — `e.segments &&` 防御 |
| 6 | 敌人一次移动跨过蛇头 | 走完 tick 后重叠检查发现 | Low |
| 7 | 蛇头和敌人不在同一房间 | 不触发碰撞 | Low |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `enemyDamagedThisTick` 被其他代码路径影响 | Low | Medium | 修饰符作用域局域在 tick() 内 |
| 食物增长和扣血的顺序导致净效果不对 | Medium | Medium | 确认 tick 顺序后调整 |
| 现有测试因为修复而失败 | Medium | Low | 确保不改变已有正常行为 |

### Rollback Plan

逐 commit 回退。每个文件改动独立可逆。

---

## 6. Acceptance Verification

### Automated Tests

```bash
npm test
# Key new tests:
# - snake head colliding with enemy head → length -1
# - snake head colliding with enemy body segment → length -1
# - score -5 (min 0) on enemy collision
# - game over on length-1 snake hitting enemy
# - single damage per tick (帧内冷却)
```

### Manual Test

```bash
# Open game and test:
# 1. Walk snake into red enemy head → length -1, score -5
# 2. Walk snake through enemy body segments → damage
# 3. Stay still while enemy chases and steps onto snake head → damage
# 4. Length-1 snake touching enemy → game over
```

---

## 7. Summary

| File | Change Type | Lines Changed |
|------|-------------|--------------|
| `public/src/engine/collision.js` | Modify `checkSnakeCollision` enemy detection | +3 |
| `public/src/engine/core.js` | Modify `checkEnemyOverlap` + `tick()` timing fix | ~25 |
| `tests/metroidvania-snake.test.js` | Add new describe block + helper | ~200 |
