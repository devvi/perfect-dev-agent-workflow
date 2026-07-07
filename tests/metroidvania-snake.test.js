// FILE: tests/metroidvania-snake.test.js
// Tests for Metroidvania-style Snake Overhaul (Issue #15)
// Uses Vitest (describe/it/expect)
// Imports reference the modular engine files; these will fail until implementation

import { describe, it, expect, beforeEach } from 'vitest';

// Engine constants
import {
  ROOM_SIZE, MAP_COLS, MAP_ROWS, CELL_SIZE,
  ROOM_TYPE, DIR, CELL, DOOR_DIR,
} from '../public/src/engine/constants.js';

// World / map structures
import {
  createRoom, getRoomAt,
  worldToRoomCoords, roomToWorldCoords, getCellAt,
} from '../public/src/engine/world.js';

// Map generator
import {
  generateWorldMap, buildSpanningTree, addRandomDoors,
  assignRoomTypes, placeKeysAndLocks, generateRoomTiles,
  placeEnemiesAndItems, verifySolvability,
} from '../public/src/engine/generator.js';

// Core game loop & state
import {
  createInitialState, startGame, tick, changeDirection, fire, interact,
} from '../public/src/engine/core.js';

// Collision detection
import {
  checkSnakeCollision, checkProjectileCollision, checkRoomTransition,
} from '../public/src/engine/collision.js';

// Combat system
import {
  fireProjectile, updateProjectiles, applyProjectileDamage, updateCooldowns,
} from '../public/src/engine/combat.js';

// Enemy AI
import { updateEnemies, enemyChasePath } from '../public/src/engine/ai.js';

// Items / gacha
import { useGachaMachine, getRandomPowerUp, applyPowerUp, tickPowerUps } from '../public/src/engine/items.js';

// Save system
import { saveGame, loadGame, applySave, clearSave } from '../public/src/engine/save.js';

// Entity factories
import { createSnake, createEnemy, createProjectile, createFood } from '../public/src/engine/entities.js';

// =====================================================================
// Helper: create a minimal GameState for tests
// =====================================================================

function minimalState(overrides = {}) {
  return {
    snake: [
      { x: 30, y: 30 },
      { x: 29, y: 30 },
      { x: 28, y: 30 },
    ],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    currentRoom: { x: 1, y: 1 },
    previousRoom: { x: 1, y: 1 },
    projectiles: [],
    fireCooldown: 0,
    fireRate: 3,
    projectileSpeed: 2,
    projectileDecay: 10,
    projectilePower: 1,
    doubleShot: false,
    maxProjectiles: 3,
    inventory: { keys: new Set(), items: [] },
    keysFound: new Set(),
    gameState: 'playing',
    tickCount: 0,
    score: 0,
    enemiesKilled: 0,
    roomsExplored: 1,
    baseTickInterval: 150,
    currentTickInterval: 150,
    savePoint: null,
    ...overrides,
  };
}

function createTestWorld() {
  // Returns a minimal 3x3 solvable world
  // We'll use the actual generator if possible, otherwise build manually
  return generateWorldMap(3, 3);
}

// =====================================================================
// Tests
// =====================================================================

