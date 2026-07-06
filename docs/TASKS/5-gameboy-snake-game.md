# Task Breakdown: GameBoy 风格贪吃蛇游戏

> Parent Issue: #5
> Agent: research-agent
> Date: 2026-07-06

---

## Overview

新建独立文件 `gameboy.html`，实现精确复刻 GameBoy 风格的贪吃蛇游戏。保留现有 `index.html` 不变。

**推荐方案:** Approach A (新建独立文件)

---

## Task Checklist

### 🎨 Visual Layer
- [ ] **T1.1 GameBoy 4-color palette**
  - 定义 4 色调色板：`#9bbc0f`（背景亮绿）、`#8bac0f`（像素亮绿）、`#306230`（像素深绿）、`#0f380f`（边框/文字最深绿）
  - 蛇身、食物、背景使用调色板中的颜色
- [ ] **T1.2 LCD pixel grid effect**
  - 每个像素方块四周留 1px 间隙，模拟 GameBoy LCD 物理像素间距
  - 用 `ctx.fillRect(x*S+1, y*S+1, S-2, S-2)` 而非全格填充
- [ ] **T1.3 Scanline overlay (optional but recommended)**
  - 每隔一行绘制半透明暗线，模拟 LCD 扫描线效果
  - 透明度约 3-5%，不可过度影响可玩性
- [ ] **T1.4 GameBoy console shell frame**
  - 屏幕四周绘制 GameBoy 掌机外壳装饰边框（紫灰/深灰色外壳）
  - 添加电池指示灯、Nintendo GAME BOY 标签文字
  - 使用像素风格字体（或系统 monospace + CSS letter-spacing）

### 🎮 Game Logic Layer
- [ ] **T2.1 Core snake engine (reuse from index.html)**
  - 20×20 网格，每格 20px
  - 蛇初始长度为 3，位于屏幕中央
  - 箭头键控制方向，反向按键忽略
  - 吃食物增长，撞墙/撞己结束
- [ ] **T2.2 Victory condition (fill entire grid)**
  - 当蛇长度 = 400 时，触发胜利画面（非 Game Over）
  - 显示 "YOU WIN!" 等庆祝文案
- [ ] **T2.3 Restart mechanism**
  - 游戏结束后按 Space/Enter 重新开始
  - 或点击覆盖层上的按钮
  - 重启后蛇回到初始位置，分数归零

### 🖥️ Page Structure
- [ ] **T3.1 Single-file HTML**
  - 全部 inline CSS + JS，零外部依赖
  - `<meta charset="UTF-8">`, `<meta viewport>` 移动端适配
  - HTML 语义化结构：header(标题/分数) → canvas → footer
- [ ] **T3.2 Responsive canvas sizing**
  - Canvas 物理尺寸 400×400 (20×20 网格 × 20px)
  - CSS 缩放：`max-width: 100%; height: auto`
  - 高 DPI 屏幕使用 `devicePixelRatio` 缩放（保留像素感）
- [ ] **T3.3 Keyboard accessibility**
  - 键盘焦点管理：页面加载后自动聚焦
  - 游戏结束覆盖层可通过键盘操作

---
