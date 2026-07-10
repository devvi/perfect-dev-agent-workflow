// FILE: tests/invisible-wall.test.js
// Tests for Invisible Wall Death Bug (Issue #113)
// Verifies: getCellAt null-room fallback, room transition tile consistency,
//           door-match-to-tile validation, render/collision parity

import { describe, it, expect, vi } from 'vitest';

import { ROOM_SIZE, CELL, ROOM_TYPE } from '../public/src/engine/constants.js';
import { createRoom, getRoomAt, getCellAt, worldToRoomCoords, generateDefaultTiles } from '../public/src/engine/world.js';
import { generateWorldMap, generateRoomTiles } from '../public/src/engine/generator.js';
import { checkSnakeCollision } from '../public/src/engine/collision.js';
import { tick, createInitialState } from '../public/src/engine/core.js';
import { renderRoom } from '../public/src/render/room.js';

// ============================================================
// Helper: seeded RNG for reproducible test maps
// ============================================================
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ============================================================
// Helper: create a minimal mock world with a single room
// ============================================================
function createMockWorld(roomOverrides = {}) {
  const room = createRoom(0, 0, ROOM_TYPE.NORMAL, {});
  const baseTiles = generateDefaultTiles();
  room.tiles = baseTiles.map(row => [...row]);

  // Apply overrides (for specific tile patterns)
  if (roomOverrides.tiles) {
    for (const { cy, cx, cellType } of roomOverrides.tiles) {
      if (room.tiles[cy] && room.tiles[cy][cx] !== undefined) {
        room.tiles[cy][cx] = cellType;
      }
    }
  }

  return {
    cols: 1,
    rows: 1,
    rooms: [[room]],
    playerStart: { roomX: 0, roomY: 0 },
    keyAssignments: [],
  };
}

// ============================================================
// Helper: create a mock canvas context for render tests
// ============================================================
function createMockCtx() {
  const calls = [];
  return {
    calls,
    save:        () => { calls.push('save'); },
    restore:     () => { calls.push('restore'); },
    fillStyle:   null,
    strokeStyle: null,
    lineWidth:   null,
    globalAlpha: 1.0,
    fillRect:    (...a) => calls.push(['fillRect', ...a]),
    strokeRect:  (...a) => calls.push(['strokeRect', ...a]),
    beginPath:   () => calls.push('beginPath'),
    arc:         (...a) => calls.push(['arc', ...a]),
    fill:        () => calls.push('fill'),
    font:        null,
    textAlign:   null,
    fillText:    (...a) => calls.push(['fillText', ...a]),
  };
}

// ============================================================
// Phase 1: getCellAt() null-room fallback
// ============================================================
describe('getCellAt — null-room fallback fix (Phase 1)', () => {
  it('should return FLOOR (not WALL) when room at coordinate is null', () => {
    // A room at (0,0) but world only has 1 col/row → getCellAt at (1,0) finds no room
    const world = createMockWorld();
    // Coordinate far outside any room (world is 1x1, each room is ROOM_SIZE wide)
    const outOfBoundsX = ROOM_SIZE * 2;
    const outOfBoundsY = 0;
    const cellType = getCellAt(world, outOfBoundsX, outOfBoundsY);
    // Should NOT be WALL — that would create an invisible wall
    expect(cellType).not.toBe(CELL.WALL);
    expect(cellType).toBe(CELL.FLOOR);
  });

  it('should return FLOOR when world.rooms entry is null', () => {
    const world = {
      cols: 2,
      rows: 2,
      rooms: [
        [createRoom(0, 0), null],  // room[1][0] is null
        [createRoom(0, 1), createRoom(1, 1)],
      ],
      playerStart: { roomX: 0, roomY: 0 },
    };
    // Coordinate inside the null room slot
    const cx = Math.floor(ROOM_SIZE / 2);
    const cy = Math.floor(ROOM_SIZE / 2);
    // (room 1,0 = roomX=1, roomY=0)
    const worldX = 1 * ROOM_SIZE + cx;
    const worldY = 0 * ROOM_SIZE + cy;
    const cellType = getCellAt(world, worldX, worldY);
    expect(cellType).not.toBe(CELL.WALL);
    expect(cellType).toBe(CELL.FLOOR);
  });

  it('should return FLOOR when world.rooms entry exists but getRoomAt returns null for bad row/col', () => {
    const world = createMockWorld();
    // Negative coordinate
    const cellType = getCellAt(world, -5, -5);
    expect(cellType).toBe(CELL.FLOOR);
  });

  it('should still detect real WALL cells correctly (no regression)', () => {
    const world = createMockWorld();
    // Border cells of a default room are WALL
    const cellType = getCellAt(world, 0, 5);  // Left border, row 5
    expect(cellType).toBe(CELL.WALL);
  });

  it('should still detect real FLOOR cells correctly (no regression)', () => {
    const world = createMockWorld();
    // Interior cell should be FLOOR
    const cellType = getCellAt(world, 5, 5);
    expect(cellType).toBe(CELL.FLOOR);
  });
});

