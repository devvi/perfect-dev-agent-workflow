# Design: GameBoy 风格贪吃蛇游戏

> Parent Issue: #5
> Agent: plan-agent
> Date: 2026-07-06

---

## 1. Architecture Overview

### Tech Stack
- **Runtime:** Vanilla JavaScript (ES6+), no framework
- **Rendering:** HTML5 Canvas 2D API
- **Styling:** Inline CSS, no external dependencies
- **Testing:** Vitest (isolated engine tests)
- **Deployment:** Single HTML file served from `public/gameboy.html`

### File Structure
```
perfect-dev-agent-workflow/
├── docs/
│   ├── PRD/5-gameboy-snake-game.md         ← Research output
│   ├── TASKS/5-gameboy-snake-game.md       ← Task breakdown
│   └── DESIGN/5-gameboy-snake-game.md      ← This file (Plan)
├── public/
│   ├── index.html                          ← Existing dark theme (Issue #1)
│   ├── about.html                          ← Existing about page
│   └── gameboy.html                        ← NEW: GameBoy snake game
├── tests/
│   └── gameboy-snake.test.js               ← NEW: Engine test suite
└── src/
    └── gameboy-snake-engine.js             ← NEW: Extract core engine (testable)
```

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File structure | Extract engine to `src/` + HTML shell in `public/` | Testability — Vitest cannot import from an inline script in HTML |
| State management | Singleton module with closure | Simple, no framework needed for this scope |
| Game loop | `setInterval` at 150ms (consistent tick) | Matches GameBoy's ~6.5 FPS feel; avoids `requestAnimationFrame` drift for grid games |
| Rendering | Canvas 2D `fillRect` + pixel gap | Precise pixel control; `image-rendering: pixelated` CSS |
| Test strategy | Isolate engine logic (no DOM/Canvas dependency) | Pure function tests are fast, deterministic, and runnable in Node.js |

---

## 2. Data Structures

### Constants
```js
const GRID_SIZE = 20;         // 20×20 grid
const CELL_SIZE = 20;         // pixels per cell
const TICK_MS = 150;          // game loop interval
const INITIAL_SNAKE_LENGTH = 3;
const POINTS_PER_FOOD = 10;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 400

// GameBoy 4-color palette
const PALETTE = {
  BG:         '#9bbc0f', // lightest green (LCD background)
  LIGHT:      '#8bac0f', // light green (snake/score)
  DARK:       '#306230', // dark green (food/walls)
  DARKEST:    '#0f380f', // darkest green (text/borders)
};
```

### Game State
```js
// Direction vectors
const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

// Core game state (snake engine)
{
  snake: [
    { x: 10, y: 10 },  // head (index 0)
    { x:  9, y: 10 },  // body
    { x:  8, y: 10 },  // tail (last index)
  ],
  food: { x: 5, y: 5 },
  direction:  DIR.RIGHT,          // current movement direction
  nextDirection: DIR.RIGHT,       // buffered next direction
  score: 0,
  gameState: 'idle' | 'playing' | 'won' | 'gameover',
  tickCount: 0,
}
```

---

## 3. Key Functions / Components

### Engine Module (`src/gameboy-snake-engine.js`)

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `createInitialState()` | `() → GameState` | Returns fresh game state: 3-cell snake centered, random food, idle state |
| `startGame(state)` | `(GameState) → GameState` | Transitions state from `idle` to `playing` |
| `tick(state)` | `(GameState) → GameState` | Main game tick: consume buffered direction → move snake → check collisions → return new state |
| `changeDirection(state, dir)` | `(GameState, DIR) → GameState` | Set `nextDirection`. Ignores reverse direction (180° turn) and locked input during `idle`/`won`/`gameover` |
| `checkCollision(head, snake)` | `({x,y}, Array) → string` | Returns `'wall'`, `'self'`, `'food'`, or `'none'` |
| `isVictory(state)` | `(GameState) → boolean` | Returns `true` when `snake.length >= TOTAL_CELLS` |
| `spawnFood(snake)` | `(Array) → {x,y}` | Returns random position not occupied by snake body |
| `resetGame()` | `() → GameState` | Alias for `createInitialState()` |

### Game Loop & Rendering (inline in `gameboy.html`)

| Component | Responsibility |
|-----------|----------------|
| `gameLoop()` | `setInterval` callback: tick engine, then render. Clear on idle. |
| `render(ctx, state)` | Top-level render dispatch |
| `renderBackground(ctx)` | Fill canvas with `PALETTE.BG` |
| `renderGrid(ctx)` | Draw pixel grid with 1px gaps using `PALETTE.DARKEST` for gaps |
| `renderSnake(ctx, snake)` | Draw each snake cell with `PALETTE.LIGHT` (head) and `PALETTE.DARK` (body) |
| `renderFood(ctx, food)` | Draw food cell with `PALETTE.DARKEST` |
| `renderScore(ctx, score)` | Draw score in pixel font at top |
| `renderOverlay(ctx, gameState, score)` | Draw translucent game-over or win overlay |
| `renderScanlines(ctx)` | Optional: semi-transparent horizontal lines |
| `renderGameBoyFrame(ctx, canvas)` | Draw outer GameBoy shell, label, indicator light |

### Input Handling