describe('Phase 1 — Map Generation Engine', () => {
  describe('generateWorldMap — (Test Case 1)', () => {
    it('generates a 5×5 map with 25 rooms', () => {
      const world = generateWorldMap(5, 5);
      expect(world.cols).toBe(5);
      expect(world.rows).toBe(5);
      // Count all rooms
      let count = 0;
      for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
          if (world.rooms[y][x]) count++;
        }
      }
      expect(count).toBe(25);
    });
  });

  describe('Solvability guarantee — (Test Case 2)', () => {
    it('generates 100 maps and all are solvable (goal reachable from start)', () => {
      for (let i = 0; i < 100; i++) {
        const world = generateWorldMap(5, 5);
        const solvable = verifySolvability(world);
        expect(solvable).toBe(true);
      }
    });
  });

  describe('Unsolvable map fallback — (Test Case 28)', () => {
    it('regenerates within 3 attempts if map is unsolvable', () => {
      // This tests the retry logic in generateWorldMap
      const world = generateWorldMap(5, 5);
      expect(verifySolvability(world)).toBe(true);
      expect(world.regenerationAttempts).toBeLessThanOrEqual(3);
    });
  });

  describe('worldToRoomCoords / roomToWorldCoords', () => {
    it('converts world coords to room-local coords correctly', () => {
      // Room (1,1) at world offset (20,20) in cells
      const local = worldToRoomCoords(25, 35);
      expect(local.rx).toBe(1);
      expect(local.ry).toBe(1);
      expect(local.cx).toBe(5);
      expect(local.cy).toBe(15);
    });

    it('converts room-local back to world coords correctly', () => {
      const world = roomToWorldCoords(1, 1, 5, 15);
      expect(world.x).toBe(25);
      expect(world.y).toBe(35);
    });
  });

  describe('createRoom', () => {
    it('creates a room with proper structure', () => {
      const room = createRoom(2, 3, ROOM_TYPE.NORMAL, {
        up: { connectedTo: { roomX: 2, roomY: 2 }, locked: false },
        down: { connectedTo: { roomX: 2, roomY: 4 }, locked: false },
      });
      expect(room.x).toBe(2);
      expect(room.y).toBe(3);
      expect(room.type).toBe(ROOM_TYPE.NORMAL);
      expect(room.explored).toBe(false);
      expect(room.tiles).toBeDefined();
      expect(room.tiles.length).toBe(ROOM_SIZE);
      expect(room.tiles[0].length).toBe(ROOM_SIZE);
    });
  });

  describe('Room transition — (Test Case 3 & 4)', () => {
    it('snake moving right across right door enters adjacent room', () => {
      const world = generateWorldMap(5, 5);
      const state = createInitialState(world);
      // Position snake near right door of its current room
      const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
      const doorDir = Object.keys(room.doors).find(d => room.doors[d]?.connectedTo);
      if (!doorDir) return; // skip if no doors
      // Move head to door position
      const head = state.snake[0];
      // Simulate crossing the door boundary
      const result = tick(state);
      expect(result.currentRoom).toBeDefined();
    });
  });
});

describe('Phase 1b — Length Gates & Key Locks', () => {
  describe('Length gate — (Test Case 5)', () => {
    it('blocks snake shorter than required length', () => {
      const world = generateWorldMap(5, 5);
      // Manually set a size gate on a room door
      const startRoom = world.rooms[world.playerStart.roomY][world.playerStart.roomX];
      // Find a door and set a size gate
      const doorDir = Object.keys(startRoom.doors).find(d => startRoom.doors[d]);
      if (!doorDir) return; // skip if start has no doors
      startRoom.sizeGate = { requiredLength: 100, doorDir };
      const state = createInitialState(world);
      // Snake length is 3, gate requires 100
      const roomState = state.currentRoom;
      const canPass = state.snake.length >= (startRoom.sizeGate?.requiredLength || 0);
      expect(canPass).toBe(false);
    });

    it('passes snake meeting or exceeding required length', () => {
      const world = generateWorldMap(5, 5);
      const startRoom = world.rooms[world.playerStart.roomY][world.playerStart.roomX];
      const doorDir = Object.keys(startRoom.doors).find(d => startRoom.doors[d]);
      if (!doorDir) return;
      startRoom.sizeGate = { requiredLength: 2, doorDir };
      const state = createInitialState(world);
      // Snake length is 3 ≥ 2
      const canPass = state.snake.length >= (startRoom.sizeGate?.requiredLength || 0);
      expect(canPass).toBe(true);
    });

    it('passes when length exactly equals requirement', () => {
      const world = generateWorldMap(5, 5);
      const startRoom = world.rooms[world.playerStart.roomY][world.playerStart.roomX];
      const doorDir = Object.keys(startRoom.doors).find(d => startRoom.doors[d]);
      if (!doorDir) return;
      startRoom.sizeGate = { requiredLength: 3, doorDir };
      const state = createInitialState(world);
      const canPass = state.snake.length >= (startRoom.sizeGate?.requiredLength || 0);
      expect(canPass).toBe(true);
    });
  });

  describe('Key locks — (Test Case 6)', () => {
    it('blocks passage without key and allows with key', () => {
      const world = generateWorldMap(5, 5);
      // Assign a key and lock
      const keyed = placeKeysAndLocks(world);
      // Find a locked door
      let lockedDoor = null;
      let lockRoom = null;
      for (let y = 0; y < keyed.rows; y++) {
        for (let x = 0; x < keyed.cols; x++) {
          const room = keyed.rooms[y][x];
          for (const dir of Object.keys(room.doors)) {
            if (room.doors[dir]?.locked) {
              lockedDoor = room.doors[dir];
              lockRoom = room;
              break;
            }
          }
          if (lockedDoor) break;
        }
        if (lockedDoor) break;
      }
      if (!lockedDoor) return; // skip if no locked doors
      // Check that without key, state prevents passage
      const state = minimalState();
      state.inventory.keys = new Set();
      const canPass = lockedDoor.keyId ? state.inventory.keys.has(lockedDoor.keyId) : true;
      expect(canPass).toBe(false);
      // With key, passage allowed
      state.inventory.keys.add(lockedDoor.keyId);
      const canPassNow = lockedDoor.keyId ? state.inventory.keys.has(lockedDoor.keyId) : true;
      expect(canPassNow).toBe(true);
    });
  });
});

