# PRD: 标题页添加版本号显示

## 背景

标题画面目前缺少版本号，玩家和开发者在调试时无法快速确认当前运行版本。Issue #200 提出在标题页右下角添加版本号 "v1.0.0"。

## 需求

在标题画面右下角添加版本号文本。具体要求：

- **格式**：硬编码 `"v1.0.0"`
- **位置**：画面右下角，坐标 `(CANVAS_SIZE - 10, CANVAS_SIZE - 10)`，右对齐
- **样式**：灰色半透明小字（`rgba(255, 255, 255, 0.3)`，`10px monospace`）
- **改动范围**：在 `renderTitleScreen()` 末尾增加 `ctx.save()`/`ctx.restore()` 包裹的 `ctx.fillText()` 调用

## 实现提示

- **实际文件**：`public/src/render/overlays.js` 中的 `renderTitleScreen()` 函数（非 `public/gameboy.html`，issue 标题中的路径需修正）
- `CANVAS_SIZE = 640`，右下角坐标 `(630, 630)`
- 使用 `ctx.save()`/`ctx.restore()` 包裹，不污染画布上下文状态
- 无需修改其他文件，不影响现有菜单逻辑或游戏状态
- 已有对应测试用例 UT1–UT4 覆盖版本号存在性、样式、对齐和位置
