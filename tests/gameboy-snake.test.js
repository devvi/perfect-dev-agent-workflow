// FILE: tests/gameboy-snake.test.js

import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  startGame,
  tick,
  changeDirection,
  checkCollision,
  isVictory,
  spawnFood,
  resetGame,
  GRID_SIZE,
  TOTAL_CELLS,
  POINTS_PER_FOOD,
  DIR,
  STUCK_TICKS,
  BASE_TICK_INTERVAL,
  SPEED_SLOPE,
  calculateSpeed,
} from '../public/src/gameboy-snake-engine.js';

function stateWithSnake(snake, overrides = {}) {
  return {
    snake,
    food: { x: 5, y: 5 },
    direction: DIR.RIGHT,
    nextDirection: DIR.RIGHT,
    score: 0,
    gameState: 'playing',
    tickCount: 0,
    ...overrides,
  };
}

describe('createInitialState', () => {
  it('should return idle state with snake length 2, score 0, and centered at (10,10)', () => {
    const state = createInitialState();
    expect(state.gameState).toBe('idle');
    expect(state.snake).toHaveLength(2);
    expect(state.snake[0]).toEqual({ x: 10, y: 10 });
    expect(state.snake[1]).toEqual({ x: 9, y: 10 });
    expect(state.direction).toEqual(DIR.RIGHT);
    expect(state.nextDirection).toEqual(DIR.RIGHT);
    expect(state.score).toBe(0);
    expect(state.tickCount).toBe(0);
  });

  it('should spawn food not on the snake', () => {
    const state = createInitialState();
    expect(state.food).not.toBeNull();
    const onSnake = state.snake.some(
      s => s.x === state.food.x && s.y === state.food.y,
    );
    expect(onSnake).toBe(false);
  });
});

describe('startGame', () => {
  it('should transition from idle to playing', () => {
    const idle = createInitialState();
    const playing = startGame(idle);
    expect(playing.gameState).toBe('playing');
    expect(playing).not.toBe(idle);
  });

  it('should not modify snake or food', () => {
    const idle = createInitialState();
    const playing = startGame(idle);
    expect(playing.snake).toEqual(idle.snake);
    expect(playing.food).toEqual(idle.food);
  });
});

describe('resetGame', () => {
  it('should return a fresh initial state after gameover', () => {
    const state = createInitialState();
    const playing = startGame(state);
    const reset = resetGame();
    expect(reset.gameState).toBe('idle');
    expect(reset.snake).toEqual(state.snake);
    expect(reset.score).toBe(0);
    expect(reset.tickCount).toBe(0);
    expect(reset).not.toBe(state);
  });

  it('should produce same shape as createInitialState', () => {
    const a = createInitialState();
    const b = resetGame();
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });
});

describe('changeDirection', () => {
  it('should set nextDirection for valid direction changes', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.RIGHT, nextDirection: DIR.RIGHT });
    const next = changeDirection(state, DIR.UP);
    expect(next.nextDirection).toEqual(DIR.UP);
    expect(next.direction).toEqual(DIR.RIGHT);
    expect(next).not.toBe(state);
  });

  it('should reject reverse direction RIGHT→LEFT (180° turn)', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.RIGHT, nextDirection: DIR.RIGHT });
    const next = changeDirection(state, DIR.LEFT);
    expect(next.nextDirection).toEqual(DIR.RIGHT);
  });

  it('should reject reverse direction LEFT→RIGHT (180° turn)', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.LEFT, nextDirection: DIR.LEFT });
    const next = changeDirection(state, DIR.RIGHT);
    expect(next.nextDirection).toEqual(DIR.LEFT);
  });

  it('should reject reverse direction DOWN→UP (180° turn)', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.DOWN, nextDirection: DIR.DOWN });
    const next = changeDirection(state, DIR.UP);
    expect(next.nextDirection).toEqual(DIR.DOWN);
  });

  it('should reject reverse direction UP→DOWN (180° turn)', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.UP, nextDirection: DIR.UP });
    const next = changeDirection(state, DIR.DOWN);
    expect(next.nextDirection).toEqual(DIR.UP);
  });

  it('should allow perpendicular direction changes', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.RIGHT, nextDirection: DIR.RIGHT });
    expect(changeDirection(state, DIR.DOWN).nextDirection).toEqual(DIR.DOWN);
    expect(changeDirection(state, DIR.UP).nextDirection).toEqual(DIR.UP);
  });

  it('should reject reverse after a previous direction change was accepted', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.RIGHT, nextDirection: DIR.RIGHT });
    const withUp = changeDirection(state, DIR.UP);
    expect(withUp.nextDirection).toEqual(DIR.UP);
    const backDown = changeDirection(withUp, DIR.DOWN);
    expect(backDown.nextDirection).toEqual(DIR.UP);
  });

  it('should allow snake to move up after moving left (valid turn)', () => {
    const state = stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.LEFT, nextDirection: DIR.LEFT });
    const up = changeDirection(state, DIR.UP);
    expect(up.nextDirection).toEqual(DIR.UP);
  });

  it('should ignore direction change when gameState is idle', () => {
    const state = { ...stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.RIGHT, nextDirection: DIR.RIGHT }), gameState: 'idle' };
    const next = changeDirection(state, DIR.UP);
    expect(next.nextDirection).toEqual(DIR.RIGHT);
  });

  it('should ignore direction change when gameState is won', () => {
    const state = { ...stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.RIGHT, nextDirection: DIR.RIGHT }), gameState: 'won' };
    const next = changeDirection(state, DIR.UP);
    expect(next.nextDirection).toEqual(DIR.RIGHT);
  });

  it('should ignore direction change when gameState is gameover', () => {
    const state = { ...stateWithSnake([{ x: 10, y: 10 }], { direction: DIR.RIGHT, nextDirection: DIR.RIGHT }), gameState: 'gameover' };
    const next = changeDirection(state, DIR.UP);
    expect(next.nextDirection).toEqual(DIR.RIGHT);
  });
});

