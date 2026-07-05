// Snake Game Engine — pure logic, no DOM

export const GRID_COLS = 20;
export const GRID_ROWS = 20;
export const SCORE_PER_FOOD = 10;

/**
 * Create initial game state
 */
export function createInitialState() {
  return {
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: { x: 15, y: 10 },
    score: 0,
    gameOver: false,
    won: false,
  };
}

/**
 * Check if a head position collides with walls
 */
export function checkWallCollision(head) {
  return head.x < 0 || head.x >= GRID_COLS || head.y < 0 || head.y >= GRID_ROWS;
}

/**
 * Check if a head position collides with the snake body (excluding tail that will move)
 */
export function checkSelfCollision(head, snake, preserveTail = false) {
  // If we're not preserving the tail, the last segment will move away,
  // so we exclude it from collision check
  const body = preserveTail ? snake : snake.slice(0, -1);
  return body.some(seg => seg.x === head.x && seg.y === head.y);
}

/**
 * Check if a position matches the food
 */
export function isEatingFood(head, food) {
  return head.x === food.x && head.y === food.y;
}

/**
 * Generate a random food position not on the snake
 * Returns null if no empty cell exists (victory condition)
 */
export function generateFood(snake) {
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const emptyCells = [];
  for (let x = 0; x < GRID_COLS; x++) {
    for (let y = 0; y < GRID_ROWS; y++) {
      if (!occupied.has(`${x},${y}`)) {
        emptyCells.push({ x, y });
      }
    }
  }
  if (emptyCells.length === 0) return null;
  return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

/**
 * Validate and buffer a new direction; rejects 180° reversals
 */
export function changeDirection(newDir, currentDir) {
  // Reject 180° reversal
  if (newDir.x === -currentDir.x && newDir.y === -currentDir.y) {
    return currentDir;
  }
  return newDir;
}

/**
 * Process one game tick. Returns the new state (immutable).
 * If game over or won, returns state with gameOver true.
 */
export function tick(state) {
  if (state.gameOver) return state;

  const direction = state.nextDirection;
  const head = {
    x: state.snake[0].x + direction.x,
    y: state.snake[0].y + direction.y,
  };

  // Wall collision
  if (checkWallCollision(head)) {
    return { ...state, gameOver: true, won: false, direction };
  }

  // Self collision (preserve tail since we haven't moved yet)
  if (checkSelfCollision(head, state.snake, true)) {
    return { ...state, gameOver: true, won: false, direction };
  }

  const newSnake = [head, ...state.snake];
  let newScore = state.score;

  if (isEatingFood(head, state.food)) {
    newScore += SCORE_PER_FOOD;
    const newFood = generateFood(newSnake);
    if (newFood === null) {
      // Snake fills entire grid — victory!
      return {
        ...state,
        snake: newSnake,
        direction,
        score: newScore,
        gameOver: true,
        won: true,
      };
    }
    return {
      ...state,
      snake: newSnake,
      direction,
      food: newFood,
      score: newScore,
    };
  }

  // Remove tail
  newSnake.pop();

  return {
    ...state,
    snake: newSnake,
    direction,
  };
}

/**
 * Reset state to initial values
 */
export function resetGame() {
  return createInitialState();
}
