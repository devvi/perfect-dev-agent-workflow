# PRD: 标题页添加版本号显示

> Issue: #200
> Depth: light
> Date: 2026-07-15

---

## 1. Problem

**Current behavior:** A version number (`v1.0.0`) is already displayed on the title screen bottom-right corner. This was implemented by issue #175 and merged via PR #178 (commit `71e9f79`).

**Expected behavior:** The issue asks for a version number display on the title page. This requirement is already satisfied by the existing implementation.

**User scenarios:** Players and developers can see the current version `v1.0.0` displayed as small gray semi-transparent text at the bottom-right of the title screen.

## 2. Solution

The feature is already implemented and deployed. The version string `v1.0.0` is rendered in `renderTitleScreen()` function in `public/src/render/overlays.js`.

**Existing implementation (no new changes needed):**

- **File:** `public/src/render/overlays.js`
- **Function:** `renderTitleScreen()` (line 40)
- **Version rendering:** Lines 80–86
- **Text:** `"v1.0.0"`
- **Position:** Bottom-right, `(CANVAS_SIZE - 10, CANVAS_SIZE - 10)`, right-aligned
- **Style:** `rgba(255, 255, 255, 0.3)`, `10px monospace`
- **Context protection:** `ctx.save()` / `ctx.restore()` wrapper

```javascript
// Version label (bottom-right, subtle)
ctx.save();
ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
ctx.font = '10px monospace';
ctx.textAlign = 'right';
ctx.fillText('v1.0.0', CANVAS_SIZE - 10, CANVAS_SIZE - 10);
ctx.restore();
```

**Tests already exist** in `tests/metroidvania-snake.test.js` (Phase 6 — Title Screen Version Label, lines 2840–2920+), covering:
- Version string `v1.0.0` exists in source
- Correct `fillStyle` (`rgba` with `0.3` opacity)
- `textAlign = 'right'`
- Position at `CANVAS_SIZE - 10`
- `ctx.save()` / `ctx.restore()` wrapping

## 3. Implementation Notes

### Replacement Map (current → no change needed)

| File | Line(s) | Current State | Action |
|------|---------|---------------|--------|
| `public/src/render/overlays.js` | 80–86 | Version `v1.0.0` already rendered | ✅ Already implemented |
| `tests/metroidvania-snake.test.js` | 2840–2920+ | Test cases for version label | ✅ Already implemented |

### Scope Check
- **Files to edit:** None — feature is already complete
- **Risk:** None — no changes required
- **Edge cases:** Already handled by `ctx.save()`/`ctx.restore()` to not pollute canvas state
- **Note:** The issue body mentions `public/gameboy.html` but the actual rendering code lives in `public/src/render/overlays.js`. The file path in the issue description is inaccurate, but the implementation matches the requirement exactly.

### Acceptance Criteria
- [x] Version `v1.0.0` is displayed on the title screen bottom-right (confirmed in source at lines 80–86)
- [x] Text uses correct style: `rgba(255,255,255,0.3)`, `10px monospace`
- [x] Text is right-aligned at `CANVAS_SIZE - 10` offset
- [x] `ctx.save()` / `ctx.restore()` protect context state
- [x] Unit tests exist and pass

### Recommendation
**This issue (#200) is a duplicate of #175, which has been implemented and merged.** Close #200 with a reference to PR #178 / commit `71e9f79`.
