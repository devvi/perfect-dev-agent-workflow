# Design: #109 — 继续改名 (Continue Renaming)

> Parent Issue: #109
> Agent: plan-agent
> Date: 2026-07-10

---

## 1. Architecture Overview

### Core Idea
Replace the current game name "🐍 灵蛇诀 / 完美之界" with a new market-friendly name "🐍 完美蛇踪 / 秘境探险" across all display locations: HTML title/h1, canvas title screen, and tests.

### Data Flow
```
User edits files → git commit → Vercel deploy → player sees new name
```
No data flow changes — purely cosmetic static text replacement across 3-4 files.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Direct string replace (Approach A from PRD) | Simple, low-risk, no build dependencies — same pattern as #101 |
| Name source | Hardcoded strings in HTML + overlays.js | Consistent with existing codebase patterns |
| Test strategy | Update existing game-rename.test.js assertions | Tests should validate the exact new name |

---

## 2. HTML Layer 變更

### File: `public/gameboy.html`

**Change 1:** `<title>` tag
- Old: `<title>🐍 银河蛇 — Metroidvania Snake</title>`
- New: `<title>🐍 完美蛇踪 — 秘境探险</title>`

**Change 2:** `<h1>` tag
- Old: `<h1>🐍 银河蛇</h1>`
- New: `<h1>🐍 完美蛇踪</h1>`

---

## 3. Render Layer 變更

### File: `public/src/render/overlays.js`

**Change 1:** Main title text in `renderTitleScreen()`
- Old: `ctx.fillText('🐍 灵蛇诀', CANVAS_SIZE / 2, 130);`
- New: `ctx.fillText('🐍 完美蛇踪', CANVAS_SIZE / 2, 130);`

**Change 2:** Subtitle text in `renderTitleScreen()`
- Old: `ctx.fillText('完美之界', CANVAS_SIZE / 2, 160);`
- New: `ctx.fillText('秘境探险', CANVAS_SIZE / 2, 160);`

---

## 4. Test Layer 變更

### File: `tests/game-rename.test.js`

**Change 1:** Update expected main title assertion
- Old: `expect(titleCall[1]).toContain('灵蛇诀');`
- New: `expect(titleCall[1]).toContain('完美蛇踪');`

**Change 2:** Update expected subtitle assertion
- Old: `expect(subtitleCall[1]).toContain('完美之界');`
- New: `expect(subtitleCall[1]).toContain('秘境探险');`

---

## 5. Files Changed（按層匯總）

### HTML Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/gameboy.html` | Update `<title>` and `<h1>` | ±2 |

### Render Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/render/overlays.js` | Update main title + subtitle in `renderTitleScreen()` | ±2 |

### Test Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/game-rename.test.js` | Update expected title and subtitle assertions | ±2 |

---

## 6. Verification Checklist

- [ ] `public/gameboy.html` `<title>` shows "🐍 完美蛇踪 — 秘境探险"
- [ ] `public/gameboy.html` `<h1>` shows "🐍 完美蛇踪"
- [ ] `public/src/render/overlays.js` renders "🐍 完美蛇踪" at position (200, 130)
- [ ] `public/src/render/overlays.js` renders "秘境探险" at position (200, 160)
- [ ] `tests/game-rename.test.js` assertions match the new name
- [ ] All pre-existing tests still pass
- [ ] No regression on existing features
