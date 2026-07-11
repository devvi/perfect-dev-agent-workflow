// FILE: tests/boss-room-freeze.test.js
// Tests for Boss Room Freeze Fix (Issue #132)
// Strategy A: Bug-documenting tests + regression tests + describe.todo()
//
// Four bugs documented:
//  Bug 1: getCellAt() reads wrong tile indices (clamps to [0,19] for 80×80 boss room)
//  Bug 2: Room transition collision — snake stuck on entrance wall
//  Bug 3: Boss entity spawns at wrong world coordinates
//  Bug 4: Boss room pillar collision broken (pillars at indices outside 0-19 range)

import { describe, it, expect } from 'vitest';

import {
  ROOM_SIZE, ROOM_TYPE, CELL, BOSS_ROOM_SIZE,
} from '../public/src/engine/constants.js';
import {
  createRoom, getRoomAt, getCellAt, worldToRoomCoords, roomToWorldCoords,
  generateDefaultTiles,
} from '../public/src/engine/world.js';
import {
  generateWorldMap, assignRoomTypes, generateBossRoomTiles, generateRoomTiles,
} from '../public/src/engine/generator.js';

// ============================================================
// Helpers: find the boss room
// ============================================================

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Create a world and find the boss room.
 * generateWorldMap internally generates boss room tiles (80×80) for the BOSS room.
 */
function createBossWorld() {
  const world = generateWorldMap(5, 5);
  let bossRoom = null;
  let bossRx = -1, bossRy = -1;
  for (let y = 0; y < world.rows; y++) {
    for (let x = 0; x < world.cols; x++) {
      const room = world.rooms[y][x];
      if (room.type === ROOM_TYPE.BOSS) {
        bossRoom = room;
        bossRx = x;
        bossRy = y;
        break;
      }
    }
    if (bossRoom) break;
  }
  return { world, bossRoom, bossRx, bossRy };
}

// ============================================================
// SECTION 1 — Bug-Documenting Tests (current buggy behaviour)
// ============================================================

describe('Bug 1: worldToRoomCoords clamps to [0,19] for boss room coords', () => {
  it('produces cy in [0,19] for y-values that should map to boss room rows 20-79', () => {
    const { world, bossRoom, bossRx, bossRy } = createBossWorld();
    // For a world y that falls within the boss room's grid cell (0..19 in world offset):
    // bossRy*20 + y_offset → ry = bossRy, cy = y_offset
    // cy ∈ [0, 19] — this can only access tiles rows 0..19 of the 80×80 boss room
    const y_offset = 18;
    const wy = bossRy * ROOM_SIZE + y_offset;
    const wx = bossRx * ROOM_SIZE + 10;
    const { cy } = worldToRoomCoords(wx, wy);
    // cy is clamped to [0, ROOM_SIZE-1] range
    expect(cy).toBeGreaterThanOrEqual(0);
    expect(cy).toBeLessThan(ROOM_SIZE);
    // BUG: for the boss room (80×80 tiles), cy should be able to go up to 79
  });

  it('produces wrong room ry for y-values that extend beyond the 20-cell grid cell', () => {
    const { world, bossRoom, bossRx, bossRy } = createBossWorld();
    // For world y = bossRy*20 + 40, worldToRoomCoords computes:
    // ry = floor((bossRy*20 + 40) / 20) = bossRy + 2
    // This maps to a DIFFERENT room, not the boss room!
    const wy = bossRy * ROOM_SIZE + 40;
    const wx = bossRx * ROOM_SIZE + 10;
    const { ry } = worldToRoomCoords(wx, wy);
    // ry points to a room 2 cells below the boss room
    expect(ry).toBe(bossRy + 2);
    // BUG: These coordinates should still be within the boss room
    // (the boss room should span 80 world-coordinate rows, not 20)
  });
});