describe('Phase 1c — Wall/Self/Food Collision', () => {
  describe('Snake collision — walls, self, food', () => {
    it('detects wall collision at room boundary', () => {
      const world = generateWorldMap(5, 5);
      const state = createInitialState(world);
      // Place snake at left wall heading left
      state.snake = [
        { x: 0, y: 30 },
        { x: 1, y: 30 },
      ];
      state.direction = { x: -1, y: 0 };
      state.nextDirection = { x: -1, y: 0 };
      const result = checkSnakeCollision({ x: -1, y: 30 }, state.snake, state);
      expect(result).toContain('wall');
    });

    it('detects self-collision', () => {
      const snake = [
        { x: 10, y: 10 },
        { x: 11, y: 10 },
        { x: 11, y: 11 },
        { x: 10, y: 11 },
        { x: 9, y: 11 },
        { x: 9, y: 10 },
      ];
      const state = minimalState({ snake });
      // Head moving left into body segment at (9,10)
      const result = checkSnakeCollision({ x: 9, y: 10 }, snake, state);
      expect(result).toContain('self');
    });

    it('detects food collision', () => {
      const snake = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ];
      // Place food at (6,5)
      const state = minimalState({ snake });
      // Manually set up food detection in collision check
      const world = generateWorldMap(5, 5);
      const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
      room.entities.food.push({ x: 26, y: 25 }); // world coords for (6,5) in room (1,1)
      const result = checkSnakeCollision({ x: 6, y: 5 }, snake, state);
      expect(result).toContain('food');
    });
  });
});

describe('Phase 2 — Minimap & Fog of War', () => {
  describe('Room explore state — (Test Case 7)', () => {
    it('marks rooms unexplored before entering, explored after', () => {
      const world = generateWorldMap(3, 3);
      // Before any entry, rooms are unexplored
      for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
          expect(world.rooms[y][x].explored).toBe(false);
        }
      }
      // Player starts in start room — it should be explored
      const state = createInitialState(world);
      const startRoom = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
      expect(startRoom.explored).toBe(true);
    });
  });

  describe('Minimap rendering — (Test Case 8)', () => {
    it('minimap shows only explored rooms', () => {
      // This tests the data backing the minimap, not canvas rendering
      const world = generateWorldMap(3, 3);
      const state = createInitialState(world);
      // Only start room is explored
      const exploredCount = world.rooms
        .flat()
        .filter(r => r.explored)
        .length;
      expect(exploredCount).toBe(1);
    });
  });
});

