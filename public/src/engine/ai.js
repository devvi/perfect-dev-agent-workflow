// FILE: public/src/engine/ai.js
// Enemy AI (pathfinding, chasing, food stealing, boss AI)

import { ROOM_SIZE, ROOM_TYPE, CELL, BOSS_ROOM_SIZE, BOSS_CHARGE_WINDUP, BOSS_STUFFED_TICKS, BOSS_CHARGE_COOLDOWN, FOOD_BLINK_START, FOOD_DESPAWN_TOTAL, COMBAT_FOOD_SPAWN_INTERVAL } from './constants.js';
import { getRoomAt, worldToRoomCoords, getCellAt } from './world.js';
import { buildBossSegments, createBounceFood } from './entities.js';
import { findEmptyFloorCell, isNearDoor } from './generator.js';

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
      const roomSize = (room.tiles && room.tiles.length) ? room.tiles.length : ROOM_SIZE;
      // Find clear spot
      for (let tries = 0; tries < 50; tries++) {
        const cx = 1 + Math.floor(Math.random() * (roomSize - 2));
        const cy = 1 + Math.floor(Math.random() * (roomSize - 2));
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

/**
 * Manhattan distance between two points
 */
function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Find nearest food to an entity
 */
function nearestFood(entity, foodList) {
  let nearest = null;
  let minDist = Infinity;
  for (const f of foodList) {
    const dist = manhattan(entity, f);
    if (dist < minDist) {
      minDist = dist;
      nearest = f;
    }
  }
  return nearest;
}

// ===================== BOSS AI (Issue #127) =====================

/**
 * Main boss update entry point
 */
export function updateBoss(state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  if (!room || !room.bossRoom) return state;
  const boss = room.entities.enemies.find(e => e.boss);
  if (!boss) return state;

  // Phase 4 Hunting: if food exists, override all phases
  if (room.entities.food && room.entities.food.length > 0) {
    return updateBossHunting(state, boss, room);
  }

  switch (boss.phase) {
    case 1: return updateBossChase(state, boss, room);
    case 2: return updateBossCharge(state, boss, room);
    case 3: return updateBossNormalSnake(state, boss, room);
  }
  return state;
}

/**
 * Phase 1 — Chase (HP 6-4): standard chase toward player
 */
function updateBossChase(state, boss, room) {
  const head = state.snake[0];
  const move = enemyChasePath(boss, head, room, state.world);
  if (move) {
    boss.x += move.x;
    boss.y += move.y;
    boss.segments = buildBossSegments(boss.x, boss.y);
  }

  // Check phase transition
  if (boss.hp <= 4) {
    boss.phase = 2;
    boss.aiState = 'windup';
    boss.chargeCooldown = BOSS_CHARGE_WINDUP;
  }
  return state;
}

/**
 * Phase 2 — Charge (HP 4-2): wind up then rush
 */
function updateBossCharge(state, boss, room) {
  if (boss.aiState === 'windup') {
    boss.chargeCooldown--;
    if (boss.chargeCooldown <= 0) {
      boss.aiState = 'charge';
      const head = state.snake[0];
      boss.chargeTarget = { x: head.x, y: head.y };
      // Calculate charge direction
      const dx = Math.sign(boss.chargeTarget.x - boss.x);
      const dy = Math.sign(boss.chargeTarget.y - boss.y);
      boss.chargeDir = { x: dx, y: dy };
    }
    return state;
  }

  if (boss.aiState === 'charge') {
    // Rush 2 cells/tick in charge direction
    for (let i = 0; i < 2; i++) {
      const nx = boss.x + boss.chargeDir.x;
      const ny = boss.y + boss.chargeDir.y;
      const cell = getCellAt(state.world, nx, ny);
      if (cell === CELL.WALL || cell === CELL.STONE_WALL || nx < 0 || ny < 0) {
        if (cell === CELL.STONE_WALL) {
          breakPillar(room, nx, ny, state);
        }
        boss.aiState = 'chase';
        boss.chargeCooldown = 3;
        break;
      }
      boss.x = nx;
      boss.y = ny;
    }
    boss.segments = buildBossSegments(boss.x, boss.y);

    // Post-charge: cooldown then re-evaluate
    if (boss.aiState !== 'chase') {
      // Still charging — nothing else
    }
  }

  if (boss.hp <= 2) {
    boss.phase = 3;
    boss.aiState = 'normal';
    // Shrink to 2 segments (the two eye cells)
    boss.segments = [boss.segments[0], boss.segments[3]];
    boss.headIndex = 0;
  }
  return state;
}

/**
 * Phase 3 — Normal Snake (HP 2): two cells, head swaps on hit
 */
function updateBossNormalSnake(state, boss, room) {
  const head = state.snake[0];
  const move = enemyChasePath(boss, head, room, state.world);
  if (move) {
    boss.x += move.x;
    boss.y += move.y;
    boss.segments[0] = { x: boss.x, y: boss.y };
    boss.segments[1] = { x: boss.x - move.x || boss.x, y: boss.y - move.y || boss.y };
  }

  // If HP reaches 4 by eating food, return to Phase 2
  if (boss.hp >= 4) {
    boss.phase = 2;
    boss.aiState = 'windup';
    boss.chargeCooldown = BOSS_CHARGE_WINDUP;
  }
  return state;
}

/**
 * Phase 4 — Hunting (overrides all): pathfind to nearest food
 */
function updateBossHunting(state, boss, room) {
  const nearest = nearestFood(boss, room.entities.food);
  if (!nearest) {
    return updateBoss(state);
  }
  const move = enemyChasePath(boss, nearest, room, state.world);
  if (move) {
    boss.x += move.x;
    boss.y += move.y;
    if (boss.phase === 3) {
      boss.headIndex = 0;
    } else {
      boss.segments = buildBossSegments(boss.x, boss.y);
    }
  }
  return state;
}

/**
 * Handle boss eating food
 */
export function bossEatFood(boss, room, state) {
  if (!room.entities.food) return false;
  let ate = false;
  for (let fi = room.entities.food.length - 1; fi >= 0; fi--) {
    const food = room.entities.food[fi];
    // Check if boss is on the same cell as food
    const onFood = boss.segments.some(seg => seg.x === food.x && seg.y === food.y);
    if (onFood) {
      room.entities.food.splice(fi, 1);
      if (boss.hp < boss.maxHp) {
        boss.hp = Math.min(boss.hp + 1, boss.maxHp);
      } else {
        boss.stuffedTicks = BOSS_STUFFED_TICKS;
      }
      ate = true;
    }
  }
  return ate;
}

/**
 * Break a pillar in the boss room — replace with floor, drop food
 */
function breakPillar(room, px, py, state) {
  const pillar = room.pillars.find(p => p.x === px && p.y === py);
  if (pillar && pillar.hp > 0) {
    pillar.hp = 0;
    // Replace tile with floor (boss room uses BOSS_ROOM_SIZE tiles)
    if (room.tiles && room.tiles[py] && room.tiles[py][px] !== undefined) {
      room.tiles[py][px] = CELL.FLOOR;
    }
    // Drop food with bounce
    const food = createBounceFood(px, py, null);
    room.entities.food.push(food);
  }
}

/**
 * Check boss vs player collision
 */
export function checkBossPlayerCollision(state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  if (!room || !room.bossRoom) return state;
  const boss = room.entities.enemies.find(e => e.boss);
  if (!boss) return state;

  const head = state.snake[0];
  const hit = boss.segments.some(seg => seg.x === head.x && seg.y === head.y);
  if (hit && state.invulnerableTicks <= 0) {
    const damage = boss.phase === 2 && boss.aiState === 'charge' ? 2 : 1;
    const lastSeg = state.snake[state.snake.length - 1];
    // Drop food with bounce
    const food = createBounceFood(lastSeg.x, lastSeg.y, boss);
    room.entities.food.push(food);
    // Remove segments
    for (let i = 0; i < damage; i++) {
      state.snake.pop();
    }
    if (state.snake.length === 0) {
      state.gameState = 'gameover';
      return state;
    }
    state.invulnerableTicks = 10;
    state.screenShake = { intensity: 6, duration: 10 };
    state.score = Math.max(0, state.score - 5);

    // Phase 3: swap head on player collision
    if (boss.phase === 3 && boss.segments.length === 2) {
      boss.headIndex = boss.headIndex === 0 ? 1 : 0;
      boss.segments = [boss.segments[1], boss.segments[0]];
    }
  }
  return state;
}

/**
 * Check boss vs pillar collision
 */
export function checkBossPillarCollision(state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  if (!room || !room.bossRoom || !room.pillars) return state;
  const boss = room.entities.enemies.find(e => e.boss);
  if (!boss) return state;

  for (const seg of boss.segments) {
    const pillar = room.pillars.find(p => p.x === seg.x && p.y === seg.y && p.hp > 0);
    if (pillar) {
      breakPillar(room, pillar.x, pillar.y, state);
    }
  }
  return state;
}

/**
 * Handle boss taking damage from projectile
 */
export function bossTakeDamage(boss, damage) {
  boss.hp = Math.max(0, boss.hp - damage);
  if (boss.hp <= 0) {
    return 'dead';
  }
  // Phase transitions
  if (boss.hp <= 2 && boss.phase < 3) {
    boss.phase = 3;
    boss.aiState = 'normal';
    if (boss.segments.length > 2) {
      boss.segments = [boss.segments[0], boss.segments[3]];
    }
  } else if (boss.hp <= 4 && boss.phase < 2) {
    boss.phase = 2;
    boss.aiState = 'windup';
    boss.chargeCooldown = BOSS_CHARGE_WINDUP;
  }
  return 'alive';
}

/**
 * Update food blink/despawn timer
 */
export function updateFoodBlinkDespawn(state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  if (!room || !room.bossRoom) return state;

  for (let i = room.entities.food.length - 1; i >= 0; i--) {
    const food = room.entities.food[i];
    if (food.isBouncing && food.bounceTicks > 0) {
      food.x += food.vx;
      food.y += food.vy;
      food.bounceTicks--;
    }
    food.despawnTicks--;
    if (food.despawnTicks <= FOOD_BLINK_START) {
      food.blinkPhase++;
    }
    if (food.despawnTicks <= 0) {
      room.entities.food.splice(i, 1);
    }
  }
  return state;
}

/**
 * Periodic food spawn when both boss and player are low on HP
 */
// ===================== COMBAT ROOM FUNCTIONS (Issue #224) =====================

/**
 * Spawn enemies in a combat room on first entry
 * @param {Object} room — The combat room
 * @param {Object} world — World map
 * @param {Object} state — Current game state (for difficulty)
 * @returns {Array} — Array of spawned enemy entities
 */
export function spawnCombatEnemies(room, world, state) {
  const dist = Math.abs(room.x) + Math.abs(room.y);
  const difficulty = Math.min(1 + Math.floor(dist * 0.3), 3);  // 1-3 difficulty
  const enemyCount = 2 + difficulty;  // 3-5 enemies per combat room
  const enemies = [];

  for (let e = 0; e < enemyCount; e++) {
    // Use spawnEnemyInRoom-like logic with margin from doors (COMBAT_ENEMY_MARGIN cells)
    const enemy = spawnCombatEnemyInRoom(room, world);
    if (enemy) {
      // Boost HP based on distance from start
      enemy.hp = 1 + Math.floor(dist * 0.3);
      enemies.push(enemy);
    }
  }

  room.entities.enemies.push(...enemies);
  return enemies;
}

/**
 * Spawn a single enemy in a combat room, avoiding door margins
 */
function spawnCombatEnemyInRoom(room, world) {
  // Find a floor cell that's not near any door
  for (let tries = 0; tries < 50; tries++) {
    const cx = 1 + Math.floor(Math.random() * (ROOM_SIZE - 2));
    const cy = 1 + Math.floor(Math.random() * (ROOM_SIZE - 2));
    if (room.tiles[cy][cx] === CELL.FLOOR) {
      // Check not near a door (COMBAT_ENEMY_MARGIN cells away)
      const nearDoor = isNearDoor(cx, cy, room);
      if (!nearDoor) {
        const wx = room.x * ROOM_SIZE + cx;
        const wy = room.y * ROOM_SIZE + cy;
        // Check no entity on this cell
        const hasEnemy = room.entities.enemies.some(e => Math.abs(e.x - wx) + Math.abs(e.y - wy) < 2);
        const hasFood = room.entities.food.some(f => f.x === wx && f.y === wy);
        if (!hasEnemy && !hasFood) {
          const hp = 1 + Math.floor(Math.random() * 3); // 1-3 HP
          const segments = [];
          for (let i = 0; i < hp; i++) {
            segments.push({ x: wx - i, y: wy });
          }
          return {
            id: generateCombatEnemyId(),
            x: wx,
            y: wy,
            segments,
            hp,
            speedTicks: 2,
            tickCounter: 0,
            roomX: room.x,
            roomY: room.y,
            chaseRange: 20,
            aiState: 'idle',
            returnCount: 0,
          };
        }
      }
    }
  }
  return null;
}

let _combatEnemyIdCounter = 2000;
function generateCombatEnemyId() {
  return _combatEnemyIdCounter++;
}

/**
 * Periodic food spawn for active combat rooms
 * Spawns 1 food every COMBAT_FOOD_SPAWN_INTERVAL ticks when room has no food
 */
export function spawnCombatFood(room, state) {
  if (room.entities.food.length > 0) return;
  if (state.tickCount % COMBAT_FOOD_SPAWN_INTERVAL !== 0) return;

  const pos = findEmptyFloorCell(room, state.world);
  if (pos) {
    room.entities.food.push({ x: pos.wx, y: pos.wy, combatFood: true });
  }
}

// Re-export findEmptyFloorCell from generator for use here

export function trySpawnPeriodicFood(state, room) {
  const boss = room.entities.enemies.find(e => e.boss);
  const playerLen = state.snake.length;
  if (boss && boss.hp <= 3 && playerLen <= 3 && state.tickCount % 15 === 0) {
    const food = createBounceFood(
      Math.floor(BOSS_ROOM_SIZE / 2) + Math.floor(Math.random() * 10) - 5,
      Math.floor(BOSS_ROOM_SIZE / 2) + Math.floor(Math.random() * 10) - 5,
      null
    );
    room.entities.food.push(food);
  }
}
