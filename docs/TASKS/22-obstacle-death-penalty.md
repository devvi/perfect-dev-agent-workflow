# Tasks: 关卡障碍死亡惩罚迭代

> Parent Issue: #22
> Derived from: `docs/PRD/22-obstacle-death-penalty.md`
> Approach: A — 最小改动（修改碰撞返回值 + 新增 DEATH_WALL）

---

## T1 — 新增 CELL.DeathWall 常量 & 渲染

**File:** `public/src/engine/constants.js`, `public/src/render/room.js`

- [ ] `constants.js`: 新增 `CELL.DEATH_WALL = 5`
- [ ] `room.js`: 添加 `DEATH_WALL` 渲染分支 —— 使用红色/熔岩风格（区别于普通深绿 WALL）
- [ ] `room.js`: STONE_WALL 渲染调整（可选：使其看起来像可破坏的普通墙，而非即死墙）

**Acceptance:** DEATH_WALL tile 在游戏中显示为明显不同的风格（红色/尖刺/岩浆）。

---

## T2 — 修改碰撞检测逻辑

**File:** `public/src/engine/collision.js`

- [ ] `checkSnakeCollision()`: 将 WALL 和 STONE_WALL 的碰撞结果从 `'wall'` 改为 `'damage'`
- [ ] `checkSnakeCollision()`: 新增 `CELL.DEATH_WALL` 检测 → 返回 `['death']`
- [ ] `checkProjectileCollision()`: 确认子弹撞到普通 WALL 仍消失（不变）
- [ ] `checkProjectileCollision()`: 子弹撞到 DEATH_WALL 也消失

**Acceptance:**
- WALL / STONE_WALL → `['damage']`
- DEATH_WALL → `['death']`
- 其他地方调用 `checkSnakeCollision` 的地方兼容新返回值

---

## T3 — 修改碰撞处理（Tick 逻辑）

**File:** `public/src/engine/core.js`

- [ ] 移除 `collisions.includes('wall')` 分支
- [ ] 新增 `collisions.includes('damage')` 分支：length - 1，设置 `screenShake` 状态
- [ ] 新增 `collisions.includes('death')` 分支：`gameState = 'gameover'`
- [ ] 在 tick 末尾添加 `state.snake.length === 0 → gameover` 兜底检查
- [ ] 确保 `screenShake` 在每次 tick 中衰减（震度减少、计时减少）
- [ ] 添加 `screenShake` 状态字段到初始化 `createInitialState()`

**Acceptance:**
- 撞普通墙 → 长度减 1，不 gameover
- 撞即死墙 → 立即 gameover
- 长度归零 → gameover
- screenShake 状态正确衰减

---

## T4 — 实现屏幕震动（Render 层）

**File:** `public/src/render/renderer.js`, `public/src/render/room.js`

- [ ] `renderer.js`: 主渲染函数在调用 `renderRoom()` 前检查 `state.screenShake`
- [ ] 如果震动激活：`ctx.save()` → `ctx.translate(randomOffsetX, randomOffsetY)` → render → `ctx.restore()`
- [ ] 震动衰减算法：每 tick 乘以衰减因子（如 0.7），低于阈值时清除
- [ ] `core.js`: 确保 `screenShake` 状态在 tick 中被正确衰减

**参数调优（spike 结果）：**
- 初始偏移：±3px
- 持续时间：300ms（约 6-9 ticks）
- 衰减：指数衰减 α=0.7
- 频率：每 tick 重新随机

**Acceptance:**
- 撞墙时画面出现短暂、微小的随机偏移
- 震动在 300ms 内平滑衰减到不可见
- 不影响操作（偏移量很小）

---

## T5 — 生成器：DEATH_WALL 放置逻辑

**File:** `public/src/engine/generator.js`

- [ ] 在 `generateRoomTiles()` 中，为特定房间类型（如 GACHA 房间、特殊陷阱房间）添加 DEATH_WALL 簇
- [ ] 确保 DEATH_WALL 不阻挡门的关键通道（保留至少 3 格宽的通行路径）
- [ ] 确保 DEATH_WALL 在房间中的视觉可辨认（不被其他墙遮挡）
- [ ] 初始版本：仅在少数房间放置 DEATH_WALL（不超过总房间数的 20%，即 5×5 地图最多 5 个房间含即死墙）

**Acceptance:**
- DEATH_WALL 只出现在特定房间，不是所有房间都有
- 玩家总能在即死房间中找到安全路径
- 生成器不会在门正前方放置 DEATH_WALL

---

## T6 — 更新测试

**File:** `tests/metroidvania-snake.test.js`

- [ ] 新增测试：蛇撞普通墙 → length - 1，screenShake 被设置，gameState 保持 'playing'
- [ ] 新增测试：蛇撞 DEATH_WALL → 立即 gameover
- [ ] 新增测试：蛇长度=1时撞普通墙 → length=0 → gameover
- [ ] 新增测试：子弹撞 DEATH_WALL → 子弹消失
- [ ] 修改现有测试：原有 `'wall'` 碰撞测试改为 `'damage'` 预期

**Acceptance:** 所有测试通过（`npm test`）。

---

## T7 — 视觉文档 & 调参

**File:** `docs/DESIGN/15-metroidvania-snake-overhaul.md` (更新)

- [ ] 更新 DESIGN 文档中的 CELL 枚举表格，加入 DEATH_WALL
- [ ] 更新 DESIGN 文档碰撞部分反映新行为
- [ ] 记录屏幕震动参数（强度、持续时间、衰减因子）
- [ ] （可选）在 `docs/REFERENCE/` 中添加游戏调参记录

**Acceptance:** DESIGN 文档准确反映新碰撞行为。