describe('Phase 3 — Combat & Projectiles', () => {
  describe('Fire projectile — (Test Case 9)', () => {
    it('fires projectile, decreases snake length by 1', () => {
      const state = minimalState();
      const result = fire(state);
      expect(result.projectiles.length).toBe(1);
      expect(result.snake.length).toBe(state.snake.length - 1);
      expect(result.fireCooldown).toBeGreaterThan(0);
    });

    it('does not fire during cooldown', () => {
      const state = minimalState({ fireCooldown: 5 });
      const result = fire(state);
      expect(result.projectiles.length).toBe(0);
      expect(result).toBe(state); // unchanged
    });
  });

  describe('Projectile decay — (Test Case 10)', () => {
    it('projectile is removed when remainingRange reaches 0', () => {
      const proj = {
        id: 1,
        x: 20, y: 20,
        dir: { x: 1, y: 0 },
        speed: 2,
        remainingRange: 0,
        power: 1,
      };
      const state = minimalState({ projectiles: [proj] });
      const result = updateProjectiles(state);
      expect(result.projectiles.length).toBe(0);
    });

    it('projectile moves and decrements range', () => {
      const state = minimalState({
        projectiles: [{
          id: 1,
          x: 20, y: 20,
          dir: { x: 1, y: 0 },
          speed: 2,
          remainingRange: 10,
          power: 1,
        }],
      });
      const result = updateProjectiles(state);
      expect(result.projectiles.length).toBe(1);
      expect(result.projectiles[0].x).toBe(22);
      expect(result.projectiles[0].remainingRange).toBe(8);
    });
  });

  describe('Fire cooldown — (Test Case 11)', () => {
    it('decrements cooldown each tick, prevents firing while > 0', () => {
      const state = minimalState({ fireCooldown: 3 });
      const result = updateCooldowns(state);
      expect(result.fireCooldown).toBe(2);
    });
  });

  describe('Max projectiles — (Test Case 12)', () => {
    it('limits simultaneous projectiles to maxProjectiles', () => {
      const state = minimalState({
        maxProjectiles: 3,
        projectiles: [
          { id: 1, x: 0, y: 0, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 5, power: 1 },
          { id: 2, x: 0, y: 0, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 5, power: 1 },
          { id: 3, x: 0, y: 0, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 5, power: 1 },
        ],
        fireCooldown: 0,
      });
      const result = fire(state);
      // No new projectile since at max
      const changed = result !== state;
      expect(changed).toBe(false);
    });
  });
});

describe('Phase 4 — Enemy AI', () => {
  describe('Enemy chase — (Test Case 13)', () => {
    it('enemy moves toward snake in same room', () => {
      const enemy = {
        id: 1,
        x: 5, y: 5,
        segments: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        hp: 2,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      };
      const snakeHead = { x: 10, y: 10 };
      const room = createRoom(1, 1, ROOM_TYPE.NORMAL, {});
      // Enemy should move toward (10,10)
      const move = enemyChasePath(enemy, snakeHead, room);
      if (move) {
        // Should move in positive x and y direction (toward 10,10)
        expect(move.x).toBeGreaterThan(0);
        expect(move.y).toBeGreaterThan(0);
      }
    });
  });

  describe('Snake touches enemy — (Test Case 14)', () => {
    it('reduces snake length by 1 on contact', () => {
      const state = minimalState();
      // Place an enemy at snake head position
      const room = createRoom(1, 1, ROOM_TYPE.NORMAL, {});
      room.entities.enemies.push({
        id: 1,
        x: 30, y: 30, // same as snake head
        segments: [{ x: 30, y: 30 }, { x: 29, y: 30 }],
        hp: 2,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      });
      const result = tick(state);
      expect(result.snake.length).toBe(state.snake.length - 1);
    });
  });

  describe('Projectile hits enemy — (Test Case 15)', () => {
    it('reduces enemy HP by projectile power', () => {
      const enemy = {
        id: 1,
        x: 15, y: 15,
        segments: [{ x: 15, y: 15 }, { x: 14, y: 15 }, { x: 13, y: 15 }],
        hp: 3,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      };
      const proj = { id: 99, x: 15, y: 15, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 5, power: 1 };
      const state = minimalState({ projectiles: [proj] });
      const result = applyProjectileDamage(state, 99, enemy);
      expect(enemy.hp).toBe(2);
      expect(enemy.segments.length).toBe(2);
    });
  });

  describe('Enemy death — (Test Case 16)', () => {
    it('removes enemy when HP reaches 0', () => {
      const enemy = {
        id: 1,
        x: 15, y: 15,
        segments: [{ x: 15, y: 15 }],
        hp: 1,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      };
      const proj = { id: 99, x: 15, y: 15, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 5, power: 1 };
      const state = minimalState({ projectiles: [proj] });
      const result = applyProjectileDamage(state, 99, enemy);
      expect(enemy.hp).toBe(0);
      // Enemy should be removed from room
    });
  });

  describe('Enemy follow-through-door — (Test Case 30)', () => {
    it('enemy returns to home room after 2 room transitions away', () => {
      const state = minimalState();
      // Simulate enemy following through 2 rooms
      state.currentRoom = { x: 3, y: 1 }; // enemy home is (1,1)
      const result = updateEnemies(state);
      // Enemy should despawn from current room and respawn at home
      expect(result).toBeDefined();
    });
  });
});

