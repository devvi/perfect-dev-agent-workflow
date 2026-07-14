# PRD: 标题页添加键盘操作提示

## 1. 背景 / Problem

标题页展示交互式菜单（START GAME / ABOUT），支持键盘导航（↑↓ 切换菜单项、Enter/Space 确认选择）。当前标题页的指令列表仅展示通用按键说明（方向键移动、Z/X 攻击交互、Shift 暂停），但缺少对标题菜单本身的操作引导。新玩家在进入标题页时，可能不清楚需要通过键盘操作来启动游戏或查看 About 信息。

## 2. 需求 / Solution

在标题画面 `renderTitleScreen()` 的指令列表末尾、菜单项上方，添加一行标题页专属操作提示，明确告知玩家如何操作菜单。

### 具体改动

| 文件 | 位置 | 添加内容 |
|------|------|---------|
| `public/src/render/overlays.js` | `renderTitleScreen()` — 菜单渲染前（SHIFT Pause 之后，y=328 与 menuY=340 之间） | `ctx.fillText('↑ ↓  Navigate  ·  ENTER/SPACE  Select', CANVAS_SIZE / 2, 346);` |

- **坐标**：`(CANVAS_SIZE / 2, 346)` — 位于 SHIFT Pause (y=328) 下方 18px、菜单项 (y=340) 上方 12px 处
- **样式**：`#aaa`（略暗于指令文字，视觉上作为过渡）、`10px monospace`、居中
- **改动范围**：纯文本新增一行，零逻辑影响。菜单起始 y 坐标保持 340 不变，新行位于 y=346 即在菜单项之间视觉上形成分隔效果。

## 3. 完成条件

- [ ] PRD 已创建
- [ ] `renderTitleScreen()` 中已添加键盘操作提示文本
- [ ] CI 通过
- [ ] 视觉确认标题页在指令列表和菜单之间显示导航提示
