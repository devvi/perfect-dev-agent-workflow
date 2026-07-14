# PRD: 标题页添加键盘操作提示

## 1. 问题 / Problem

标题页当前已显示方向键移动、Z 发射、X 交互、ENTER 选择、SHIFT 暂停五项指令，但 SPACE 键的功能未被提及。游戏内 `keydown` 事件处理（`gameboy.html:451`）同时接受 `Enter` 和 `Space` 两个按键用于菜单选择（开始游戏 / 进入 ABOUT），然而标题画面只标注了 `ENTER`，玩家无法通过标题页获知 SPACE 同样可用。

## 2. 解决方案 / Solution

将 `renderTitleScreen()` 中第 66 行（当前为 `"ENTER  Select"`）改为 `"ENTER/SPACE  Select"`，明确告知 SPACE 键也可用于选择菜单项。

### 改动概览

| 文件 | 行号 | 当前内容 | 改为 |
|------|------|---------|------|
| `public/src/render/overlays.js` | 66 | `ctx.fillText('ENTER  Select', CANVAS_SIZE / 2, 310);` | `ctx.fillText('ENTER/SPACE  Select', CANVAS_SIZE / 2, 310);` |

### 其他方案（不推荐）

| 方案 | 说明 | 缺点 |
|------|------|------|
| 新增一行 `'SPACE  Select'` | 在 ENTER 行下方再写一行 | 指令列表过长，Y 坐标空间不足（下距菜单 `menuY=340` 仅 30px） |
| 底部提示行 `"Press SPACE to start"` | 在菜单下方或版本号附近添加独立提示 | 与现有 `ENTER Select` 语义重复，增加文字密度 |

## 3. 实现提示

- **改动人**：仅修改 `public/src/render/overlays.js` 第 66 行一个字符串字面量
- **零逻辑影响**：纯 UI 文本改动，不涉及游戏状态、菜单逻辑或输入处理
- **不影响测试**：当前测试（`metroidvania-snake.test.js`）仅检测版本号相关的 `v1.0.0` / `fillStyle` / `save/restore`，不检测指令文本
- **不影响 HTML controls-info**：`gameboy.html:43` 的 `.controls-info` 已显示 Space 对应「重新开始」，与本改动语义不同且互不冲突
- **坐标验证**：新字符串 `'ENTER/SPACE  Select'` 比原字符串 `'ENTER  Select'` 多 5 个字符，在 `10px monospace` / `textAlign = 'center'` 下宽度约 +50px，仍在 400px 画布内居中显示（左右各约 40px 余量），无需调整坐标
- **接受条件**：标题画面菜单项上方显示 `ENTER/SPACE  Select` 文本，CI 通过