describe('checkCollision', () => {
  it('should return "wall" when head is outside left boundary (x < 0)', () => {
    expect(checkCollision({ x: -1, y: 5 }, [{ x: 0, y: 5 }])).toBe('wall');
  });

  it('should return "wall" when head is outside right boundary (x >= GRID_SIZE)', () => {
    expect(checkCollision({ x: GRID_SIZE, y: 5 }, [{ x: 0, y: 5 }])).toBe('wall');
  });

  it('should return "wall" when head is outside top boundary (y < 0)', () => {
    expect(checkCollision({ x: 5, y: -1 }, [{ x: 5, y: 0 }])).toBe('wall');
  });

  it('should return "wall" when head is outside bottom boundary (y >= GRID_SIZE)', () => {
    expect(checkCollision({ x: 5, y: GRID_SIZE }, [{ x: 5, y: 0 }])).toBe('wall');
  });

  it('should return "self" when head overlaps any body segment', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];
    expect(checkCollision({ x: 4, y: 5 }, snake)).toBe('self');
  });

  it('should return "food" when head overlaps food position', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ];
    expect(checkCollision({ x: 6, y: 5 }, snake, { x: 6, y: 5 })).toBe('food');
  });

  it('should return "none" when head is on empty cell not containing food', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ];
    expect(checkCollision({ x: 6, y: 5 }, snake, { x: 7, y: 5 })).toBe('none');
  });
});

