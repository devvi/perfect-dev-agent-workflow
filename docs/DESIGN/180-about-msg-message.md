# Design: #180 — ABOUT界面文案 Msg → Message

> Parent Issue: #180
> Agent: plan-agent
> Date: 2026-07-14

---

## 1. Architecture Overview

### Core Idea

Rename the commit message label on the ABOUT screen from the abbreviated `"Msg:"` to the full word `"Message:"` for consistency with the sibling labels `"Commit:"` and `"Date:"`.

### Data Flow

```
renderer.js → calls renderOverlay(ctx, state)
                → state.gameState === 'title'
                  → state.menuMode === 'about'
                    → renderAboutScreen(ctx, state)
                      → ctx.fillText('Commit: ' + info.hash, ...)
                      → ctx.fillText('Msg:   ' + info.message, ...)   ← CHANGE HERE
                      → ctx.fillText('Date:  ' + info.date, ...)
```

No new state, no new data flow. A single string literal change on line 107 of `overlays.js`.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | One-character string replacement in `renderAboutScreen()` | Minimal change — no logic, no state, no ripple effects |
| Label text | `"Message: "` | Matches full-word style of `"Commit:"` and `"Date:"` |
| Spacing | `"Message: "` (9 chars + 1 space) | Equivalent visual spacing — `"Msg:   "` was 4 chars + 3 spaces for a total of 7 visible characters; `"Message: "` is 8 chars + 1 space = 9 visible characters. Slightly wider but still within bounds and consistent with full-word labels |
| Alignment | Identical x/y position (80, 230) | No layout shift in the ABOUT screen |

---

## 2. Render Layer 变更

### File: `public/src/render/overlays.js`

**Change (line 107):** Replace the label string in `renderAboutScreen()`.

```diff
-  ctx.fillText('Msg:   ' + truncateMessage(info.message), 80, 230);
+  ctx.fillText('Message: ' + truncateMessage(info.message), 80, 230);
```

No other code in the function is affected:
- `truncateMessage()` remains unchanged
- Positioning (80, 230), font (`12px monospace`), color (`'#ccc'`), and text alignment (`'left'`) unchanged
- Surrounding lines (Commit: at line 106, Date: at line 108) untouched

---

## 3. Files Changed

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Render | `public/src/render/overlays.js` | String literal `"Msg:"` → `"Message:"` | ±1 |
| Test | `tests/metroidvania-snake.test.js` | Add unit + integration tests for the label | +~30 |

---

## 4. Verification Checklist

- [ ] `public/src/render/overlays.js` — line 107 shows `'Message: '` instead of `'Msg:   '`
- [ ] ABOUT screen renders `"Message: <commit message>"` correctly
- [ ] `truncateMessage()` still operates on the message value (unchanged)
- [ ] All surrounding code (Commit:, Date:, font, position, color) untouched
- [ ] No regression on ABOUT screen rendering or other overlay screens
- [ ] All test cases pass (`npm test`)
