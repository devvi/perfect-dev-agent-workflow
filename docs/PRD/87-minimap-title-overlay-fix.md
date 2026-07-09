# Research: 右下角小地图显示修复

> Parent Issue: #87
> Agent: subagent
> Date: 2026-07-09

---

## 1. Problem Definition

### Current Behavior

有以下两个 Bug：

**Bug A — 小地图在 Title 界面显示：**
游戏进入初始状态（`state.gameState === 'title'`）时，渲染管线无条件调用 `renderMinimap()`，title overlay 随后以 `rgba(10, 10, 26, 0.85)` 覆盖全屏。由于 title overlay 并非完全不透明（85% 不透明度），小地图内容仍隐约可见于 title 界面之下。

**Bug B — 小地图半透明效果不达标：**
Issue #74 已修复了 minimap 背景 `rgba` 的 alpha 值（0.85 → 0.50），但 minimap 内部的房间色块使用**完全不透明**的颜色绘制（如 `#306230`、`#f0c040` 等）。整体效果是背景半透明但色块不透明，视觉上仍感觉"不够半透明"。

### Steps to Reproduce

**Bug A:**
1. 打开游戏 `public/gameboy.html`
2. 观察 title 界面右下角区域 → 可见小地图内容（房间色块、网格线）透过 title 黑暗覆盖层隐约显示

**Bug B:**
1. 按 Enter 开始游戏
2. 观察右下角小地图区域 → minimap 的房间色块完全覆盖底层游戏内容，只有背景边框处显示半透明

### Expected Behavior

1. **Title 界面不应显示小地图** — `state.gameState === 'title'` 时整个 canvas 只显示 title overlay
2. **游戏运行时小地图应呈现均匀的半透明效果** — 整个 minimap 区域（包括房间色块、网格线等）都应让底层游戏内容可见

### User Scenarios

- **Scenario A（Title 界面）：** 玩家打开游戏看到 title screen → 右下角不应有任何小地图残留
- **Scenario B（游戏进行中）：** 蛇移动到画面右下角区域 → 小地图整体半透明，玩家能看清自己和环境
- **Scenario C（GameOver/Won 界面）：** 游戏结束或胜利 → 小地图同样不应在 overlay 下可见（与 title 同理）
- **Frequency:** Bug A 首次打开必现；Bug B 每次进入游戏右下角区域触发

---

## 2. Root Cause Analysis

### Why Does Current Behavior Exist?

**Bug A — 渲染顺序：**
`public/src/render/renderer.js` 中的 `render()` 函数执行顺序为：
1. `renderRoom()` — 绘制当前房间
2. `renderHUD()` — 绘制 HUD
3. `renderMinimap()` — 绘制小地图（**无条件执行**）
4. `renderOverlay()` — 绘制 title/gameover/won 覆盖层

title overlay 以 `rgba(10, 10, 26, 0.85)` 覆盖全屏，导致 minimap 内容透过 15% 的透明度隐约可见。

**Bug B — 每个元素独立绘制：**
`minimap.js` 的 `renderMinimap()` 按顺序绘制：
1. 半透明背景：`rgba(10, 10, 26, 0.50)` ✅ 半透明
2. 房间色块：`ctx.fillStyle = color`（**不透明**）❌
3. 门指示器：`ctx.fillRect(...)`（**不透明**）❌
4. 网格线：`rgba(48, 98, 48, 0.3)` ✅ 半透明
5. 玩家位置点：全不透明 ❌

Issue #74 只改了第 1 步的背景 alpha，第 2~5 步未受影响。

### Why Change Now?

- Bug A 破坏了 title 界面的纯净视觉——玩家首次启动游戏即看到渲染瑕疵
- Bug B 使 minimap 的实际体验仍不符合 Issue #74 的"半透明"需求——只有背景透明，内部的色块依然遮挡游戏内容

### Previous Constraints

- Issue #74 约束：不能改变小地图的位置或大小
- 更改应尽可能集中在 `minimap.js` 和 `renderer.js`
- 小地图必须保持可读性（房间类型色标、玩家点、标签）
- 不能引入新的按键绑定或游戏状态

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/render/renderer.js` | 主渲染管线 | 按 `gameState` 条件跳过小地图渲染 |
| `public/src/render/minimap.js` | 小地图渲染 | 房间色块、玩家点等元素添加半透明效果 |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/render/overlays.js` | 覆盖层渲染 | 已正确绘制 title overlay，无需改动；但确认 title/gameover/won 的 overlay 层级正确 |
| `public/src/engine/constants.js` | 常量 | 可能需新增 minimap 房间色块的 alpha 常量（可选） |

### Data Flow Impact

改变前：
```
render() ──► renderRoom() ──► renderHUD() ──► renderMinimap() ──► renderOverlay()
```