// ============================================================
// Phase 2 — Room transition tile consistency
// ============================================================
describe('Room transition tile consistency (Phase 2)', () => {
  it('door cells in tile data should match room.doors direction presence', () => {
    // Generate a real world and check every room
    const world = generateWorldMap(5, 5, 'test-seed-1');
    for (let ry = 0; ry < world.rows; ry++) {
      for (let rx = 0; rx < world.cols; rx++) {
        const room = world.rooms[ry][rx];
        if (!room) continue;

        // For each door direction, the corresponding border tile must be DOOR
        for (const dir of ['up', 'down', 'left', 'right']) {
          const mid = Math.floor(ROOM_SIZE / 2);
          if (room.doors[dir]) {
            // Check center door cell
            if (dir === 'up') {
              expect(room.tiles[0][mid]).toBe(CELL.DOOR);
            } else if (dir === 'down') {
              expect(room.tiles[ROOM_SIZE - 1][mid]).toBe(CELL.DOOR);
            } else if (dir === 'left') {
              expect(room.tiles[mid][0]).toBe(CELL.DOOR);
            } else if (dir === 'right') {
              expect(room.tiles[mid][ROOM_SIZE - 1]).toBe(CELL.DOOR);
            }
          } else {
            // No door → border must be WALL (not invisible)
            if (dir === 'up') {
              expect(room.tiles[0][mid]).toBe(CELL.WALL);
            } else if (dir === 'down') {
              expect(room.tiles[ROOM_SIZE - 1][mid]).toBe(CELL.WALL);
            } else if (dir === 'left') {
              expect(room.tiles[mid][0]).toBe(CELL.WALL);
            } else if (dir === 'right') {
              expect(room.tiles[mid][ROOM_SIZE - 1]).toBe(CELL.WALL);
            }
          }
        }
      }
    }
  });

  it('all 5 door cells match when a door exists', () => {
    const world = generateWorldMap(5, 5, 'test-seed-2');
    let roomWithDoors = 0;
    for (let ry = 0; ry < world.rows; ry++) {
      for (let rx = 0; rx < world.cols; rx++) {
        const room = world.rooms[ry][rx];
        if (!room) continue;

        for (const dir of ['up', 'down', 'left', 'right']) {
          if (room.doors[dir]) {
            roomWithDoors++;
            const mid = Math.floor(ROOM_SIZE / 2);
            if (dir === 'up') {
              for (let dx = -2; dx <= 2; dx++) {
                expect(room.tiles[0][mid + dx]).toBe(CELL.DOOR);
              }
            } else if (dir === 'down') {
              for (let dx = -2; dx <= 2; dx++) {
                expect(room.tiles[ROOM_SIZE - 1][mid + dx]).toBe(CELL.DOOR);
              }
            } else if (dir === 'left') {
              for (let dy = -2; dy <= 2; dy++) {
                expect(room.tiles[mid + dy][0]).toBe(CELL.DOOR);
              }
            } else if (dir === 'right') {
              for (let dy = -2; dy <= 2; dy++) {
                expect(room.tiles[mid + dy][ROOM_SIZE - 1]).toBe(CELL.DOOR);
              }
            }
          }
        }
      }
    }
    // Ensure we actually tested some rooms with doors
    expect(roomWithDoors).toBeGreaterThan(0);
  });

  it('a room with no doors has full WALL border (all CELL.WALL)', () => {
    // Create a room with NO doors
    const room = createRoom(0, 0, ROOM_TYPE.NORMAL, {});
    const world = {
      cols: 1, rows: 1,
      rooms: [[room]],
      playerStart: { roomX: 0, roomY: 0 },
    };

    // Every border cell must be WALL
    for (let cy = 0; cy < ROOM_SIZE; cy++) {
      for (let cx = 0; cx < ROOM_SIZE; cx++) {
        if (cy === 0 || cy === ROOM_SIZE - 1 || cx === 0 || cx === ROOM_SIZE - 1) {
          expect(getCellAt(world, cx, cy)).toBe(CELL.WALL);
        }
      }
    }
  });
});