describe('tick', () => {
  it('should move snake one cell in current direction', () => {
    const state = stateWithSnake([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    const next = tick(state);
    expect(next.snake[0]).toEqual({ x: 11, y: 10 });
    expect(next.snake).toHaveLength(3);
    expect(next.tickCount).toBe(1);
  });

  it('should consume nextDirection into direction', () => {
    const state = stateWithSnake([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ], { direction: DIR.RIGHT, nextDirection: DIR.UP });
    const next = tick(state);
    expect(next.direction).toEqual(DIR.UP);
    expect(next.snake[0]).toEqual({ x: 10, y: 9 });
  });

  it('should increase length by 1 and score by 10 when eating food', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];
    const state = stateWithSnake(snake, { food: { x: 6, y: 5 } });
    const next = tick(state);
    expect(next.snake).toHaveLength(4);
    expect(next.score).toBe(POINTS_PER_FOOD);
  });

  it('should spawn new food not on snake after eating', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];
    const state = stateWithSnake(snake, { food: { x: 6, y: 5 } });
    const next = tick(state);
    expect(next.food).not.toBeNull();
    const onSnake = next.snake.some(s => s.x === next.food.x && s.y === next.food.y);
    expect(onSnake).toBe(false);
  });

  it('should set stuckCounter when hitting left wall (Issue #46)', () => {
    const snake = [
      { x: 0, y: 5 },
      { x: -1, y: 5 },
    ];
    const state = stateWithSnake(snake, { direction: DIR.LEFT, nextDirection: DIR.LEFT });
    const next = tick(state);
    expect(next.gameState).toBe('playing');
    expect(next.stuckCounter).toBe(STUCK_TICKS);
  });

  it('should set stuckCounter when hitting right wall (Issue #46)', () => {
    const snake = [
      { x: GRID_SIZE - 1, y: 5 },
      { x: GRID_SIZE - 2, y: 5 },
    ];
    const state = stateWithSnake(snake, { direction: DIR.RIGHT, nextDirection: DIR.RIGHT });
    const next = tick(state);
    expect(next.gameState).toBe('playing');
    expect(next.stuckCounter).toBe(STUCK_TICKS);
  });

  it('should set stuckCounter when hitting top wall (Issue #46)', () => {
    const snake = [
      { x: 5, y: 0 },
      { x: 5, y: 1 },
    ];
    const state = stateWithSnake(snake, { direction: DIR.UP, nextDirection: DIR.UP });
    const next = tick(state);
    expect(next.gameState).toBe('playing');
    expect(next.stuckCounter).toBe(STUCK_TICKS);
  });

  it('should set stuckCounter when hitting bottom wall (Issue #46)', () => {
    const snake = [
      { x: 5, y: GRID_SIZE - 1 },
      { x: 5, y: GRID_SIZE - 2 },
    ];
    const state = stateWithSnake(snake, { direction: DIR.DOWN, nextDirection: DIR.DOWN });
    const next = tick(state);
    expect(next.gameState).toBe('playing');
    expect(next.stuckCounter).toBe(STUCK_TICKS);
  });

  it('should handle self collision as non-lethal: tail pop, stun, score penalty', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 5 },
    ];
    const state = stateWithSnake(snake, {
      direction: DIR.LEFT,
      nextDirection: DIR.LEFT,
      food: { x: 19, y: 19 },
    });
    const prevLen = state.snake.length;
    const prevScore = state.score;
    const next = tick(state);
    // Non-lethal: gameState stays 'playing'
    expect(next.gameState).toBe('playing');
    // Tail popped: length decreases by 1
    expect(next.snake).toHaveLength(prevLen - 1);
    // Score penalty: drops by 5
    expect(next.score).toBe(Math.max(0, prevScore - 5));
    // Stun engaged
    expect(next.stuckCounter).toBe(STUCK_TICKS);
    // No reverse
    expect(next.pendingReverse).toBe(false);
  });

  it('should handle snake moving vertically and eating food', () => {
    const snake = [
      { x: 10, y: 10 },
      { x: 10, y: 9 },
      { x: 10, y: 8 },
    ];
    const state = stateWithSnake(snake, {
      direction: DIR.DOWN,
      nextDirection: DIR.DOWN,
      food: { x: 10, y: 11 },
    });
    const next = tick(state);
    expect(next.snake[0]).toEqual({ x: 10, y: 11 });
    expect(next.snake).toHaveLength(4);
    expect(next.score).toBe(POINTS_PER_FOOD);
  });

  it('should only apply the last valid direction when multiple keys pressed between ticks (multi-input buffer)', () => {
    const state = stateWithSnake([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    const withUp = changeDirection(state, DIR.UP);
    const withLeft = changeDirection(withUp, DIR.LEFT);
    const withDown = changeDirection(withLeft, DIR.DOWN);
    const next = tick(withDown);
    expect(next.direction).toEqual(DIR.DOWN);
    expect(next.snake[0]).toEqual({ x: 10, y: 11 });
  });

  it('should not mutate the original state', () => {
    const state = stateWithSnake([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    const copy = JSON.parse(JSON.stringify(state));
    tick(state);
    expect(state).toEqual(copy);
  });

  it('should not advance game when state is idle', () => {
    const idle = { ...stateWithSnake([{ x: 10, y: 10 }]), gameState: 'idle' };
    expect(tick(idle)).toBe(idle);
  });

  it('should not advance game when state is won', () => {
    const won = { ...stateWithSnake([{ x: 10, y: 10 }]), gameState: 'won' };
    expect(tick(won)).toBe(won);
  });

  it('should not advance game when state is gameover', () => {
    const over = { ...stateWithSnake([{ x: 10, y: 10 }]), gameState: 'gameover' };
    expect(tick(over)).toBe(over);
  });

  it('should set gameState to "won" when snake fills the entire grid', () => {
    const fullSnake = [];
    for (let i = 0; i < TOTAL_CELLS - 1; i++) {
      fullSnake.push({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) });
    }
    const headX = (TOTAL_CELLS - 1) % GRID_SIZE;
    const headY = Math.floor((TOTAL_CELLS - 1) / GRID_SIZE);
    fullSnake.unshift({ x: headX - 1, y: headY });

    const lastCell = { x: headX, y: headY };
    const state = stateWithSnake(fullSnake, {
      direction: DIR.RIGHT,
      nextDirection: DIR.RIGHT,
      food: lastCell,
    });

    const next = tick(state);
    expect(next.gameState).toBe('won');
    expect(next.snake).toHaveLength(TOTAL_CELLS);
  });
});

describe('isVictory', () => {
  it('should return false when snake length is less than TOTAL_CELLS', () => {
    const state = stateWithSnake([{ x: 0, y: 0 }]);
    expect(isVictory(state)).toBe(false);
  });

  it('should return true when snake length equals TOTAL_CELLS', () => {
    const fullSnake = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      fullSnake.push({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) });
    }
    const state = stateWithSnake(fullSnake);
    expect(isVictory(state)).toBe(true);
  });
});

