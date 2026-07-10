# Research: Game Name Change (parent #94) — light

> Parent Issue: #94
> Agent: research-agent
> Date: 2026-07-10

---

## 1. Problem

### Current Behavior
The title screen and page header display a placeholder/provisional game name that lacks a distinctive, memorable identity:

| Location | Current Text | Context |
|----------|-------------|---------|
| `public/gameboy.html` (line 6, 20) | `<title>🐍 银河蛇 — Metroidvania Snake</title>` / `<h1>🐍 银河蛇</h1>` | Browser tab title + page heading |
| `public/src/render/overlays.js` (line 49) | `🐍 SNAKE` | Title screen primary text (canvas) |
| `public/src/render/overlays.js` (line 53) | `METROIDVANIA` | Title screen subtitle (canvas) |
| `public/gameboy.html` (line 33) | `🐍 探索 · 战斗 · 成长 — 到达 ★ 目标房间即可胜利` | Page footer |
| `public/about.html` (line 74) | `<h1>Pixel Snake Game</h1>` | Standalone about page |
| Console log (gameboy.html:271) | `🐍 Metroidvania Snake loaded!` | Developer console |

The current name `🐍 SNAKE / 银河蛇 / Metroidvania Snake` is a descriptive placeholder — it describes *what* the game is (a snake game + Metroidvania genre) but doesn't establish a unique brand identity.

### Expected Behavior
Replace all occurrences of the game name with a single, cohesive, evocative title in the style of the Chinese indie game **《完美的一天》** — poetic, short, emotionally resonant, and memorable. The name should feel like a natural fit for a game about an endlessly growing snake exploring a mysterious dungeon.

### User Scenarios
- **Scenario A (Player):** A player discovers the game via URL/bookmark. The browser tab title and page heading should immediately convey a distinct, polished identity — not a generic description.
- **Scenario B (Streamer/VOD):** The title screen appears on stream/recording. An evocative name like `长蛇行` is more likely to stick in viewers' minds than `🐍 SNAKE`.
- **Scenario C (Developer):** Console and about-page references should use the same canonical name for consistency.
- **Frequency:** Every loading/title-screen visit (100% of sessions).

---

## 2. Solution

### Proposed Name: **长蛇行** (*Cháng Shé Xíng*)

| Aspect | Detail |
|--------|--------|
| **Chinese** | 长蛇行 |
| **Pinyin** | Cháng Shé Xíng |
| **Translation** | *The Long Serpent's Journey* / *Long Snake Walks* |
| **Characters** | 长 (long/endless) + 蛇 (snake/serpent) + 行 (journey/travel/walk) |
| **English sub-title** | *The Long Serpent's Journey* — or simply *Long Serpent* for brevity |

#### Why this name fits

**1. Poetic resonance with 《完美的一天》 style**
- 完美的一天 is a short, evocative, slightly melancholic Chinese phrase that feels like a story fragment. 长蛇行 achieves the same tone — it reads like a classical Chinese poem title (五言/七言 style), instantly giving the game a literary, handcrafted feel.
- The three-character structure (三字格) is punchy, memorable, and scans well — similar in rhythm to games like 蜡烛人 (Candle Man), 归家异途 (Home Behind), or 完美的一天 itself (四字格 but same spirit).

**2. Meaningful to the game**
- **长** (long/endless) — dual meaning: the snake literally grows longer as you eat, and the dungeon is vast/unfolding.
- **蛇** (snake) — the player character, unambiguous.
- **行** (journey/walk) — the core loop of room-by-room exploration in a Metroidvania map.
- Together: the name tells a mini-story — "a serpent sets out on an endless journey."

**3. Brand-able**
- Short enough for a browser tab title, long enough to be distinctive.
- Works with the existing emoji prefix: `🐍 长蛇行`
- English subtitle *The Long Serpent's Journey* clarifies meaning for non-Chinese readers.

### Replacement Map

| Location | Current → Replacement |
|----------|-----------------------|
| `gameboy.html` `<title>` | `🐍 银河蛇 — Metroidvania Snake` → `🐍 长蛇行 — The Long Serpent's Journey` |
| `gameboy.html` `<h1>` | `🐍 银河蛇` → `🐍 长蛇行` |
| `gameboy.html` footer | `🐍 探索 · 战斗 · 成长 — 到达 ★ 目标房间即可胜利` → `🐍 长蛇行 · 探索 · 战斗 · 成长 — 到达 ★ 目标房间即可胜利` (insert game name) |
| `gameboy.html` console log | `🐍 Metroidvania Snake loaded!` → `🐍 长蛇行 loaded!` |
| `overlays.js` title screen | `🐍 SNAKE` → `🐍 长蛇行` |
| `overlays.js` subtitle | `METROIDVANIA` → `THE LONG SERPENT'S JOURNEY` |
| `about.html` `<h1>` | `Pixel Snake Game` → `长蛇行` (link back also updated) |

### Visual/Layout Notes
- Font remains `24px monospace` for the primary title (same as current `🐍 SNAKE`). The three Chinese characters 长蛇行 at 24px will fit cleanly in the same canvas space.
- Subtitle `THE LONG SERPENT'S JOURNEY` at 14px may need a slightly smaller font or line break check due to word length. Consider `LONG SERPENT` (11 chars vs current 11-char `METROIDVANIA` — same fit) if `THE LONG SERPENT'S JOURNEY` overflows.

---

## 3. Implementation Notes

### Files to Edit
1. **`public/gameboy.html`** — 4 locations (line 6 title, line 20 h1, line 33 footer, line 271 console log)
2. **`public/src/render/overlays.js`** — 2 locations (line 49 title text, line 53 subtitle text)
3. **`public/about.html`** — 1 location (line 74 h1)

### Scope Check
- **No** JS logic changes — pure string replacement in rendering and DOM
- **No** CSS/layout changes needed — same font size, same positioning
- **No** test changes — the title screen text is not asserted in unit tests (`tests/metroidvania-snake.test.js` tests game logic, not canvas rendering)
- **No** new assets — text-only change

### Risks
- **Low.** String-only changes in a single-UI-surface game. Rollback is trivial (`git checkout -- public/`).
- The subtitle `THE LONG SERPENT'S JOURNEY` is longer than `METROIDVANIA` (25 chars vs 11). If it overflows the 400px canvas at 14px monospace (~7px per char → 25×7=175px < 400px, OK), but visually it may not center as tightly. Fallback: use `LONG SERPENT` (11 chars, same as current).

### Acceptance Criteria
- [ ] Browser tab reads `🐍 长蛇行 — The Long Serpent's Journey`
- [ ] Page `<h1>` reads `🐍 长蛇行`
- [ ] Title screen canvas reads `🐍 长蛇行` (primary) and subtitle (English)
- [ ] About page title updated
- [ ] Footer includes game name
- [ ] No rendering regressions on title/game-over/victory screens
