# Tasks: #15 — 银河城风格贪吃蛇重构

| 字段 | 值 |
|------|----|
| Issue | #15 |
| 优先级 | P0 |

## Overview

将经典贪吃蛇游戏重构为银河城(Metroidvania)风格：引入多房间地图系统、小地图与迷雾、攻击/敌人系统、增强食物系统、存档与隐藏房间，以及完整 UI/UX 整合。Agent: research-agent, Date: 2026-07-07。

## Phase 1: 地图引擎与房间系统（核心架构重写）(P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `public/src/engine/world.js` (新) | 设计 Room / WorldMap 数据结构（房间尺寸、门位置、房间类型枚举） | 无 | P0 |
| 1.2 | `public/src/engine/generator.js` (新) | 实现地图程序化生成算法（可选：Random Walker / BSP / Cellular Automata） | 1.1 | P0 |
| 1.3 | `public/src/engine/generator.js` | 实现房间连通性保证算法（钥匙分配 + 解可达性验证） | 1.2 | P0 |
| 1.4 | `public/src/engine/core.js` | 实现蛇在世界坐标中的移动（房间内网格坐标 + 房间切换逻辑） | 1.1 | P0 |
| 1.5 | `public/src/engine/core.js` | 实现门系统：房间间过渡、长度锁判定、钥匙解锁判定 | 1.4 | P0 |
| 1.6 | `tests/metroidvania-snake.test.js` | 地图生成测试：100 次生成，验证连通性 100% | 1.3 | P0 |
| 1.7 | `tests/metroidvania-snake.test.js` | 房间切换测试：蛇从门穿出时坐标正确转换 | 1.4 | P0 |
| 1.8 | `tests/metroidvania-snake.test.js` | 长度锁测试：大于/等于/小于要求长度时的正确通过/阻挡 | 1.5 | P0 |

## Phase 2: 小地图与迷雾系统 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `public/src/engine/world.js` | 实现小地图数据结构（记录每个房间的探索状态：未探索/已探索/当前） | 1.1 | P1 |
| 2.2 | `public/src/render/minimap.js` (新) | 实现迷雾逻辑：未探索房间在地图上完全黑色 | 2.1 | P1 |
| 2.3 | `public/src/engine/world.js` | 实现房间探索标记：进入房间后永久显示其布局 | 1.4 | P1 |
| 2.4 | `public/src/render/minimap.js` (新) | 实现小地图 Canvas 渲染层（缩略图 + 玩家位置指示器） | 2.1 | P1 |
| 2.5 | `public/src/render/minimap.js` | 实现迷雾渲染（已探索房间显示，未探索完全遮蔽） | 2.2, 2.3 | P1 |
| 2.6 | `tests/metroidvania-snake.test.js` | 迷雾状态测试：未进入房间前为未探索，进入后变为已探索 | 2.3 | P1 |
| 2.7 | `tests/metroidvania-snake.test.js` | 小地图渲染测试：验证所有已探索房间正确显示 | 2.4 | P1 |

## Phase 3: 攻击系统 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `public/src/engine/combat.js` (新) | 实现 Projectile 数据结构（位置、方向、速度、剩余飞行距离、攻击力） | 无 | P1 |
| 3.2 | `public/src/engine/combat.js` | 实现子弹发射逻辑：蛇头前方生成子弹，蛇长减 1 | 3.1 | P1 |
| 3.3 | `public/src/engine/combat.js` | 实现子弹飞行逻辑：每 tick 移动，衰减检测（飞行距离归零后消失） | 3.1 | P1 |
| 3.4 | `public/src/engine/collision.js` | 实现子弹碰撞检测：命中敌人/可破坏墙/门 | 3.3 | P1 |
| 3.5 | `public/src/engine/combat.js` | 实现发射冷却系统：攻击频度、攻速参数 | 3.2 | P1 |
| 3.6 | `public/src/engine/combat.js` | 实现多子弹上限控制（最多 N 枚同时存在） | 3.2 | P1 |
| 3.7 | `public/src/render/room.js` | 实现子弹的视觉绘制（小像素弹丸 + 飞行轨迹？） | 3.1 | P1 |
| 3.8 | `tests/metroidvania-snake.test.js` | 子弹发射测试：发射后蛇长 -1，子弹正确生成 | 3.2 | P1 |
| 3.9 | `tests/metroidvania-snake.test.js` | 子弹衰减测试：飞行距离超限后自动消失 | 3.3 | P1 |
| 3.10 | `tests/metroidvania-snake.test.js` | 冷却测试：冷却期间无法发射 | 3.5 | P1 |