describe('Bug 1: getCellAt cannot access full boss room tiles', () => {
  it('returns wrong value for boss door position at tiles[0][40]', () => {
    const { world, bossRoom, bossRx, bossRy } = createBossWorld();
    // The boss door is at tiles[0][BOSS_ROOM_SIZE/2] = tiles[0][40].
    // To read it with getCellAt, we need world coords within the boss room's
    // 20×20 world cell: wy = bossRy*20 + 0, wx = bossRx*20 + 40
    // But worldToRoomCoords(wx, wy) gives cx = 40%20 = 0, so it reads tiles[0][0]
    // And the world cell only spans 20 cols from bossRx*20, so wx=bossRx*20+40
    // is OUTSIDE the boss room's world grid cell (maps to room bossRx+2).
    // 
    // The boss door at tiles[0][40] is UNREACHABLE through getCellAt with
    // the current ROOM_SIZE-based coordinate system.
    const wx = bossRx * ROOM_SIZE + 40;  // maps to room bossRx+2
    const wy = bossRy * ROOM_SIZE + 0;   // maps to room bossRy
    const cell = getCellAt(world, wx, wy);
    // BUG: should read BOSS_DOOR (7) at tiles[0][40], but reads tiles[0][0]
    // of room (bossRx+2, bossRy) which is a different room entirely
    expect(cell).not.toBe(CELL.BOSS_DOOR);
  });

  it('returns wrong value for bottom pillar position at tiles[74][5]', () => {
    const { world, bossRoom, bossRx, bossRy } = createBossWorld();
    // Pillar at tiles[74][5] in tile-local coords.
    // wy = bossRy*20 + 74 → ry = bossRy + 3 (wrong room!)
    // getCellAt reads room (bossRx, bossRy+3) tiles[some][5]
    const wx = bossRx * ROOM_SIZE + 5;
    const wy = bossRy * ROOM_SIZE + 74;
    const cell = getCellAt(world, wx, wy);
    // BUG: should be CELL.STONE_WALL (4) but is whatever is at room (bossRx, bossRy+3)
    expect(cell).not.toBe(CELL.STONE_WALL);
  });
});

describe('Bug 3: Boss entity spawns at wrong world coordinates', () => {
  it('boss entity is placed at tile-local coords (40,38) instead of world coords', () => {
    const { world, bossRoom, bossRx, bossRy } = createBossWorld();
    // generateBossRoomTiles() calls:
    //   createBossEnemy('blue_hammer', 40, 38)  // args are tile-local coords
    // but the entity's x,y are stored as WORLD coords.
    // So boss at (40, 38) world coords → room grid (2, 0), not the boss room.
    const boss = bossRoom.entities.enemies.find(e => e.boss);
    expect(boss).toBeDefined();
    // BUG: boss should be in boss room grid cell (bossRx, bossRy)
    const bossRoomGrid = getRoomAt(world, Math.floor(boss.x / ROOM_SIZE), Math.floor(boss.y / ROOM_SIZE));
    expect(bossRoomGrid).not.toBeNull();
    expect(bossRoomGrid.type).not.toBe(ROOM_TYPE.BOSS);
    expect(bossRoomGrid.type).toBe(ROOM_TYPE.NORMAL); // wrong room
  });
});

describe('Bug 2 & 4: Boss room entry and pillars', () => {
  it('getCellAt returns incorrect value for a pillar at tiles[5][5] that IS in the 0-19 range', () => {
    const { world, bossRoom, bossRx, bossRy } = createBossWorld();
    // Pillar at tiles[5][5] IS within the 0-19 range, so getCellAt CAN read it.
    // wx = bossRx*20 + 5, wy = bossRy*20 + 5
    // cx = 5, cy = 5 → tiles[5][5] in the boss room
    const wx = bossRx * ROOM_SIZE + 5;
    const wy = bossRy * ROOM_SIZE + 5;
    const cell = getCellAt(world, wx, wy);
    // tiles[5][5] is STONE_WALL in boss room — THIS actually works!
    expect(cell).toBe(CELL.STONE_WALL);
  });

  it('cannot access pillar at tiles[5][74] (outside 0-19 row range)', () => {
    const { world, bossRoom, bossRx, bossRy } = createBossWorld();
    // Pillar at tiles[74][5] in tile-local coords = world (bossRx*20+5, bossRy*20+74)
    // ry = bossRy + 3, so it reads a different room entirely
    // But even if ry were bossRy, cy = 74%20 = 14, and tiles[14][5] in boss room
    // is CELL.FLOOR, not CELL.STONE_WALL!
    const wx = bossRx * ROOM_SIZE + 5;
    const wy = bossRy * ROOM_SIZE + 74;
    const cell = getCellAt(world, wx, wy);
    // BUG: should be CELL.STONE_WALL but is FLOOR or other
    expect(cell).not.toBe(CELL.STONE_WALL);
  });
});

// ============================================================
// SECTION 2 — Regression Tests (normal rooms must still work)
// ============================================================

