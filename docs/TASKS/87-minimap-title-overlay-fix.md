# Tasks: #87 — 右下角小地图显示修复

| 字段 | 值 |
|------|----|
| Issue | #87 |
| 优先级 | P1 |

## Overview

修复两个 minimap 显示 Bug：(A) title/gameover/won 界面小地图残留显示，(B) minimap 内房间色块未半透明。方案为 renderer.js 添加 gameState 条件渲染 + minimap.js 使用 globalAlpha 统一半透明。详见 `docs/DESIGN/87-minimap-title-overlay-fix.md`。

## Phase 1: 条件渲染 + 全局 Alpha (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/render/renderer.js` | Wrap `renderMinimap()` in `if (state.gameState === 'playing')` guard | 无 | P0 |
| 1.2 | `public/src/render/minimap.js` | (a) Wrap all minimap drawing in `ctx.save()/ctx.globalAlpha=0.50/ctx.restore()`; (b) Change background alpha from 0.50 to 1.0; (c) Local save/restore for "MAP" label at `globalAlpha=1.0` | 无 | P0 |
| 1.3 | Manual visual regression | Load `gameboy.html` and verify: title no minimap, playing has minimap, gameover no minimap | 1.1, 1.2 | P0 |

## Phase 2: 测试与验证 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `tests/renderer.test.js` (或类似) | Add test case: minimap not rendered when `gameState !== 'playing'` | 1.1 | P1 |
| 2.2 | `tests/minimap.test.js` (或类似) | Add test case: verify `ctx.globalAlpha` is set to 0.50 during minimap render and restored after; verify label uses `globalAlpha=1.0` | 1.2 | P1 |
| 2.3 | Manual edge-case test | Test: playing→paused→playing, title→about menu, save-load transition, palette variants | 1.3, 2.1, 2.2 | P1 |

## Dependency Graph

```
Phase 1 ──────────────────
├─ 1.1 (renderer.js guard) ───────┐
├─ 1.2 (minimap.js alpha) ────────┤
└─ 1.3 (manual visual check) ←────┤
                                  │
Phase 2 ──────────────────        │
├─ 2.1 (renderer unit tests) ←─ 1.1
├─ 2.2 (minimap unit tests) ←── 1.2
└─ 2.3 (edge-case manual tests) ←─ 1.3, 2.1, 2.2
                                  │
All done ──────────────────────────┤
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `public/src/render/renderer.js` | 修改 | +3 / -1 |
| `public/src/render/minimap.js` | 修改 | +6 / -1 |
| `tests/renderer.test.js` | 新增测试 | +15 |
| `tests/minimap.test.js` | 新增测试 | +20 |