## Phase 4: 敌人系统 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `public/src/engine/ai.js` (新) | 实现 Enemy 数据结构（位置、长度/血量、AI 状态） | 无 | P1 |
| 4.2 | `public/src/engine/ai.js` | 实现敌人追逐 AI（简单寻路：蛇与敌人的曼哈顿距离指引方向） | 4.1 | P1 |
| 4.3 | `public/src/engine/collision.js` | 实现敌人伤害逻辑：蛇碰到敌人 → 蛇长 -1 | 4.1 | P1 |
| 4.4 | `public/src/engine/combat.js` | 实现敌人死亡逻辑：子弹命中 → 血量减少 → 血量归零时敌人消失 | 3.4, 4.1 | P1 |
| 4.5 | `public/src/engine/ai.js` | 实现敌人寻路逻辑：避开墙壁，向蛇位置移动 | 4.2 | P1 |
| 4.6 | `public/src/engine/ai.js` | 实现敌人跨房间行为：敌人不跨房间（或限定在 ±1 房间范围内） | 4.2 | P1 |
| 4.7 | `public/src/render/room.js` | 实现敌人的视觉绘制（不同颜色/形状区分敌人与蛇） | 4.1 | P1 |
| 4.8 | `tests/metroidvania-snake.test.js` | 敌人 AI 测试：敌人在空旷房间内向蛇移动 | 4.2 | P1 |
| 4.9 | `tests/metroidvania-snake.test.js` | 敌人受伤测试：子弹命中减少敌人长度 | 4.4 | P1 |
| 4.10 | `tests/metroidvania-snake.test.js` | 蛇碰敌人测试：蛇长减 1 | 4.3 | P1 |
| 4.11 | `tests/metroidvania-snake.test.js` | 敌人死亡测试：长度归零后消失 | 4.4 | P1 |

## Phase 5: 食物系统（增强）(P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 5.1 | `public/src/engine/generator.js` | 实现食物生成逻辑：非玩家房间内随机生成 | 1.3 | P1 |
| 5.2 | `public/src/engine/ai.js` | 实现敌人抢食物逻辑：敌人走过食物位置时食物被消耗、敌人增长 | 4.2 | P1 |
| 5.3 | `public/src/engine/constants.js` | 实现蛇速度随长度衰减曲线（线性/指数/阶梯式） | 无 | P1 |
| 5.4 | `public/src/engine/generator.js` | 实现紧急食物重生机制（所有可到达房间无食物时触发） | 5.1 | P1 |
| 5.5 | `tests/metroidvania-snake.test.js` | 食物测试：蛇吃食物长 1 格 | 5.1 | P1 |
| 5.6 | `tests/metroidvania-snake.test.js` | 敌人抢食测试：敌人走到食物位置后食物消失且敌人增长 | 5.2 | P1 |
| 5.7 | `tests/metroidvania-snake.test.js` | 速度衰减测试：不同长度下的 tick 间隔计算 | 5.3 | P1 |

