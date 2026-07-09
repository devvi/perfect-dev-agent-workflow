# Tasks: #46 — 蛇撞到非即死障碍后反向运动

| 字段 | 值 |
|------|----|
| Issue | #46 |
| 优先级 | P0 |

## Overview

实现蛇撞到非即死障碍（如普通墙）后的 stuck（卡住）+ reverse（反向）状态，替换原来的直接扣血行为。蛇撞墙后卡住片刻，然后整体反向移动。Source: `docs/PRD/46-snake-reverse-on-obstacle.md`.

## Phase 1: Core Logic — Stuck + Reverse 状态机 (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/core.js` | 添加 `stuckCounter`、`pendingReverse` 到 `createInitialState()` | 无 | P0 |
| 1.2 | `public/src/engine/core.js` | 在 `tick()` 顶部添加 stuck 处理分支（stuckCounter > 0 → 不动，递减） | 1.1 | P0 |
| 1.3 | `public/src/engine/core.js` | 修改 damage 处理分支：改为 stuck+reverse 而非 length-1 | 1.1 | P0 |
| 1.4 | `public/src/engine/core.js` | stuck 归零时执行 `snake.reverse()` + `direction` 取反 + 安全检查 | 1.2 | P0 |
| 1.5 | `public/src/engine/constants.js` | 定义 `STUCK_TICKS = 6`（~900ms at 150ms/tick） | 无 | P0 |
| 1.6 | `public/src/engine/core.js` | Stuck 期间方向输入缓冲：`changeDirection()` 确认 stuck 期间仍接受方向输入 | 1.2 | P0 |

## Phase 2: 位置安全检查 (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/src/engine/core.js` | 反转后检查新蛇头是否在障碍物内 | 1.4 | P0 |
| 2.2 | `public/src/engine/core.js` | 如果在障碍物内，再推一格（在反方向上多移动一步） | 2.1 | P0 |

## Phase 3: Rendering — Stuck 视觉反馈 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/render/renderer.js` | Stuck 期间蛇闪烁或变灰色；可复用已有的 screenShake 机制（撞墙时已有震动） | 1.2 | P1 |
| 3.2 | `public/gameboy.html` / `public/src/render/hud.js` | Stuck 期间可选显示 "STUCK!" 提示 | 1.2 | P1 |

## Phase 4: Classic Engine — 同步修改 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `src/gameboy-snake-engine.js` | 添加 stuck+reverse 逻辑（如果此引擎也需要支持） | 1.2, 1.4 | P1 |
| 4.2 | `src/gameboy-snake-engine.js` | 添加非即死障碍概念（当前只有 grid 边界） | 4.1 | P1 |

## Phase 5: Tests (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 5.1 | `tests/metroidvania-snake.test.js` | 基础 stuck+reverse 测试 | 1.2, 1.4 | P0 |
| 5.2 | `tests/metroidvania-snake.test.js` | Stuck duration 测试 | 1.5 | P0 |
| 5.3 | `tests/metroidvania-snake.test.js` | 反向位置安全测试 | 2.1, 2.2 | P0 |
| 5.4 | `tests/metroidvania-snake.test.js` | Stuck 期间输入缓冲测试 | 1.6 | P0 |
| 5.5 | `tests/metroidvania-snake.test.js` | 多次撞墙测试 | 1.2, 1.4 | P0 |
| 5.6 | `tests/gameboy-snake.test.js` | 经典引擎反向测试（如果适用） | 4.1 | P1 |

## Dependency Graph

```
Phase 1 (Core Logic)
├─ 1.1 (state init: stuckCounter, pendingReverse) ──────┐
├─ 1.2 (tick stuck handler)        ←── 1.1              │
├─ 1.3 (damage→stuck+reverse)      ←── 1.1              │
├─ 1.4 (reverse execution)         ←── 1.2              │
├─ 1.5 (STUCK_TICKS constant)      ─────────────────────┤
├─ 1.6 (input buffer during stuck) ←── 1.2              │
                                                          │
Phase 2 (Position Safety)           Phase 3 (Rendering)   │
├─ 2.1 (head-in-obstacle check)     ├─ 3.1 (snake flash) │
├─ 2.2 (push out)   ←── 2.1         └─ 3.2 (STUCK! hint) │
                                                          │
Phase 4 (Classic Engine)            Phase 5 (Tests)       │
├─ 4.1 (backport logic)             ├─ 5.1 (basic test)      ←── 1.2+1.4  │
├─ 4.2 (grid boundary)  ←── 4.1    ├─ 5.2 (duration)        ←── 1.5      │
                                     ├─ 5.3 (position safety) ←── 2.1+2.2  │
                                     ├─ 5.4 (input buffer)    ←── 1.6      │
                                     ├─ 5.5 (multi-hit)       ←── 1.2+1.4  │
                                     └─ 5.6 (classic engine)  ←── 4.1      │
                                                                             │
All done ─────────────────────────────────────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `public/src/engine/constants.js` | 修改（+STUCK_TICKS） | +1 |
| `public/src/engine/core.js` | 修改（主逻辑） | ~60 |
| `public/src/render/renderer.js` | 修改（stuck 视觉反馈） | ~10 |
| `public/src/render/hud.js` | 修改（可选：STUCK! 提示） | ~5 |
| `src/gameboy-snake-engine.js` | 修改（可选：经典引擎同步） | ~30 |
| `tests/metroidvania-snake.test.js` | 修改（新测试） | ~80 |
| `tests/gameboy-snake.test.js` | 修改（可选：经典引擎测试） | ~30 |

**Total estimated effort:** 1-2 hours
