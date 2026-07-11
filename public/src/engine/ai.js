// FILE: public/src/engine/ai.js
// Enemy AI (pathfinding, chasing, food stealing)

import { ROOM_SIZE, ROOM_TYPE } from './constants.js';
import { getRoomAt, worldToRoomCoords, getCellAt } from './world.js';

/**
 * Update all enemies: chase, idle, or return to home
 */
export function updateEnemies(state) {
  if (!state.world) return state;

  let newState = { ...state };
  const { world } = newState;

  for (let ry = 0; ry < world.rows; ry++) {
    for (let rx = 0; rx < world.cols; rx++) {
      const room = world.rooms[ry][rx];
      const enemies = [...room.entities.enemies];

      for (let ei = 0; ei < enemies.length; ei++) {
        const enemy = enemies[ei];
        enemy.tickCounter++;

        if (enemy.tickCounter < enemy.speedTicks) continue;
        enemy.tickCounter = 0;

        // Determine if snake is in the same room
        const snakeInRoom = newState.currentRoom.x === enemy.roomX && newState.currentRoom.y === enemy.roomY;
        const snakeHead = newState.snake[0];

        if (snakeInRoom) {
          // Chase mode — priority: food in room > snake head
          enemy.aiState = 'chase';
          let target = snakeHead;
          if (room.entities.food && room.entities.food.length > 0) {
            const nearest = findNearestFood(enemy, room.entities.food);
            if (nearest) {
              target = nearest;
            }
          }
          const move = enemyChasePath(enemy, target, room, world);
          if (move) {
            // Check if the move cell is valid
            const newX = enemy.x + move.x;
            const newY = enemy.y + move.y;
            const cellType = getCellAt(world, newX, newY);
            if (cellType === 0) { // FLOOR
              // Check not occupied by another enemy
              const occupied = room.entities.enemies.some(
                e => e.id !== enemy.id && e.x === newX && e.y === newY
              );
              if (!occupied) {
                enemy.x = newX;
                enemy.y = newY;
                // Also move segments
                if (enemy.segments.length > 0) {
                  enemy.segments = [{ x: newX, y: newY }, ...enemy.segments.slice(0, -1)];
                }
              }
            }
          }
        } else {
          // Not in same room - check if too far from home
          const roomDist = Math.abs(newState.currentRoom.x - enemy.roomX) +
                          Math.abs(newState.currentRoom.y - enemy.roomY);
          if (roomDist >= 2) {
            // Return home logic - despawn and respawn at home room
            enemy.x = enemy.roomX * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);
            enemy.y = enemy.roomY * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);
            enemy.aiState = 'idle';
            enemy.returnCount = 0;
          }
        }

        // Check for food nearby - enemy can steal food
        tryStealFood(enemy, room, world);

        // Update segments array to match current position
        if (enemy.hp > enemy.segments.length) {
          enemy.segments.push({ x: enemy.x, y: enemy.y });
        }
      }
    }
  }

  return newState;
}

/**
 * Find the nearest food item to an enemy by Manhattan distance
 */
export function findNearestFood(enemy, foodList) {
  let nearest = null;
  let minDist = Infinity;
  for (const food of foodList) {
    const dist = Math.abs(enemy.x - food.x) + Math.abs(enemy.y - food.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = food;
    }
  }
  return nearest;
}

/**
 * Greedy pathfinding: move toward target, avoiding walls
 */
export function enemyChasePath(enemy, snakeHead, room, world) {
  if (!snakeHead) return null;

  const dx = snakeHead.x - enemy.x;
  const dy = snakeHead.y - enemy.y;

  // Check within chase range
  const dist = Math.abs(dx) + Math.abs(dy);
  if (dist > enemy.chaseRange) return null;

  // Try to move along the axis with greater distance first
  const moves = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) moves.push({ x: 1, y: 0 });
    else moves.push({ x: -1, y: 0 });
    if (dy > 0) moves.push({ x: 0, y: 1 });
    else moves.push({ x: 0, y: -1 });
  } else {
    if (dy > 0) moves.push({ x: 0, y: 1 });
    else moves.push({ x: 0, y: -1 });
    if (dx > 0) moves.push({ x: 1, y: 0 });
    else moves.push({ x: -1, y: 0 });
  }

  // Try each move, pick the first valid one
  for (const move of moves) {
    const nx = enemy.x + move.x;
    const ny = enemy.y + move.y;
    const cellType = getCellAt(world, nx, ny);
    if (cellType === 0) { // FLOOR
      return move;
    }
  }

  return null; // stuck
}

/**
 * Enemy steals food if on the same cell
 */
function tryStealFood(enemy, room, world) {
  for (let fi = room.entities.food.length - 1; fi >= 0; fi--) {
    const food = room.entities.food[fi];
    if (Math.abs(enemy.x - food.x) <= 1 && Math.abs(enemy.y - food.y) <= 1) {
      // Actually step on it
      if (enemy.x === food.x && enemy.y === food.y) {
        room.entities.food.splice(fi, 1);
        enemy.hp += 1;
        enemy.segments.push({ x: enemy.x, y: enemy.y });
        return;
      }
    }
  }
}

/**
 * Emergency food respawn: if no food exists in any accessible room
 */
export function emergencyFoodRespawn(state) {
  if (!state.world) return state;

  // Check if any room has food
  let hasFood = false;
  for (let ry = 0; ry < state.world.rows; ry++) {
    for (let rx = 0; rx < state.world.cols; rx++) {
      if (state.world.rooms[ry][rx].entities.food.length > 0) {
        hasFood = true;
        break;
      }
    }
    if (hasFood) break;
  }

  if (!hasFood) {
    // Respawn food in current room
    const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
    if (room) {
      // Find clear spot
      for (let tries = 0; tries < 50; tries++) {
        const cx = 1 + Math.floor(Math.random() * (ROOM_SIZE - 2));
        const cy = 1 + Math.floor(Math.random() * (ROOM_SIZE - 2));
        if (room.tiles[cy][cx] === 0) {
          const wx = state.currentRoom.x * ROOM_SIZE + cx;
          const wy = state.currentRoom.y * ROOM_SIZE + cy;
          // Check not on snake or enemy
          const onSnake = state.snake.some(s => s.x === wx && s.y === wy);
          const onEnemy = room.entities.enemies.some(e => e.x === wx && e.y === wy);
          if (!onSnake && !onEnemy) {
            room.entities.food.push({ x: wx, y: wy });
            break;
          }
        }
      }
    }
  }

  return state;
}
