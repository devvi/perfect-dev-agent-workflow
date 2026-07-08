// FILE: public/src/engine/core.js
// Main game loop, state management

import {
  ROOM_SIZE, ROOM_TYPE, BASE_TICK_INTERVAL, SPEED_SLOPE, CELL,
} from './constants.js';
import { generateWorldMap, findRoomOfType } from './generator.js';
import { getRoomAt } from './world.js';
import { createSnake } from './entities.js';
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

    // Check if entering goal room -> victory
    if (newRoom.type === ROOM_TYPE.GOAL) {
      s.gameState = 'won';
      return s;
    }

    // Check if entering save room -> auto-save
    if (newRoom.type === ROOM_TYPE.SAVE) {
      s.savePoint = createSavePoint(s);
      saveGame(s, s.world);
    }
  }

  // Check collision (now in correct room context after transition)
  const collisions = checkSnakeCollision(newHead, s.snake, { ...s });

  // Death collision (instant game over — DEATH_WALL, SPIKE)
  if (collisions.includes('death')) {
    s.gameState = 'gameover';
    return s;
  }

  // Self collision — with protection during room transition
  if (collisions.includes('self') && !duringTransition) {
    s.gameState = 'gameover';
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

  // Move snake (skip if damage — head stays in place)
  if (collidedDamage) {
    // Damage: remove tail, don't move head to avoid wall embedding
    s.snake = s.snake.slice(0, -1);
    s.screenShake = { intensity: 3, duration: 6 };
    s.score = Math.max(0, s.score - 5);

    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
    }
  } else if (collidedFood) {
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
    s.snake = s.snake.slice(0, -1); // lose one segment
    s.screenShake = { intensity: 3, duration: 6 };
    s.score = Math.max(0, s.score - 5);

    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
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
  return Math.floor(baseInterval * (1 + (length - 3) * SPEED_SLOPE));
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
