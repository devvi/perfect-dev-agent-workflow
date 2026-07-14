# Design: #175 — 标题页显示版本号

> Parent Issue: #175
> Agent: subagent
> Date: 2026-07-14

---

## 1. Architecture Overview

### Core Idea

Add a hardcoded version string `"v1.0.0"` to the title screen, displayed in the bottom-right corner as small gray semi-transparent text.

### Data Flow

```
renderer.js → calls renderOverlay(ctx, state)
                → state.gameState === 'title'
                  → renderTitleScreen(ctx, state)
                    → existing title drawing (menu, instructions)
                    → NEW: ctx.fillText("v1.0.0", bottom-right)
```

No new state, no new modules, no new data flow. A single `fillText()` draw call appended to the end of `renderTitleScreen()`.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Single `fillText()` in `renderTitleScreen()` | Simplest possible change — one line, no ripple effects |
| Version source | Hardcoded string `"v1.0.0"` | Per PRD requirement; future issues can make it dynamic |
| Position | Bottom-right, right-aligned | Keeps version visible without overlapping menu/content |
| Styling | `rgba(255,255,255,0.3)` / `10px monospace` | Subtle — does not distract from title or menu |

---

## 2. Render Layer 变更

### File: `public/src/render/overlays.js`

**Change:** Append version display at the end of `renderTitleScreen()` (after the menu loop, before the closing `}`).

```javascript
// Version label (bottom-right, subtle)
ctx.save();
ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
ctx.font = '10px monospace';
ctx.textAlign = 'right';
ctx.fillText('v1.0.0', CANVAS_SIZE - 10, CANVAS_SIZE - 10);
ctx.restore();
```

Key details:
- **`textAlign = 'right'`** ensures text is right-aligned to the coordinate, preventing overflow off-screen
- **`CANVAS_SIZE - 10`** gives 10px padding from the right and bottom edges
- **`ctx.save()` / `ctx.restore()`** wrap the change so existing `textAlign` / `fillStyle` / `font` are not polluted

`CANVAS_SIZE = 640` (defined in `public/src/engine/constants.js`), so the version renders at pixel (630, 630) right-aligned.

---

## 3. Files Changed

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Render | `public/src/render/overlays.js` | Add `fillText()` version call in `renderTitleScreen()` | +7 |
| Test | `tests/metroidvania-snake.test.js` | Add version-rendering unit tests | +50 |

---

## 4. Verification Checklist

- [ ] `public/src/render/overlays.js` — version text `"v1.0.0"` is rendered via `fillText()`
- [ ] Version uses `textAlign = 'right'` at coordinates `(CANVAS_SIZE - 10, CANVAS_SIZE - 10)`
- [ ] Version uses correct style: `rgba(255, 255, 255, 0.3)`, `10px monospace`
- [ ] Version is inside `renderTitleScreen()`, not a separate function or layer
- [ ] `ctx.save()` / `ctx.restore()` protect context state
- [ ] All test cases pass (`npm test`)
- [ ] No regression on existing title screen features (menu, controls, commit hash)
