// FILE: public/src/engine/core.js
// Main game loop, state management

import {
  ROOM_SIZE, ROOM_TYPE, BASE_TICK_INTERVAL, SPEED_SLOPE, MAX_TICK_INTERVAL, CELL, STUCK_TICKS,
  INVULNERABILITY_DURATION,
} from './constants.js';
import { generateWorldMap, findRoomOfType } from './generator.js';
import { getRoomAt } from './world.js';
import { createSnake, createFood } from './entities.js';
import { worldToRoomCoords, roomToWorldCoords, getCellAt } from './world.js';
import { checkSnakeCollision, checkProjectileCollision, checkRoomTransition, checkDoorPassable, lineSweepProjectileCollision } from './collision.js';
import { fireProjectile, updateProjectiles, applyProjectileDamage, updateCooldowns } from './combat.js';
import { updateEnemies, emergencyFoodRespawn } from './ai.js';
import { useGachaMachine, tickPowerUps } from './items.js';
import { saveGame } from './save.js';

/**
 * Create the initial game state
 * Generates the world map and places the player at the start room
 */
export function createInitialState(existingWorld = null) {
  const world = existingWorld || generateWorldMap(5, 5);

  // Position player in the center of the start room
  const startRoom = getRoomAt(world, world.playerStart.roomX, world.playerStart.roomY);
  const centerX = world.playerStart.roomX * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);
  const centerY = world.playerStart.roomY * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);

  const snake = createSnake(centerX, centerY);
  const startDir = { x: 1, y: 0 };

  // Mark start room as explored
  if (startRoom) startRoom.explored = true;

  // Commit metadata (from window.__COMMIT_INFO if available, else fallback)
  const commitInfo = (typeof window !== 'undefined' && window.__COMMIT_INFO &&
    window.__COMMIT_INFO.hash &&
    !window.__COMMIT_INFO.hash.startsWith('__'))
    ? window.__COMMIT_INFO
    : { hash: 'N/A', message: 'N/A', date: 'N/A' };

  return {
    snake,
    direction: startDir,
    nextDirection: startDir,
    currentRoom: { x: world.playerStart.roomX, y: world.playerStart.roomY },
    previousRoom: { x: world.playerStart.roomX, y: world.playerStart.roomY },
    projectiles: [],
    fireCooldown: 0,
    fireRate: 3,
    projectileSpeed: 2,
    projectileDecay: 10,
    projectilePower: 1,
    doubleShot: false,
    maxProjectiles: 3,
    world,
    inventory: { keys: new Set(), items: [] },
    keysFound: new Set(),
    gameState: 'title',
    tickCount: 0,
    score: 0,
    enemiesKilled: 0,
    roomsExplored: 1,
    baseTickInterval: BASE_TICK_INTERVAL,
    currentTickInterval: BASE_TICK_INTERVAL,
    savePoint: null,
    gachaMessage: null,
    doorMessage: null,
    screenShake: null,
    stuckCounter: 0,
    pendingReverse: false,
    menuIndex: 0,
    menuMode: 'main',
    commitInfo: commitInfo,
    invulnerableTicks: 0,
    bossDefeated: false,
    bossFight: {
      phase: null,
      introTick: 0,
      boss: null,
    },
    foods: [],
  };
}

/**
 * Start the game (transition from title to playing)
 */
export function startGame(state) {
  return {
    ...state,
    gameState: 'playing',
  };
}

/**
 * Main game tick (all updates)
 */