describe('Regression: normal rooms still work with ROOM_SIZE=20', () => {
  it('getCellAt returns CELL.FLOOR for interior cell in normal room', () => {
    const world = generateWorldMap(5, 5);
    // Room (0, 0) is START type with default 20×20 tiles
    const wx = 0 * ROOM_SIZE + 10;
    const wy = 0 * ROOM_SIZE + 10;
    const cell = getCellAt(world, wx, wy);
    expect(cell).toBe(CELL.FLOOR);
  });

  it('getCellAt returns CELL.WALL for border cell in normal room', () => {
    const world = generateWorldMap(5, 5);
    // Border of room (0, 0)
    const wx = 0 * ROOM_SIZE + 0;
    const wy = 0 * ROOM_SIZE + 5;
    const cell = getCellAt(world, wx, wy);
    expect(cell).toBe(CELL.WALL);
  });

  it('worldToRoomCoords produces correct room index and cell coords for normal rooms', () => {
    const world = generateWorldMap(5, 5);
    // World position at room (2, 3), cell (5, 7)
    const wx = 2 * ROOM_SIZE + 5;
    const wy = 3 * ROOM_SIZE + 7;
    const { rx, ry, cx, cy } = worldToRoomCoords(wx, wy);
    expect(rx).toBe(2);
    expect(ry).toBe(3);
    expect(cx).toBe(5);
    expect(cy).toBe(7);
  });

  it('roomToWorldCoords roundtrip is consistent for normal rooms', () => {
    const rx = 3, ry = 1, cx = 7, cy = 4;
    const { x, y } = roomToWorldCoords(rx, ry, cx, cy);
    expect(x).toBe(rx * ROOM_SIZE + cx);
    expect(y).toBe(ry * ROOM_SIZE + cy);
    // Reverse
    const { rx: rx2, ry: ry2, cx: cx2, cy: cy2 } = worldToRoomCoords(x, y);
    expect(rx2).toBe(rx);
    expect(ry2).toBe(ry);
    expect(cx2).toBe(cx);
    expect(cy2).toBe(cy);
  });

  it('getCellAt returns null-safe FLOOR for out-of-bounds world position', () => {
    expect(getCellAt({ rows: 5, cols: 5, rooms: [] }, -1, -1)).toBe(CELL.FLOOR);
  });

  it('generateRoomTiles creates a room interior with non-WALL cells', () => {
    const room = createRoom(0, 0, ROOM_TYPE.NORMAL, {});
    const rng = seededRandom(42);
    const tiles = generateRoomTiles(room, rng);
    expect(tiles.length).toBe(ROOM_SIZE);
    expect(tiles[0].length).toBe(ROOM_SIZE);
    expect(tiles[ROOM_SIZE - 2][ROOM_SIZE - 2]).not.toBe(CELL.WALL);
  });
});

describe('Regression: boss room has correct structure', () => {
  it('boss room tiles array is 80×80', () => {
    const { bossRoom } = createBossWorld();
    expect(bossRoom.tiles.length).toBe(BOSS_ROOM_SIZE);
    expect(bossRoom.tiles[0].length).toBe(BOSS_ROOM_SIZE);
  });

  it('boss room has 4 pillars in config', () => {
    const { bossRoom } = createBossWorld();
    expect(bossRoom.bossConfig.pillars.length).toBe(4);
  });

  it('boss room tiles have STONE_WALL at pillar positions', () => {
    const { bossRoom } = createBossWorld();
    for (const p of bossRoom.bossConfig.pillars) {
      expect(bossRoom.tiles[p.y][p.x]).toBe(CELL.STONE_WALL);
    }
  });

  it('boss room tiles have BOSS_DOOR on top wall at center', () => {
    const { bossRoom } = createBossWorld();
    const doorPos = Math.floor(BOSS_ROOM_SIZE / 2);
    expect(bossRoom.tiles[0][doorPos]).toBe(CELL.BOSS_DOOR);
  });
});

// ============================================================
// SECTION 3 — Post-Fix Expectations (describe.todo())
// After the implement agent fixes the coordinate conversion,
// these tests will be enabled.
// ============================================================

describe.todo('Post-fix: boss room tile access through getCellAt', () => {
  it('getCellAt returns CELL.FLOOR for a floor cell inside boss room');

  it('getCellAt returns CELL.BOSS_DOOR for the boss door position');

  it('getCellAt returns CELL.STONE_WALL at pillar position (5,5)');

  it('getCellAt returns CELL.STONE_WALL at pillar position (74,5)');

  it('getCellAt returns CELL.STONE_WALL at pillar position (5,74)');

  it('getCellAt returns CELL.STONE_WALL at pillar position (74,74)');

  it('getCellAt returns CELL.WALL for the outer border of boss room (top edge)');

  it('getCellAt returns CELL.WALL for the outer border of boss room (bottom edge)');
});

describe.todo('Post-fix: worldToRoomCoords handles boss rooms', () => {
  it('worldToRoomCoords with room param returns correct cx,cy for boss rooms');

  it('worldToRoomCoords without room param falls back to ROOM_SIZE');

  it('worldToRoomCoords with room param returns correct rx,ry for boss rooms');
});

describe.todo('Post-fix: boss entity at correct world coordinates', () => {
  it('boss entity is in the boss room grid cell');

  it('boss entity is near center of the boss room');
});

describe.todo('Post-fix: emergency food respawn uses correct bounds', () => {
  it('emergencyFoodRespawn can place food in the full 80×80 boss room');

  it('emergencyFoodRespawn does not change behaviour for normal rooms');
});