describe('spawnFood', () => {
  it('should return a position within the grid not occupied by any snake segment', () => {
    const snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    for (let i = 0; i < 50; i++) {
      const food = spawnFood(snake);
      expect(food).not.toBeNull();
      const onSnake = snake.some(s => s.x === food.x && s.y === food.y);
      expect(onSnake).toBe(false);
      expect(food.x).toBeGreaterThanOrEqual(0);
      expect(food.x).toBeLessThan(GRID_SIZE);
      expect(food.y).toBeGreaterThanOrEqual(0);
      expect(food.y).toBeLessThan(GRID_SIZE);
    }
  });

  it('should return the only empty cell when snake covers all but one cell', () => {
    const snake = [];
    for (let i = 0; i < TOTAL_CELLS - 1; i++) {
      snake.push({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) });
    }
    const emptyX = 19;
    const emptyY = 19;
    const food = spawnFood(snake);
    expect(food).toEqual({ x: emptyX, y: emptyY });
  });

  it('should return null when no empty cells remain', () => {
    const snake = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
      snake.push({ x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) });
    }
    const food = spawnFood(snake);
    expect(food).toBeNull();
  });
});

// =====================================================================
// Issue #46 — Stuck+Reverse on wall collision (Classic Engine)
// =====================================================================

