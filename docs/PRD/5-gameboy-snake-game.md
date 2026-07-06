# Research: GameBoy 风格贪吃蛇游戏

> Parent Issue: #5
> Agent: research-agent
> Date: 2026-07-06

---

## 1. Problem Definition

### Current Behavior
项目有一个现有的贪吃蛇游戏（`index.html`），采用深色赛博朋克风格配色（深蓝背景 `#1a1a2e`，红/蓝色蛇，黄色食物），与 GameBoy 复古风格无关。

### Expected Behavior
新增一个独立的 GameBoy 风格的贪吃蛇游戏页面（或替代方案），其视觉风格精确复刻任天堂 GameBoy 经典掌机的液晶屏幕特征：
- 黄绿色 LCD 屏幕底色（#8bac0f / #9bbc0f）
- 4 色调色板（最浅绿→最深绿）模拟单色液晶
- 像素颗粒之间的物理间隙
- 可选扫描线效果
- 游戏区域外 GameBoy 掌机外壳装饰边框
- 标准贪吃蛇玩法，方向键控制

### User Scenarios
- **Scenario A (复古游戏爱好者):** 用户打开页面后立即感受到 90 年代 GameBoy 的 nostalgia 体验，像素画面精确还原手持掌机的视觉感受。
- **Scenario B (新用户首次访问):** 干净的复古游戏页面，无需任何说明即可上手游玩，方向键控制，吃食物增长，撞墙或撞自己结束。
- **Scenario C (移动端用户):** 在手机浏览器上也能操作（需要补充触控支持或虚拟方向键）。

---

## 2. Design Intent

### Why Does Current Behavior Exist?
现有 `index.html` 是 Issue #1 的成果，当时选择了深色现代风格作为 MVP。Issue #5 则是全新的视觉方向——围绕 GameBoy 复古美学重建整个体验。

### Why Change Now?
完成了一个功能性贪吃蛇 MVP 后，项目的第二阶段是提升视觉品质和主题差异化。GameBoy 复古风格是游戏开发中的经典主题，具有强烈的识别度和情感共鸣，能有效地将本项目的多个游戏统一在怀旧主题下。

### Previous Constraints
- 必须保持单文件 HTML（inline CSS/JS），零外部依赖
- Canvas 渲染，像素化渲染 (`image-rendering: pixelated`)
- 蛇的移动逻辑可以复用已有实现，但需要适配新的网格尺寸和视觉层级

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `index.html`（或新建 `gameboy.html`） | Game UI + Engine | 全新 GameBoy 主题页面。如果替换现有 index.html，需保留回退；建议新建文件避免破坏已有页面。 |
| `public/about.html` | 导航/关于 | 如果新建文件，about 页需添加指向新游戏的链接 |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `README.md` | 文档 | 需要更新项目描述，新增游戏入口链接 |
| `vercel.json` | 部署配置 | 如果新建路由，可能需要调整 Vercel 路由规则 |

### Data Flow Impact
游戏逻辑数据流与现有实现一致：
1. `keydown` 事件 → 方向更新 (`nextDir`)
2. `setInterval` tick → 蛇位置计算 → 碰撞检测 → 食物生成
3. `draw()` → Canvas 2D 上下文渲染

主要变化在**渲染层**：颜色调色板、像素间隙绘制、扫描线叠加、GameBoy 外壳边框。

### Documents to Update
- [ ] `docs/PRD/5-gameboy-snake-game.md` (本文件)
- [ ] `docs/TASKS/5-gameboy-snake-game.md`
- [x] `README.md`（添加新游戏入口）
- [ ] `docs/DESIGN/gameboy-snake.md` (Plan 阶段创建)

---

## 4. Solution Comparison

### Approach A: 新建独立文件 `gameboy.html`
- **Description:** 创建一个全新的 HTML 文件 `gameboy.html`，与现有的 `index.html` 并存。使用完整 GameBoy 外壳视觉效果（屏幕边框、指示灯、字体），游戏逻辑从现有代码重构优化。Vercel 部署为 `/gameboy` 路由。
- **Pros:**
  - 不破坏现有游戏，用户可以访问两种风格
  - GameBoy 专属 UI（外壳、标签、指示灯）更容易实现
  - 独立迭代，便于测试和回滚
