# Research: 蛇身长度和速度的关系调整

> Parent Issue: #54
> Agent: research-agent
> Date: 2026-07-08
> Status: Open
> Priority: Medium

---

## 1. Problem Definition

### Current Behavior

The metroidvania snake game currently includes a length-based speed system (implemented per Issue #50), but the tuning makes the relationship barely perceptible during normal gameplay.

### Current Implementation

Two engines exist:

- **Engine B** (`public/src/engine/core.js` + `public/gameboy.html`): The main game engine. Already has `calculateSpeed()` and a recursive `setTimeout` game loop that dynamically reads `currentTickInterval`. **The game loop fix works correctly.**

- **Engine A** (`src/gameboy-snake-engine.js`): Standalone classic GameBoy engine. Does **not** have any speed-length logic. Its copy at `public/src/gameboy-snake-engine.js` has the fix applied (used by tests).

### Expected Behavior

The speed-length relationship should be **perceptible** during normal gameplay ranges (length 10-35), creating a meaningful trade-off: longer body = more risk (slow speed means enemies can catch up), creating a natural self-regulation mechanic where players may choose to deliberately lose length to regain speed.

### Root Cause of the Design Issue

The current formula uses a **linear slope** with `SPEED_SLOPE = 0.02`:

```js
calculateSpeed(length, baseInterval)
  = floor(150 * (1 + (length - 3) * 0.02))
```

| Length | Tick Interval | Perception |
|--------|--------------|------------|
| 3 (min) | 150ms | — |
| 10 | 171ms | +14% — barely noticeable |
| 20 | 201ms | +34% — slightly noticeable |
| 50 | 291ms | +94% — noticeable but still fast |
| 100 | 441ms | ~3× — game feels slower |
| 400 (max) | 1341ms | ~9× — extremely slow |

**The problem:** The slope is too gentle. A player reaching length 20-30 (a typical mid-game range) experiences only 30-60% slowdown — not enough to create a meaningful trade-off decision. By the time the slowdown becomes significant (~length 50+), the player is already very experienced and enemies are still easily outrun.

### User Scenarios

- **Scenario A（正常游戏）:** 玩家从长度 3 增长到 20，速度几乎没有变化。玩家感觉不到长度/速度的权衡。
- **Scenario B（策略决策）:** 长度 35+ 时速度明显变慢，敌人可以追上。但斜率太缓，中段游戏（10-30）几乎没有差异。
- **Scenario C（最大长度）:** 长度 400 时极慢（~1.3s/tick），但几乎不可能到达这个长度。
- **Frequency:** 每次游玩全程。

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

Issue #50 实现了速度/长度功能，但使用了保守的 `SPEED_SLOPE = 0.02`。当时的目标是"先实现功能再调优"，而不是直接确定最佳斜率值。

### Why Change Now?

1. **感知度不足：** 当前调优使得中段游戏（长度 10-35）几乎没有可感知的速度变化
2. **策略深度不足：** 玩家没有动力去主动管理蛇的长度（碰撞扣血反而成了好事？因为可以加速）
3. **敌人的威胁不足：** 敌人速度固定，而长蛇仍然可以轻松逃脱敌人

### Previous Constraints

- `BASE_TICK_INTERVAL` (150ms) 是基础间隔，不应更改
- 公式输出不能为负或为 0
- 需要速度上限（防止极端长度下不可玩）

---

## 3. Impact Analysis

| Area | Impact |
|------|--------|
| **Player Experience** | Currently minimal tension; no meaningful trade-off decision about snake length. Enemies rarely threaten long snakes. |
| **Game Balance** | Enemies' movement speed (`DEFAULT_ENEMY_SPEED_TICKS = 2`) is constant. With current tuning, long snakes still outrun enemies easily. |
| **Strategy Depth** | No incentive for players to manage length strategically (e.g., collision damage that reduces length becomes a benefit, not a penalty). |
| **Code Complexity** | Low — only constants and the formula need changing. No architectural modifications. |
| **Test Scope** | `calculateSpeed()` tests need new expected values. Integration tests should verify game loop picks up changes. |

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/constants.js` | Constants | 更新 `SPEED_SLOPE` 从 0.02 到 0.05，添加 `MAX_TICK_INTERVAL = 800` |
| `public/src/engine/core.js` | Core | 更新 `calculateSpeed()` 添加上限约束 |
| `src/gameboy-snake-engine.js` | Classic Engine | 从 #50 移植速度/长度逻辑，然后用新斜率调优 |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `tests/metroidvania-snake.test.js` | Tests | 更新 `calculateSpeed()` 的期望值 |
| `tests/gameboy-snake.test.js` | Tests | 为经典引擎添加测试 |

### Data Flow Impact

无数据流变化——只有常量和公式变化。

### Documents to Update

- [ ] `docs/PRD/54-snake-length-speed.md` (本文件)
- [ ] `docs/TASKS/54-snake-length-speed.md` (任务文件)

---

## 4. Solution Comparison

> At least 2 approaches required.

### Alternative A: Steeper Linear Slope (Recommended)

增加 `SPEED_SLOPE` 从 0.02 到 **0.05**（2.5× 更陡）。

**Formula:**
```js
calculateSpeed(length, baseInterval)
  = floor(150 * (1 + (length - 3) * 0.05))
```

**Behavior:**

| Length | Tick Interval | Perception |
|--------|--------------|------------|
| 3 | 150ms | — |
| 10 | 202ms | +35% — noticeable slowdown |
| 20 | 277ms | +85% — significant |
| 35 | 390ms | ~2.6× — slow; enemies begin to catch up |
| 50 | 502ms | ~3.3× — very slow; enemies can easily catch |
| 100 | 877ms | ~5.8× — extremely slow |

**Pros:**
- Simple parameter change, minimal code risk
- Creates clear trade-off zones: moderate speed at length 10-20, significant slowdown at 20-35, dangerous at 35+
- Players naturally feel the need to manage length around mid-game (length 20-35)
- Enemies become a real threat at length 35+ as intended

**Cons:**
- At max length (400): ~3,000ms (20×), which may be unplayably slow. Need a max-speed floor or soft cap.
- Linear throughout; no curve to the relationship.

**Risk:** Low
**Effort:** Small (< 30 minutes)

### Alternative B: Logarithmic / Diminishing-Returns Curve

Use a logarithmic function so speed drops quickly at first then plateaus.

**Formula:**
```js
calculateSpeed(length, baseInterval)
  = floor(baseInterval * (1 + Math.log2(length - 2) * SLOPE_FACTOR))
```

**Pros:**
- Smooth, natural-feeling progression
- Never becomes unplayably slow even at extreme lengths
- Most noticeable change happens in the early and mid game where it matters most

**Cons:**
- More complex formula — harder to tune and explain
- At very high lengths, speed barely changes anymore, reducing the "danger zone" feeling
- Logarithmic costs more CPU (negligible but less elegant)
- Harder for players to intuitively understand the relationship

**Risk:** Low
**Effort:** Small (~30 minutes)

### Alternative C: Staged / Piecewise Linear

Define speed tiers by length intervals with different slopes.

**Pros:**
- Predictable, easy to understand and communicate to players
- Clear breakpoints create achievement-like markers
- Speed cap ensures playability

**Cons:**
- Discontinuous — abrupt speed jumps at breakpoints feel jarring
- Discrete tiers reduce granularity of player feedback per food eaten
- Harder to justify specific threshold values without playtesting

**Risk:** Low
**Effort:** Small (~30 minutes)

### Recommendation

→ **Alternative A (Steeper Linear Slope)** 因为：
1. Simplest change — single constant modification `SPEED_SLOPE: 0.02 → 0.05`
2. Creates the exact desired behavior: moderate lengths = moderate slowdown, long = very slow, enemies catch up
3. Easy to tune further after playtesting
4. Consistent with the existing linear model — no architectural changes

### Additional Safeguard: Speed Floor

To prevent extreme lengths from becoming unplayable, add a **speed floor** that clamps the maximum tick interval:

```js
export const MAX_TICK_INTERVAL = 800; // ms — capped max interval (≈5.3× slowdown)

export function calculateSpeed(length, baseInterval) {
  return Math.min(
    Math.floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE)),
    MAX_TICK_INTERVAL
  );
}
```

With `SPEED_SLOPE = 0.05` and `MAX_TICK_INTERVAL = 800ms`:
- Length 3: 150ms (fast)
- Length 10: 202ms
- Length 20: 277ms
- Length 35: 390ms (enemy threat zone begins)
- Length 50: 502ms (enemies easily catch up)
- Length ≈90: 800ms (hits the floor)
- Length 100–400: 800ms (capped)

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

- [ ] `SPEED_SLOPE` updated from 0.02 → 0.05 in Engine B (`public/src/engine/constants.js`)
- [ ] `MAX_TICK_INTERVAL = 800` added and `calculateSpeed()` clamps to it
- [ ] Engine A (`src/gameboy-snake-engine.js`) receives the speed-length logic from #50 (backport the `public/src/gameboy-snake-engine.js` changes)
- [ ] Engine A also tuned with the new slope (0.05) and max clamp
- [ ] At length 3: tick interval = 150ms
- [ ] At length 20: tick interval = 277ms (~1.85× baseline)
- [ ] At length 35: tick interval = 390ms (~2.6× baseline) — enemy threat zone
- [ ] At length 50: tick interval = 502ms (~3.3× baseline)
- [ ] At length ≥90: tick interval capped at 800ms
- [ ] Existing test suite passes
- [ ] New tests added for: `calculateSpeed()` with new slope, max clamp, edge lengths (1, 3, 35, 50, 90, 400)
- [ ] Game loop correctly reads updated `currentTickInterval` each tick (regression check per #50 fix)

### Scope

| Item | Description |
|------|-------------|
| **Engine B** | Update `SPEED_SLOPE` constant from 0.02 → 0.05. Add `MAX_TICK_INTERVAL = 800`. Update `calculateSpeed()` to clamp to max. |
| **Engine A** | First brought up to parity with #50 fix, then tuned with new values. |
| **Tests** | Update test expectations for `calculateSpeed()` with new slope and max clamp. Add edge-case tests. |
| **HUD / Feedback** | Optionally display current tick interval (or a visual speed indicator). |

### Out of Scope

| Item | Reason |
|------|--------|
| **Enemy speed tuning** | Enemy movement (`DEFAULT_ENEMY_SPEED_TICKS = 2`) is a separate concern. |
| **Non-linear formulas beyond linear/log** | Exponential or custom spline curves add unnecessary complexity. |
| **Visual snake length indicator** | UI changes beyond a simple HUD speed readout are out of scope. |
| **Game loop architecture** | The recursive `setTimeout` fix from #50 is already deployed. |

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Snake length = 1 (after combat damage) | Speed should not be faster than the base 150ms. Clamp lower bound: `currentTickInterval = max(BASE_TICK_INTERVAL, calculated)`. |
| Snake at max length (400) | Speed hits the floor at 800ms. Player moves very slowly — enemies should be able to catch up easily. |
| Game pause/unpause | `currentTickInterval` is preserved in state; on resume, game loop reads it fresh. |
| Game restart | New game resets length to 3, `currentTickInterval` returns to `BASE_TICK_INTERVAL` (150ms). |
| Very short snake (length 3) | Fastest possible speed. Player feels agile and can easily dodge enemies. |
| Multi-room transitions | `currentTickInterval` is part of state and persists across rooms. |

### Failure Paths

1. **速度上限太低：** 若 `MAX_TICK_INTERVAL` 设得太低（如 500ms），极限长度下速度变化不明显
2. **速度下限失控：** 若 `calculateSpeed` 返回小于 `BASE_TICK_INTERVAL` 的值，可能导致游戏循环加速过快

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| Issue #50 fixes (game loop fix + Engine A update) | Not deployed to Engine A | Medium — Engine A 必须先实现速度/长度逻辑 |
| `calculateSpeed()` function | Stable | Low — 只需修改常量和上限 |
| Game loop (recursive setTimeout) | Stable | Low — 无需修改 |

### Blocks

| Future Work | Priority |
|-------------|----------|
| 基于速度的敌人 AI 调整 | Post-MVP (Phase 2) |
| HUD 速度显示 | Low |

### Preparation Needed

- [ ] 确认 #50 的 Engine A fix 已合并到 master
- [ ] 确定 `MAX_TICK_INTERVAL` 的最佳值（建议 800ms）

---

## 7. Spike / Experiment (Optional)

无必要。斜率调整是简单的参数变化，可直接在生产环境中测试和调整。
