# Design: #185 — 标题页指令列表添加 Shift Pause 提示

> Parent Issue: #185
> Agent: plan-agent
> Date: 2026-07-14

---

## 1. Architecture Overview

### Core Idea

Add a "SHIFT  Pause" instruction line at the bottom of the title screen's control hints list, informing players that pressing Shift pauses the game. Currently the title screen shows `Arrow keys Move`, `Z Fire`, `X Interact`, and `ENTER Select` but has no pause hint.

### Data Flow

```
renderer.js → calls renderOverlay(ctx, state)
                → state.gameState === 'title'
                  → renderTitleScreen(ctx, state)
                    → ctx.fillText('⬆ ⬇ ⬅ ➡  Move', CANVAS_SIZE/2, 250)
                    → ctx.fillText('Z  Fire projectile', ...)
                    → ctx.fillText('X  Interact (gacha/save)', ...)
                    → ctx.fillText('ENTER  Select', CANVAS_SIZE/2, 310)
                    → ctx.fillText('SHIFT  Pause', CANVAS_SIZE/2, 328)    ← ADD HERE
```

No new state, no new data flow. A single `fillText()` draw call inserted after the existing ENTER line.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Single `fillText()` call in `renderTitleScreen()` | Minimal change — one line, zero logic, no ripple effects |
| Coordinates | `(CANVAS_SIZE / 2, 328)` — 18px below ENTER Select (y=310) | Maintains consistent 18px vertical spacing with the existing instruction lines (lines at y=250, 268, 286, 310 — all 18px apart) |
| Styling | Inherits from current instruction block: `#ccc`, `10px monospace`, centered | No new style context; text blends seamlessly with the four existing hints |
| Spacing | `'SHIFT  Pause'` (double space) | Matches the `'ENTER  Select'` double-space convention used in the existing hints |

---

## 2. Render Layer 变更

### File: `public/src/render/overlays.js`

**Change:** Insert a `fillText()` call after line 66 (the ENTER Select line) in `renderTitleScreen()`.

```diff
   ctx.fillText('ENTER  Select', CANVAS_SIZE / 2, 310);
+  ctx.fillText('SHIFT  Pause', CANVAS_SIZE / 2, 328);
```

The insertion point sits between the instruction list and the interactive menu block (which starts at `const menuY = 340;` on line 69). No surrounding code is modified.

---

## 3. Files Changed

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Render | `public/src/render/overlays.js` | Add `fillText()` for SHIFT Pause hint after line 66 | +1 |

No test changes required — the change is a pure UI text addition with zero logic impact.

---

## 4. Verification Checklist

- [ ] `public/src/render/overlays.js` — line 67 (after ENTER Select) shows `ctx.fillText('SHIFT  Pause', CANVAS_SIZE / 2, 328);`
- [ ] Title screen renders "SHIFT  Pause" below "ENTER  Select"
- [ ] Vertical spacing (18px) matches the other instruction lines
- [ ] Font (`10px monospace`), color (`#ccc`), alignment (center) match existing instructions
- [ ] Interactive menu below (y=340+) is unaffected
- [ ] All existing tests pass (`npm test`)