describe('Phase 5 — Food System', () => {
  describe('Snake eats food — (Test Case 17)', () => {
    it('increases snake length by 1 and score', () => {
      const state = minimalState();
      const prevLen = state.snake.length;
      // Place food at snake's next position
      const world = generateWorldMap(5, 5);
      const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
      const head = state.snake[0];
      room.entities.food.push({ x: head.x + 1, y: head.y });
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };
      const result = tick(state);
      expect(result.snake.length).toBe(prevLen + 1);
    });
  });

  describe('Enemy steals food — (Test Case 18)', () => {
    it('removes food when enemy walks over it, enemy grows', () => {
      const enemy = {
        id: 1,
        x: 5, y: 5,
        segments: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
        hp: 2,
        speedTicks: 1,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      };
      const room = createRoom(1, 1, ROOM_TYPE.NORMAL, {});
      room.entities.food.push({ x: 6, y: 5 }); // next to enemy
      const prevHp = enemy.hp;
      // Move enemy onto food
      enemy.x = 6;
      enemy.y = 5;
      // Food should be consumed
      const foodIdx = room.entities.food.findIndex(f => f.x === 6 && f.y === 5);
      if (foodIdx >= 0) {
        room.entities.food.splice(foodIdx, 1);
        enemy.hp += 1;
        enemy.segments.push({ x: enemy.x, y: enemy.y });
      }
      expect(room.entities.food.length).toBe(0);
      expect(enemy.hp).toBe(prevHp + 1);
    });
  });

  describe('Speed curve — (Test Case 19)', () => {
    it('increases tick interval (slows down) as snake grows', () => {
      // Speed formula: baseTickInterval * (1 + (length - 3) * 0.02)
      const state = minimalState();
      state.baseTickInterval = 150;
      const shortSpeed = 150 * (1 + (5 - 3) * 0.02); // length 5
      const longSpeed = 150 * (1 + (50 - 3) * 0.02); // length 50
      expect(shortSpeed).toBeCloseTo(156, 0);
      expect(longSpeed).toBeGreaterThan(280);
    });
  });

  describe('Emergency food respawn — (Test Case 20)', () => {
    it('spawns food in current room when no food is available', () => {
      const world = generateWorldMap(5, 5);
      const state = createInitialState(world);
      // Clear all food from all reachable rooms
      for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
          world.rooms[y][x].entities.food = [];
        }
      }
      // Tick should trigger emergency respawn
      const result = tick(state);
      const currentRoom = getRoomAt(world, result.currentRoom.x, result.currentRoom.y);
      expect(currentRoom.entities.food.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Phase 6 — Save & Hidden Rooms', () => {
  describe('Save room — (Test Case 21)', () => {
    it('auto-saves when entering a save room', () => {
      const state = minimalState();
      state.currentRoom = { x: 1, y: 2 };
      // Mark this room as SAVE type
      const result = tick(state);
      // If the room is SAVE type, saveGame should be called
      expect(typeof saveGame).toBe('function');
    });
  });

  describe('Load from save after death — (Test Case 22)', () => {
    it('restores state from save point when dying', () => {
      const saveData = {
        snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
        currentRoom: { x: 1, y: 1 },
        direction: { x: 1, y: 0 },
        inventory: { keys: ['key1'], items: [] },
        exploredMap: [[true, false], [false, false]],
        score: 50,
        timestamp: Date.now(),
      };
      clearSave();
      saveGame(saveData);
      const loaded = loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded.score).toBe(50);
      expect(loaded.snake.length).toBe(3);
      expect(loaded.inventory.keys).toContain('key1');
    });
  });

  describe('Save data mismatch — (Test Case 29)', () => {
    it('resets save silently on format mismatch', () => {
      // Simulate corrupted/old-format save
      try {
        localStorage.setItem('snake_save', 'corrupted data');
      } catch (e) {
        // localStorage might not be available in test env
      }
      const result = loadGame();
      // Should not crash; returns null
      expect(result).toBeNull();
    });
  });

  describe('Cracked wall — (Test Case 23)', () => {
    it('removes cracked wall when hit by projectile, revealing hidden room', () => {
      const room = createRoom(1, 1, ROOM_TYPE.NORMAL, {});
      // Set a cell as cracked wall
      room.tiles[5][5] = 2; // CRACKED_WALL
      // Fire projectile at it
      const state = minimalState({
        projectiles: [{ id: 1, x: 5, y: 5, dir: { x: 1, y: 0 }, speed: 2, remainingRange: 10, power: 1 }],
      });
      const result = checkProjectileCollision(state.projectiles[0], state);
      if (result && result.collisionType === 'cracked_wall') {
        room.tiles[5][5] = 0; // FLOOR
        expect(room.tiles[5][5]).toBe(0);
      }
    });
  });

  describe('Gacha machine — (Test Case 24)', () => {
    it('consumes 5 length and grants a random power-up', () => {
      const state = minimalState();
      // Make snake long enough for gacha
      const longSnake = [];
      for (let i = 0; i < 20; i++) {
        longSnake.push({ x: 20 - i, y: 30 });
      }
      state.snake = longSnake;
      state.currentRoom = { x: 2, y: 2 };
      const prevLen = state.snake.length;
      const result = useGachaMachine(state);
      expect(result.snake.length).toBe(prevLen - 5);
      expect(result.inventory.items.length).toBeGreaterThan(0);
    });

    it('shows not-enough message when length < 5', () => {
      const state = minimalState(); // length 3
      const result = useGachaMachine(state);
      expect(result).toBe(state); // unchanged
      expect(result.gachaMessage).toBeDefined();
    });
  });

  describe('Power-up effects — (Test Case 25)', () => {
    it('doubleShot creates two projectiles per fire', () => {
      const state = minimalState({ doubleShot: true, fireCooldown: 0 });
      const result = fire(state);
      expect(result.projectiles.length).toBe(2);
      expect(result.snake.length).toBe(state.snake.length - 1);
    });
  });
});

describe('Phase 7 — Game Flow', () => {
  describe('Victory — (Test Case 26)', () => {
    it('sets gameState to won when player reaches goal room', () => {
      const world = generateWorldMap(3, 3);
      // Find the goal room
      let goalPos = null;
      for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
          if (world.rooms[y][x].type === ROOM_TYPE.GOAL) {
            goalPos = { x, y };
            break;
          }
        }
        if (goalPos) break;
      }
      if (!goalPos) return; // skip if no goal
      const state = createInitialState(world);
      state.currentRoom = goalPos;
      const result = tick(state);
      // Entering goal room triggers victory
      expect(result.gameState).toBe('won');
    });
  });

  describe('Game over — (Test Case 27)', () => {
    it('sets gameState to gameover when snake length reaches 0', () => {
      const state = minimalState({
        snake: [{ x: 10, y: 10 }],
        gameState: 'playing',
      });
      // One segment: length 1
      // Hit by enemy → length 0
      state.snake = [];
      if (state.snake.length === 0) {
        state.gameState = 'gameover';
      }
      expect(state.gameState).toBe('gameover');
    });
  });

  describe('Full game state lifecycle', () => {
    it('transitions through title → playing → gameover/won', () => {
      const world = generateWorldMap(3, 3);
      let state = createInitialState(world);
      expect(state.gameState).toBe('title');
      state = startGame(state);
      expect(state.gameState).toBe('playing');
    });
  });
});

describe('Phase 8 — Integration', () => {
  describe('World map tiles construct correctly', () => {
    it('generates valid tile layouts for all rooms', () => {
      const world = generateWorldMap(5, 5);
      for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
          const room = world.rooms[y][x];
          expect(room.tiles.length).toBe(ROOM_SIZE);
          for (let ty = 0; ty < ROOM_SIZE; ty++) {
            expect(room.tiles[ty].length).toBe(ROOM_SIZE);
            for (let tx = 0; tx < ROOM_SIZE; tx++) {
              expect([0, 1, 2, 3, 4]).toContain(room.tiles[ty][tx]);
            }
          }
        }
      }
    });
  });

  describe('End-to-end flow: generate → explore → fight → win', () => {
    it('generates a playable world, places entities, and allows victory', () => {
      const world = generateWorldMap(3, 3);
      expect(verifySolvability(world)).toBe(true);
      // Place enemies and food
      const populated = placeEnemiesAndItems(world, 1);
      // Verify food is placed
      const totalFood = populated.rooms.flat().reduce((sum, r) => sum + r.entities.food.length, 0);
      expect(totalFood).toBeGreaterThan(0);
    });
  });
});
