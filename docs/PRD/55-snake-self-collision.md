# Research: [Feature] 蛇撞到自己，不会即死

> Parent Issue: #55
> Agent: research-agent
> Date: 2026-07-08
> Status: Open
> Priority: Medium

---

## 1. Problem Definition

### Current Behavior

When the snake collides with its own body, the game currently triggers an instant game over. This behavior is inconsistent with the design philosophy established by recent changes:

- **Wall collision** (Issue #46): Changed from instant death → stuck + reverse + score penalty
- **Obstacle death penalty** (Issue #22): Hard obstacles → instant death, but regular obstacles → damage only
- **Enemy collision** (Issue #20): Changed from instant death → length reduction

Self-collision is the last remaining "trivial death" trigger. Making self-collision non-lethal aligns it with the other collision types and creates a more forgiving, skill-friendly gameplay experience.

### Expected Behavior

蛇撞到自己不会即死。取而代之，应移除 1 段蛇尾并应用短暂的晕眩/脆弱窗口。

**具体行为：**
- 蛇头与身体段重叠时 → **不**将蛇头移入该位置（防止重叠）
- 移除 1 段蛇尾
- 应用短暂的晕眩（stun）
- 扣 5 分（不低于 0）
- 如果蛇长度为 1（移出尾巴后为空）→ 游戏结束

### User Scenarios

- **Scenario A（狭窄通道中）：** 蛇在狭窄走廊中快速移动，不小心转向自己身体 → 移除尾巴一段，屏幕震动，蛇被短暂晕眩 → 玩家调整方向继续
- **Scenario B（战斗中）：** 蛇在躲避敌人时因为空间不足撞到自己 → 同样处理，不移除致死
- **Scenario C（蛇极长时）：** 蛇长 50+ 时几乎必然因转弯空间不足而撞到自己 → 非致死设计避免了因一次误操作就重开
- **Frequency:** 蛇越长越频繁触发

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

Two engines are affected, each with the same self-collision → gameover mapping:

### Engine A: Classic GameBoy Snake (`src/gameboy-snake-engine.js`)

**File:** `src/gameboy-snake-engine.js`, lines 124–127:

```js
// Self collision → instant gameover (lethal)
if (collision === 'self') {
  next.gameState = 'gameover';
  return next;
}
```

The collision check at line 93 calls `checkCollision(newHead, next.snake)` which scans body segments (skipping the head at index 0). If any body segment overlaps the head's new position, `'self'` is returned.

### Engine B: Metroidvania Snake (`public/src/engine/core.js`)

**File:** `public/src/engine/core.js`, lines 199–201:

```js
// Self collision — with protection during room transition
if (collisions.includes('self') && !duringTransition) {
  s.gameState = 'gameover';
  return s;
}
```

The collision detection is in `public/src/engine/collision.js`, `checkSnakeCollision()`, lines 66–69:

```js
// Check self collision (skip first segment which is head)
for (let i = 1; i < snake.length; i++) {
  if (snake[i].x === head.x && snake[i].y === head.y) {
    return ['self'];
  }
}
```

Both engines handle self-collision identically: **immediate game over with no recovery**.

### Why Change Now?

1. **设计一致性：** 墙壁和敌人碰撞已改为非致死，自我碰撞是最后一个"廉价死亡"触发点
2. **玩家体验：** 在狭窄空间里，自我碰撞非常常见，即死惩罚不成比例
3. **游戏深度：** 非致命的自我碰撞鼓励玩家在狭窄空间冒险，但需承担长度损失的风险

### Previous Constraints

- 不能引入外部库
- 碰撞检测逻辑不变（`['self']` 标签仍然由 collision.js 返回）
- 房间过渡期间的 `duringTransition` 保护必须保留

---

## 3. Impact Analysis

| Factor | Assessment |
|--------|------------|
| **Game difficulty** | Self-collision is common in tight corridors. Instant death here is disproportionately punishing vs. wall collision (non-lethal since #46). |
| **Player frustration** | Dying immediately from self-collision feels arbitrary when other penalties (wall bump, enemy hit) are non-lethal. |
| **Design coherence** | The wall/obstacle/enemy collision "family" has moved to non-lethal. Self-collision is an outlier. |
| **Test impact** | ~5 test cases explicitly assert `gameState === 'gameover'` on self-collision. These must be updated. |
| **Two engines** | Both engines must be changed, doubling the implementation surface but not the complexity. |

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `src/gameboy-snake-engine.js` | Classic Engine | 替换 self-collision 从 gameover 改为尾巴移除 + stun + 扣分 |
| `public/src/engine/core.js` | Metroidvania Engine (tick) | 替换 self-collision 从 gameover 改为尾巴移除 + stun + 扣分 |
| `tests/gameboy-snake.test.js` | Tests | 更新已有的 gameover 测试断言 |
| `tests/metroidvania-snake.test.js` | Tests | 更新已有的 gameover 测试断言 |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/collision.js` | Collision | 无需修改——`['self']` 标签仍然正确返回 |

### Data Flow Impact

```
[Before]
self collision → gameover (immediate)

[After]
self collision → tail.pop() + stunCounter = STUN_TICKS + score -= 5
  → if length <= 1 after pop → gameover (empty snake)
```

### Documents to Update

- [ ] `docs/PRD/55-snake-self-collision.md` (本文件)
- [ ] `docs/TASKS/55-snake-self-collision.md` (任务文件)

---

## 4. Solution Comparison

> At least 2 approaches required.

### Alternative A: Remove tail segment on self-collision (Recommended)

**Behavior:** When the snake head overlaps any body segment, do **not** move the head into that position (prevent merging). Instead, **remove 1 segment from the tail** and apply a brief stun/vulnerability window. The head stays in place.

**Pseudo-code:**
```
if (selfCollision) {
  // Don't move head into body; head stays put
  // Remove last segment
  next.snake.pop();
  // Apply short stun (skip next tick or reduce score)
  next.stunCounter = STUN_TICKS;
  next.score = Math.max(0, next.score - 5);
  return next;
}
```

**Pros:**
- Visually clean — head never overlaps body
- Consistency with existing `damage` penalty pattern (score loss + stun)
- Natural penalty: shorter snake = easier to self-collide again → skill spiral

**Cons:**
- Head staying in place could feel like "input ignored" if not communicated visually (screen shake / flash)

**Risk:** Low
**Effort:** Small (~1 hour)

### Alternative B: Allow head to push into body, remove overlap segment

**Behavior:** Move the head into the overlapping cell. The overlapped body segment is removed, and the tail segment is also removed. Net length reduction could be 0–2 depending on head position.

**Pros:**
- Snake still moves (no "stuck" feel)
- The body gap created by removing the overlapped segment looks natural

**Cons:**
- Complex index math — more bug-prone
- Removing middle segment creates a "hole" that the snake body must bridge on the next tick (potential visual glitch)
- Edge case: if head overlaps the 2nd segment and tail is removed, length stays the same

**Risk:** Medium
**Effort:** Medium (~1-2 hours)

### Alternative C: Reverse direction + tail removal (penalty sandwich)

**Behavior:** Like wall collision: reverse direction + remove tail + score penalty.

**Pros:**
- Reuses the wall-collision pattern (proven, tested)
- Reversing away from the collision feels intuitive

**Cons:**
- Doubling down on "reverse" for yet another collision type reduces gameplay variety
- Self-collision often happens in tight spaces where reversing is no better than waiting

**Risk:** Low
**Effort:** Small (~1 hour)

### Alternative D: Keep as-is (status quo)

**Behavior:** Self-collision = instant game over.

**Pros:** Zero implementation cost.
**Cons:** Inconsistent with the game's evolving design direction; self-collision becomes the "cheap death" trap.

### Recommendation

→ **Alternative A** 因为：
1. **设计一致性** — 与敌人碰撞相同的长度减少惩罚模式（Issue #20），与墙壁碰撞相同的扣分惩罚（Issue #46）
2. **视觉清晰** — 蛇头从不与身体重叠；stun 计数器（用于墙反向）可作为视觉反馈机制复用
3. **最简单实现** — 每个引擎只需两个更改，最小分支
4. **易于测试** — 断言 `snake.length === previous.length - 1` 和 `gameState === 'playing'`

### Implementation Plan

**Engine A (`src/gameboy-snake-engine.js`):**

Replace lines 124–127:
```js
// Self collision → non-lethal: remove tail, stun, score penalty
if (collision === 'self') {
  next.stuckCounter = STUCK_TICKS;
  next.pendingReverse = false;  // don't reverse, just stun
  next.snake.pop();             // remove 1 tail segment
  next.score = Math.max(0, next.score - 5);
  return next;
}
```

**Engine B (`public/src/engine/core.js`):**

Replace lines 199–201:
```js
// Self collision → non-lethal: remove tail, stun, score penalty
if (collisions.includes('self') && !duringTransition) {
  s.stuckCounter = STUCK_TICKS;
  s.pendingReverse = false;
  s.snake.pop();
  s.score = Math.max(0, s.score - 5);
  s.screenShake = { intensity: 4, duration: 8 };
  return s;
}
```

**Collision detection (`public/src/engine/collision.js`):**

No change needed — the `['self']` tag is already correctly returned. Only the handler changes.

### Interaction with Room Transition (`duringTransition`)

The existing protection `!duringTransition` on Engine B should remain:
- During room transitions the snake is briefly in an intermediate state where body segments may overlap
- The `duringTransition` flag prevents false-positive self-collision during these frames

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

1. Engine A: Self-collision removes 1 tail segment + score penalty + stun, not gameover
2. Engine B: Same behavior, with `duringTransition` protection preserved
3. Length 1 self-collision triggers gameover (empty snake is unplayable)
4. Screen shake / visual feedback on self-collision
5. Existing self-collision gameover tests updated to assert new behavior
6. New tests for edge cases (length=1 guard, stun counter)
7. Wall collision (Issue #46) behavior is not regressed
8. Enemy collision (Issue #20) behavior is not regressed

### Edge Cases

| # | Item | Expected |
|---|------|----------|
| 1 | **Zero-length snake** | If the snake is length 1, `snake.pop()` produces an empty snake. This should trigger a gameover. **Guard:** `if (next.snake.length <= 1) { next.gameState = 'gameover'; return next; }` |
| 2 | **Tight-corner spiral** | In very tight spaces, repeated self-collision could reduce the snake to a length of 1 in rapid succession. The `length <= 1` guard prevents an infinite loop. |
| 3 | **Existing test cases** | Tests asserting `gameState === 'gameover'` on self-collision must be updated |
| 4 | **Visual feedback** | The new behavior should include visual feedback (screen shake, brief flash) to communicate that the penalty was applied. |
| 5 | **Score penalty stacking** | In a single tick, could other penalties (wall, enemy) stack with self-collision? The current `return`-early pattern prevents stacking. |
| 6 | **Two-engine parity** | Both engines must implement the same behavior. |

### Failure Paths

1. **无尽 self-collision 循环：** 蛇在墙角被自己身体包围，每 tick 都 self-collision → 需要 stun 计数器防止连续伤害
2. **长度=1 guard 误触发：** 蛇长度=2 但 pop 后长度=1 → 不应 gameover

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `src/gameboy-snake-engine.js` (tick function) | Stable | Low |
| `public/src/engine/core.js` (tick function) | Stable | Low |
| `public/src/engine/collision.js` (checkSnakeCollision) | Stable | Low — 无需修改 |

### Blocks

| Future Work | Priority |
|-------------|----------|
| — | — |

### Preparation Needed

- [ ] 确定 `STUCK_TICKS` / `STUN_TICKS` 的值（与 #46 保持一致？建议 3-4 ticks）

---

## 7. Spike / Experiment (Optional)

无必要。行为变更（从 gameover 改为尾巴移除）是直截了当的代码修改，无需原型验证。