## Phase 6: 存档与隐藏房间系统 (P2)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 6.1 | `public/src/engine/core.js` | 实现存档房间逻辑：蛇头到达存档点 → 自动保存状态 | 1.4 | P2 |
| 6.2 | `public/src/engine/core.js` | 实现存档数据结构（保存蛇长度、位置、道具、已探索地图） | 6.1 | P2 |
| 6.3 | `public/src/engine/core.js` | 实现死 → 加载最近存档的逻辑 | 6.2 | P2 |
| 6.4 | `public/src/engine/constants.js` | 实现可破坏墙（Cracked Wall）标记 | 无 | P2 |
| 6.5 | `public/src/engine/generator.js` | 实现隐藏房间入口提示（墙表面裂纹） | 6.4 | P2 |
| 6.6 | `public/src/engine/combat.js` | 实现抽奖机（Gacha Machine）逻辑：消耗长度抽取道具 | 6.2 | P2 |
| 6.7 | `public/src/engine/combat.js` | 实现道具效果系统：攻速、攻击力、双发、衰减强化等 | 6.6 | P2 |
| 6.8 | `public/src/engine/combat.js` | 实现道具时效/使用次数管理 | 6.7 | P2 |
| 6.9 | `public/src/render/room.js` | 实现存档点视觉提示（不同颜色/闪烁效果） | 6.1 | P2 |
| 6.10 | `public/src/render/room.js` | 实现裂纹墙视觉提示 | 6.4 | P2 |
| 6.11 | `public/src/render/overlays.js` | 实现抽奖机 UI 界面（消耗长度→显示道具效果） | 6.6 | P2 |
| 6.12 | `tests/metroidvania-snake.test.js` | 存档/读档测试：存档后死亡 → 恢复到存档状态 | 6.3 | P2 |
| 6.13 | `tests/metroidvania-snake.test.js` | 可破坏墙测试：子弹命中裂纹墙 → 墙消失，通向隐藏房间 | 6.5 | P2 |
| 6.14 | `tests/metroidvania-snake.test.js` | 抽奖机测试：消耗长度获得道具 | 6.6 | P2 |

## Phase 7: UI/UX 整合 (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 7.1 | `public/gameboy.html` | 扩展 HTML 结构：添加小地图容器、道具栏、存档提示区域 | 2.4 | P1 |
| 7.2 | `public/src/render/hud.js` (新) | 设计 HUD（血量/长度显示、当前道具、当前房间名？） | 2.4 | P1 |
| 7.3 | `public/src/render/overlays.js` | 设计游戏结束和胜利画面（含统计数据） | 无 | P1 |
| 7.4 | `public/gameboy.html` | 设计触控操作方案（移动已有的 A/B/START/SELECT 按钮功能） | 无 | P1 |
| 7.5 | `public/gameboy.html` | 映射攻击键（建议 A 按钮 = 发射子弹） | 7.4 | P1 |
| 7.6 | `public/gameboy.html` | 映射交互键（建议 B 按钮 = 互动/使用道具） | 7.4 | P1 |
| 7.7 | `public/gameboy.html` | 键盘映射补充（Z = 攻击, X = 互动） | 7.5, 7.6 | P1 |
| 7.8 | `public/src/render/audio.js` (新) | 添加音效（可选，用 Web Audio API 生成简单 8-bit 音效） | 无 | P2 |
| 7.9 | `public/src/render/room.js` | 添加 GameBoy 风格过渡动画（房间切换淡入淡出？） | 1.4 | P2 |
| 7.10 | `public/about.html` | 更新 About 页面链接 | 无 | P1 |

## Phase 8: 测试与部署验证 (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 8.1 | — (Manual: E2E) | 综合 E2E 测试（Playwright）：打开游戏，完整游玩流程 | 全部 | P0 |
| 8.2 | — (Manual) | 移动端适配验证 | 7.4 | P0 |
| 8.3 | — (Manual: Vercel) | Vercel 部署验证（无 404） | 全部 | P0 |
| 8.4 | — (Manual: perf) | 性能基准测试（帧率、内存使用） | 全部 | P1 |
| 8.5 | `README.md`, `docs/STATUS.md` | 更新 README.md 和 docs/STATUS.md | 全部 | P0 |

## Dependency Graph

