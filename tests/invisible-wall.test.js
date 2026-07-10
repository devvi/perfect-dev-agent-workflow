// FILE: tests/invisible-wall.test.js
// Tests for Invisible Wall Death Bug (Issue #113)
// Plan phase: tests document the bug + expected behavior after fix
//
// Root cause: getCellAt() returns CELL.WALL when getRoomAt() returns null,
// but renderRoom() returns early on null rooms — creating an invisible collision.
//
// Fix in Phase 1 (implement): change getCellAt() null fallback from CELL.WALL to CELL.FLOOR

import { describe, it, expect } from 'vitest';

import { ROOM_SIZE, CELL, ROOM_TYPE } from '../public/src/engine/constants.js';
import {
  createRoom, getRoomAt, getCellAt, worldToRoomCoords,
  generateDefaultTiles,
} from '../public/src/engine/world.js';
import { generateWorldMap } from '../public/src/engine/generator.js';
import { checkSnakeCollision } from '../public/src/engine/collision.js';
import { tick, createInitialState, startGame } from '../public/src/engine/core.js';
import { renderRoom } from '../public/src/render/room.js';

// ============================================================
// Helper: seeded RNG
// ============================================================
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ============================================================
// Helper: mock canvas context
// ============================================================
function createMockCtx() {
  return {
    save:        () => {},
    restore:     () => {},
    fillStyle:   null,
    strokeStyle: null,
    lineWidth:   null,
    globalAlpha: 1.0,
    fillRect:    () => {},
    strokeRect:  () => {},
    beginPath:   () => {},
    arc:         () => {},
    fill:        () => {},
    font:        null,
    textAlign:   null,
    fillText:    () => {},
  };
}

// ============================================================
// Phase 1: getCellAt null-room fallback — DOCUMENT THE BUG
// ============================================================
describe('getCellAt — null-room fallback (bug docs)', () => {
  it('currently returns WALL (bug) for coords where getRoomAt returns null', () => {
    // getCellAt(world, wx, wy) → worldToRoomCoords → getRoomAt → null → return CELL.WALL
    // This is the BUG: no room exists at these coords, so there's nothing to render,
    // but collision sees a WALL → invisible wall death
    const world = generateWorldMap(1, 1);
    const outX = world.cols * ROOM_SIZE + 10;
    const outY = world.rows * ROOM_SIZE + 10;
    expect(getCellAt(world, outX, outY)).toBe(CELL.WALL); // BUG: should be CELL.FLOOR
  });

  it('currently returns WALL (bug) for negative coordinates', () => {
    const world = generateWorldMap(1, 1);
    expect(getCellAt(world, -1, -1)).toBe(CELL.WALL); // BUG
  });

  it('still returns the correct cell type for valid room coords (no regression)', () => {
    const world = generateWorldMap(3, 3);
    // Interior cell of room (1,1)
    const wx = 1 * ROOM_SIZE + 5;
    const wy = 1 * ROOM_SIZE + 5;
    expect(getCellAt(world, wx, wy)).toBe(CELL.FLOOR);
  });

  it('still returns CELL.WALL for a real wall on the room border', () => {
    const world = generateWorldMap(1, 1);
    // Room (0,0), cell (0, 5) = left border wall
    expect(getCellAt(world, 0, 5)).toBe(CELL.WALL);
  });
});

// ============================================================
// Phase 2: Collision behavior — null-room areas
// ============================================================
describe('checkSnakeCollision — null-room areas', () => {
  it('currently returns damage for null-room coords (bug: invisible wall)', () => {
    const world = generateWorldMap(1, 1);
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    const state = { world, food: { x: 2, y: 2 } };
    // Coord outside any room → getCellAt returns WALL → checkSnakeCollision returns 'damage'
    const result = checkSnakeCollision(
      { x: world.cols * ROOM_SIZE + 10, y: 5 },
      snake,
      state,
    );
    expect(result).toContain('damage'); // BUG: should NOT contain damage
  });

  it('still returns damage for a real CELL.WALL cell (no regression)', () => {
    const world = generateWorldMap(1, 1);
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    const state = { world, food: { x: 2, y: 2 } };
    // Room border = real CELL.WALL
    const result = checkSnakeCollision({ x: 0, y: 5 }, snake, state);
    expect(result).toContain('damage');
  });

  it('world boundary damage (head.x < 0) still works', () => {
    const snake = [{ x: 1, y: 5 }, { x: 2, y: 5 }];
    const state = { food: { x: 3, y: 5 } };
    expect(checkSnakeCollision({ x: -1, y: 5 }, snake, state)).toContain('damage');
  });

  it('world boundary damage (head.y < 0) still works', () => {
    const snake = [{ x: 5, y: 1 }, { x: 5, y: 2 }];
    const state = { food: { x: 3, y: 5 } };
    expect(checkSnakeCollision({ x: 5, y: -1 }, snake, state)).toContain('damage');
  });

  it('self-collision still returns self', () => {
    const snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }];
    const state = { food: { x: 2, y: 2 } };
    expect(checkSnakeCollision({ x: 5, y: 6 }, snake, state)).toContain('self');
  });

  it('food collision still works', () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    const state = { food: { x: 3, y: 5 } };
    expect(checkSnakeCollision({ x: 3, y: 5 }, snake, state)).toContain('food');
  });

  it('no collision returns none', () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    const state = { food: { x: 6, y: 6 } };
    expect(checkSnakeCollision({ x: 7, y: 7 }, snake, state)).toContain('none');
  });
});