- **Cons:**
  - 代码重复（蛇的逻辑与 index.html 基本一致）
  - 需要配置 Vercel 路由（或多页面入口）
  - 两个 HTML 文件增加维护成本
- **Risk:** Low — 与现有代码完全隔离
- **Effort:** 中等（约 2-3 小时）

### Approach B: 改造现有 `index.html`，增加主题切换
- **Description:** 在现有 `index.html` 中添加主题切换机制（CSS 类切换 + 颜色变量），GameBoy 风格作为可选主题。通过 URL 参数 `?theme=gameboy` 或页面内按钮切换。
- **Pros:**
  - 单一文件维护，无代码重复
  - 用户可切换风格，获得两种体验
  - 部署简单，无需调整路由
- **Cons:**
  - 单文件代码复杂度显著增加（主题系统 + 两种风格的样式/渲染逻辑）
  - GameBoy 外壳 UI（指示灯、边框标签）与现有页面布局冲突，强行嵌入不自然
  - Canvas 绘制逻辑需要同时支持两套颜色方案和像素间隙模式
- **Risk:** Medium — 现有稳定页面可能因重构引入回归
- **Effort:** 较高（约 4-6 小时）

### Recommendation
→ **Approach A** 因为：
1. GameBoy 主题需要完整的外壳 UI（屏幕边框、标签、指示灯），这与现有页面布局不兼容
2. 项目目标是展示多个游戏/主题，独立文件是更好的扩展模式
3. 风险最低——不碰稳定代码
4. 未来可以有更多复古主题（GBA、NES 等），每个独立文件是自然的架构

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 用户打开 `/gameboy`（或 `gameboy.html`）
2. 屏幕上出现 GameBoy 风格的游戏界面，蛇在初始位置（中央）
3. 按箭头键开始游戏，蛇向对应方向移动
4. 蛇头碰到食物→蛇身增长+1格，分数+10
5. 食物出现在新的随机位置（不在蛇身上）
6. 游戏继续直到撞墙或撞自己
7. 游戏结束，显示最终分数，按 空格/回车 重启

### Edge Cases
1. **蛇瞬间回头自杀：** 按相反方向键后，直接撞到自己脖颈（第2节）。处理方式：当前移动方向的反方向按键应被忽略（已有逻辑 `!(k.x+dir.x===0 && k.y+dir.y===0))`）。
2. **满屏占满：** 蛇填满整个网格（20×20=400格）时获胜。需要检测蛇长度 = 总格数时触发胜利画面，而非撞墙判定。
3. **键盘连按导致的方向抖动：** 用户在两次 tick 之间快速按多个方向键，可能导致蛇在下一个 tick 使用无效方向。需要限制 tick 内只处理一个输入。
4. **窗口尺寸变化：** 浏览器窗口缩放后 Canvas 保持比例。需要用 CSS `max-width: 100%` + 固定宽高比，或者自动缩放 Canvas 像素尺寸。

### Failure Paths
1. **Canvas 不支持：** 极老旧浏览器。降级行为：显示 "您的浏览器不支持 Canvas，请升级浏览器" 替代文字。
2. **键盘事件被遮挡：** 全屏覆盖层（游戏结束弹窗）需要透传键盘事件，或弹窗中的按钮能获得焦点且可键盘操作。

> 这些直接成为 Plan 阶段的测试用例骨架。

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| 现有 snake 游戏逻辑 (index.html) | Stable | Low — 仅作参考，不是代码依赖 |
| Canvas API (浏览器原生) | Stable | Low — 所有现代浏览器支持 |
| browserslist (ES6+ 支持) | Stable | Low — 不使用 Babel |

### Blocks
| Future Work | Priority |
|-------------|----------|
| 添加移动端触控支持（虚拟 D-pad） | Optional (Post-MVP) |
| GameBoy 开机动画效果 | Optional (Post-MVP) |
| 高分记录 (localStorage) | Optional (Post-MVP) |

### Preparation Needed
- [ ] 无特殊准备，浏览器运行即可

---

## 7. Spike / Experiment (Optional)

无。GameBoy 配色和像素效果已有成熟实现方案，Canvas 像素间隙通过 `fillRect` 的偏移绘制即可实现，无需原型验证。
