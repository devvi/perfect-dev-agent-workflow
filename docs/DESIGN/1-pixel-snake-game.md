# Design: 像素贪吃蛇游戏

> Parent Issue: #1
> Agent: plan-agent
> Date: 2026-07-06

---

## 1. Architecture Overview

### Tech Stack
- **Rendering:** HTML5 Canvas (2D context)
- **Runtime:** Vanilla JavaScript, no dependencies
- **Styling:** CSS with `image-rendering: pixelated` for retro look
- **Deploy:** Static, zero build — works on Vercel and `file://` protocol

### File Structure
```
public/index.html          ← Single self-contained game file (inline HTML/CSS/JS)
tests/snake.test.js        ← Vitest test cases (unit tests for game logic)
```

**Decision:** Single-file approach. All game logic is in one HTML file for maximum simplicity and Vercel compatibility. The test file separates game logic functions for unit testing.

---

## 2. Game Data Structures

```javascript
// Grid constants
const GRID_COLS = 20;
const GRID_ROWS = 20;
const CELL_SIZE = 16;        // logical pixels
const TICK_MS = 200;         // ms per game tick
const SPEED_INCREASE_MS = 20; // ms faster per speed level
const SCORE_PER_FOOD = 10;

// Game state
let snake = [               // array of {x, y}, head at index 0
  { x: 10, y: 10 },
  { x: 9,  y: 10 },
  { x: 8,  y: 10 }
];
let direction = { x: 1, y: 0 };     // current direction
let nextDirection = { x: 1, y: 0 }; // buffered input
let food = { x: 15, y: 10 };        // food position
let score = 0;
let gameOver = false;
let gameLoopId = null;
```

---

## 3. Game Loop

```
function gameLoop():
  1. direction = nextDirection          (apply buffered input)
  2. head = { snake[0].x + direction.x, snake[0].y + direction.y }
  3. Check wall collision → game over
  4. Check self collision → game over
  5. Add head to snake front
  6. If head === food:
       score += 10
       generate new food (not on snake)
     Else:
       remove tail
  7. Draw everything
  8. scheduleTick() → setTimeout(gameLoop, tickMs)
```

Tick timing uses `setTimeout` with a fixed interval. The interval decreases as score increases (every 5 food eaten).

---

## 4. Key Functions

| Function | Description |
|----------|-------------|
| `init()` | Reset game state to initial values |
| `tick()` | One step of the game loop |
| `checkWallCollision(head)` | Returns true if head is outside grid |
| `checkSelfCollision(head)` | Returns true if head overlaps snake body |
| `generateFood()` | Returns `{x, y}` on an empty cell |
| `changeDirection(newDir)` | Sets `nextDirection`, rejecting 180° reversals |
| `draw()` | Renders snake, food, score on canvas |
| `drawGameOver()` | Shows game-over overlay with score + restart button |
| `restart()` | Re-initializes and starts a new game |

---

## 5. Rendering Strategy

- Canvas sized at `GRID_COLS * CELL_SIZE` × `GRID_ROWS * CELL_SIZE` (320×320 logical pixels)
- CSS scales the canvas to viewport-appropriate size (max 90vw) with `image-rendering: pixelated`
- Snake head: slightly brighter green
- Snake body: alternating green shades for pixel-art look
- Food: red square with a subtle glow effect
- Grid background: dark green with subtle lines

---

## 6. Input Handling

- `keydown` listener on `document`
- Maps arrow keys to direction vectors:
  - ArrowUp → `{x: 0, y: -1}`
  - ArrowDown → `{x: 0, y: 1}`
  - ArrowLeft → `{x: -1, y: 0}`
  - ArrowRight → `{x: 1, y: 0}`
- **180° reversal check:** If `newDir.x === -direction.x && newDir.y === -direction.y`, ignore
- Input is buffered to `nextDirection` and applied once per tick

---

## 7. Acceptance Tests

See `tests/snake.test.js` for the full test suite.

| Test Case | Description |
|-----------|-------------|
| Snake moves in correct direction | After one tick, head moves by direction vector |
| Snake grows when eating food | After head reaches food, snake length increases by 1 |
| Wall collision → game over | Head at grid boundary, moving out → game over |
| Self collision → game over | Head moves into own body → game over |
| Food spawns in valid position | Generated food position is not on any snake segment |
| Score increments correctly | Eating food adds `SCORE_PER_FOOD` to score |
| 180° reversal is ignored | Pressing opposite direction has no effect |
| Restart resets game state | After game over, restart clears all state |
| Victory state | Snake fills entire grid → win condition |

---

## 8. Error Handling / Boundary Cases

- **Rapid key presses:** Only last valid direction per tick; 180° reversals silently ignored
- **Tab switch:** Game pauses (requestAnimationFrame stops), no burst on return
- **Vercel deploy:** Single file at `public/index.html` — no route config needed
- **Empty grid for food:** If no empty cells exist, trigger victory instead of infinite loop
