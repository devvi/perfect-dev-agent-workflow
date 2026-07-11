// FILE: public/src/engine/bossAI.js
// Boss AI system — phase-based behavior for "Blue Hammer" dual-column boss
//
// Phase Resolution Priority (highest first):
//   1. FOOD_PRIORITY — food on field overrides all other modes
//   2. SINGLE_SNAKE — HP ≤ 2, one active head
//   3. CHARGE — HP ≤ 4, windup → dash → recovery cycle
//   4. CHASE — default, pathfind toward player

import { ROOM_SIZE, CELL, BOSS } from './constants.js';
import { getRoomAt, getCellAt, worldToRoomCoords } from './world.js';

/**
 * Resolve boss behavior mode based on current state
 * Priority cascade: FOOD_PRIORITY > SINGLE_SNAKE > CHARGE > CHASE
 */
export function resolveBossPhase(boss, state) {
  // Food on field overrides all
  if (hasFoodOnField(state)) return 'FOOD_PRIORITY';
  // HP thresholds
  if (boss.hp <= 2) return 'SINGLE_SNAKE';
  if (boss.hp <= 4) return 'CHARGE';
  return 'CHASE';
}

/**
 * Check if there's food on the field that the boss can path to
 */
export function hasFoodOnField(state) {
  return state.foods && state.foods.length > 0;
}

/**
 * Update boss for current tick — main AI dispatcher
 */
export function updateBoss(boss, state) {
  if (!boss || !state) return;

  // Decrement stuffed ticks if active
  if (boss.stuffedTicks > 0) {
    boss.stuffedTicks--;
    return; // Immobile while stuffed
  }

  // Resolve phase
  const phase = resolveBossPhase(boss, state);
  boss.behavior = phase;
  boss.behaviorTick = (boss.behaviorTick || 0) + 1;

  switch (phase) {
    case 'FOOD_PRIORITY':
      bossSeekFood(boss, state);
      break;
    case 'SINGLE_SNAKE':
      bossSingleSnake(boss, state);
      break;
    case 'CHARGE':
      bossCharge(boss, state);
      break;
    case 'CHASE':
    default:
      bossChase(boss, state);
      break;
  }
}

/**
 * Mode 1: Chase — pathfind toward player
 */
export function bossChase(boss, state) {
  const playerHead = state.snake[0];
  if (!playerHead) return;

  const dx = playerHead.x - getBossCenterX(boss);
  const dy = playerHead.y - getBossCenterY(boss);
  const dist = Math.abs(dx) + Math.abs(dy);

  // Only chase within range
  if (dist > 30) return;

  moveBossToward(boss, dx, dy, state);
}

/**
 * Mode 2: Charge — windup → dash → recovery
 * Phase A (ticks 1-5): Windup — boss visual cue
 * Phase B (ticks 6-10): Dash — move at 2× speed toward player direction
 * Phase C (ticks 11-13): Recovery
 */
export function bossCharge(boss, state) {
  const bt = boss.behaviorTick || 0;
  const windup = BOSS.CHARGE_WINDUP_TICKS || 5;
  const dash = BOSS.CHARGE_DASH_TICKS || 5;
  const recovery = BOSS.CHARGE_RECOVERY_TICKS || 3;
  const cycle = windup + dash + recovery;
  const phaseInCycle = bt % cycle;

  if (phaseInCycle < windup) {
    // Windup: don't move, visual cue
    return;
  } else if (phaseInCycle < windup + dash) {
    // Dash: move 2 cells in current direction
    const dir = boss.direction || { x: -1, y: 0 };
    moveBossBy(boss, dir.x * 2, dir.y * 2, state);
  } else {
    // Recovery: slow movement
    const playerHead = state.snake[0];
    if (playerHead) {
      const dx = playerHead.x - getBossCenterX(boss);
      const dy = playerHead.y - getBossCenterY(boss);
      moveBossToward(boss, dx * 0.5, dy * 0.5, state);
    }
  }
}

