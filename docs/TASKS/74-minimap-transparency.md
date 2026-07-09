# Tasks: #74 — 小地图半透明 (Minimap Semi-Transparent)

| 字段 | 值 |
|------|----|
| Issue | #74 |
| 优先级 | P2 |

## Overview

使小地图背景半透明，让底部右下区域的游戏内容透过小地图可见。核心变更为 `public/src/render/minimap.js` 中背景透明度的单行调整。Design: `docs/DESIGN/74-minimap-transparency.md`.

## Phase 1: Core Rendering Change (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/render/minimap.js` | Change `fillStyle` alpha from `0.85` to `0.50` — single line change to the minimap background alpha value | 无 | P0 |

### Step 1.1 Detail

```js
// BEFORE:
ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';

// AFTER:
ctx.fillStyle = 'rgba(10, 10, 26, 0.50)';
```

**Risk:** Trivial — single character change in `0.85` → `0.50`

## Phase 2: Verify & Test (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `tests/metroidvania-snake.test.js` | Add unit test verifying alpha value in `fillStyle` is `0.50` | 1.1 | P1 |
| 2.2 | `tests/metroidvania-snake.test.js` | Add integration test that renders minimap with 4+ rooms and asserts no throw | 1.1 | P1 |
| 2.3 | Terminal | Run full test suite: `npm test` — confirm all existing tests pass | 1.1 | P1 |

## Phase 3: Visual Validation (P1)

| Step | Task | Criteria |
|------|------|----------|
| 3.1 | Load game in browser | Minimap renders at correct position |
| 3.2 | Visually confirm transparency | Player character is visible when standing in bottom-right minimap zone |
| 3.3 | Visually confirm room colors | All room types (green, gold, red, blue, fog) are distinguishable on minimap |
| 3.4 | Visually confirm player dot | Player position dot is clearly visible |
| 3.5 | Visually confirm grid & labels | Grid lines and "MAP" label remain readable |
| 3.6 | Edge case: dark room behind minimap | Cave/void room content shows through appropriately |
| 3.7 | Edge case: bright room behind minimap | White/dirt room content shows through but minimap colors still readable |

## Phase 4: Cleanup & PR (P2)

| Step | Task | 前置 |
|------|------|-------------|
| 4.1 | Review diff for unrelated changes | 1.1 |
| 4.2 | Add PR description referencing issue #74 with "Closes #74" | 4.1 |
| 4.3 | Open PR with label `enhancement` | 4.2 |

## Dependency Graph

```
Phase 1 (Core Change)
    │
    ├──► Phase 2 (Verify & Test)
    │
    └──► Phase 3 (Visual Validation)
              │
              └──► Phase 4 (Cleanup & PR)
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `public/src/render/minimap.js` | 修改（单行 alpha 值） | ±1 |
| `tests/metroidvania-snake.test.js` | 修改（新增测试） | +15 |

**Branch:** Implementation branch: `plan/74-minimap-transparency` (this plan)
Implementation PR will be on branch `impl/74-minimap-transparency`
