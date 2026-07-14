# Design: #201 — 标题页添加键盘操作提示 (Add keyboard operation hints on title page)

> Parent Issue: #201
> Agent: plan-agent
> Date: 2026-07-15

---

## 1. Overview + Implementation

### Core Idea

Change the "ENTER  Select" hint on the title screen to "ENTER/SPACE  Select", informing players that both Enter and Space keys can be used to select menu items. Currently the game's `keydown` handler (in `gameboy.html`) accepts both `Enter` and `Space` for menu selection, but the title screen only shows `ENTER`, hiding the Space option from the player.

### Exact Change

**File:** `public/src/render/overlays.js`
**Function:** `renderTitleScreen()`, instruction block (lines 61-67)
**Line 66:**

```diff
-  ctx.fillText('ENTER  Select', CANVAS_SIZE / 2, 310);
+  ctx.fillText('ENTER/SPACE  Select', CANVAS_SIZE / 2, 310);
```

### Rationale

| Consideration | Detail |
|---------------|--------|
| **Minimal diff** | Single string literal change on one line; zero logic, state, or data-flow impact |
| **Visual fit** | New string is ~5 chars longer (~50px at 10px monospace). Canvas is 400px wide; centered text has ~40px margin on each side — no coordinate adjustment needed |
| **Consistency** | Uses same `double-space` convention (`'ENTER/SPACE  Select'`) as existing hints |
| **No duplication** | The controls-info HTML block below the canvas (line 43) already documents Space as "重新开始" (restart). This change does NOT overlap — that label addresses in-game restart, not menu selection |

---

## 2. Boundary Conditions & Edge Cases

| # | Condition | Expected Behavior | Risk |
|---|-----------|-------------------|------|
| 1 | `ENTER/SPACE  Select` text overflows canvas width | Text fits within 400px canvas at 10px monospace centered (~210px rendered width including new chars, margin ~95px per side) | None — width remains ~52% of canvas |
| 2 | Y-coordinate collision with adjacent elements | `y=310` unchanged; 22px gap to menu items starting at `y=340` unaffected | None — no overlap risk |
| 3 | Scrolling state (about/menuMode switch) | ABOUT screen renders via `renderAboutScreen()`, not `renderTitleScreen()` — completely unaffected | None — separate render path |
| 4 | Touch screen tap handling | No change to hit-test logic (`hitTestMenuItem`/`handleTitleTap`) or key handlers (`keydown` Space/Enter) | None — pure UI text change |
| 5 | Font/color mismatch after change | Same `#ccc` fill style and `10px monospace` font applied via the surrounding block, not inlined | None — inherits from existing context |
| 6 | Translations / i18n | No i18n in current codebase; English-only string | Future-proofing not required |
| 7 | E2E tests detecting `ENTER  Select` text on canvas | Existing tests do NOT assert on instruction text; any future visual test would see the new string automatically | Low — no existing test dependency on this string |

---

## 3. Test Plan

Strategy C (post-implementation — the feature may already exist; tests validate its correctness).

### UT1: Source contains the updated string

Check that `public/src/render/overlays.js` contains the new `ENTER/SPACE  Select` text in the `renderTitleScreen` function context.

### UT2: Old string is absent from the instruction block

Verify that the old `ENTER  Select` (without `/SPACE`) is no longer used in `renderTitleScreen`. The new string replaces it, so the old string should not appear in the same context.

### UT3: Integration test — renderOverlay calls fillText with the new string

Create a mock `CanvasRenderingContext2D` and call `renderOverlay(ctx, titleState)`. Verify `fillText` was called with `'ENTER/SPACE  Select'` and `x=CANVAS_SIZE/2`, `y=310`.

### UT4: New string positioned at correct Y coordinate

Check that the `fillText('ENTER/SPACE  Select'` call specifies `CANVAS_SIZE / 2` for x and `310` for y (unchanged from original).

### Test File

`tests/201-keyboard-hints.test.js` — isolated file, no modifications to existing test files.

---

## 4. Files Modified

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Render | `public/src/render/overlays.js` | Line 66: `'ENTER  Select'` → `'ENTER/SPACE  Select'` | ±1 |
| Tests | `tests/201-keyboard-hints.test.js` | New test file (UT1–UT4) | +65 |
| Docs | `docs/DESIGN/201-keyboard-hints.md` | This design document | +110 |