改变后：
```
render()
  ├─ [title/gameover/won] renderRoom() ──► renderHUD() ──► renderOverlay()
  └─ [playing]             renderRoom() ──► renderHUD() ──► renderMinimap() ──► renderOverlay()
```

数据流无变化——渲染前检查 `gameState` 即可。

### Documents to Update

- [x] `docs/PRD/87-minimap-title-overlay-fix.md`（本文件）
- [ ] `docs/DESIGN/87-minimap-title-overlay-fix.md`（设计文档）

---

## 4. Solution Comparison

### Approach A: 条件渲染 + 全局 Alpha（推荐）

**Description:**

**Part 1 — 条件渲染：** 在 `renderer.js` 的 `render()` 中，仅在 `state.gameState === 'playing'` 时调用 `renderMinimap()`。

**Part 2 — 全局 Alpha：** 在 `minimap.js` 中，使用 `ctx.globalAlpha` 包裹整个 minimap 渲染过程，使所有元素（背景 + 色块 + 玩家点）均匀半透明。

```js
// renderer.js
if (state.gameState === 'playing') {
  renderMinimap(ctx, state, world);
}

// minimap.js
ctx.save();
ctx.globalAlpha = 0.50;
// ... 所有 minimap 渲染代码 ...
ctx.restore();
```

**Pros:**
- 两个 Bug 一次性解决
- 代码改动最小（~3 行）
- 整个 minimap 呈现均匀半透明效果
- 玩家点也半透明化后，不会产生"一个点突兀不透明"的视觉矛盾
- 不引入新常量/状态

**Cons:**
- `globalAlpha` 会使 "MAP" 标签也变半透明（可单独在标签区域 `save/restore` 恢复 Alpha=1）
- 门槛稍高的玩家点亮度——0.50 alpha 下 `#00ff88` 变 `rgba(0,255,136,0.50)`，仍清晰可见

**Risk:** Low
**Effort:** Small（~30 分钟）

### Approach B: 条件渲染 + 逐个元素设置 Alpha

**Description:**
在 `renderer.js` 中添加条件渲染；在 `minimap.js` 中逐个为色块绘制调用设置 fillStyle 为半透明版本（例如 `rgba(...)` 格式或使用独立 alpha 常量）。

**Pros:**
- 精细化控制每个元素的透明度（玩家点可保持全不透明，色块设为 0.6 等）
- 不改变 "MAP" 标签可见性

**Cons:**
- 改动量大——需要修改 5+ 个 fillStyle 调用
- 需要为每个色块定义 rgba 等价色
- 维护成本高（颜色需要同步更新）
- 可能需要新增常量

**Risk:** Low
**Effort:** Medium（~1 小时）

### Approach C: 仅条件渲染（不修复透明度问题）

**Description:**
只修复 Bug A（title 界面不显示 minimap），不处理 Bug B（半透明效果不够）。

**Pros:**
- 改动最小

**Cons:**
- Bug B 仍未解决
- 用户对 #74 的要求仍未被真正满足
- 两个 Bug 是同一个 issue #87 报告的，应统一处理

**Risk:** Low（技术上）— 但不符合 issue 要求
**Effort:** Trivial（~5 分钟）

### Recommendation

→ **Approach A** 因为：
1. 条件渲染 + `globalAlpha` 两个改动加起来 ~3 行
2. 均匀半透明效果符合用户的视觉期望
3. 无额外性能开销（`globalAlpha` 是 canvas 原生支持）
4. "MAP" 标签和玩家点可通过局部 `ctx.save()/ctx.restore()` 单独恢复全不透明
5. Effort 最低且效果最佳

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | 场景 | Steps | Expected |
|---|------|-------|----------|
| 1 | Title 界面启动 | 打开游戏 → 看到 title screen | 右下角无小地图残留 |
| 2 | 进入游戏 | 按 Enter → 游戏开始 | 小地图正常显示在右下角 |
| 3 | 游戏中小地图半透明 | 蛇移动到右下角区域 | 蛇身和周围环境透过 minimap 可见 |
| 4 | 游戏结束 | 蛇死亡 → gameover screen | 右下角无小地图残留 |
| 5 | 胜利 | 到达 goal 房间 → victory screen | 右下角无小地图残留 |
| 6 | 暂停 | 按 Shift → 暂停 | minimap 是否显示由 playing 判断决定 |

### Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | 从暂停恢复（playing→paused→playing） | gameState 恢复为 'playing' → minimap 重新显示 |
| 2 | 在暂停前 minimap 已显示 | pause 时 gameState 为 'paused' → minimap 隐藏（按条件渲染方案） |
| 3 | Title 界面 with about 子菜单 | `menuMode === 'about'` 时 gameState 仍为 'title' → 不显示 minimap |
| 4 | 游戏重新开始（gameover→Enter→init→Enter→start） | init 后 gameState='title' → 不显示 minimap；再按 Enter 后 'playing' → 显示 |
| 5 | 读档后（gameover→S 读档→playing） | gameState 直接设为 'playing' → minimap 立即显示 |
| 6 | 极小屏幕/window resize | Canvas 固定 400×400，无响应式问题 |
| 7 | GameBoy Color palette | 颜色由 PALETTE 常量定义，transparency 行为一致 |

