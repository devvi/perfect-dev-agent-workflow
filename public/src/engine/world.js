// FILE: public/src/engine/world.js
// Room/WorldMap data structures and coordinate helpers

import { ROOM_SIZE, ROOM_TYPE, CELL, DOOR_DIR } from './constants.js';

/**
 * Create a room with the given parameters
 */
export function createRoom(x, y, type = ROOM_TYPE.NORMAL, connections = {}) {
  const doors = {};
  for (const dir of DOOR_DIR) {
    doors[dir] = connections[dir] || null;
  }

  const room = {
    x,
    y,
    type,
    explored: false,
    tiles: generateDefaultTiles(),
    doors,
    sizeGate: null,
    entities: {
      enemies: [],
      food: [],
      items: [],
    },
    gachaMachine: null,
    savePoint: null,
  };

  return room;
}

/**
 * Generate default tiles for a room (Walls around border, Floor inside)
 */
export function generateDefaultTiles() {
  const tiles = [];
  for (let cy = 0; cy < ROOM_SIZE; cy++) {
    const row = [];
    for (let cx = 0; cx < ROOM_SIZE; cx++) {
      // Walls on border, floor inside
      if (cx === 0 || cx === ROOM_SIZE - 1 || cy === 0 || cy === ROOM_SIZE - 1) {
        row.push(CELL.WALL);
      } else {
        row.push(CELL.FLOOR);
      }
    }
    tiles.push(row);
  }
  return tiles;
}

/**
 * Get room at a given grid position
 */
export function getRoomAt(world, rx, ry) {
  if (ry < 0 || ry >= world.rows || rx < 0 || rx >= world.cols) return null;
  return world.rooms[ry][rx] || null;
}

/**
 * Convert world coords to room-local coords
 * @param {number} wx - World X coordinate
 * @param {number} wy - World Y coordinate
 * @param {object} [room] - Optional room object. When provided, uses room.tiles.length
 *                          as the room size for modular arithmetic. Falls back to ROOM_SIZE.
 */
export function worldToRoomCoords(wx, wy, room) {
  const roomSize = (room && room.tiles && room.tiles.length) ? room.tiles.length : ROOM_SIZE;
  const rx = Math.floor(wx / roomSize);
  const ry = Math.floor(wy / roomSize);
  const cx = ((wx % roomSize) + roomSize) % roomSize;
  const cy = ((wy % roomSize) + roomSize) % roomSize;
  return { rx, ry, cx, cy };
}

/**
 * Convert room-local coords to world coords
 */
export function roomToWorldCoords(rx, ry, cx, cy) {
  return {
    x: rx * ROOM_SIZE + cx,
    y: ry * ROOM_SIZE + cy,
  };
}

/**
 * Get cell type at a given world position
 * Uses the room's actual tile dimensions for bounds checking.
 * Falls back to ROOM_SIZE when room is null/undefined.
 * The cell coordinates (cx, cy) within the tile array are derived from
 * the ROOM_SIZE-based grid cell offset, ensuring backward compatibility
 * for rooms where tiles.length > ROOM_SIZE (e.g. boss rooms with 80×80 tiles).
 */
export function getCellAt(world, wx, wy) {
  // First pass: find room using standard ROOM_SIZE grid
  const { rx, ry } = worldToRoomCoords(wx, wy);
  const room = getRoomAt(world, rx, ry);
  if (!room) return CELL.FLOOR;
  // Cell coords within the ROOM_SIZE grid cell (always [0, ROOM_SIZE-1])
  const cx = ((wx % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
  const cy = ((wy % ROOM_SIZE) + ROOM_SIZE) % ROOM_SIZE;
  // Bounds check against actual room tile dimensions
  const roomSize = (room.tiles && room.tiles.length) ? room.tiles.length : ROOM_SIZE;
  if (cy < 0 || cy >= roomSize || cx < 0 || cx >= roomSize) return CELL.FLOOR;
  return room.tiles[cy][cx];
}

/**
 * Get door direction for a position within a room
 * Returns the door direction if the cell is at a door position
 */
export function getDoorDirectionAtCell(cx, cy) {
  if (cy === 0) return 'up';
  if (cy === ROOM_SIZE - 1) return 'down';
  if (cx === 0) return 'left';
  if (cx === ROOM_SIZE - 1) return 'right';
  return null;
}

/**
 * Check if a cell is at the edge of a room (door positions)
 */
export function isCellAtEdge(cx, cy) {
  return cx === 0 || cx === ROOM_SIZE - 1 || cy === 0 || cy === ROOM_SIZE - 1;
}

/**
 * Get opposite direction
 */
export function oppositeDir(dir) {
  const map = { up: 'down', down: 'up', left: 'right', right: 'left' };
  return map[dir] || dir;
}

/**
 * Direction name to vector
 */
export function dirToVector(dirName) {
  const map = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  return map[dirName] || { x: 0, y: 0 };
}

/**
 * Vector to direction name
 */
export function vectorToDir(vec) {
  if (vec.x === 0 && vec.y === -1) return 'up';
  if (vec.x === 0 && vec.y === 1) return 'down';
  if (vec.x === -1 && vec.y === 0) return 'left';
  if (vec.x === 1 && vec.y === 0) return 'right';
  return null;
}
