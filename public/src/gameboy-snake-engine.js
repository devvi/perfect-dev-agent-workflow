// FILE: src/gameboy-snake-engine.js

export const GRID_SIZE = 20;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
export const POINTS_PER_FOOD = 10;

// Stuck+Reverse mechanic (Issue #46)
export const STUCK_TICKS = 5;

export const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function cloneState(state) {
  return structuredClone(state);
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

export function createInitialState() {
  const centerX = Math.floor(GRID_SIZE / 2);
  const snake = [
    { x: centerX, y: 10 },
    { x: centerX - 1, y: 10 },
    { x: centerX - 2, y: 10 },
  ];
  return {
    gameState: 'idle',
    snake,
    direction: DIR.RIGHT,
    nextDirection: DIR.RIGHT,
    food: spawnFood(snake),
    score: 0,
    tickCount: 0,
    stuckCounter: 0,
    pendingReverse: false,
  };
}

export function startGame(state) {
  const next = cloneState(state);
  next.gameState = 'playing';
  return next;
}

export function resetGame() {
  return createInitialState();
}

export function changeDirection(state, dir) {
  if (state.gameState !== 'playing') {
    return state;
  }
  const currentDir = state.nextDirection;
  if (isOpposite(currentDir, dir)) {
    return cloneState(state);
  }
  const next = cloneState(state);
  next.nextDirection = dir;
  return next;
}

export function checkCollision(head, snake, food) {
  if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
    return 'wall';
  }
  for (let i = 1; i < snake.length; i++) {
    if (snake[i].x === head.x && snake[i].y === head.y) {
      return 'self';
    }
  }
  if (food && head.x === food.x && head.y === food.y) {
    return 'food';
  }
  return 'none';
}

export function tick(state) {
  if (state.gameState !== 'playing') {
    return state;
  }

  const next = cloneState(state);
  next.tickCount++;

  // Stuck handler — countdown then reverse (Issue #46)
  if (next.stuckCounter > 0) {
    next.stuckCounter--;
    if (next.stuckCounter === 0 && next.pendingReverse) {
      // Execute reverse: tail becomes head, head becomes tail
      next.snake = next.snake.reverse();
      next.direction = { x: -next.direction.x || 0, y: -next.direction.y || 0 };
      next.nextDirection = { x: next.direction.x, y: next.direction.y };
      next.pendingReverse = false;
    }
    return next;
  }

  const dir = next.nextDirection;
  next.direction = dir;

  const head = next.snake[0];
  const newHead = { x: head.x + dir.x, y: head.y + dir.y };

  const collision = checkCollision(newHead, next.snake);

  // Wall collision → stuck+reverse (not instant gameover)
  if (collision === 'wall') {
    next.stuckCounter = STUCK_TICKS;
    next.pendingReverse = true;
    next.score = Math.max(0, next.score - 5);
    return next;
  }

  // Self collision → instant gameover (lethal)
  if (collision === 'self') {
    next.gameState = 'gameover';
    return next;
  }

  const ateFood = newHead.x === next.food.x && newHead.y === next.food.y;

  if (ateFood) {
    next.snake = [newHead, ...next.snake];
    next.score += POINTS_PER_FOOD;

    if (next.snake.length >= TOTAL_CELLS) {
      next.snake = next.snake.slice(0, TOTAL_CELLS);
      next.gameState = 'won';
      return next;
    }

    next.food = spawnFood(next.snake);
  } else {
    next.snake = [newHead, ...next.snake.slice(0, -1)];
  }

  return next;
}

export function isVictory(state) {
  return state.snake.length >= TOTAL_CELLS;
}

export function spawnFood(snake) {
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const empty = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) {
        empty.push({ x, y });
      }
    }
  }
  if (empty.length === 0) return null;
  return empty[randomInt(empty.length)];
}