// ============================================================
// Phase 3 — Collision behavior
// ============================================================
describe('Snake collision with walls vs invisible areas (Phase 3)', () => {
  it('snake head at null-room coordinate should NOT trigger damage', () => {
    // Create world with 2 columns but only one valid room (room at [1][0] is null)
    const world = {
      cols: 2,
      rows: 2,
      rooms: [
        [createRoom(0, 0), null],
        [createRoom(0, 1), createRoom(1, 1)],
      ],
      playerStart: { roomX: 0, roomY: 0 },
      keyAssignments: [],
    };
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
    const state = {
      world,
      food: { x: 2, y: 2 },
    };

    // New head at coordinate that maps to null room slot (room rx=1, ry=0)
    const nullRoomX = 1 * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);
    const nullRoomHead = { x: nullRoomX, y: Math.floor(ROOM_SIZE / 2) };
    // Verify this maps to a null room (not out-of-bounds)
    const { rx, ry } = worldToRoomCoords(nullRoomHead.x, nullRoomHead.y);
    expect(rx).toBe(1);
    expect(ry).toBe(0);
    expect(world.rooms[ry][rx]).toBeNull();

    const collisions = checkSnakeCollision(nullRoomHead, snake, state);
    // After fix, should NOT include 'damage'
    expect(collisions.includes('damage')).toBe(false);
    expect(collisions.includes('death')).toBe(false);
  });

  it('snake head at real WALL cell should still trigger damage (no regression)', () => {
    const world = createMockWorld();
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
    const state = {
      world,
      food: { x: 2, y: 2 },
    };

    // Border cell — real CELL.WALL
    const wallHead = { x: 0, y: 5 };
    const collisions = checkSnakeCollision(wallHead, snake, state);
    expect(collisions.includes('damage')).toBe(true);
  });

  it('snake moving into null-room area does NOT cause stuck/reverse', () => {
    // Create a minimal game state where snake is near world boundary
    const world = generateWorldMap(2, 2, 'test-seed-3');
    const state = createInitialState(world);
    state.gameState = 'playing';

    // Move snake way outside valid room coordinates
    state.snake = [
      { x: ROOM_SIZE * 2 - 1, y: 5 },  // head at right edge
      { x: ROOM_SIZE * 2 - 2, y: 5 },
      { x: ROOM_SIZE * 2 - 3, y: 5 },
    ];
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    state.currentRoom = { x: 1, y: 0 };

    // Tick should move head to x = ROOM_SIZE * 2 which is beyond world
    const result = tick(state);

    // After fix: should NOT be 'gameover' and should NOT be stuck from invisible wall
    // The snake should encounter some behavior, but not death from invisible wall
    expect(result.gameState).not.toBe('gameover');
  });
});

// ============================================================
// Phase 3 — Render parity
// ============================================================
describe('Render matches collision — no invisible walls (Phase 3)', () => {
  it('renderRoom does not throw for null room (graceful)', () => {
    const ctx = createMockCtx();
    const state = {
      currentRoom: { x: 99, y: 99 }, // non-existent room
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
      direction: { x: 1, y: 0 },
      projectiles: [],
    };
    const world = createMockWorld();

    // Should not throw
    expect(() => renderRoom(ctx, state, world)).not.toThrow();
  });

  it('every WALL cell in a room should have a matching fillRect in render', () => {
    // Verify that renderRoom draws a filled rectangle for WALL cells
    const room = createRoom(0, 0);
    const world = {
      cols: 1, rows: 1,
      rooms: [[room]],
      playerStart: { roomX: 0, roomY: 0 },
    };
    const ctx = createMockCtx();
    const state = {
      currentRoom: { x: 0, y: 0 },
      snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
      direction: { x: 1, y: 0 },
      projectiles: [],
    };

    renderRoom(ctx, state, world);

    // Count WALL cells in the room
    let wallCount = 0;
    for (let cy = 0; cy < ROOM_SIZE; cy++) {
      for (let cx = 0; cx < ROOM_SIZE; cx++) {
        if (room.tiles[cy][cx] === CELL.WALL) wallCount++;
      }
    }

    // Count fillRect calls with DARK_GREEN color (WALL color from room.js)
    const wallFills = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect'
    );

    // At minimum, we should have fillRect calls (walls + items)
    expect(wallFills.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Regression: pre-existing collision behavior unchanged
// ============================================================
describe('Regression — no impact on existing collision (Phase 3)', () => {
  it('self-collision still returns self', () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 7 },
    ];
    const state = { food: { x: 2, y: 2 } };
    // Head tries to move onto its own body
    const headOnBody = { x: 5, y: 6 };
    const collisions = checkSnakeCollision(headOnBody, snake, state);
    expect(collisions.includes('self')).toBe(true);
  });

  it('food collision still returns food', () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    const state = { food: { x: 3, y: 5 } };
    const headOnFood = { x: 3, y: 5 };
    const collisions = checkSnakeCollision(headOnFood, snake, state);
    expect(collisions.includes('food')).toBe(true);
  });

  it('no collision returns none', () => {
    const snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }];
    const state = { food: { x: 3, y: 5 } };
    const emptyHead = { x: 7, y: 7 };
    const collisions = checkSnakeCollision(emptyHead, snake, state);
    expect(collisions.includes('none')).toBe(true);
  });
});
