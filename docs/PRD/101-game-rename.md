# Research: 游戏改名 (Game Rename)

> Parent Issue: #101
> Agent: research-agent
> Date: 2026-07-10

---

## 1. Problem Definition

### Current Behavior
The game currently displays the name "🐍 银河蛇" (Galaxy Snake) in multiple locations:
- **`index.html`**: `<title>` and `<h1>` show "🐍 银河蛇 — Metroidvania Snake" / "🐍 银河蛇"
- **`public/gameboy.html`**: `<title>` shows "🐍 银河蛇 — Metroidvania Snake", `<h1>` shows "🐍 银河蛇"
- **`public/src/render/overlays.js`**: Title screen renders "🐍 SNAKE" and "METROIDVANIA" on canvas

### Expected Behavior
The game name should be changed to something that better fits the user's personal style and the game's content (a metroidvania-style snake game with exploration, combat, and item collection). On opening the game, the title screen should display the new name.

### User Scenarios
- **Scenario A:** Player opens the game → sees the title screen with the new game name
- **Scenario B:** The HTML `<title>` tag reflects the new name for browser tabs/bookmarks
- **Frequency:** Every time the game loads

---

## 2. Root Cause Analysis (Feature) / Design Intent

### Why Does Current Behavior Exist?
The current name "银河蛇" (Galaxy Snake / Milky Way Snake) was chosen during initial development. It's a Chinese-language name that combines "银河" (galaxy/milky way) with "蛇" (snake), fitting the metroidvania+snake hybrid concept.

### Why Change Now?
The user wants a name that better reflects their personal style and the game's evolving content. With features like combat, items, rooms, and RPG elements, the game has grown beyond a simple "snake" game.

### Previous Constraints
- Game is deployed on Vercel at `gameboy.html`
- HTML titles affect SEO/browser bookmarks
- Canvas-rendered title on the start screen
- The name must work in both Chinese and English contexts

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `index.html` | Root HTML | Update `<title>` and `<h1>` content |
| `public/gameboy.html` | Game HTML | Update `<title>` and `<h1>` content |
| `public/src/render/overlays.js` | Canvas Renderer | Update title screen text (`renderTitleScreen` function) |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/render/renderer.js` | Render Dispatch | Only if new title needs different rendering |
| `public/src/engine/constants.js` | Game Constants | Only if game name is made a configurable constant |

### Data Flow Impact
- Static content change only — no data flow changes
- No game state modifications needed
- No save data or network dependencies

### Documents to Update
- [x] `docs/PRD/101-game-rename.md` (this document)
- [ ] `docs/DESIGN/101-game-rename.md`
- [ ] `README.md` (if game name appears there)
- [ ] Other: ___

---

## 4. Solution Comparison

### Approach A: Direct String Replace (Recommended)
- **Description:** Replace "银河蛇" and "🐍 银河蛇" strings with new name in all files. Update canvas title text in overlays.js.
- **Pros:** Simple, fast, no new infrastructure needed
- **Cons:** Manually needs to update all locations
- **Risk:** Low — straightforward text replacement
- **Effort:** ~15 minutes

### Approach B: Configurable Game Title Constant
- **Description:** Extract game name into a constant in `constants.js` and reference it from all files (HTML + JS)
- **Pros:** Single source of truth, easy to change again
- **Cons:** HTML files would need JS injection or build step to read the constant; over-engineered for a simple rename
- **Risk:** Low — but introduces complexity for no real gain
- **Effort:** ~1 hour

### Approach C: CSS + JS Dynamic Title
- **Description:** Use JavaScript to set the document title and h1 text dynamically from a constant
- **Pros:** Dynamic, could support future theming
- **Cons:** Increases load time complexity; title change isn't visible until JS executes
- **Risk:** Medium — JS dependency for basic content
- **Effort:** ~30 minutes

### Recommendation
→ **Approach A (Direct Replace)** because: This is a one-time rename with low risk. The game needs a simple, clean name change. Approach B and C add unnecessary complexity for a cosmetic text change. The change touches exactly 3 files with clear, unambiguous locations.

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. Open `index.html` and `public/gameboy.html` — new name appears in `<title>` and `<h1>`
2. Open the game and see the title screen — new name rendered on canvas
3. Browser tab shows the new game name

### Edge Cases
1. **Long names:** If the new name is very long, it should still fit in the canvas title (currently fits ~20-30 chars at 24px)
2. **Emoji names:** If the new name includes emoji, verify it renders correctly on canvas
3. **Mixed Chinese/English:** If the name mixes Chinese and English, verify font rendering works (monospace font may handle differently)

### Failure Paths
1. **Missed location:** If one of the 3 files is not updated, the old name will appear inconsistently
2. **Canvas clipping:** If the new name is too long for the canvas, it may clip off-screen

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| None | — | Low |

### Blocks
| Future Work | Priority |
|-------------|----------|
| None | — |

### Preparation Needed
- [ ] Decide on the new game name before implementation

---

## 7. Spike / Experiment (Optional — depth/deep only)

### Question to Answer
_Not applicable for light depth._

### Method
_Not applicable for light depth._

### Result
_Not applicable for light depth._

### Impact on Approach
_Not applicable for light depth._
