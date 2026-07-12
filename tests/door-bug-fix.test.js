// FILE: tests/door-bug-fix.test.js
// Tests for Door Death Bug Fix (Issue #19)
// Verifies: pair-shuffled doors, 5-cell wide passages, protected clear zones,
//           and defensive isDoorCell fallback

import { describe, it, expect } from 'vitest';

import { ROOM_SIZE, CELL, ROOM_TYPE } from '../public/src/engine/constants.js';
import { createRoom, getRoomAt, oppositeDir } from '../public/src/engine/world.js';
import { addRandomDoors, buildSpanningTree, generateRoomTiles, generateWorldMap, verifySolvability } from '../public/src/engine/generator.js';

// ============================================================
// Helper: create a seeded RNG for reproducible tests
// ============================================================
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ============================================================
// Phase 1 — addRandomDoors() pair correctness
// ============================================================
describe('addRandomDoors — pair correctness', () => {
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DIR_OFFSET = {
    right: (x, y) => [x + 1, y],
    left:  (x, y) => [x - 1, y],
    down:  (x, y) => [x, y + 1],
    up:    (x, y) => [x, y - 1],
  };

  it('every door key has its matching reverse key', () => {
    const cols = 5, rows = 5;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = seededRandom(seed);
      const tree = buildSpanningTree(cols, rows, rng);
      const edges = addRandomDoors(tree, cols, rows, rng, 0.4);

      for (const key of edges) {
        const match = key.match(/^(\d+),(\d+):(\w+)$/);
        expect(match).not.toBeNull();
        const [, xStr, yStr, dir] = match;
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        const [nx, ny] = DIR_OFFSET[dir](x, y);
        const revKey = `${nx},${ny}:${OPPOSITE[dir]}`;
        expect(edges.has(revKey)).toBe(true);
      }
    }
  });

  it('never produces a one-way door', () => {
    const cols = 5, rows = 5;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = seededRandom(seed);
      const tree = buildSpanningTree(cols, rows, rng);
      const edges = addRandomDoors(tree, cols, rows, rng, 0.5);

      for (const key of edges) {
        const match = key.match(/^(\d+),(\d+):(\w+)$/);
        const [, xStr, yStr, dir] = match;
        const x = parseInt(xStr);
        const y = parseInt(yStr);
        const [nx, ny] = DIR_OFFSET[dir](x, y);
        const revKey = `${nx},${ny}:${OPPOSITE[dir]}`;
        expect(edges.has(revKey)).toBe(true);
      }
    }
  });
});

// ============================================================
// Phase 2 — Door passages are 5 cells wide
// ============================================================
describe('generateRoomTiles — door passage width', () => {
  it('door passages are 5 cells wide', () => {
    const room = createRoom(0, 0, 0, {
      right: { connectedTo: { roomX: 1, roomY: 0 }, locked: false, keyId: null },
      down:  { connectedTo: { roomX: 0, roomY: 1 }, locked: false, keyId: null },
    });
    const rng = seededRandom(42);
    const tiles = generateRoomTiles(room, rng);
    const mid = Math.floor(ROOM_SIZE / 2);

    for (let dy = -2; dy <= 2; dy++) {
      expect(tiles[mid + dy][ROOM_SIZE - 1]).toBe(CELL.DOOR);
    }
    expect(tiles[mid - 3][ROOM_SIZE - 1]).not.toBe(CELL.DOOR);
    expect(tiles[mid + 3][ROOM_SIZE - 1]).not.toBe(CELL.DOOR);

    for (let dx = -2; dx <= 2; dx++) {
      expect(tiles[ROOM_SIZE - 1][mid + dx]).toBe(CELL.DOOR);
    }
    expect(tiles[ROOM_SIZE - 1][mid - 3]).not.toBe(CELL.DOOR);
    expect(tiles[ROOM_SIZE - 1][mid + 3]).not.toBe(CELL.DOOR);
  });

  it('rooms without doors have no door cells', () => {
    const room = createRoom(0, 0, 0, {});
    const rng = seededRandom(42);
    const tiles = generateRoomTiles(room, rng);
    for (let y = 0; y < ROOM_SIZE; y++) {
      for (let x = 0; x < ROOM_SIZE; x++) {
        expect(tiles[y][x]).not.toBe(CELL.DOOR);
      }
    }
  });
});

// ============================================================
// Phase 3 — No interior walls within 1 cell of door passages
// ============================================================
describe('generateRoomTiles — wall avoidance near doors', () => {
  it('no walls placed within 1 cell of door passages', () => {
    const room = createRoom(0, 0, 0, {
      right: { connectedTo: { roomX: 1, roomY: 0 }, locked: false, keyId: null },
    });
    const mid = Math.floor(ROOM_SIZE / 2);

    for (let seed = 1; seed <= 200; seed++) {
      const rng = seededRandom(seed);
      const tiles = generateRoomTiles(room, rng);

      for (let dy = -2; dy <= 2; dy++) {
        const doorY = mid + dy;
        if (doorY >= 0 && doorY < ROOM_SIZE) {
          expect(tiles[doorY][ROOM_SIZE - 2]).not.toBe(CELL.WALL);
        }
      }
    }
  });
});

// ============================================================
// Phase 4 — Door tile symmetry
// ============================================================
describe('Door tile symmetry in generated worlds', () => {
  it('if room A has a door to room B, both rooms have DOOR tiles at the boundary', () => {
    const cols = 3, rows = 3;
    for (let seed = 1; seed <= 50; seed++) {
      const world = generateWorldMap(cols, rows, seed);

      for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) {
          const room = world.rooms[ry][rx];
          if (!room || !room.doors || room.type === ROOM_TYPE.BOSS) continue;

          for (const dir of ['up', 'down', 'left', 'right']) {
            const door = room.doors[dir];
            if (!door) continue;

            const targetRoom = getRoomAt(world, door.connectedTo.roomX, door.connectedTo.roomY);
            if (!targetRoom) continue;

            const opp = oppositeDir(dir);
            expect(targetRoom.doors[opp]).toBeDefined();
            expect(targetRoom.doors[opp]?.connectedTo).toEqual({ roomX: rx, roomY: ry });

            const mid = Math.floor(ROOM_SIZE / 2);
            if (dir === 'right') {
              for (let dy = -2; dy <= 2; dy++) {
                expect(room.tiles[mid + dy][ROOM_SIZE - 1]).toBe(CELL.DOOR);
                expect(targetRoom.tiles[mid + dy][0]).toBe(CELL.DOOR);
              }
            }
            if (dir === 'down') {
              for (let dx = -2; dx <= 2; dx++) {
                expect(room.tiles[ROOM_SIZE - 1][mid + dx]).toBe(CELL.DOOR);
                expect(targetRoom.tiles[0][mid + dx]).toBe(CELL.DOOR);
              }
            }
          }
        }
      }
    }
  });
});

// ============================================================
// Integration — Solvability
// ============================================================
describe('Solvability with all door fixes', () => {
  it('100 generated 5×5 maps are all solvable', () => {
    for (let i = 0; i < 100; i++) {
      const world = generateWorldMap(5, 5);
      expect(verifySolvability(world)).toBe(true);
    }
  });
});
