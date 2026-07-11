// Collision detection (world coordinates)

import { ROOM_SIZE, CELL, ROOM_TYPE } from './constants.js';
import { getRoomAt, getCellAt, worldToRoomCoords } from './world.js';

/**
 * Check if a room-local cell position is part of a door passage.
 * Used as a defensive fallback: if the tile grid shows WALL at a door position
 * (due to generation edge cases), the snake can still pass through safely.
 */
function isDoorCell(room, cx, cy) {
  if (!room || !room.doors) return false;
  const mid = Math.floor(ROOM_SIZE / 2);
  if (cy === 0 && room.doors.up) {
    return cx >= mid - 2 && cx <= mid + 2;
  }
  if (cy === ROOM_SIZE - 1 && room.doors.down) {
    return cx >= mid - 2 && cx <= mid + 2;
  }
  if (cx === 0 && room.doors.left) {
    return cy >= mid - 2 && cy <= mid + 2;
  }
  if (cx === ROOM_SIZE - 1 && room.doors.right) {
    return cy >= mid - 2 && cy <= mid + 2;
  }
  return false;
}

/**
 * Check what the snake head collides with
 * Returns array of collision types: 'damage', 'death', 'self', 'food', 'enemy', 'door'
 */
export function checkSnakeCollision(head, snake, state) {
  const world = state && state.world ? state.world : null;
  const results = [];

  // Check world bounds (works with or without world)
  let maxX = 9999, maxY = 9999;
  if (world) {
    maxX = world.cols * ROOM_SIZE;
    maxY = world.rows * ROOM_SIZE;
  }
  if (head.x < 0 || head.y < 0) return ['damage'];
  if (!world && head.x === 0) return ['damage'];
  if (world && (head.x >= maxX || head.y >= maxY)) return ['damage'];

  // Check cell type
  let cellType = -1;
  if (world) {
    cellType = getCellAt(world, head.x, head.y);
  }
  // Instant-death obstacles (spikes, stone walls)
  if (cellType === CELL.SPIKE || cellType === CELL.DEATH_WALL) {
    return ['death'];
  }

  // Regular wall — damage but not death
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
    results.push('damage');
  }

  // Check door (room transition)
  if (cellType === CELL.DOOR) results.push('door');
  if (cellType === CELL.BOSS_DOOR) results.push('boss_door');
  if (cellType === CELL.CRACKED_WALL) results.push('cracked_wall');

  // Check self collision (skip first segment which is head)
  for (let i = 1; i < snake.length; i++) {
    if (snake[i].x === head.x && snake[i].y === head.y) {
      return ['self'];
    }
  }

  // Check current room entities
  if (world) {
    const { rx, ry } = worldToRoomCoords(head.x, head.y);
    const room = getRoomAt(world, rx, ry);
    if (room) {
      const foodIdx = room.entities.food.findIndex(f => f.x === head.x && f.y === head.y);
      if (foodIdx >= 0) results.push('food');

      const enemyCollision = room.entities.enemies.some(e =>
        e.x === head.x && e.y === head.y ||
        e.segments.some(s => s.x === head.x && s.y === head.y)
      );
      if (enemyCollision) results.push('enemy');

      if (room.savePoint && head.x === room.x * ROOM_SIZE + room.savePoint.x &&
          head.y === room.y * ROOM_SIZE + room.savePoint.y) {
        results.push('save_point');
      }

      if (room.gachaMachine && head.x === room.x * ROOM_SIZE + room.gachaMachine.x &&
          head.y === room.y * ROOM_SIZE + room.gachaMachine.y) {
        results.push('gacha');
      }
    }
  } else if (state && state.food) {
    // Legacy: check single food property on state directly
    if (head.x === state.food.x && head.y === state.food.y) {
      results.push('food');
    }
  }

  return results.length > 0 ? results : ['none'];
}

/**
 * Check projectile collision with environment and entities
 * Returns collision info or null
 */
export function checkProjectileCollision(proj, state) {
  const world = state && state.world ? state.world : null;
  if (!world) return null;

  // Check world bounds
  const maxX = world.cols * ROOM_SIZE;
  const maxY = world.rows * ROOM_SIZE;
  if (proj.x < 0 || proj.x >= maxX || proj.y < 0 || proj.y >= maxY) {
    return { collisionType: 'wall', target: null };
  }

  // Check cell type
  const cellType = getCellAt(world, proj.x, proj.y);
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL || cellType === CELL.DEATH_WALL) {
    return { collisionType: 'wall', target: null };
  }
  if (cellType === CELL.CRACKED_WALL) {
    return { collisionType: 'cracked_wall', target: null, cellX: proj.x, cellY: proj.y };
  }

  // Check enemies
  const { rx, ry } = worldToRoomCoords(proj.x, proj.y);
  const room = getRoomAt(world, rx, ry);
  if (room) {
    const enemy = room.entities.enemies.find(e => e.x === proj.x && e.y === proj.y);
    if (enemy) {
      return { collisionType: 'enemy', target: enemy, projId: proj.id };
    }
  }

  return null;
}

