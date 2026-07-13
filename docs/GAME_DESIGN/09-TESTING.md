# 9. 测试体系

> 单元测试使用 Vitest，E2E 测试使用 Playwright + Teleport 模式。

---

## 9.1 测试栈

| 组件 | 用途 |
|------|------|
| Vitest | 单元测试（引擎逻辑/碰撞/世界生成/战斗） |
| Playwright | E2E 浏览器测试（完整游戏流程） |
| Teleport API | E2E 中状态注入，跳过按键导航 |

## 9.2 单元测试覆盖

测试文件根据功能模块组织：

| 文件 | 测试范围 |
|------|----------|
| `tests/metroidvania-snake.test.js` | 引擎、碰撞、敌人、BOSS、地图 |
| 其他 | 按功能拆分 |

测试策略分为三类：

**Bug-Documenting Tests：** 在修复前记录当前错误行为，保证修复后能验证。

**Regression Tests：** 验证已有正确行为不被新代码破坏。

**Post-Fix Tests：** 修复后激活的 `describe.todo` 测试。

## 9.3 Teleport E2E 模式

E2E 测试通过 `window.__GAME_API__` 直接注入游戏状态，避免键盘导航整个游戏。

### 核心 API

```javascript
window.__GAME_API__ = {
  getState(),              // 获取当前游戏状态
  teleport(x, y),          // 跳转到指定世界坐标
  placeSnakeHead(x, y),    // 设定蛇头位置
  setDirection(dir),       // 设定移动方向
  simulateKey(code),       // 模拟按键
  tick(n),                 // 运行 N 帧
  getBossRoom(),           // 查找 BOSS 房间位置
  findBossEntrance(),      // 查找 BOSS 房间入口
}
```

### 标准测试模式：Walk Through the Door

**不要直接 teleport 到 BOSS 房间内部**——这会跳过房间切换逻辑。正确做法：

```javascript
// 1. 找到 BOSS 入口
const entrance = api.findBossEntrance();

// 2. teleport 到相邻房间（不是 BOSS 房间）
api.teleport(entrance.neighbor.roomX, entrance.neighbor.roomY);

// 3. 蛇头放在门边，朝向 BOSS 房间
api.placeSnakeHead(hx, hy);
api.setDirection(entrance.dir);

// 4. tick → 穿过门 → 触发房间切换 → bossIntro
api.tick(2);
assert(api.getState().gameState === 'bossIntro');
```

### Tick-by-Tick 调试

冻结问题调试时逐帧追踪状态变化：

```javascript
for (let i = 0; i < 30; i++) {
  api.tick(1);
  const s = api.getState();
  trace.push({
    tick: i,
    gameState: s.gameState,
    head: `${s.snake[0].x},${s.snake[0].y}`,
    direction: JSON.stringify(s.direction),
  });
  if (s.gameState !== 'playing') break;
}
```

## 9.4 测试门禁

**CI 必须阻止合并：** `opencode-review.yml` 的测试步骤必须有 `continue-on-error: false` 及测试门禁检查。PR 含有 `workflow/implement` label 时触发全部测试。
