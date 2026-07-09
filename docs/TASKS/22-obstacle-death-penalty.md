# Tasks: #22 — 关卡障碍死亡惩罚迭代

| 字段 | 值 |
|------|----|
| Issue | #22 |
| 优先级 | P0 |

## Overview

引入 DEATH_WALL（即死墙）和损伤墙机制：撞普通墙改为扣血+屏幕震动（非即死），新增红色即死墙（致命）。Approach: A — 最小改动（修改碰撞返回值 + 新增 DEATH_WALL）。Derived from: `docs/PRD/22-obstacle-death-penalty.md`.

## Phase 1: 新增 CELL.DeathWall 常量 & 渲染 (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/constants.js` | 新增 `CELL.DEATH_WALL = 5` | 无 | P0 |
| 1.2 | `public/src/render/room.js` | 添加 `DEATH_WALL` 渲染分支——使用红色/熔岩风格（区别于普通深绿 WALL） | 1.1 | P0 |
| 1.3 | `public/src/render/room.js` | STONE_WALL 渲染调整（可选：使其看起来像可破坏的普通墙，而非即死墙） | 无 | P1 |

**Acceptance:** DEATH_WALL tile 在游戏中显示为明显不同的风格（红色/尖刺/岩浆）。

## Phase 2: 修改碰撞检测逻辑 (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/src/engine/collision.js` | `checkSnakeCollision()`: 将 WALL 和 STONE_WALL 的碰撞结果从 `'wall'` 改为 `'damage'` | 无 | P0 |
| 2.2 | `public/src/engine/collision.js` | `checkSnakeCollision()`: 新增 `CELL.DEATH_WALL` 检测 → 返回 `['death']` | 1.1 | P0 |
| 2.3 | `public/src/engine/collision.js` | `checkProjectileCollision()`: 确认子弹撞到普通 WALL 仍消失（不变） | 无 | P0 |
| 2.4 | `public/src/engine/collision.js` | `checkProjectileCollision()`: 子弹撞到 DEATH_WALL 也消失 | 1.1 | P0 |

**Acceptance:**
- WALL / STONE_WALL → `['damage']`
- DEATH_WALL → `['death']`
- 其他地方调用 `checkSnakeCollision` 的地方兼容新返回值

## Phase 3: 修改碰撞处理（Tick 逻辑）(P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/engine/core.js` | 移除 `collisions.includes('wall')` 分支 | 2.1 | P0 |
| 3.2 | `public/src/engine/core.js` | 新增 `collisions.includes('damage')` 分支：length - 1，设置 `screenShake` 状态 | 2.1 | P0 |
| 3.3 | `public/src/engine/core.js` | 新增 `collisions.includes('death')` 分支：`gameState = 'gameover'` | 2.2 | P0 |
| 3.4 | `public/src/engine/core.js` | 在 tick 末尾添加 `state.snake.length === 0 → gameover` 兜底检查 | 3.2 | P0 |
| 3.5 | `public/src/engine/core.js` | 确保 `screenShake` 在每次 tick 中衰减（震度减少、计时减少） | 3.2 | P0 |
| 3.6 | `public/src/engine/core.js` | 添加 `screenShake` 状态字段到初始化 `createInitialState()` | 3.2 | P0 |

**Acceptance:**
- 撞普通墙 → 长度减 1，不 gameover
- 撞即死墙 → 立即 gameover
- 长度归零 → gameover
- screenShake 状态正确衰减

## Phase 4: 实现屏幕震动（Render 层）(P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `public/src/render/renderer.js` | 主渲染函数在调用 `renderRoom()` 前检查 `state.screenShake` | 3.2 | P0 |
| 4.2 | `public/src/render/room.js` | 如果震动激活：`ctx.save()` → `ctx.translate(randomOffsetX, randomOffsetY)` → render → `ctx.restore()` | 4.1 | P0 |
| 4.3 | `public/src/engine/core.js` | 震动衰减算法：每 tick 乘以衰减因子（如 0.7），低于阈值时清除 | 3.5 | P0 |

**参数调优（spike 结果）：**
- 初始偏移：±3px
- 持续时间：300ms（约 6-9 ticks）
- 衰减：指数衰减 α=0.7
- 频率：每 tick 重新随机

**Acceptance:**
- 撞墙时画面出现短暂、微小的随机偏移
- 震动在 300ms 内平滑衰减到不可见
- 不影响操作（偏移量很小）

## Phase 5: 生成器：DEATH_WALL 放置逻辑 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 5.1 | `public/src/engine/generator.js` | 在 `generateRoomTiles()` 中，为特定房间类型（如 GACHA 房间、特殊陷阱房间）添加 DEATH_WALL 簇 | 1.1 | P1 |
| 5.2 | `public/src/engine/generator.js` | 确保 DEATH_WALL 不阻挡门的关键通道（保留至少 3 格宽的通行路径） | 5.1 | P1 |
| 5.3 | `public/src/engine/generator.js` | 确保 DEATH_WALL 在房间中的视觉可辨认（不被其他墙遮挡） | 5.1 | P1 |
| 5.4 | `public/src/engine/generator.js` | 初始版本：仅在少数房间放置 DEATH_WALL（不超过总房间数的 20%，即 5×5 地图最多 5 个房间含即死墙） | 5.1 | P1 |

