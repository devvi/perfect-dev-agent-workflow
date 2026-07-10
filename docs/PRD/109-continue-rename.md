# Research: 继续改名 (Continue Renaming)

> Parent Issue: #109
> Agent: research-agent
> Date: 2026-07-10

---

## 1. Problem Definition

### Current Behavior
The game title screen currently displays the name "🐍 灵蛇诀" (main title) with subtitle "完美之界". The HTML `<title>` and `<h1>` in `public/gameboy.html` still show the older name "🐍 银河蛇 — Metroidvania Snake" from before issue #101. The game's name is displayed in the following locations:

- **`public/gameboy.html`**: `<title>` = "🐍 银河蛇 — Metroidvania Snake", `<h1>` = "🐍 银河蛇"
- **`public/src/render/overlays.js`**: Canvas title screen renders "🐍 灵蛇诀" at y=130 and "完美之界" at y=160

### Expected Behavior
The game should display a market-friendly name that:
- Matches the game's content (metroidvania-style snake game with exploration, combat, items, RPG elements)
- Reflects the user's personal style (referencing Obsidian knowledge base)
- Appears consistently across all locations (HTML, canvas title screen)
- Is engaging and memorable for players

### User Scenarios
- **Scenario A:** Player opens the game → sees an attractive, market-friendly title on the title screen
- **Scenario B:** Browser tab shows the new game name for bookmarks/sharing
- **Scenario C:** The game is shared socially — the name should be catchy and descriptive
- **Frequency:** Every time the game loads (100% of sessions)

---

## 2. Design Intent (Feature)

### Why Does Current Behavior Exist?
The game was originally named "🐍 银河蛇" (Galaxy Snake). Issue #101 renamed it to "🐍 灵蛇诀 / 完美之界", but the rename only updated the canvas overlay (`overlays.js`) and not the HTML title/h1 in `gameboy.html`. The HTML still carries the original name.

### Why Change Now?
The user wants to iterate on the name to find one that is more market-friendly and better reflects their evolving personal style. The game has grown significantly in features (mobile support, gyroscope, combat, items, interactive menus) and deserves a name that matches its scope.

### Previous Constraints
- Game is deployed on Vercel at `gameboy.html`
- HTML titles affect SEO and browser bookmarks
- Canvas-rendered title on the start screen must be updated
- Name should work for both Chinese and English audiences
- The user's "Perfect Day" aesthetic (完美一天 style) is a reference point

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/gameboy.html` | Game HTML | Update `<title>` and `<h1>` content (currently old "银河蛇" name) |
| `public/src/render/overlays.js` | Canvas Renderer | Update title text in `renderTitleScreen()` |
| `tests/game-rename.test.js` | Tests | Update expected title text assertions |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `public/about.html` | About Page | Has "Pixel Snake Game" title — may want to update |
| `public/src/render/renderer.js` | Render Dispatch | Only if new title requires different rendering |

### Data Flow Impact
- Static content change only — no data flow changes
- No game state modifications needed
- No save data or network dependencies

### Documents to Update
- [x] `docs/PRD/109-continue-rename.md` (this document)
- [ ] `docs/DESIGN/109-continue-rename.md`
- [ ] `tests/game-rename.test.js`
- [ ] `public/gameboy.html` (title + h1)
- [ ] `public/src/render/overlays.js` (canvas title)
- [ ] `README.md` (if game name appears there)

---

## 4. Solution Comparison

### Approach A: Direct String Replace (Recommended)
- **Description:** Replace game name strings in all relevant files with the new name. Update `gameboy.html`, `overlays.js`, tests, and optionally `about.html`.
- **Pros:** Simple, fast, no new infrastructure needed — same approach as #101
- **Cons:** Manual update across multiple files
- **Risk:** Low — straightforward text replacement in 3-4 files
- **Effort:** ~15 minutes

### Approach B: Configurable Game Title Constant
- **Description:** Extract game name into a constant in `constants.js` and reference it from all files
- **Pros:** Single source of truth, easy to change again
- **Cons:** HTML files need JS injection; over-engineered for a simple rename
- **Risk:** Low — but introduces complexity for no real gain
- **Effort:** ~1 hour

### Approach C: Environmental/Runtime Naming
- **Description:** Use JS to set document.title and h1 dynamically from a data attribute or URL parameter
- **Pros:** Could support A/B testing different names
- **Cons:** Overly complex; title not visible until JS executes
- **Risk:** Medium — JS dependency for basic content
- **Effort:** ~30 minutes

### Recommendation
→ **Approach A (Direct Replace)** because: This is a straightforward text replacement across a small number of files. The same approach was used successfully in issue #101 and has proven to be low-risk. No build infrastructure or architectural changes are needed.

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. Open `public/gameboy.html` — new name appears in `<title>` and `<h1>`
2. Open the game and see the title screen — new name rendered on canvas at correct positions
3. Browser tab shows the new game name

### Edge Cases
1. **Long names:** If the new name is very long (>30 chars), verify it fits within the 400px canvas (currently renders at 24px monospace)
2. **Emoji/Unicode names:** If the name includes emoji, verify canvas rendering works correctly (emoji rendering varies by browser/OS)
3. **Mixed Chinese/English:** If the name mixes Chinese and English, verify monospace font handles both

### Failure Paths
1. **Missed location:** If one of the 3+ files is not updated, the old name will appear inconsistently
2. **Canvas clipping:** If the new name is too long for the canvas, it may clip off-screen
3. **Test mismatch:** Tests assert specific title text — if tests aren't updated with the new name, they'll fail

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| New game name decision | Pending | Low — need to finalize the name |
| Obsidian vault access | Unavailable on this system | Low — name can be chosen from context |

### Blocks
| Future Work | Priority |
|-------------|----------|
| None | — |

### Preparation Needed
- [ ] Finalize the new game name before implementation

---

## 7. Spike / Experiment (Optional — depth/deep only)

> Not applicable for light depth. The rename is a straightforward text replacement across limited files. User's Obsidian vault is not accessible from this environment, so the name is chosen based on existing style conventions from the repo (the "完美" / Perfect Day aesthetic).

### Proposed Names (Research Output)

Based on the game's content (metroidvania snake, exploration, combat, RPG elements) and the user's "完美" (Perfect Day) style, the following name is proposed:

**Main Title:** 🐍 **完美蛇踪** (Perfect Snake Trail)
**Subtitle:** 秘境探险 (Mystic Realm Adventure)

Rationale:
- "完美蛇踪" — "Perfect Snake Trail" combines the "完美" (perfect) aesthetic from the user's established style with "蛇踪" (snake trail/trace), evoking the game's exploration and snake themes
- "秘境探险" — "Mystic Realm Adventure" replaces "完美之界" with a more market-friendly subtitle that describes the gameplay (exploring rooms, finding keys, discovering secrets)
- The 🐍 snake emoji is retained as a visual identifier

Note: User requested checking Obsidian vault for name ideas. The vault was not accessible from this environment. If the Obsidian vault contains specific name preferences, the implement phase should use those names instead.