```
Phase 1 (Map Engine + Room System) ────────────────────────────────
├─ 1.1 (Room/WorldMap data structures) ──────────────────────┐     │
├─ 1.2 (generation algorithm)  ←── 1.1                       │     │
├─ 1.3 (connectivity)          ←── 1.2                       │     │
├─ 1.4 (snake world movement)  ←── 1.1                       │     │
├─ 1.5 (door system)           ←── 1.4                       │     │
├─ 1.6 (gen tests)             ←── 1.3                       │     │
├─ 1.7 (transition tests)      ←── 1.4                       │     │
├─ 1.8 (lock tests)            ←── 1.5                       │     │
                                                              │     │
Phase 2 (Minimap + Fog)         Phase 3 (Attack)              │     │
├─ 2.1 (map data) ←── 1.1      ├─ 3.1 (projectile data) ────┤     │
├─ 2.2 (fog logic) ←── 2.1     ├─ 3.2 (fire logic) ←── 3.1  │     │
├─ 2.3 (explore marker) ←─ 1.4 ├─ 3.3 (flight) ←── 3.1      │     │
├─ 2.4 (canvas render) ←── 2.1 ├─ 3.4 (collision) ←── 3.3   │     │
├─ 2.5 (fog render) ←── 2.2+2.3├─ 3.5 (cooldown) ←── 3.2    │     │
├─ 2.6 (fog tests) ←── 2.3     ├─ 3.6 (limit) ←── 3.2       │     │
├─ 2.7 (render tests) ←── 2.4  ├─ 3.7 (visual) ←── 3.1      │     │
                                ├─ 3.8-3.10 (tests) ─────────┤     │
Phase 4 (Enemy)                 Phase 5 (Food)                │     │
├─ 4.1 (enemy data) ───────────├─ 5.1 (food gen) ←── 1.3     │     │
├─ 4.2 (AI chase) ←── 4.1      ├─ 5.2 (enemy steal) ←── 4.2 │     │
├─ 4.3 (dmg logic) ←── 4.1     ├─ 5.3 (speed curve) ────────┤     │
├─ 4.4 (death) ←── 3.4+4.1     ├─ 5.4 (emergency) ←── 5.1   │     │
├─ 4.5 (pathfinding) ←── 4.2   ├─ 5.5-5.7 (tests) ──────────┤     │
├─ 4.6 (cross-room) ←── 4.2    │                             │     │
├─ 4.7 (visual) ←── 4.1        │                             │     │
├─ 4.8-4.11 (tests) ───────────┘                             │     │
                                                              │     │
Phase 6 (Save + Hidden)          Phase 7 (UI/UX)              │     │
├─ 6.1 (save room) ←── 1.4      ├─ 7.1 (HTML ext) ←── 2.4   │     │
├─ 6.2 (save data) ←── 6.1      ├─ 7.2 (HUD) ←── 2.4        │     │
├─ 6.3 (load) ←── 6.2           ├─ 7.3 (overlays) ──────────┤     │
├─ 6.4 (cracked wall) ──────────├─ 7.4 (touch) ─────────────┤     │
├─ 6.5 (hidden room) ←── 6.4    ├─ 7.5 (attack btn) ←── 7.4 │     │
├─ 6.6 (gacha) ←── 6.2          ├─ 7.6 (interact btn) ←─7.4 │     │
├─ 6.7 (item effects) ←── 6.6   ├─ 7.7 (keyboard) ←── 7.5+7.6│     │
├─ 6.8 (item mgmt) ←── 6.7      ├─ 7.8 (audio) ────────────┤     │
├─ 6.9-6.11 (rendering) ────────├─ 7.9 (transitions) ←─1.4  │     │
├─ 6.12-6.14 (tests) ───────────└─ 7.10 (about page) ──────┘     │
                                                                   │
Phase 8 (Test + Deploy) ←── all prior phases                      │
├─ 8.1 (E2E) ─────────────────────────────────────────────────────┤
├─ 8.2 (mobile) ─── ←── 7.4                                     │
├─ 8.3 (Vercel) ─────────────────────────────────────────────────┤
├─ 8.4 (perf) ────────────────────────────────────────────────────┤
└─ 8.5 (docs) ────────────────────────────────────────────────────┤
                                                                    │
All done ────────────────────────────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `public/src/engine/world.js` | 新增 | ~200 |
| `public/src/engine/generator.js` | 新增 | ~300 |
| `public/src/engine/core.js` | 修改 | ~150 |
| `public/src/engine/combat.js` | 新增 | ~250 |
| `public/src/engine/collision.js` | 修改 | ~80 |
| `public/src/engine/ai.js` | 新增 | ~200 |
| `public/src/engine/constants.js` | 新增/修改 | ~30 |
| `public/src/render/minimap.js` | 新增 | ~150 |
| `public/src/render/room.js` | 修改 | ~100 |
| `public/src/render/overlays.js` | 修改 | ~80 |
| `public/src/render/hud.js` | 新增 | ~100 |
| `public/src/render/audio.js` | 新增（可选） | ~80 |
| `public/gameboy.html` | 修改 | ~50 |
| `public/about.html` | 修改 | ~5 |
| `tests/metroidvania-snake.test.js` | 新增 | ~500 |
| `README.md`, `docs/STATUS.md` | 修改 | ~10 |