/**
 * Generate all cells along a straight line from (ax, ay) to (bx, by).
 * Assumes axis-aligned movement (only x or y changes per step).
 * Includes both start and end cells. Maximum 50 steps to prevent infinite loops.
 */
export function getCellsAlongLine(ax, ay, bx, by) {
  const cells = [];
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  let cx = ax, cy = ay;
  let steps = 0;
  const MAX_STEPS = 50;

  while (steps < MAX_STEPS) {
    cells.push({ x: cx, y: cy });
    if (cx === bx && cy === by) break;
    cx += dx;
    cy += dy;
    steps++;
  }

  return cells;
}

/**
 * Check projectile collision at a specific cell (world coordinates).
 * Includes enemy body segment detection.
 * Returns collision info object or null.
 */
export function checkProjectileCollisionForCell(state, cellX, cellY, proj) {
  const world = state?.world;
  if (!world) return null;

  const maxX = world.cols * ROOM_SIZE;
  const maxY = world.rows * ROOM_SIZE;
  if (cellX < 0 || cellX >= maxX || cellY < 0 || cellY >= maxY) {
    return { collisionType: 'wall', target: null };
  }

  const cellType = getCellAt(world, cellX, cellY);
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL || cellType === CELL.DEATH_WALL) {
    return { collisionType: 'wall', target: null };
  }
  if (cellType === CELL.CRACKED_WALL) {
    return { collisionType: 'cracked_wall', target: null, cellX: cellX, cellY: cellY };
  }

  const { rx, ry } = worldToRoomCoords(cellX, cellY);
  const room = getRoomAt(world, rx, ry);
  if (room) {
    const enemy = room.entities.enemies.find(e =>
      e.x === cellX && e.y === cellY ||
      e.segments.some(s => s.x === cellX && s.y === cellY)
    );
    if (enemy) {
      return { collisionType: 'enemy', target: enemy, projId: proj.id };
    }
  }

  return null;
}

/**
 * Line-sweep continuous collision detection for a projectile.
 * Checks every cell along the path from prev position to current position.
 * Returns the first collision found, or null.
 */
export function lineSweepProjectileCollision(proj, state) {
  if (proj.prevX === undefined || proj.prevY === undefined) {
    return checkProjectileCollision(proj, state);
  }

  const cells = getCellsAlongLine(proj.prevX, proj.prevY, proj.x, proj.y);
  for (const cell of cells) {
    const result = checkProjectileCollisionForCell(state, cell.x, cell.y, proj);
    if (result) return result;
  }

  return null;
}

/**
 * Check room transition - detect if head crosses a door boundary
 */
export function checkRoomTransition(state, newHead) {
  const { currentRoom, world } = state;
  if (!world) return { entered: false };

  const { rx: newRx, ry: newRy } = worldToRoomCoords(newHead.x, newHead.y);

  // If room changed
  if (newRx !== currentRoom.x || newRy !== currentRoom.y) {
    const newRoom = getRoomAt(world, newRx, newRy);
    if (newRoom) {
      return {
        entered: true,
        roomX: newRx,
        roomY: newRy,
        room: newRoom,
        previousRoomX: currentRoom.x,
        previousRoomY: currentRoom.y,
      };
    }
  }

  return { entered: false };
}
export function checkDoorPassable(state, doorDir) {
  const { currentRoom, world } = state;
  if (!world) return { passable: true };

  const room = getRoomAt(world, currentRoom.x, currentRoom.y);
  if (!room) return { passable: true };

  const door = room.doors[doorDir];
  if (!door) return { passable: true };

  // BOSS door locked from inside until boss defeated
  if (room.bossRoom && !state.bossDefeated) {
    return { passable: false, reason: 'boss_door' };
  }

  if (door.locked && door.keyId) {
    if (!state.inventory || !state.inventory.keys || !state.inventory.keys.has(door.keyId)) {
      return { passable: false, reason: 'locked' };
    }
  }

  if (room.sizeGate && room.sizeGate.doorDir === doorDir) {
    const required = room.sizeGate.requiredLength;
    if (state.snake.length < required) {
      return { passable: false, reason: 'size_gate' };
    }
  }

  return { passable: true };
}
