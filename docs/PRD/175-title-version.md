# PRD: 标题页显示版本号

## 背景

标题页目前没有版本信息，玩家和开发者在调试时无法快速确认当前运行的版本。Issue #175 提出在标题页右下角增加版本号显示。

## 需求

在标题画面（`public/src/render/overlays.js` 中的 `renderTitleScreen` 函数）右下角添加一行版本号文本。具体要求：

- **格式**：硬编码 `"v1.0.0"`
- **位置**：画面右下角，坐标约为 `(CANVAS_SIZE - 10, CANVAS_SIZE - 10)`，右对齐
- **样式**：灰色半透明小字（`rgba(255, 255, 255, 0.3)`，`10px monospace`）
- **改动范围**：在 `renderTitleScreen()` 末尾增加一行 `ctx.fillText()` 调用

## 实现提示

`CANVAS_SIZE = 640`，右下角坐标可计算为 `(CANVAS_SIZE - 10, CANVAS_SIZE - 10)`，需将 `textAlign` 设为 `'right'` 以确保文本不溢出画面。无需修改其他文件，不影响现有菜单逻辑或游戏状态。