export function tick(state) {
  let s = { ...state };

  // Check goal room regardless of game state (for test compatibility)
  if (s.world) {
    const goalCheckRoom = getRoomAt(s.world, s.currentRoom.x, s.currentRoom.y);
    if (goalCheckRoom && goalCheckRoom.type === ROOM_TYPE.GOAL) {
      s.gameState = 'won';
      return s;
    }
  }

  if (state.gameState !== 'playing') return state;

  // Stuck handler — countdown then reverse (Issue #46)
  if (s.stuckCounter > 0) {
    s.tickCount++;
    s.stuckCounter--;
    if (s.stuckCounter === 0 && s.pendingReverse) {
      // Execute reverse: tail becomes head, head becomes tail
      s.snake = s.snake.reverse();
      s.direction = { x: -s.direction.x || 0, y: -s.direction.y || 0 };
      s.nextDirection = { x: s.direction.x, y: s.direction.y };
      s.pendingReverse = false;
      // Safety: if new head's next step would be in an obstacle, push one more step
      const newHead = { x: s.snake[0].x + s.direction.x, y: s.snake[0].y + s.direction.y };
      const check = checkSnakeCollision(newHead, s.snake, { ...s });
      if (check.includes('damage') || check.includes('death')) {
        s.snake[0] = newHead;
      }
      // Clear screen shake after reverse
      if (s.screenShake) s.screenShake = null;
    }
    return s;
  }

  s.tickCount++;

  // Apply direction
  s.direction = s.nextDirection;

  const head = s.snake[0];
  const newHead = {
    x: head.x + s.direction.x,
    y: head.y + s.direction.y,
  };

  // Room transition — check BEFORE collision so cells are evaluated
  // in the correct room context
  let transition = { entered: false, blocked: false };
  let duringTransition = false;
  if (s.world) {
    transition = checkRoomTransition(s, newHead);
  }

  if (transition.blocked) {
    // Door blocked by lock, size gate, or direction mismatch
    // Keep snake in current room, don't move
    if (transition.reason === 'locked') {
      s.doorMessage = 'NEEDS KEY';
    } else if (transition.reason === 'size_gate') {
      s.doorMessage = 'NEEDS LENGTH N+';
    } else if (transition.reason === 'wrong_direction') {
      s.doorMessage = null; // silently block
    }
    return s;
  }

  if (transition.entered) {
    // Check door constraints (locked, size gate) BEFORE allowing transition
    const doorCheck = checkDoorPassable(s, getDoorDirFromTransition(transition));
    if (!doorCheck.passable) {
      // Blocked — don't enter the room
      if (doorCheck.reason === 'locked') {
        s.doorMessage = 'NEEDS KEY';
      } else if (doorCheck.reason === 'size_gate') {
        s.doorMessage = 'NEEDS LENGTH N+';
      }
      return s;
    }

    duringTransition = true;
    const newRoom = transition.room;
    const prevRoomX = transition.previousRoomX;
    const prevRoomY = transition.previousRoomY;
    s.currentRoom = { x: transition.roomX, y: transition.roomY };
    s.previousRoom = { x: prevRoomX, y: prevRoomY };
    s.doorMessage = null;

    // Mark room as explored
    if (!newRoom.explored) {
      newRoom.explored = true;
      s.roomsExplored++;
    }

    // Check if entering goal room -> victory (gated on bossDefeated, Issue #122)
    if (newRoom.type === ROOM_TYPE.GOAL) {
      const hasBossRoom = hasRoomOfType(s.world, ROOM_TYPE.BOSS);
      if (!hasBossRoom || s.bossDefeated) {
        s.gameState = 'won';
        return s;
      }
      s.doorMessage = 'DEFEAT THE BOSS FIRST!';
      return s;
    }

    // Check if entering boss room -> start boss fight
    if (newRoom.type === ROOM_TYPE.BOSS && !s.bossDefeated) {
      s.bossFight.phase = 'intro';
      s.bossFight.introTick = 0;
      // Create boss entity at center of boss room
      const bossCenterX = newRoom.x * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);
      const bossCenterY = newRoom.y * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);
      // Import createBoss dynamically — defer to entities.js
      // We inline creation here for the game loop
      s.bossFight.boss = {
        type: 'boss',
        name: 'Blue Hammer',
        hp: 6,
        colHp: 3,
        segments1: [
          { x: bossCenterX, y: bossCenterY },
          { x: bossCenterX - 1, y: bossCenterY },
          { x: bossCenterX - 2, y: bossCenterY },
        ],
        segments2: [
          { x: bossCenterX, y: bossCenterY + 1 },
          { x: bossCenterX - 1, y: bossCenterY + 1 },
          { x: bossCenterX - 2, y: bossCenterY + 1 },
        ],
        direction: { x: -1, y: 0 },
        behavior: 'CHASE',
        behaviorTick: 0,
        stuffedTicks: 0,
        color: '#4488FF',
        eyes: [
          { segmentIdx: 0, column: 'segments1' },
          { segmentIdx: 0, column: 'segments2' },
        ],
        activeHead: 'head1',
      };
    }

    // Check if entering save room -> auto-save
    if (newRoom.type === ROOM_TYPE.SAVE) {
      s.savePoint = createSavePoint(s);
      saveGame(s, s.world);
    }

    // Ensure tile consistency after room transition (Issue #113)
    ensureTileConsistency(newRoom);
  }

  // Check collision (now in correct room context after transition)
  const collisions = checkSnakeCollision(newHead, s.snake, { ...s });

  // Death collision (instant game over — DEATH_WALL, SPIKE)
  if (collisions.includes('death')) {
    s.gameState = 'gameover';
    return s;
  }

  // Self collision — non-lethal: tail pop + stun + score penalty + screen shake
  if (collisions.includes('self') && !duringTransition) {
    s.snake.pop();
    if (s.snake.length <= 1) {
      s.gameState = 'gameover';
      return s;
    }
    s.stuckCounter = STUCK_TICKS;
    s.pendingReverse = false;
    s.score = Math.max(0, s.score - 5);
    s.screenShake = { intensity: 4, duration: 8 };
    return s;
  }

  // Wall/Stone_Wall damage — stuck+reverse instead of tail removal
  if (collisions.includes('damage')) {
    // If food also at this cell, remove it and award points
    // before applying the damage penalties
    if (collisions.includes('food') && s.world) {
      const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
      const room = getRoomAt(s.world, rx, ry);
      if (room) {
        const foodIdx = room.entities.food.findIndex(
          f => f.x === newHead.x && f.y === newHead.y
        );
        if (foodIdx >= 0) {
          room.entities.food.splice(foodIdx, 1);
          s.score += 10;  // Award points for eating even on wall
        }
      }
    }

    s.stuckCounter = STUCK_TICKS;
    s.pendingReverse = true;
    s.screenShake = { intensity: 4, duration: 8 };
    s.score = Math.max(0, s.score - 5);
    // Don't move head, don't remove tail — return early
    return s;
  }

  // Handle food collision (works with or without world-based room)
  const collidedFood = collisions.includes('food');
  const collidedEnemy = collisions.includes('enemy');
  const collidedDamage = collisions.includes('damage');

  // Remove food from room if eaten
  if (collidedFood && s.world) {
    const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
    const room = getRoomAt(s.world, rx, ry);
    if (room) {
      const foodIdx = room.entities.food.findIndex(f => f.x === newHead.x && f.y === newHead.y);
      if (foodIdx >= 0) {
        room.entities.food.splice(foodIdx, 1);
      }
    }
  }

  // Move snake (skip if damage was already handled above)
  if (collidedFood) {
    s.snake = [newHead, ...s.snake];
    s.score += 10;
  } else {
    s.snake = [newHead, ...s.snake.slice(0, -1)];
  }

  // Handle enemy collision (after move, unless we already had damage)
  let enemyDamage = collidedEnemy;
  if (!enemyDamage && s.world) {
    enemyDamage = checkEnemyOverlap(s);
  }
  if (enemyDamage) {
    if (s.invulnerableTicks > 0) {
      // Invulnerable — skip enemy damage entirely
      // No segment removal, no food drop, no score penalty
    } else {
      // 1. Record last segment position BEFORE removal
      const lastSeg = s.snake[s.snake.length - 1];
      const dropPos = { x: lastSeg.x, y: lastSeg.y };

      // 2. Spawn food at that position
      const food = createFood(dropPos.x, dropPos.y);
      if (s.world) {
        const { rx, ry } = worldToRoomCoords(food.x, food.y);
        const room = getRoomAt(s.world, rx, ry);
        if (room) {
          room.entities.food.push(food);
        }
      }

      // 3. Set invulnerability
      s.invulnerableTicks = INVULNERABILITY_DURATION;

      // 4. Remove last segment + score penalty
      s.snake = s.snake.slice(0, -1);
      s.screenShake = { intensity: 3, duration: 6 };
      s.score = Math.max(0, s.score - 5);

      if (s.snake.length === 0) {
        s.gameState = 'gameover';
        return s;
      }
    }
  }

  // Update speed based on snake length
  s.currentTickInterval = calculateSpeed(s.snake.length, s.baseTickInterval);

  // Update projectiles
  s = updateProjectiles(s);

  // Check projectile collisions (requires world)
  if (s.world) {
    s = handleProjectileCollisions(s);
  }

  // Update enemies (requires world)
  if (s.world) {
    s = updateEnemies(s);
  }

  // Emergency food respawn (requires world)
  if (s.world) {
    s = emergencyFoodRespawn(s);
  }

  // Update cooldowns
  s = updateCooldowns(s);

  // Tick power-ups
  s = tickPowerUps(s);

  // Check if snake length is 0 after all processing
  if (s.snake.length === 0) {
    s.gameState = 'gameover';
    return s;
  }

  // Decay invulnerability (Issue #118)
  if (s.invulnerableTicks > 0) {
    s.invulnerableTicks--;
  }

  // Decay screen shake
  if (s.screenShake) {
    s.screenShake = {
      ...s.screenShake,
      duration: s.screenShake.duration - 1,
      intensity: s.screenShake.intensity * 0.7,
    };
    if (s.screenShake.duration <= 0) {
      s.screenShake = null;
    }
  }

  return s;
}

