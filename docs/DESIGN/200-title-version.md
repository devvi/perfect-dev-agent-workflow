# DESIGN: #200 — 标题页添加版本号显示

> Parent Issue: #200
> Agent: plan-agent
> Date: 2026-07-15

---

## 1. Overview

Add a hardcoded version string `"v1.0.0"` to the title screen, displayed in the bottom-right corner as small gray semi-transparent text. The version label is a purely cosmetic addition — it does not affect gameplay, menu logic, or any other overlay screen.

## 2. Implementation

### File: `public/src/render/overlays.js` — `renderTitleScreen()`

Append a `fillText()` call at the end of `renderTitleScreen()`, **after** the menu `forEach` loop and **before** the closing `}`. The version is wrapped in `ctx.save()` / `ctx.restore()` to avoid polluting the canvas context state left by the menu rendering above.

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
- **`CANVAS_SIZE = 640`** (from `public/src/engine/constants.js`), so pixel coordinate is `(630, 630)`
- **`textAlign = 'right'`** — text is right-aligned to `(630, 630)`, providing 10px padding from right and bottom edges
- **`ctx.save()` / `ctx.restore()`** — isolates the `fillStyle`/`font`/`textAlign` changes so the menu draw calls above are unaffected

### Already Implemented

The code above already exists in `public/src/render/overlays.js` at lines 80–86. No additional production code changes are needed.

## 3. Boundary Conditions & Edge Cases

| Condition | Expected Behaviour | Rationale |
|-----------|-------------------|-----------|
| Game state is `'title'`, menuMode is `'about'` | Version text is NOT shown (about screen has its own layout) | Version only appears on title, not about/gameover/victory/paused |
| Game state is `'gameover'`, `'won'`, `'paused'` | Version text is NOT shown | Each overlay screen has its own render function; version is only in `renderTitleScreen()` |
| `CANVAS_SIZE` changes (e.g. responsive scaling) | Version position scales with canvas | Uses `CANVAS_SIZE - 10` so it always stays 10px from bottom-right |
| Resize/zoom of browser window | Version retains correct position and right-alignment | Canvas pixel coordinates are fixed; `textAlign = 'right'` keeps it from overflowing |
| Future dynamic version string | Hardcoded string `"v1.0.0"` can be replaced with a variable in one place | Single `fillText('v1.0.0', ...)` — change the first argument |

## 4. Test Plan

### UT1 — Version text exists on title screen
Call `renderOverlay()` with `gameState: 'title'` and a mock canvas context. Verify that `ctx.fillText` is called with the string `"v1.0.0"`.

### UT2 — Version uses correct style (rgba, 10px monospace)
Read `public/src/render/overlays.js` source. Verify that the `fillStyle` assigned before the `fillText('v1.0.0', ...)` matches `'rgba(255, 255, 255, 0.3)'` and the `font` is `'10px monospace'`.

### UT3 — Version is right-aligned at bottom-right
Read `public/src/render/overlays.js` source. Verify that `textAlign = 'right'` is set before the version `fillText`, and coordinates are `CANVAS_SIZE - 10` for both x and y.

### UT4 — ctx.save/ctx.restore are properly paired
Read `public/src/render/overlays.js` source. Verify that a `ctx.save()` call appears before the version fillText block and a `ctx.restore()` call appears after it.

### UT5 — Version is NOT rendered on non-title overlay screens
Call `renderOverlay()` with `gameState: 'gameover'` (and `'won'`, `'paused'`) and a mock canvas context. Verify that `ctx.fillText` is NOT called with `"v1.0.0"`.

## 5. Files Modified

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Render | `public/src/render/overlays.js` | Add version `fillText()` in `renderTitleScreen()` | +7 (already implemented) |
| Test | `tests/title-version.test.js` | New version rendering unit tests | +100 (new file) |