**Acceptance:**
- DEATH_WALL 只出现在特定房间，不是所有房间都有
- 玩家总能在即死房间中找到安全路径
- 生成器不会在门正前方放置 DEATH_WALL

## Phase 6: 更新测试 (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 6.1 | `tests/metroidvania-snake.test.js` | 新增测试：蛇撞普通墙 → length - 1，screenShake 被设置，gameState 保持 'playing' | 3.2, 4.1 | P0 |
| 6.2 | `tests/metroidvania-snake.test.js` | 新增测试：蛇撞 DEATH_WALL → 立即 gameover | 3.3 | P0 |
| 6.3 | `tests/metroidvania-snake.test.js` | 新增测试：蛇长度=1时撞普通墙 → length=0 → gameover | 3.4 | P0 |
| 6.4 | `tests/metroidvania-snake.test.js` | 新增测试：子弹撞 DEATH_WALL → 子弹消失 | 2.4 | P0 |
| 6.5 | `tests/metroidvania-snake.test.js` | 修改现有测试：原有 `'wall'` 碰撞测试改为 `'damage'` 预期 | 2.1 | P0 |

**Acceptance:** 所有测试通过（`npm test`）。

## Phase 7: 视觉文档 & 调参 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 7.1 | `docs/DESIGN/15-metroidvania-snake-overhaul.md` | 更新 DESIGN 文档中的 CELL 枚举表格，加入 DEATH_WALL | 1.1 | P1 |
| 7.2 | `docs/DESIGN/15-metroidvania-snake-overhaul.md` | 更新 DESIGN 文档碰撞部分反映新行为 | 2.1 | P1 |
| 7.3 | `docs/DESIGN/15-metroidvania-snake-overhaul.md` | 记录屏幕震动参数（强度、持续时间、衰减因子） | 4.1 | P1 |
| 7.4 | `docs/REFERENCE/` | （可选）在 `docs/REFERENCE/` 中添加游戏调参记录 | 全部 | P2 |

**Acceptance:** DESIGN 文档准确反映新碰撞行为。

## Dependency Graph

```
Phase 1 (Constants + Render)
├─ 1.1 (DEATH_WALL constant) ─────────────┐
├─ 1.2 (DEATH_WALL render)   ←── 1.1      │
├─ 1.3 (STONE_WALL render) ───────────────┤
                                            │
Phase 2 (Collision Detection)               │
├─ 2.1 (wall→damage rename) ──────────────┤
├─ 2.2 (death_wall detection) ←── 1.1     │
├─ 2.3 (bullet wall unchanged) ───────────┤
├─ 2.4 (bullet death_wall)    ←── 1.1     │
                                            │
Phase 3 (Tick Logic)                        │
├─ 3.1 (remove wall branch)   ←── 2.1     │
├─ 3.2 (damage branch)        ←── 2.1     │
├─ 3.3 (death branch)         ←── 2.2     │
├─ 3.4 (length 0 guard)       ←── 3.2     │
├─ 3.5 (screenShake decay)    ←── 3.2     │
├─ 3.6 (init screenShake)     ←── 3.2     │
                                            │
Phase 4 (Screen Shake Render)               │
├─ 4.1 (check in renderer)    ←── 3.2     │
├─ 4.2 (translate render)     ←── 4.1     │
├─ 4.3 (decay algo)           ←── 3.5     │
                                            │
Phase 5 (Generator)     Phase 6 (Tests)     │
├─ 5.1 (death_wall gen)      ├─ 6.1 (wall damage test)   ←──3.2+4.1  │
├─ 5.2 (passage clear)       ├─ 6.2 (death test)        ←──3.3      │
├─ 5.3 (visual clarity)      ├─ 6.3 (length=1 test)     ←──3.4      │
├─ 5.4 (room limit)          ├─ 6.4 (bullet death test) ←──2.4      │
                              └─ 6.5 (existing tests)   ←──2.1      │
                                                                       │
Phase 7 (Documentation)     ←── all phases                            │
                                                                       │
All done ───────────────────────────────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `public/src/engine/constants.js` | 修改（+DEATH_WALL） | +1 |
| `public/src/engine/collision.js` | 修改（碰撞逻辑重写） | ±10 |
| `public/src/engine/core.js` | 修改（tick 逻辑 + screenShake） | +30 |
| `public/src/render/room.js` | 修改（渲染分支） | +10 |
| `public/src/render/renderer.js` | 修改（屏幕震动） | +10 |
| `public/src/engine/generator.js` | 修改（放置逻辑） | +20 |
| `tests/metroidvania-snake.test.js` | 修改（新增测试） | +60 |
| `docs/DESIGN/15-metroidvania-snake-overhaul.md` | 修改（文档更新） | +10 |