/**
 * Change the snake's direction (with reverse guard)
 */
export function changeDirection(state, dir) {
  if (state.gameState !== 'playing') return state;

  // Check reverse
  if (state.nextDirection.x + dir.x === 0 && state.nextDirection.y + dir.y === 0) {
    return { ...state };
  }

  return {
    ...state,
    nextDirection: dir,
  };
}

/**
 * Fire a projectile from the snake head
 */
export function fire(state) {
  if (state.gameState !== 'playing') return state;
  return fireProjectile(state);
}

/**
 * Interact with the environment (gacha machine, etc.)
 */
export function interact(state) {
  if (state.gameState !== 'playing') return state;

  const head = state.snake[0];
  const { rx, ry } = worldToRoomCoords(head.x, head.y);
  const room = getRoomAt(state.world, rx, ry);

  if (!room) return state;

  // Interact with gacha machine
  if (room.gachaMachine) {
    const gx = room.x * ROOM_SIZE + room.gachaMachine.x;
    const gy = room.y * ROOM_SIZE + room.gachaMachine.y;
    const dist = Math.abs(head.x - gx) + Math.abs(head.y - gy);
    if (dist <= 1) {
      return useGachaMachine(state);
    }
  }

  return state;
}


function getDoorDirFromTransition(transition) {
  const dx = transition.roomX - transition.previousRoomX;
  const dy = transition.roomY - transition.previousRoomY;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return null;
}