| Event | Action |
|-------|--------|
| `keydown ArrowUp` | `changeDirection(state, DIR.UP)` |
| `keydown ArrowDown` | `changeDirection(state, DIR.DOWN)` |
| `keydown ArrowLeft` | `changeDirection(state, DIR.LEFT)` |
| `keydown ArrowRight` | `changeDirection(state, DIR.RIGHT)` |
| `keydown ' '` (Space) | If `won` or `gameover`, restart game |
| `keydown Enter` | If `won` or `gameover`, restart game |
| `keydown Arrow*` | If `idle`, start game then set direction |

---

## 4. Rendering / UI Strategy

### Layer Order (bottom to top)
1. **LCD background** — Fill canvas with `#9bbc0f`
2. **Pixel grid** — Draw 1px dark gaps between cells (20×20 grid)
3. **Snake** — Light green with head slightly brighter
4. **Food** — Darkest green pixel
5. **Score text** — Top-center, dark green, monospace font
6. **Overlay** — Semi-transparent dark for game-over/win; text centered
7. **Scanlines** — Optional every-other-row dark horizontal lines (3% opacity)
8. **GameBoy frame** — Outer border (dark grey), label "GAME BOY", battery indicator

### Canvas Sizing
- **Logical size:** 400×400 (20 cells × 20px)
- **CSS:** `width: 400px; height: 400px; max-width: 100%; height: auto;`
- **High DPI:** Use `canvas.width = 400 * devicePixelRatio`, then CSS scale down
- **Pixel-perfect:** `image-rendering: pixelated;`

### GameBoy Shell Frame
- Outer border: 20px thick dark grey (`#444`)
- Rounded corners (CSS `border-radius`)
- Text "GAME BOY" at bottom-center in pixelated monospace
- Small red/green LED indicator (top-right)

---

## 5. Input Handling

- **Direction buffer:** `keydown` handler writes to `state.nextDirection`; `tick()` consumes it once per tick. Prevents multi-input jitter.
- **Reverse direction lock:** If `direction + nextDirection` sums to 0 (x or y cancel out), reject the input.
- **Idle → Playing:** Any arrow key press starts the game from idle state.
- **Restart:** Space / Enter in gameover/won state triggers full reset.
- **Passive key events:** No `preventDefault()` during overlay to allow page scroll if needed; but directional arrows should be prevented on the canvas.

---

## 6. Phased Implementation Tasks

### Phase 1: Core Engine + Boot (TDD)
- [ ] Create `src/gameboy-snake-engine.js` with all pure functions
- [ ] Write `tests/gameboy-snake.test.js` covering all functions and edge cases
- [ ] Verify tests compile and fail (TDD — no rendering yet)

### Phase 2: GameBoy HTML Page
- [ ] Create `public/gameboy.html` with inline HTML/CSS shell
- [ ] Game loop with `setInterval`, engine integration
- [ ] All rendering layers: background → grid → snake → food → score
- [ ] GameBoy 4-color palette, pixel gap rendering
- [ ] Input handling (arrow keys, space, enter)
- [ ] Game-over / win overlays

### Phase 3: Visual Polish
- [ ] GameBoy shell frame with label and indicator
- [ ] Scanline overlay effect
- [ ] High DPI canvas support
- [ ] Responsive sizing (CSS max-width)
- [ ] About page link update

---

## 7. Acceptance Test Cases

Mapped to research boundary conditions:

| # | Test | Expected | Phase |
|---|------|----------|-------|
| 1 | New game state is idle with snake length 3 | `state.gameState === 'idle'`, `state.snake.length === 3` | P1 |
| 2 | Arrow key starts game (idle→playing) | `state.gameState === 'playing'` after `startGame()` | P1 |
| 3 | Snake moves one cell per tick in current direction | Position changes by (1,0) for RIGHT | P1 |
| 4 | Eating food increments length by 1 and score by 10 | `snake.length +1`, `score +10` | P1 |
| 5 | New food spawns not on snake body | Food position not in snake array | P1 |
| 6 | Reverse direction is rejected (180° turn) | Calling `changeDirection(LEFT)` while moving RIGHT is ignored | P1 |
| 7 | Collision with wall → gameover | `gameState === 'gameover'` when head x ∉ [0, GRID_SIZE) | P1 |
| 8 | Collision with self → gameover | `gameState === 'gameover'` when head overlaps body | P1 |
| 9 | Snake fills entire grid → victory | `gameState === 'won'` when `snake.length >= TOTAL_CELLS` | P1 |
| 10 | Space/Enter restarts after gameover | State resets to initial after restart | P1 |
| 11 | Multi-key input between ticks only applies last valid | Only one direction change per tick | P1 |
| 12 | Food spawns deterministically when snake covers most grid | Handles edge case of no empty cells | P1 |
| 13 | Canvas rendering uses GameBoy palette colors | Visual verification | P2 |
| 14 | Pixel grid has 1px gaps between cells | Visual verification | P2 |
| 15 | GameBoy shell frame renders correctly | Visual verification | P3 |
| 16 | Scanline overlay renders | Visual verification | P3 |

---

## 8. Error Handling / Boundary Cases

| Condition | Handling |
|-----------|----------|
| Snake fills all 400 cells | Victory state triggers before wall/self collision check |
| No valid food spawn position | Detect all cells occupied → skip food generation or win |
| Canvas API unavailable | `<canvas>` fallback text: "Your browser does not support Canvas" |
| Extremely rapid key presses | Direction buffer accepts only one change per tick; overwrites on rapid press |
| Window resize | CSS `max-width: 100%` keeps aspect ratio; no logic change |
| No arrow keys present (mobile) | Post-MVP: add virtual D-pad overlay |
| devicePixelRatio non-integer | Use `Math.floor(400 * devicePixelRatio)` for crisp pixels |
