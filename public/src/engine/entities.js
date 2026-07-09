// FILE: public/src/engine/entities.js
// Entity factories (Snake, Enemy, Projectile, Food)

import { ROOM_SIZE } from './constants.js';

/**
 * Create snake starting state
 */
export function createSnake(startWorldX, startWorldY) {
  return [
    { x: startWorldX, y: startWorldY },
    { x: startWorldX - 1, y: startWorldY },
    { x: startWorldX - 2, y: startWorldY },
  ];
}

/**
 * Create an enemy entity
 */
export function createEnemy(id, x, y, hp = 2, speedTicks = 2) {
  const segments = [];
  for (let i = 0; i < hp; i++) {
    segments.push({ x: x - i, y });
  }

  return {
    id,
    x,
    y,
    segments,
    hp,
    speedTicks,
    tickCounter: 0,
    roomX: 0,
    roomY: 0,
    chaseRange: 20,
    aiState: 'idle',
    returnCount: 0,
  };
}

/**
 * Create a projectile
 */
export function createProjectile(id, x, y, dir, speed, remainingRange, power) {
  return {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    dir,
    speed,
    remainingRange,
    power,
  };
}

/**
 * Create a food item at world coordinates
 */
export function createFood(x, y) {
  return { x, y };
}

/**
 * Check if a world position is within bounds
 */
export function isInWorld(wx, wy, world) {
  const maxX = world.cols * ROOM_SIZE;
  const maxY = world.rows * ROOM_SIZE;
  return wx >= 0 && wx < maxX && wy >= 0 && wy < maxY;
}