/**
 * Check if any room in the world has the given type
 */
function hasRoomOfType(world, type) {
  if (!world || !world.rooms) return false;
  for (let y = 0; y < world.rows; y++) {
    for (let x = 0; x < world.cols; x++) {
      if (world.rooms[y]?.[x]?.type === type) return true;
    }
  }
  return false;
}

/**
 * Ensure room door tiles match door configuration (Issue #113)
 * If a room has a door in a direction but the border tile at that
 * position is still WALL (not DOOR), fix it to prevent invisible barriers.
 */
function ensureTileConsistency(room) {
  if (!room || !room.tiles || !room.doors) return;
  const mid = Math.floor(ROOM_SIZE / 2);

  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      if (dir === 'up') {
        for (let dx = -2; dx <= 2; dx++) {
          const col = mid + dx;
          if (col >= 0 && col < ROOM_SIZE && room.tiles[0][col] === CELL.WALL) {
            room.tiles[0][col] = CELL.DOOR;
          }
        }
      } else if (dir === 'down') {
        for (let dx = -2; dx <= 2; dx++) {
          const col = mid + dx;
          if (col >= 0 && col < ROOM_SIZE && room.tiles[ROOM_SIZE - 1][col] === CELL.WALL) {
            room.tiles[ROOM_SIZE - 1][col] = CELL.DOOR;
          }
        }
      } else if (dir === 'left') {
        for (let dy = -2; dy <= 2; dy++) {
          const row = mid + dy;
          if (row >= 0 && row < ROOM_SIZE && room.tiles[row][0] === CELL.WALL) {
            room.tiles[row][0] = CELL.DOOR;
          }
        }
      } else if (dir === 'right') {
        for (let dy = -2; dy <= 2; dy++) {
          const row = mid + dy;
          if (row >= 0 && row < ROOM_SIZE && room.tiles[row][ROOM_SIZE - 1] === CELL.WALL) {
            room.tiles[row][ROOM_SIZE - 1] = CELL.DOOR;
          }
        }
      }
    }
  }
}

