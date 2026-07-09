// FILE: public/src/engine/items.js
// Gacha machine, power-up system

import { POWER_UP_TYPE, GACHA_COST } from './constants.js';

/**
 * Use the gacha machine
 * Consumes GACHA_COST length, grants a random power-up
 */
export function useGachaMachine(state) {
  if (state.snake.length < GACHA_COST + 1) {
    // Return the same state reference when not enough length
    state.gachaMessage = 'NOT ENOUGH LENGTH! Need ' + GACHA_COST + ' segments.';
    return state;
  }

  // Consume length
  const snake = state.snake.slice(0, state.snake.length - GACHA_COST);

  // Get random power-up
  const powerUp = getRandomPowerUp();

  const inventory = {
    ...state.inventory,
    items: [...state.inventory.items, powerUp],
  };

  // Apply immediate effects
  let newState = {
    ...state,
    snake,
    inventory,
    gachaMessage: 'GOT: ' + powerUpTypeName(powerUp.type),
  };

  newState = applyPowerUp(newState, powerUp);

  return {
    ...newState,
    score: state.score + 5, // bonus score for using gacha
  };
}

/**
 * Get a random power-up (weighted)
 */
export function getRandomPowerUp() {
  const types = [
    { type: POWER_UP_TYPE.FIRE_RATE, weight: 25 },
    { type: POWER_UP_TYPE.DAMAGE, weight: 20 },
    { type: POWER_UP_TYPE.DOUBLE_SHOT, weight: 15 },
    { type: POWER_UP_TYPE.RANGE, weight: 25 },
    { type: POWER_UP_TYPE.SPEED, weight: 15 },
  ];

  const totalWeight = types.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const t of types) {
    roll -= t.weight;
    if (roll <= 0) {
      return {
        type: t.type,
        duration: 300 + Math.floor(Math.random() * 200), // 300-500 ticks
        stack: 1,
      };
    }
  }

  // Fallback
  return { type: POWER_UP_TYPE.FIRE_RATE, duration: 300, stack: 1 };
}

/**
 * Apply a power-up effect to state
 */
export function applyPowerUp(state, powerUp) {
  switch (powerUp.type) {
    case POWER_UP_TYPE.FIRE_RATE:
      return { ...state, fireRate: Math.max(1, state.fireRate - 1) };

    case POWER_UP_TYPE.DAMAGE:
      return { ...state, projectilePower: state.projectilePower + 1 };

    case POWER_UP_TYPE.DOUBLE_SHOT:
      return { ...state, doubleShot: true };

    case POWER_UP_TYPE.RANGE:
      return { ...state, projectileDecay: state.projectileDecay + 5 };

    case POWER_UP_TYPE.SPEED:
      // Temporarily reduce the tick interval
      return { ...state, _speedBoost: true };

    default:
      return state;
  }
}

/**
 * Remove a power-up effect from state
 */
export function removePowerUp(state, type) {
  switch (type) {
    case POWER_UP_TYPE.FIRE_RATE:
      return { ...state, fireRate: Math.min(5, state.fireRate + 1) };

    case POWER_UP_TYPE.DAMAGE:
      return { ...state, projectilePower: Math.max(1, state.projectilePower - 1) };

    case POWER_UP_TYPE.DOUBLE_SHOT:
      return { ...state, doubleShot: false };

    case POWER_UP_TYPE.RANGE:
      return { ...state, projectileDecay: Math.max(5, state.projectileDecay - 5) };

    case POWER_UP_TYPE.SPEED:
      return { ...state, _speedBoost: false };

    default:
      return state;
  }
}

/**
 * Tick all active power-ups (decrement durations, remove expired)
 */
export function tickPowerUps(state) {
  if (state.inventory.items.length === 0) return state;

  let newState = { ...state };
  const remaining = [];

  for (const item of state.inventory.items) {
    if (item.duration > 0) {
      item.duration -= 1;
    }

    if (item.duration <= 0) {
      // Remove expired power-up
      newState = removePowerUp(newState, item.type);
    } else {
      remaining.push(item);
    }
  }

  return {
    ...newState,
    inventory: { ...newState.inventory, items: remaining },
  };
}

/**
 * Power-up type name (for display)
 */
export function powerUpTypeName(type) {
  const names = {
    [POWER_UP_TYPE.FIRE_RATE]: 'RAPID FIRE',
    [POWER_UP_TYPE.DAMAGE]: 'DAMAGE UP',
    [POWER_UP_TYPE.DOUBLE_SHOT]: 'DOUBLE SHOT',
    [POWER_UP_TYPE.RANGE]: 'RANGE UP',
    [POWER_UP_TYPE.SPEED]: 'SPEED BOOST',
  };
  return names[type] || type;
}
