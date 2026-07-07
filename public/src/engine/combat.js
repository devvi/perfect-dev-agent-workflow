// FILE: public/src/engine/combat.js
// Attack system, projectile management

import {
  DEFAULT_FIRE_RATE, DEFAULT_PROJECTILE_SPEED,
  DEFAULT_PROJECTILE_DECAY, DEFAULT_PROJECTILE_POWER,
  DEFAULT_MAX_PROJECTILES,
} from './constants.js';
import { createProjectile } from './entities.js';

let _projIdCounter = 1;

function nextProjId() {
  return _projIdCounter++;
}

/**
 * Fire a projectile from the snake head
 * Returns new state (or unchanged if can't fire)
 */
export function fireProjectile(state) {
  // Check game state
  if (state.gameState !== 'playing') return state;

  // Check cooldown
  if (state.fireCooldown > 0) return state;

  // Check max projectiles
  if (state.projectiles.length >= state.maxProjectiles) return state;

  // Check snake length
  if (state.snake.length < 2) return state; // need at least 2 segments to survive

  const head = state.snake[0];

  // Create projectile(s)
  const projectiles = [...state.projectiles];
  const newProj = createProjectile(
    nextProjId(),
    head.x + state.direction.x,
    head.y + state.direction.y,
    { ...state.direction },
    state.projectileSpeed,
    state.projectileDecay,
    state.projectilePower,
  );
  projectiles.push(newProj);

  // Double shot: create a second projectile
  if (state.doubleShot) {
    // Second projectile from the same position
    const proj2 = createProjectile(
      nextProjId(),
      head.x + state.direction.x,
      head.y + state.direction.y,
      { ...state.direction },
      state.projectileSpeed,
      state.projectileDecay,
      state.projectilePower,
    );
    projectiles.push(proj2);
  }

  // Remove last segment (deduct length)
  const snake = state.snake.slice(0, -1);

  return {
    ...state,
    snake,
    projectiles,
    fireCooldown: state.fireRate,
  };
}

/**
 * Update all projectiles: move, decrement range, despawn
 */
export function updateProjectiles(state) {
  const active = [];

  for (const proj of state.projectiles) {
    const remaining = proj.remainingRange - proj.speed;
    if (remaining <= 0) continue; // despawn

    active.push({
      ...proj,
      prevX: proj.x,
      prevY: proj.y,
      x: proj.x + proj.dir.x * proj.speed,
      y: proj.y + proj.dir.y * proj.speed,
      remainingRange: remaining,
    });
  }

  return { ...state, projectiles: active };
}

/**
 * Apply projectile damage to an enemy
 */
export function applyProjectileDamage(state, projId, enemy) {
  // Remove the projectile
  const projectiles = state.projectiles.filter(p => p.id !== projId);

  // Damage the enemy
  enemy.hp -= 1;
  if (enemy.segments.length > 0) {
    enemy.segments.pop();
  }

  // Update score
  const score = state.score + 5;

  return {
    ...state,
    projectiles,
    score,
    enemiesKilled: enemy.hp <= 0 ? state.enemiesKilled + 1 : state.enemiesKilled,
  };
}

/**
 * Remove enemy from its room if HP <= 0
 */
export function removeDeadEnemy(state, enemy) {
  const { rx, ry } = worldToRoom(state, enemy.x, enemy.y);
  if (!rx === null) return state;

  const room = state.world.rooms[ry][rx];
  if (!room) return state;

  const filtered = room.entities.enemies.filter(e => e.id !== enemy.id);
  room.entities.enemies = filtered;

  return state;
}

/**
 * Helper to get room coords from world coords
 */
function worldToRoom(state, wx, wy) {
  const size = 20; // ROOM_SIZE
  const rx = Math.floor(wx / size);
  const ry = Math.floor(wy / size);
  if (rx < 0 || rx >= state.world.cols || ry < 0 || ry >= state.world.rows) {
    return { rx: null, ry: null };
  }
  return { rx, ry };
}

/**
 * Update cooldowns
 */
export function updateCooldowns(state) {
  return {
    ...state,
    fireCooldown: Math.max(0, state.fireCooldown - 1),
  };
}

/**
 * Reset projectile counter (for tests)
 */
export function resetProjCounter() {
  _projIdCounter = 1;
}