// ============================================================
// Phase 3: Room tile consistency (door ↔ tile match)
// ============================================================
describe('Room tile consistency', () => {
  it('every door has matching DOOR tiles on the border', () => {
    const world = generateWorldMap(5, 5, 'test-seed-1');
    let checkedDoors = 0;
    for (let ry = 0; ry < world.rows; ry++) {
      for (let rx = 0; rx < world.cols; rx++) {
        const room = world.rooms[ry][rx];
        if (!room) continue;
        const mid = Math.floor(ROOM_SIZE / 2);
        for (const dir of ['up', 'down', 'left', 'right']) {
          if (room.doors[dir]) {
            checkedDoors++;
            if (dir === 'up') expect(room.tiles[0][mid]).toBe(CELL.DOOR);
            else if (dir === 'down') expect(room.tiles[ROOM_SIZE - 1][mid]).toBe(CELL.DOOR);
            else if (dir === 'left') expect(room.tiles[mid][0]).toBe(CELL.DOOR);
            else if (dir === 'right') expect(room.tiles[mid][ROOM_SIZE - 1]).toBe(CELL.DOOR);
          }
        }
      }
    }
    expect(checkedDoors).toBeGreaterThan(0);
  });

  it('door-less room has CELL.WALL on entire border', () => {
    const room = createRoom(0, 0, ROOM_TYPE.NORMAL, {});
    // No connections → no doors → all border = WALL
    for (let cy = 0; cy < ROOM_SIZE; cy++) {
      for (let cx = 0; cx < ROOM_SIZE; cx++) {
        if (cy === 0 || cy === ROOM_SIZE - 1 || cx === 0 || cx === ROOM_SIZE - 1) {
          expect(room.tiles[cy][cx]).toBe(CELL.WALL);
        }
      }
    }
  });

  it('getCellAt matches room tile data for all cells in valid rooms', () => {
    const world = generateWorldMap(3, 3);
    for (let ry = 0; ry < world.rows; ry++) {
      for (let rx = 0; rx < world.cols; rx++) {
        const room = world.rooms[ry][rx];
        if (!room) continue;
        for (let cy = 0; cy < ROOM_SIZE; cy++) {
          for (let cx = 0; cx < ROOM_SIZE; cx++) {
            const wx = rx * ROOM_SIZE + cx;
            const wy = ry * ROOM_SIZE + cy;
            expect(getCellAt(world, wx, wy)).toBe(room.tiles[cy][cx]);
          }
        }
      }
    }
  });
});

// ============================================================
// Phase 4: Render parity
// ============================================================
describe('Render vs collision parity', () => {
  it('renderRoom does not throw for null room (graceful degradation)', () => {
    const ctx = createMockCtx();
    const world = generateWorldMap(1, 1);
    const state = {
      currentRoom: { x: 99, y: 99 }, // non-existent room
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
      direction: { x: 1, y: 0 },
      projectiles: [],
    };
    expect(() => renderRoom(ctx, state, world)).not.toThrow();
  });

  it('renderRoom produces fillRect calls when rendering a real room', () => {
    const ctx = createMockCtx();
    const world = generateWorldMap(1, 1);
    const spy = { count: 0 };
    ctx.fillRect = (...a) => { spy.count++; spy.last = a; };

    const state = {
      currentRoom: { x: 0, y: 0 },
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
      direction: { x: 1, y: 0 },
      projectiles: [],
    };

    renderRoom(ctx, state, world);
    // Should have drawn at least the borders (WALL cells)
    expect(spy.count).toBeGreaterThan(0);
  });
});

// ============================================================
// Phase 5: Room transition safety (passes with current code)
// ============================================================
describe('Room transition — no invisible walls', () => {
  it('doors are mutual between connected rooms', () => {
    const world = generateWorldMap(2, 2);
    const startRoom = getRoomAt(world, 0, 0);
    expect(startRoom).toBeDefined();

    const doorDir = Object.keys(startRoom.doors).find(d => startRoom.doors[d]);
    if (!doorDir) return; // no doors in this map generation

    const door = startRoom.doors[doorDir];
    const targetRoom = getRoomAt(world, door.connectedTo.roomX, door.connectedTo.roomY);
    expect(targetRoom).toBeDefined();

    const opp = { up: 'down', down: 'up', left: 'right', right: 'left' };
    expect(targetRoom.doors[opp[doorDir]]).toBeDefined();
  });

  it('snake entering a room via startGame+tick does not crash', () => {
    const world = generateWorldMap(3, 3);
    const state = createInitialState(world);
    const started = startGame(state); // gameState → 'playing'
    expect(started.gameState).toBe('playing');

    // Position near right door of start room (0,0)
    // Door at (ROOM_SIZE-1, mid), snake at (ROOM_SIZE-4, mid), heading right
    const mid = Math.floor(ROOM_SIZE / 2);
    const headX = state.currentRoom.x * ROOM_SIZE + ROOM_SIZE - 4;
    const headY = state.currentRoom.y * ROOM_SIZE + mid;
    started.snake = [
      { x: headX, y: headY },
      { x: headX - 1, y: headY },
      { x: headX - 2, y: headY },
    ];
    started.direction = { x: 1, y: 0 };
    started.nextDirection = { x: 1, y: 0 };

    const result = tick(started);
    // Should not crash; gameState should remain playing or change to won
    expect(result.gameState === 'playing' || result.gameState === 'won').toBe(true);
  });
});

// ============================================================
// Phase 6: Expected behavior post-fix (test.todo markers)
// ============================================================
describe.todo('After fix (Phase 1): getCellAt null-room → FLOOR');
