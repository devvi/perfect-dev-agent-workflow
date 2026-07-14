# PRD: 标题页指令列表添加 Shift Pause 提示

## 1. 背景 / Problem

标题页当前显示操作提示（方向键移动、Z 发射、X 交互、ENTER 选择），但缺少暂停功能的提示。玩家在首次进入标题页时无法获知如何暂停游戏。

## 2. 需求 / Solution

在标题画面 `renderTitleScreen` 函数的指令列表末尾添加一行文本，提示玩家按 Shift 键暂停游戏。

### 具体改动

| 文件 | 位置 | 添加内容 |
|------|------|---------|
| `public/src/render/overlays.js` | 第 66 行后 (ENTER Select 之后) | `ctx.fillText('SHIFT  Pause', CANVAS_SIZE / 2, 328);` |

- **坐标**：`(CANVAS_SIZE / 2, 328)` — 位于 ENTER Select (y=310) 下方 18px
- **样式**：继承当前指令列表样式（`#ccc`、`10px monospace`、居中）
- **改动范围**：纯文本新增一行，零逻辑影响

## 3. 实现提示

- 无需修改其他文件
- 不影响现有菜单逻辑或游戏状态
- 不影响测试（纯 UI 文本）

## 4. 完成条件

- [x] PRD 已创建
- [ ] 已在 `renderTitleScreen()` 中第 66 行后添加指令文本
- [ ] CI 通过
- [ ] 视觉确认标题页显示 "SHIFT  Pause" 提示
