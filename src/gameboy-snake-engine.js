// gameboy-snake-engine.js — Core game engine for GameBoy-style snake

export const GRID_SIZE = 20;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
export const POINTS_PER_FOOD = 10;

export const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function centerX() {
  return Math.floor(GRID_SIZE / 2);
}

export function createInitialState() {
  const cx = centerX();
  const snake = [
    { x: cx, y: 10 },
    { x: cx - 1, y: 10 },
    { x: cx - 2, y: 10 },
  ];
  return {
    gameState: 'idle',
    snake,
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: spawnFood(snake),
    score: 0,
    tickCount: 0,
  };
}

export function startGame(state) {
  const next = structuredClone(state);
  next.gameState = 'playing';
  return next;
}

export function resetGame() {
  return createInitialState();
}

export function changeDirection(state, dir) {
  // Lock during idle/won/gameover — return same state reference
  if (state.gameState !== 'playing') {
    return state;
  }

  // Check reverse direction against buffered nextDirection
  if (isOpposite(state.nextDirection, dir)) {
    return state;
  }

  const next = structuredClone(state);
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

  const direction = state.nextDirection;

  // Calculate new head position
  const head = state.snake[0];
  const newHead = { x: head.x + direction.x, y: head.y + direction.y };

  // Check wall/self collision
  if (checkCollision(newHead, state.snake) !== 'none') {
    return {
      ...structuredClone(state),
      direction,
      gameState: 'gameover',
      tickCount: state.tickCount + 1,
    };
  }

  // Check food collision
  const ateFood = newHead.x === state.food.x && newHead.y === state.food.y;

  let newSnake;
  let newScore;
  let newFood;
  let newGameState;

  if (ateFood) {
    newSnake = structuredClone(state.snake);
    newSnake.unshift(newHead);
    newScore = state.score + POINTS_PER_FOOD;
    // Cap snake at TOTAL_CELLS and check victory
    if (newSnake.length >= TOTAL_CELLS) {
      newSnake = newSnake.slice(0, TOTAL_CELLS);
      newFood = state.food;
      newGameState = 'won';
    } else {
      newFood = spawnFood(newSnake);
      newGameState = 'playing';
    }
  } else {
    newSnake = [newHead, ...state.snake.slice(0, -1)];
    newScore = state.score;
    newFood = state.food;
    newGameState = 'playing';
  }

  return {
    ...structuredClone(state),
    snake: newSnake,
    direction,
    score: newScore,
    food: newFood,
    gameState: newGameState,
    tickCount: state.tickCount + 1,
  };
}

export function isVictory(state) {
  return state.snake.length >= TOTAL_CELLS;
}

export function spawnFood(snake) {
  if (snake.length >= TOTAL_CELLS) {
    return null;
  }
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