/**
 * Mode 3: Single-snake — one active head, alternates on player collision
 */
export function bossSingleSnake(boss, state) {
  const playerHead = state.snake[0];
  if (!playerHead) return;

  // Use active head for pathfinding
  const activeSegments = boss.activeHead === 'head1' ? boss.segments1 : boss.segments2;
  if (!activeSegments || activeSegments.length === 0) return;

  const headPos = activeSegments[0];
  const dx = playerHead.x - headPos.x;
  const dy = playerHead.y - headPos.y;
  moveBossToward(boss, dx, dy, state);
}

/**
 * Mode 4: Food priority — pathfind to nearest food
 */
export function bossSeekFood(boss, state) {
  if (!state.foods || state.foods.length === 0) return;

  const centerX = getBossCenterX(boss);
  const centerY = getBossCenterY(boss);

  let nearest = null;
  let minDist = Infinity;
  for (const food of state.foods) {
    const dist = Math.abs(food.x - centerX) + Math.abs(food.y - centerY);
    if (dist < minDist) {
      minDist = dist;
      nearest = food;
    }
  }

  if (nearest) {
    const dx = nearest.x - centerX;
    const dy = nearest.y - centerY;
    moveBossToward(boss, dx, dy, state);

    // Check if boss ate the food
    if (Math.abs(centerX - nearest.x) <= 1 && Math.abs(centerY - nearest.y) <= 1) {
      const totalLen = (boss.segments1 ? boss.segments1.length : 0) +
                       (boss.segments2 ? boss.segments2.length : 0);
      if (totalLen > BOSS.MAX_HP) {
        boss.stuffedTicks = BOSS.STUFFED_TICKS;
      }
    }
  }
}

/**
 * Move boss one step toward a target direction
 */
function moveBossToward(boss, dx, dy, state) {
  let moveX = 0, moveY = 0;
  if (Math.abs(dx) > Math.abs(dy)) {
    moveX = dx > 0 ? 1 : -1;
  } else if (Math.abs(dy) > 0) {
    moveY = dy > 0 ? 1 : -1;
  }

  if (moveX === 0 && moveY === 0) return;

  // Update direction
  boss.direction = { x: moveX, y: moveY };

  // Move both columns
  moveBossBy(boss, moveX, moveY, state);
}

/**
 * Move boss by a delta, with collision checking
 */
function moveBossBy(boss, dx, dy, state) {
  moveColumn(boss, 'segments1', dx, dy, state);
  moveColumn(boss, 'segments2', dx, dy, state);
}

/**
 * Move a single column of the boss
 */
function moveColumn(boss, columnKey, dx, dy, state) {
  const segments = boss[columnKey];
  if (!segments || segments.length === 0) return;

  const head = segments[0];
  const newHead = { x: head.x + dx, y: head.y + dy };

  // Basic bounds check
  if (state && state.world) {
    const maxX = state.world.cols * ROOM_SIZE;
    const maxY = state.world.rows * ROOM_SIZE;
    if (newHead.x < 0 || newHead.x >= maxX || newHead.y < 0 || newHead.y >= maxY) return;
  }

  // Move: prepend new head, remove tail
  segments.unshift(newHead);
  segments.pop();
}

/**
 * Get boss center position (average of both heads)
 */
function getBossCenterX(boss) {
  const h1 = boss.segments1 && boss.segments1[0];
  const h2 = boss.segments2 && boss.segments2[0];
  if (h1 && h2) return Math.floor((h1.x + h2.x) / 2);
  if (h1) return h1.x;
  return 0;
}

function getBossCenterY(boss) {
  const h1 = boss.segments1 && boss.segments1[0];
  const h2 = boss.segments2 && boss.segments2[0];
  if (h1 && h2) return Math.floor((h1.y + h2.y) / 2);
  if (h1) return h1.y;
  return 0;
}
