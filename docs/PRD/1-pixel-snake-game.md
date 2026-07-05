# Research: 像素贪吃蛇游戏

> Parent Issue: #1
> Agent: research-agent
> Date: 2026-07-06

---

## 1. Problem Definition

### Current Behavior
The repository is a workflow/framework project with no game content at all. There is no `src/` directory, no static files, and no web server to serve any HTML content. Opening the repo in a browser yields nothing playable.

### Expected Behavior
A fully playable pixel-art Snake game that runs in a browser. The user should be able to:
- Open an `index.html` (or the Vercel-deployed URL) and immediately see a pixel-style snake game
- Control the snake with arrow keys
- Eat food pellets to grow the snake and increase score
- Experience proper collision detection (walls, self)
- See a game-over screen with a restart button

### User Scenarios
- **Scenario A:** K opens the deployed Vercel URL in a browser and plays. No setup required.
- **Scenario B:** Developer clones the repo, opens `index.html` locally, and plays/iterates.
- **Frequency:** Single feature; game is played on demand. No recurring automation needed.

---

## 2. Root Cause Analysis / Design Intent

### Why Does Current Behavior Exist?
The repo was created as a development workflow framework (Perfect Dev Agent Workflow). It has no game code, no frontend assets, and no intention of being a game delivery platform — until this feature request.

### Why Change Now?
This is the first real feature for the new workflow to process end-to-end. It serves as both a functional deliverable (a playable game) and a proof-of-concept that the Perfect Dev Agent Workflow can produce tangible software, not just pipeline scaffolding.

### Previous Constraints
- The game must be a **single self-contained HTML file** (or minimal file set) so it works with Vercel's static deploy with zero backend.
- Must preserve the existing workflow structure (do not break AGENTS.md, templates, CI/CD files).
- Must use **pixel-art style** (blocky/retro visual), not smooth graphics.

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `src/snake-game/index.html` | Game entry point | New — the entire game HTML/CSS/JS |
| `src/snake-game/game.js` | Game logic | New — snake movement, collision, score, game loop |
| `src/snake-game/style.css` | Visual style | New — pixel-art CSS rendering |
| `src/snake-game/pixel-font.css` | Pixel font | New — retro pixel font if not inline |