describe('Issue #46 — Stuck+Reverse on wall collision', () => {
  const STUCK_TICKS = 5;

  describe('Test 1: Wall collision sets stuck instead of gameover', () => {
    it('should set stuckCounter and freeze movement when hitting a wall', () => {
      const snake = [
        { x: 0, y: 5 },
        { x: -1, y: 5 },
      ];
      const state = stateWithSnake(snake, {
        direction: DIR.LEFT,
        nextDirection: DIR.LEFT,
        stuckCounter: 0,
        pendingReverse: false,
      });
      const next = tick(state);
      // Should NOT be gameover — wall collision triggers stuck+reverse
      expect(next.gameState).not.toBe('gameover');
      expect(next.stuckCounter).toBe(STUCK_TICKS);
      expect(next.pendingReverse).toBe(true);
      expect(next.snake[0]).toEqual({ x: 0, y: 5 }); // no movement
    });
  });

  describe('Test 2: After stuck duration, snake reverses direction', () => {
    it('should reverse snake and flip direction after stuck expires', () => {
      const snake = [
        { x: 0, y: 5 },
        { x: -1, y: 5 },
      ];
      const initialSnake = [...snake];
      const state = stateWithSnake(snake, {
        direction: DIR.LEFT,
        nextDirection: DIR.LEFT,
        stuckCounter: 0,
        pendingReverse: false,
      });

      let s = tick(state); // first tick → stuck
      expect(s.stuckCounter).toBe(STUCK_TICKS);

      // Tick through stuck period
      for (let i = 0; i < STUCK_TICKS; i++) {
        s = tick(s);
      }

      // After stuck expires, snake should be reversed
      expect(s.stuckCounter).toBe(0);
      expect(s.pendingReverse).toBe(false);
      const reversed = [...initialSnake].reverse();
      expect(s.snake).toEqual(reversed);
      expect(s.direction).toEqual(DIR.RIGHT); // flipped from LEFT
    });
  });

  describe('Test 3: Score penalty on wall collision', () => {
    it('should reduce score by 5 when hitting a wall in classic engine', () => {
      const snake = [
        { x: 0, y: 5 },
        { x: -1, y: 5 },
      ];
      const state = stateWithSnake(snake, {
        direction: DIR.LEFT,
        nextDirection: DIR.LEFT,
        score: 50,
        stuckCounter: 0,
        pendingReverse: false,
      });
      const next = tick(state);
      expect(next.score).toBe(45);
    });
  });

  describe('Test 4: Self collision triggers non-lethal penalty (stun + tail pop + score drop)', () => {
    it('should trigger stun, pop tail, and reduce score on self collision, not gameover', () => {
      const snake = [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
      ];
      const state = stateWithSnake(snake, {
        direction: DIR.LEFT,
        nextDirection: DIR.LEFT,
        food: { x: 19, y: 19 },
        stuckCounter: 0,
        pendingReverse: false,
      });
      const prevLen = state.snake.length;
      const prevScore = state.score;
      const next = tick(state);
      // Not gameover
      expect(next.gameState).toBe('playing');
      // Tail popped: length decreased by 1
      expect(next.snake).toHaveLength(prevLen - 1);
      // Score penalty
      expect(next.score).toBe(Math.max(0, prevScore - 5));
      // Stun counter set
      expect(next.stuckCounter).toBe(STUCK_TICKS);
      // No reverse
      expect(next.pendingReverse).toBe(false);
    });

    it('should trigger gameover when length-1 guard fires (snake length 2 self-collides)', () => {
      // Snake length 2: head + tail. Head turns back into the only body segment.
      // After pop, length becomes 1 → guard fires → gameover.
      const snake = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ];
      const state = stateWithSnake(snake, {
        direction: DIR.LEFT,
        nextDirection: DIR.LEFT,
        food: { x: 19, y: 19 },
      });
      const next = tick(state);
      expect(next.gameState).toBe('gameover');
      expect(next.snake).toHaveLength(1);
    });

    it('should not go below score 0 on self collision penalty', () => {
      const snake = [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
      ];
      const state = stateWithSnake(snake, {
        direction: DIR.LEFT,
        nextDirection: DIR.LEFT,
        score: 2,
        food: { x: 19, y: 19 },
      });
      const next = tick(state);
      expect(next.score).toBe(0); // clamped at 0
      expect(next.gameState).toBe('playing');
    });

    it('should not mutate the original state on self collision', () => {
      const snake = [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
      ];
      const state = stateWithSnake(snake, {
        direction: DIR.LEFT,
        nextDirection: DIR.LEFT,
        food: { x: 19, y: 19 },
      });
      const copy = JSON.parse(JSON.stringify(state));
      tick(state);
      expect(state).toEqual(copy);
    });
  });
});

// =====================================================================
// Issue #50 — Snake speed proportional to length
// =====================================================================

