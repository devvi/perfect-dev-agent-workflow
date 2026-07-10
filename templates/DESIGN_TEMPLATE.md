# Design: #{ISSUE_N} — {title}

> Parent Issue: #{ISSUE_N}
> Agent: plan-agent
> Date: {YYYY-MM-DD}

---

## 1. Architecture Overview

### Core Idea
{一兩句話描述這次改動的核心設計意圖}

### Data Flow
```ascii
{ASCII 流程圖，展示數據/控制流如何經過各層}
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| {設計決策點} | {選擇的方案} | {理由} |

---

## 2. Engine Layer 變更

> 遊戲主循環、狀態機、AI、碰撞、戰鬥系統

### State Additions
```js
// 新增到 game state 的字段
{
  newField: type,    // 說明
}
```

### Game Loop Changes (`core.js`)
- {tick() 中新增的分支/條件}
- {新的 update function 調用點}

### AI / Behavior (`ai.js`)
- {新 AI 邏輯或行為}
- {function 簽名和行為描述}

### Collision / Combat (`collision.js`, `combat.js`)
- {新的碰撞檢測}
- {新的戰鬥交互}

---

## 3. Entity Layer 變更

> 實體工廠、生成器、世界、地圖

### New Entity Types
```js
// 新實體結構
{
  field: type,  // 說明
}
```
- {實體名稱} — {創建函數簽名}
- {實體生命週期}

### Existing Entity Modifications
- {對現有實體的改動}

### World / Map Changes
- {地圖生成、房間類型變化}

---

## 4. Data Layer 變更

> 常數、配置、調色板、存檔

### New Constants (`constants.js`)
```js
export const NEW_CONST = value;  // 說明
```

### Palette Additions
```js
PALETTE.KEY = '#hexcolor';  // 用途
```

### Save Data Changes
- {存檔格式變化}

---

## 5. Render Layer 變更

> 渲染、HUD、動畫、視覺效果

### New Visual Elements
- {新精靈/方塊類型}
- {新顏色/調色板條目}

### HUD / Overlay Changes
- {HUD 新增或修改}

### Animation / Effects
- {屏幕震動、粒子效果等}

---

## 6. Input / UI Layer 變更

> 輸入處理、UI 元件、菜單

### New Controls
- {新按鍵/操作}

### UI Changes
- {新 UI 元素或現有 UI 修改}

---

## 7. Test Layer 變更

> 測試覆蓋範圍、測試用例

### Test Structure
- {哪些測試文件需要修改或新增}
- {測試模式}

### Coverage Requirements
| Area | Normal Path | Edge Cases | Failure Paths |
|------|-------------|------------|---------------|
| {功能 A} | ✅ | ≥{N} | ✅ |
| {功能 B} | ✅ | ≥{N} | ✅ |

---

## 8. Files Changed（按層匯總）

### Engine Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/engine/core.js` | {改動說明} | ±{N} |
| `public/src/engine/entities.js` | {改動說明} | ±{N} |

### Render Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/render/xxx.js` | {改動說明} | ±{N} |

### Test Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/xxx.test.js` | {改動說明} | ±{N} |

---

## 9. Verification Checklist

- [ ] {驗證點 1}
- [ ] {驗證點 2}
- [ ] {驗證點 3}
- [ ] No regression on existing features
- [ ] All pre-existing tests still pass