Alternatively, if a single-file approach is chosen:
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/index.html` (or `index.html` at root) | All-in-one game | New — inline HTML/CSS/JS in one file |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `README.md` | Docs | May need a link/screenshot of the game |
| `vercel.json` | Deploy config | May need updates if routes change |
| `.github/workflows/deploy.yml` | CI | May need config update if build step is added |

### Data Flow Impact
No backend or database. The entire data flow is in-browser:
1. User input (keyboard) → event listener → game state update
2. Game state (snake positions, food position, score, direction, alive) → requestAnimationFrame → Canvas/draw call
3. Collision detection during state update → game-over condition → UI overlay

### Documents to Update
- [x] `docs/PRD/1-pixel-snake-game.md` — this document
- [ ] `README.md` — add game screenshot/link post-implementation
- [ ] `vercel.json` — verify routing works for the new entry point

---

## 4. Solution Comparison

### Approach A: Vanilla JS + Canvas
- **Description:** Single HTML file with inline `<canvas>` element. All game logic (snake array, direction, game loop via `requestAnimationFrame` or `setInterval`, keyboard input, collision detection) in one JS block. Pixel-art look achieved by drawing filled rectangles on a small Canvas (e.g., 20×20 grid, each cell 16px) with nearest-neighbor scaling.
- **Pros:**
  - Single file — zero build step, works on Vercel static hosting immediately
  - Full control over pixel rendering
  - Very fast, no external dependencies
  - Canvas handles the grid rendering efficiently
  - Easy to achieve pixel-art look with `image-rendering: pixelated`
- **Cons:**
  - Canvas API has a learning curve for pixel-perfect rendering
  - All-in-one file can get messy for complex games (fine for Snake)
  - Manual `requestAnimationFrame` timing (need to cap speed, not render rate)
- **Risk:** Low — Canvas Snake is one of the most documented beginner game projects
- **Effort:** ~300–500 lines, 2–4 hours

### Approach B: HTML Elements Grid
- **Description:** Create a grid of `<div>` elements, each representing a cell. The snake is rendered by toggling CSS classes on cells (e.g., `.snake-head`, `.snake-body`, `.food`). The game loop updates the DOM directly.
- **Pros:**
  - No Canvas API knowledge needed — just DOM manipulation
  - Easy to style with CSS (animations, transitions)
  - Accessible by default (screen readers can see elements)
- **Cons:**
  - DOM updates for a 20×20 grid (400 elements) every frame — performance concerns at larger sizes
  - Much more verbose HTML/JS
  - Harder to achieve true pixel-art feel without Canvas scaling
  - More memory overhead per cell
- **Risk:** Medium — DOM manipulation at game-loop speed can cause jank; larger grids may lag
- **Effort:** ~400–600 lines, 3–5 hours

### Recommendation
→ **Approach A (Vanilla JS + Canvas)** because: it's the standard approach for pixel-art browser games, gives full control over rendering, requires zero build tools, and performs well even on low-powered devices. The single-file delivery minimizes deploy complexity and matches the project's "simple and self-contained" constraint perfectly.

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. User opens `index.html` → game canvas renders with a snake (length 3) and one food item
2. User presses Arrow Right → snake moves right one cell per tick
3. Snake head reaches food cell → score increases by 10, snake grows by 1, new food spawns at random empty cell
4. Game continues with increasing speed as score grows (optional difficulty curve)
5. User closes tab → no state to preserve (ephemeral)

### Edge Cases
1. **Wall collision:** Snake head moves beyond grid boundary (e.g., x < 0, x >= cols, y < 0, y >= rows) → game over. **Expected:** Game ends immediately, show "Game Over" overlay with final score and restart button.
2. **Self-collision:** Snake head moves onto a cell occupied by its own body (excluding the tail segment that just moved away) → game over. **Expected:** Game ends immediately, same overlay as wall collision.
3. **Food spawns on snake body:** When generating a new food position, the random cell happens to be occupied by the snake. **Expected:** Re-roll until an empty cell is found. If all cells are occupied (snake fills entire grid) → player wins (victory condition, alternate to game-over).
4. **Rapid key presses:** User presses two direction keys within one tick (e.g., Right then Down before next tick). **Expected:** Only the last valid direction change is applied per tick. 180-degree reversal (e.g., pressing Left while moving Right) is ignored.
5. **Window resize / tab switch:** Browser tab goes to background → `requestAnimationFrame` pauses. **Expected:** Game pauses or continues at correct delta time — no burst of moves when tab regains focus.

### Failure Paths
1. **Food spawn with no empty cells:** Snake fills entire grid (victory condition). **Expected:** Display "You Win!" message with final score and restart button instead of game-over.
2. **Vercel deploy routes:** If the game file is at `index.html` in the root, Vercel automatically serves it. If in a subdirectory, Vercel config may need a rewrite rule.

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| Browser runtime (Canvas API) | Every modern browser supports it | None |
| Vercel static hosting | Already configured in repo | Low |
| Vercel deploy workflow | Already exists (`.github/workflows/deploy.yml`) | Low |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Mobile touch controls | Low — nice-to-have after MVP |
| High-score persistence (localStorage) | Low — post-MVP |
| Power-ups / obstacles | Low — future iteration |

### Preparation Needed
- [ ] Verify `vercel.json` routes if game file is placed in subdirectory
- [ ] Confirm `deploy.yml` picks up the new files without modification
- [ ] No npm/node dependencies needed — game is pure HTML/CSS/JS

---

## 7. Spike / Experiment (Optional)

### Question to Answer
What is the ideal grid size and cell pixel size for a pixel-art Snake game that looks retro and plays well on both desktop and mobile viewports?

### Method
Render a quick prototype canvas (20×20 grid, 16px cells) that scales to viewport using CSS `image-rendering: pixelated` + `width/height` scaling. Test on:
- Desktop 1920×1080
- Mobile 375×667 (iPhone SE)

### Result
- 20×20 grid with 16px logical cells → scaled to 320×320 CSS pixels works well on both
- On mobile, the canvas can be centered and given a max-width of 90vw to prevent overflow
- Speed: 200ms per tick (5 moves/sec) feels right for classic Snake; can increase every 5 food eaten

### Impact on Approach
Confirms Approach A (Canvas) is the right choice. The cell size and tick speed parameters can be defined as constants at the top of the script, making them easy to tune.
