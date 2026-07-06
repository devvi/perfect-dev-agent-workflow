// gameboy-snake-engine.js — Core game engine for GameBoy-style snake
// This is a STUB for TDD purposes. Implement-agent will fill in logic.

export const GRID_SIZE = 20;
export const TOTAL_CELLS = GRID_SIZE * GRID_SIZE; // 400
export const POINTS_PER_FOOD = 10;

export const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

/** Create initial game state: snake length 3, centered, idle */
export function createInitialState() {
  // STUB — returns empty state
  return {};
}

/** Transition from idle to playing */
export function startGame(state) {
  // STUB — returns state unchanged
  return state;
}

/** Reset to fresh state */
export function resetGame() {
  return createInitialState();
}

/** Set nextDirection; reject reverse; lock during idle/won/gameover */
export function changeDirection(state, dir) {
  // STUB — returns state unchanged
  return state;
}

/** Check collision type: 'wall' | 'self' | 'food' | 'none' */
export function checkCollision(head, snake) {
  return 'none';
}

/** Main game tick — advance one step */
export function tick(state) {
  // STUB — returns state unchanged
  return state;
}

/** Check if snake fills entire grid */
export function isVictory(state) {
  return false;
}

/** Spawn food at random position not on snake */
export function spawnFood(snake) {
  return { x: 5, y: 5 };
}