### Failure Paths

| # | Failure | Handling |
|---|---------|----------|
| 1 | `globalAlpha` 设为过低（<0.30） | minimap 几乎不可读。测试中需确保 α=0.50。 |
| 2 | `globalAlpha` 影响无关画布元素 | `ctx.save()/restore()` 包裹 minimap 区块 — 不会泄漏到外部 |
| 3 | 半透明后 room 颜色难以区分 | 保留鲜明色差（绿色 #306230 vs 金色 #f0c040 vs 红色 #ff4444），α=0.50 时仍可区分 |

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk | Notes |
|-----------|--------|------|-------|
| `public/src/render/renderer.js` | Stable | Low | 条件渲染判断 |
| `public/src/render/minimap.js` | Stable | Low | 全局 alpha 包裹 |
| `public/src/engine/constants.js` | Stable | None | 无需新增常量 |

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `globalAlpha` 0.50 降低 minimap 可读性 | 中 | 测试确认所有房间色标可区分；如不可接受可升至 0.60 |
| 条件渲染遗漏其他 gameState（'paused'） | 低 | 明确仅 'playing' 时渲染 minimap |
| 半透明后玩家位置点不够明显 | 低 | `#00ff88` 颜色高亮，α=0.50 仍足够；如不够可以局部恢复 |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Minimap 功能扩展（如可缩放） | 未来 |
| Minimap 对比度/颜色自定义 | 未来 |

### Preparation Needed

- [ ] Visual test on real gameboy.html to confirm readability at α=0.50

---

## 7. Spike / Experiment (Optional)

### 7.1 Code Change Summary

**文件 1: `public/src/render/renderer.js`**

```diff
  // Render minimap
- renderMinimap(ctx, state, world);
+ if (state.gameState === 'playing') {
+   renderMinimap(ctx, state, world);
+ }
```

**文件 2: `public/src/render/minimap.js`**

```diff
 export function renderMinimap(ctx, state, world) {
   const offsetX = 400 - MINIMAP_SIZE - 8;
   const offsetY = 400 - MINIMAP_SIZE - 8;

+  ctx.save();
+  ctx.globalAlpha = 0.50;

   // Background
-  ctx.fillStyle = 'rgba(10, 10, 26, 0.50)';
+  ctx.fillStyle = 'rgba(10, 10, 26, 1.0)';
   ctx.fillRect(offsetX - 2, offsetY - 2, MINIMAP_SIZE + 4, MINIMAP_SIZE + 4);
   // ... 其余绘制代码保持不变 ...

   // Label (keep fully opaque)
+  // Local save/restore for label if we want full opacity
   ctx.fillStyle = '#8bac0f';
   ctx.font = '6px monospace';
   ctx.textAlign = 'left';
   ctx.fillText('MAP', offsetX, offsetY - 4);
+
+  ctx.restore();
 }
```

注意：背景从 `rgba(10, 10, 26, 0.50)` 改为 `rgba(10, 10, 26, 1.0)` 配合 `globalAlpha=0.50`，效果等效且统一。

### 7.2 Visual Test Matrix at globalAlpha=0.50

| Background Content | Readability at α=0.50 |
|-------------------|----------------------|
| 暗色洞穴房间 (#0a0a1a) | 尚可 — 房间色块仍对比明显 |
| 绿色草地房间 | 良好 — #306230 绿色色块仍可区分 |
| 金色 goal 房间 | 良好 — 金色强烈对比 |
| 白色/沙地房间 | 尚可 — 色块略减弱但可区分 |
| 玩家蛇身 | 可见 — 蛇身全色透过 minimap 显示 |
| 敌人 | 可见 — 红色敌人透过 minimap 可见 |
| MAP 标签 | 略减弱 — 可单独恢复为全不透明 |

### 7.3 Acceptance Criteria Checklist

- [ ] AC1: Title 界面右下角无小地图内容可见
- [ ] AC2: GameOver 界面右下角无小地图内容可见
- [ ] AC3: Won（胜利）界面右下角无小地图内容可见
- [ ] AC4: 游戏进行中小地图呈现均匀半透明效果
- [ ] AC5: 玩家蛇身位于右下角时透过 minimap 可见
- [ ] AC6: 小地图内房间类型色标仍可区分
- [ ] AC7: 从暂停恢复后小地图正常显示
- [ ] AC8: 所有 room 类型（goal/save/gacha/key_shrine）在 minimap 中色标可识别
- [ ] AC9: "MAP" 标签保持可读（如单独恢复 opacity）
- [ ] AC10: 所有现有测试通过