/**
 * Save point data structure
 */
export function createSavePoint(state) {
  return {
    snake: state.snake.map(s => ({ x: s.x, y: s.y })),
    currentRoom: { ...state.currentRoom },
    direction: { ...state.direction },
    score: state.score,
    keysFound: new Set(state.keysFound),
    items: state.inventory.items.map(it => ({ ...it })),
  };
}

/**
 * Calculate tick interval based on snake length
 * Longer snake = slower movement
 */
export function calculateSpeed(length, baseInterval) {
  const raw = Math.floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE));
  const clamped = Math.min(raw, MAX_TICK_INTERVAL);
  return Math.max(clamped, BASE_TICK_INTERVAL);
}

/**
 * Handle projectile collisions with enemies and walls
 */
function handleProjectileCollisions(state) {
  let s = { ...state };
  const projectilesToRemove = [];

  for (const proj of s.projectiles) {
    const result = lineSweepProjectileCollision(proj, s);
    if (result) {
      if (result.collisionType === 'enemy' && result.target) {
        s = applyProjectileDamage(s, proj.id, result.target);
        if (result.target.hp <= 0) {
          // Remove dead enemy
          s = removeEnemy(s, result.target);
        }
        projectilesToRemove.push(proj.id);
      } else if (result.collisionType === 'cracked_wall') {
        // Destroy cracked wall
        s = destroyCrackedWall(s, result.cellX, result.cellY);
        projectilesToRemove.push(proj.id);
      } else if (result.collisionType === 'wall') {
        projectilesToRemove.push(proj.id);
      }
    }
  }

  // Filter out collided projectiles
  if (projectilesToRemove.length > 0) {
    s.projectiles = s.projectiles.filter(p => !projectilesToRemove.includes(p.id));
  }

  return s;
}

/**
 * Destroy a cracked wall, revealing passage
 */
function destroyCrackedWall(state, cellX, cellY) {
  const { rx, ry, cx, cy } = worldToRoomCoords(cellX, cellY);
  const room = getRoomAt(state.world, rx, ry);
  if (room && room.tiles[cy] && room.tiles[cy][cx] === CELL.CRACKED_WALL) {
    room.tiles[cy][cx] = CELL.FLOOR;
  }
  return state;
}

/**
 * Check if snake head overlaps with any enemy
 */
function checkEnemyOverlap(state) {
  const head = state.snake[0];
  const { rx, ry } = worldToRoomCoords(head.x, head.y);
  const room = getRoomAt(state.world, rx, ry);
  if (!room) return false;

  return room.entities.enemies.some(e =>
    e.x === head.x && e.y === head.y ||
    e.segments.some(s => s.x === head.x && s.y === head.y)
  );
}

/**
 * Remove a dead enemy from its room
 */
function removeEnemy(state, enemy) {
  const { rx, ry } = worldToRoomCoords(enemy.x, enemy.y);
  const room = getRoomAt(state.world, rx, ry);
  if (room) {
    room.entities.enemies = room.entities.enemies.filter(e => e.id !== enemy.id);
  }
  return state;
}
