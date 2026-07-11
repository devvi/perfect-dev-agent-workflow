// FILE: public/src/engine/entities.js
// Entity factories (Snake, Enemy, Projectile, Food, Boss)

import { ROOM_SIZE, FOOD_DESPAWN_TOTAL } from './constants.js';

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
 * Create a boss enemy (Blue Hammer — double-row blue snake)
 */
export function createBossEnemy(type, x, y) {
  if (type !== 'blue_hammer') throw new Error(`Unknown boss type: ${type}`);
  return {
    id: 999,
    type: 'blue_hammer',
    boss: true,
    x, y,
    hp: 6,
    maxHp: 6,
    segments: buildBossSegments(x, y),
    rows: 2,
    segmentsPerRow: 3,
    speedTicks: 1,
    tickCounter: 0,
    chaseRange: 200,
    phase: 1,
    chargeCooldown: 0,
    stuffedTicks: 0,
    aiState: 'chase',
    headIndex: 0,
    color: '#3060e0',
    headColor: '#5090ff',
  };
}

/**
 * Build boss segment array — double row (2 rows × 3 segments)
 */
export function buildBossSegments(x, y) {
  return [
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y },
    { x, y: y + 1 },
    { x: x - 1, y: y + 1 },
    { x: x - 2, y: y + 1 },
  ];
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
 * Create a bouncing food item (with physics bounce + despawn timer)
 */
export function createBounceFood(x, y, source) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1 + Math.floor(Math.random() * 3);
  return {
    x, y,
    vx: Math.round(Math.cos(angle) * dist),
    vy: Math.round(Math.sin(angle) * dist),
    isBouncing: true,
    bounceTicks: 3,
    despawnTicks: FOOD_DESPAWN_TOTAL,
    blinkPhase: 0,
  };
}

/**
 * Check if a world position is within bounds
 */
export function isInWorld(wx, wy, world) {
  const maxX = world.cols * ROOM_SIZE;
  const maxY = world.rows * ROOM_SIZE;
  return wx >= 0 && wx < maxX && wy >= 0 && wy < maxY;
}
