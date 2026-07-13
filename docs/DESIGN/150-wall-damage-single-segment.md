# Design: #150 — Wall Damage Handler Missing Snake Length Check

> Parent Issue: #150
> Agent: plan-agent
> Date: 2026-07-13

---

## 1. Architecture Overview

### Core Idea
在撞牆傷害處理器的開頭增加蛇身長度檢查：當蛇只有 1 節時（僅剩頭部），直接觸發 `gameover`，而不是繼續執行 stuck+reverse 邏輯（對 1 元素陣列無效）。

### Data Flow
```ascii
tick()
  └─ checkSnakeCollision() → ['damage']
       └─ wall damage handler (core.js:244)
            ├─ if s.snake.length <= 1 → gameover ← NEW CHECK
            └─ else → stuck + reverse (existing behavior, unchanged)
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 放置位置 | Wall damage handler 入口，food check 之前 | 確保 gameover 優先級最高，與 self-collision handler (line 232) 模式一致 |
| 處理方式 | 直接 return 不繼續執行 | 避免 gameover 後還設置 stuckCounter/screenShake |
| 判斷條件 | `<= 1` 而非 `=== 1` | 防禦性程式設計，與 self-collision (line 232) 一致 |

---

## 2. Engine Layer 變更

> 遊戲主循環、碰撞系統

### Game Loop Changes (`core.js`)

在 wall damage handler (`if (collisions.includes('damage'))`) 的開頭、food check 之前插入：

```javascript
// Wall/Stone_Wall damage — stuck+reverse instead of tail removal
if (collisions.includes('damage')) {
  // NEW: Single-segment snake hitting wall → gameover
  if (s.snake.length <= 1) {
    s.gameState = 'gameover';
    return s;
  }

  // If food also at this cell, remove it and award points
  // before applying the damage penalties
  if (collisions.includes('food') && s.world) {
    // ... existing food handling ...
  }
  // ... existing stuck+reverse logic ...
}
```

### State Additions
無。`gameState` 已有 `'gameover'` 狀態。

---

## 3. Entity Layer 變更

無。

---

## 4. Data Layer 變更

無。

---

## 5. Render Layer 變更

無。

---

## 6. Input / UI Layer 變更

無。

---

## 7. Test Layer 變更

> 測試覆蓋範圍、測試用例

### Test Structure
- 修改現有 test `tests/metroidvania-snake.test.js` 中 Issue #22 的 `snake length 1 hitting wall → stuck not gameover (Issue #46)` test
- 這個 test 目前斷言 **broken behavior**（1 節撞牆還活著）
- 修正為斷言 **correct behavior**（1 節撞牆 → gameover）
- 新增 test：正常長度蛇（3 節）撞牆 → stuck+reverse（不 gameover）— 已存在

### Coverage Requirements

| Area | Normal Path | Edge Cases |
|------|-------------|------------|
| 3+ segments hitting wall | ✅ 現有 test (line 1264) | — |
| 1 segment hitting wall | ✅ 更新 test (line 1286) | ✅ `<= 1` 邊界 |

---

## 8. Files Changed（按層匯總）

### Engine Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/engine/core.js` | 在 wall damage handler 開頭加入 snake length check | +4 |

### Test Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/metroidvania-snake.test.js` | 更新 line 1286 的 test assertion: `toBe('playing')` → `toBe('gameover')` | ±1 |

---

## 9. Verification Checklist

- [x] Root cause identified: wall damage handler missing snake length check
- [ ] Fix implemented in `public/src/engine/core.js` — line 244 entry point
- [ ] Existing test for multi-segment wall collision still passes
- [ ] Existing bug-documenting test for 1-segment wall collision updated to expect gameover
- [ ] No regression on existing features
- [ ] All pre-existing tests still pass
