# Task Summary: 蛇撞到非即死障碍后反向运动

> Parent Issue: #46
> Source: `docs/PRD/46-snake-reverse-on-obstacle.md`

---

## Implementation Order

### Phase 1: Core Logic — Stuck + Reverse 状态机

- [ ] `public/src/engine/core.js`:
  - 添加 `stuckCounter`、`pendingReverse` 到 `createInitialState()`
  - 在 `tick()` 顶部添加 stuck 处理分支（stuckCounter > 0 → 不动，递减）
  - 修改 damage 处理分支：改为 stuck+reverse 而非 length-1
  - stuck 归零时执行 `snake.reverse()` + `direction` 取反 + 安全检查
- [ ] `public/src/engine/constants.js`:
  - 定义 `STUCK_TICKS = 6`（~900ms at 150ms/tick）
- [ ] Stuck 期间方向输入缓冲：`changeDirection()` 确认 stuck 期间仍接受方向输入

### Phase 2: 位置安全检查

- [ ] 反转后检查新蛇头是否在障碍物内
- [ ] 如果在障碍物内，再推一格（在反方向上多移动一步）

### Phase 3: Rendering — Stuck 视觉反馈

- [ ] `public/src/render/renderer.js`:
  - stuck 期间蛇闪烁或变灰色
  - 可复用已有的 screenShake 机制（撞墙时已有震动）
- [ ] `public/gameboy.html`/`public/src/render/hud.js`:
  - stuck 期间可选显示 "STUCK!" 提示

### Phase 4: Classic Engine — 同步修改

- [ ] `src/gameboy-snake-engine.js`:
  - 添加 stuck+reverse 逻辑（如果此引擎也需要支持）
  - 添加非即死障碍概念（当前只有 grid 边界）

### Phase 5: Tests

- [ ] `tests/metroidvania-snake.test.js`:
  - 基础 stuck+reverse 测试
  - stuck duration 测试
  - 反向位置安全测试
  - stuck 期间输入缓冲测试
  - 多次撞墙测试
- [ ] `tests/gameboy-snake.test.js`:
  - 经典引擎反向测试（如果适用）

---

## File Change Summary

| File | Change Type | Lines Affected | Complexity |
|------|------------|----------------|------------|
| `public/src/engine/constants.js` | Add constant | +1 line | Trivial |
| `public/src/engine/core.js` | Main logic change | ~60 lines | Medium |
| `public/src/render/renderer.js` | Stuck visual feedback | ~10 lines | Low |
| `public/src/render/hud.js` | Optional: stuck indicator | ~5 lines | Low |
| `src/gameboy-snake-engine.js` | Optional: classic engine | ~30 lines | Medium |
| `tests/metroidvania-snake.test.js` | New tests | ~80 lines | Low |
| `tests/gameboy-snake.test.js` | Optional: classic tests | ~30 lines | Low |

**Total estimated effort:** 1-2 hours