describe('Issue #50 — Snake speed proportional to length', () => {
  describe('calculateSpeed function', () => {
    it('Test 1: length=3 (minimum) returns BASE_TICK_INTERVAL (150)', () => {
      expect(calculateSpeed(3, BASE_TICK_INTERVAL)).toBe(150);
    });

    it('Test 2: length=10 returns 202', () => {
      // floor(150 * (1 + (10 - 3) * 0.05)) = floor(150 * 1.35) = floor(202.5) = 202
      expect(calculateSpeed(10, BASE_TICK_INTERVAL)).toBe(202);
    });

    it('Test 3: length=50 returns 502', () => {
      // floor(150 * (1 + (50 - 3) * 0.05)) = floor(150 * 3.35) = floor(502.5) = 502
      expect(calculateSpeed(50, BASE_TICK_INTERVAL)).toBe(502);
    });

    it('Test 4: length=400 returns 800 (capped at MAX_TICK_INTERVAL)', () => {
      // raw = floor(150 * (1 + (400 - 3) * 0.05)) = floor(150 * 20.85) = floor(3127.5) = 3127
      // clamped = min(3127, 800) = 800
      expect(calculateSpeed(400, BASE_TICK_INTERVAL)).toBe(800);
    });

    it('Test 5: length=4 returns 157', () => {
      // floor(150 * (1 + (4 - 3) * 0.05)) = floor(150 * 1.05) = floor(157.5) = 157
      expect(calculateSpeed(4, BASE_TICK_INTERVAL)).toBe(157);
    });

    it('Test 6: length=1 (after damage) is clamped to BASE_TICK_INTERVAL', () => {
      // Without clamp: floor(150 * (1 + (1 - 3) * 0.05)) = floor(150 * 0.90) = floor(135) = 135
      // With clamp: Math.max(135, 150) = 150
      expect(calculateSpeed(1, BASE_TICK_INTERVAL)).toBe(150);
    });

    it('Test 7: length=35 returns 390', () => {
      // floor(150 * (1 + (35 - 3) * 0.05)) = floor(150 * 2.60) = floor(390) = 390
      expect(calculateSpeed(35, BASE_TICK_INTERVAL)).toBe(390);
    });

    it('Test 8: length=90 returns 800 (capped at MAX_TICK_INTERVAL)', () => {
      // raw = floor(150 * (1 + (90 - 3) * 0.05)) = floor(150 * 5.35) = floor(802.5) = 802
      // clamped = min(802, 800) = 800
      // result = max(800, 150) = 800
      expect(calculateSpeed(90, BASE_TICK_INTERVAL)).toBe(800);
    });

    it('Test 9: length=0 is clamped to BASE_TICK_INTERVAL', () => {
      // raw = floor(150 * (1 + (0 - 3) * 0.05)) = floor(150 * 0.85) = floor(127.5) = 127
      // clamped = min(127, 800) = 127
      // result = max(127, 150) = 150
      expect(calculateSpeed(0, BASE_TICK_INTERVAL)).toBe(150);
    });

    it('Test 10: length=-1 is clamped to BASE_TICK_INTERVAL', () => {
      // raw = floor(150 * (1 + (-1 - 3) * 0.05)) = floor(150 * 0.80) = floor(120) = 120
      // result = max(120, 150) = 150
      expect(calculateSpeed(-1, BASE_TICK_INTERVAL)).toBe(150);
    });
  });

  describe('tick updates currentTickInterval', () => {
    it('Test 7: currentTickInterval increases after eating food', () => {
      const snake = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ];
      const state = stateWithSnake(snake, {
        food: { x: 6, y: 5 },
        currentTickInterval: BASE_TICK_INTERVAL,
      });
      const next = tick(state);
      expect(next.snake.length).toBe(4); // ate food, grew
      expect(next.currentTickInterval).toBeGreaterThan(BASE_TICK_INTERVAL);
    });

    it('Test 8: currentTickInterval unchanged when no food eaten', () => {
      const snake = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ];
      // Food far away so snake doesn't eat it
      const state = stateWithSnake(snake, {
        food: { x: 19, y: 19 },
        currentTickInterval: BASE_TICK_INTERVAL,
      });
      const next = tick(state);
      expect(next.snake.length).toBe(3); // didn't eat
      expect(next.currentTickInterval).toBe(BASE_TICK_INTERVAL);
    });

    it('Test 9: currentTickInterval is capped at MAX_TICK_INTERVAL for snake length >= 90 (via tick)', () => {
      // Build snake of length 95, positioned to avoid self-collision
      const longSnake = [];
      // Head at (0,0), moving RIGHT — (1,0) must be empty
      longSnake.push({ x: 0, y: 0 });
      // Fill body from (2,0) onward, skipping (1,0)
      for (let i = 2; i < 95; i++) {
        longSnake.push({ x: i, y: 0 });
      }
      const state = stateWithSnake(longSnake, {
        food: { x: 19, y: 19 }, // far away, won't eat
        currentTickInterval: BASE_TICK_INTERVAL,
      });
      const next = tick(state);
      // After tick, length=95 → raw=840 → clamped to 800
      expect(next.currentTickInterval).toBe(800);
    });

    it('Test 10: currentTickInterval decreases after tail loss', () => {
      // Start with length 5, then simulate losing a segment
      const snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 },
      ];
      const state = stateWithSnake(snake, {
        food: { x: 19, y: 19 },
        currentTickInterval: calculateSpeed(5, BASE_TICK_INTERVAL),
      });
      // Manually reduce length to 4 (simulating tail loss)
      state.snake = state.snake.slice(0, -1);
      const next = tick(state);
      // Length 4 should have lower interval than length 5
      expect(next.currentTickInterval).toBeLessThan(state.currentTickInterval);
    });
  });
});
