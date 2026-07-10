# Design: #101 — 游戏改名 (Game Rename)

> Parent Issue: #101
> Agent: plan-agent
> Date: 2026-07-10

---

## 1. Architecture Overview

### Core Idea
Replace the hardcoded "🐍 银河蛇" / "🐍 SNAKE METROIDVANIA" display name throughout the HTML and canvas rendering code with the new game name chosen by the user.

### Data Flow
```
User edits files → git commit → Vercel deploy → player sees new name
```

No data flow changes — purely cosmetic static text replacement across 3 files.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Direct string replace (Approach A from PRD) | Simple, low-risk, no build dependencies |
| Name source | Hardcoded constant in overlays.js + HTML inline | Single constant in JS, two HTML files manually updated |
| Test strategy | DOM content check + canvas mock fillText check | Verifies both rendering paths |

---

## 2. Files Changed (按層匯總)

### Render Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/render/overlays.js` | Replace "🐍 SNAKE" and "METROIDVANIA" in `renderTitleScreen()` with new name | ±2 |

### HTML Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `index.html` | Update `<title>` and `<h1>` content | ±2 |
| `public/gameboy.html` | Update `<title>` and `<h1>` content | ±2 |

### Test Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/game-rename.test.js` | New test: verify overlays.js renders correct title text | +30 |

---

## 3. Implementation Plan

### Phase 1: Map all name locations
1. Search for all occurrences of "银河蛇", "SNAKE", "METROIDVANIA" in the repo
2. Document which need to change vs. which are engine identifiers

### Phase 2: Define new name
1. Get the new game name from the user (via issue context)
2. The name should match the user's "完美的一天" (Perfect Day) style as referenced in the Issue #94 context

### Phase 3: Apply changes
1. Update `index.html` — `<title>` and `<h1>`
2. Update `public/gameboy.html` — `<title>` and `<h1>`
3. Update `public/src/render/overlays.js` — `renderTitleScreen()` title text

### Phase 4: Verify
1. Run existing tests to ensure no regression
2. Run new test to verify correct title rendering

---

## 4. Verification Checklist

- [ ] `index.html` `<title>` updated to new name
- [ ] `index.html` `<h1>` updated to new name
- [ ] `public/gameboy.html` `<title>` updated to new name
- [ ] `public/gameboy.html` `<h1>` updated to new name
- [ ] `public/src/render/overlays.js` title screen text updated
- [ ] All pre-existing tests still pass
- [ ] Canvas renders new name on title screen
