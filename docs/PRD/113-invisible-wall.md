# Research: [Bug] 隐形墙致死

> Parent Issue: #113
> Agent: Hermes Agent
> Date: 2026-07-10

---

## 1. Problem Definition

### Current Behavior
关卡中存在看不见的碰撞墙（隐形墙），蛇碰到这些"隐形墙"后会持续掉血（HP），并不会像碰到其他正常墙那样反向（reverse）蛇身。玩家在视觉上看不到任何障碍物，但蛇却被阻挡并持续扣血。

### Expected Behavior
1. 如果视觉上没有墙，蛇应该能够正常通过该位置
2. 或者如果该位置有碰撞逻辑，应该显示对应的墙体视觉效果
3. 碰到墙应反转蛇身方向，而不是持续掉血

### User Scenarios
- **Scenario A:** 玩家持续游玩，切换不同房间/关卡后，遇到隐形墙区域
- **Scenario B:** 蛇被隐形墙阻挡，无法前进，持续掉血直至死亡
- **Frequency:** 中高频 — 在多房间切换后较易触发

---

## 2. Root Cause Analysis (Bug)

### Why Does Current Behavior Exist?
可能原因：
1. 房间/关卡切换时，墙体碰撞数据未正确更新或初始化
2. 某些墙体只有碰撞体（collider）而没有对应的渲染/可视化组件
3. 地图数据中某些坐标标记为墙，但渲染层遗漏了该位置的贴图
4. 前一房间残留的碰撞数据在新房间未清理干净

### Why Change Now?
此 Bug 导致玩家在无任何视觉提示的情况下损失生命值，属于高严重性问题。既然是"隐形"的，玩家无法通过操作规避，严重影响游戏公平性和体验。

### Previous Constraints
- 地图数据格式和渲染管线不宜大改
- 房间切换逻辑是核心机制，修改需谨慎

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `src/map/` | 房间/地图系统 | 修复碰撞数据初始化/渲染 |
| `src/snake/` | 蛇碰撞逻辑 | 修复碰撞后行为（反向 vs 扣血） |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `src/game/` | 房间切换 | 数据重置逻辑 |
| `src/render/` | 渲染管线 | 确保碰撞体与视觉一致 |

### Data Flow Impact
蛇的移动 → 检测碰撞 → (当前) 遇到隐形碰撞体 → 扣血 → 蛇死亡
(期望) 遇到正常墙体 → 反向蛇身方向

### Documents to Update
- [ ] `docs/DESIGN/` — 如果碰撞逻辑有变更
- [ ] README 或相关文档

---

## 4. Solution Comparison

### Approach A: 修复房间切换时的碰撞数据残留
- **Description:** 在房间切换时，确保清空前一个房间的所有碰撞数据，并为新房间正确加载所有碰撞体和对应的墙体视觉
- **Pros:** 解决根本原因；不影响其他功能
- **Cons:** 需要定位具体是哪个数据残留
- **Risk:** Low — 标准的数据生命周期修复
- **Effort:** 小

### Approach B: 碰撞时检查视觉组件
- **Description:** 蛇碰撞时，检查碰撞位置是否有对应的视觉组件（贴图/模型）。如果没有视觉组件，则视为可通过
- **Pros:** 防御性编程，防止遗漏
- **Cons:** 可能掩盖真正的地图数据问题；性能开销
- **Risk:** Medium — 可能让没有墙但需要碰撞的位置失效
- **Effort:** 中

### Recommendation
→ **Approach A** 因为：这是最根本的修复方案，定位房间切换时碰撞数据残留/缺失的具体原因，确保碰撞体与视觉组件永远一致。

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. 玩家切换房间后，新房间所有可见墙体均有碰撞
2. 蛇碰到任何墙都应反转方向，而不是扣血
3. 没有"隐形墙"阻挡蛇的通行

### Edge Cases
1. **房间边界:** 房间边缘不应存在隐形碰撞
2. **快速切换:** 高频连续切换房间后，碰撞数据依然正确
3. **空房间:** 无障碍物的房间不应有任何碰撞检测

### Failure Paths
1. **数据加载失败:** 如果房间数据加载失败，应使用默认安全地图，而不是部分加载导致隐形墙

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| 地图/碰撞系统 | 现有 | Low |

### Blocks
| Future Work | Priority |
|-------------|----------|
| 无 | — |

### Preparation Needed
- [ ] 本地复现 bug，确认复现步骤

---
