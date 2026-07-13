# 1. 游戏概述

> 完美蛇踪是一款 Metroidvania 风格的贪吃蛇游戏。
> 玩家控制一条蛇在 5×5 的房间网格中探索、战斗、成长，
> 最终击败 BOSS "Blue Hammer" 通关。

---

## 1.1 基本信息

| 项目 | 值 |
|------|------|
| 游戏名称 | 完美蛇踪 |
| 英文代号 | Metroidvania Snake |
| 游戏类型 | 迷宫探险 + 动作射击 |
| 渲染引擎 | Canvas 2D (原生 JavaScript) |
| 游戏核心 | 蛇的移动 + 房间探索 + 战斗成长 |

**标题画面文案：**

```
🐍 完美蛇踪
秘境探险
Explore. Fight. Eat. Grow.
```

## 1.2 核心循环

玩家在 5×5 的房间地图中移动蛇，核心循环为：

```
探索房间 → 拾取食物（↑蛇身长度） → 遇到敌人（射击/躲避）
  → 找到钥匙（开锁） → 到达 BOSS 房间 → 击败 BOSS → 胜利
```

蛇的长度既是**资源**（越长越慢，射击消耗长度），也是**目标**（长度影响通过 Size Gate 的能力）。

## 1.3 控制方式

| 按键 | 动作 |
|------|------|
| ⬆ ⬇ ⬅ ➡ | 改变蛇的移动方向 |
| Z | 发射射弹（消耗尾部一节） |
| X | 交互（抽奖机/存档点） |
| Space / Enter | 选择菜单 / 关闭 Boss 介绍 |
| Shift | 暂停/恢复 |
| S | 游戏结束时读取存档 |

## 1.4 游戏状态机

```javascript
TITLE    → Space/Enter → PLAYING
PLAYING  → 死亡         → GAMEOVER
PLAYING  → 进入 BOSS 房  → BOSS_INTRO
BOSS_INTRO → Space或方向键 → PLAYING
PLAYING  → 到达 GOAL 房  → WON
PLAYING  → Shift        → PAUSED
PAUSED   → Shift        → PLAYING
GAMEOVER → Space/Enter  → TITLE (重新开始)
GAMEOVER → S            → PLAYING (读取存档)
WON      → Space/Enter  → TITLE (重新开始)
```

## 1.5 存档机制

- 进入 SAVE 房间时自动存档（localStorage）
- 游戏结束时按 S 读取最后一次存档
- 存档包含：蛇的位置/方向、房间探索状态、钥匙收集、道具库存
