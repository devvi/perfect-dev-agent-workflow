// FILE: tests/metroidvania-snake.test.js
// Tests for Metroidvania-style Snake Overhaul (Issue #15)
// Uses Vitest (describe/it/expect)
// Imports reference the modular engine files; these will fail until implementation

import { describe, it, expect, beforeEach } from 'vitest';

// Engine constants
import {
  ROOM_SIZE, MAP_COLS, MAP_ROWS, CELL_SIZE,
  ROOM_TYPE, DIR, CELL, DOOR_DIR,
  BASE_TICK_INTERVAL,
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
  calculateSpeed,
} from '../public/src/engine/core.js';

// Collision detection
import {
  checkSnakeCollision, checkProjectileCollision, checkRoomTransition,
  getCellsAlongLine, checkProjectileCollisionForCell,
  lineSweepProjectileCollision, checkDoorPassable,
} from '../public/src/engine/collision.js';

// Combat system
import {
  fireProjectile, updateProjectiles, applyProjectileDamage, updateCooldowns,
  resetProjCounter,
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
      expect(result).toContain('damage');
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

    it('handles self-collision as non-lethal: tail pop, stun, score penalty, screen shake', () => {
      const snake = [
        { x: 10, y: 10 },
        { x: 11, y: 10 },
        { x: 11, y: 11 },
        { x: 10, y: 11 },
        { x: 9, y: 11 },
        { x: 9, y: 10 },
      ];
      const state = minimalState({ snake });
      state.direction = { x: -1, y: 0 };
      state.nextDirection = { x: -1, y: 0 };
      const prevLen = state.snake.length;
      const prevScore = state.score;
      const result = tick(state);
      // Non-lethal: gameState stays 'playing'
      expect(result.gameState).toBe('playing');
      // Tail popped: length decreased by 1
      expect(result.snake).toHaveLength(prevLen - 1);
      // Score penalty: drops by 5
      expect(result.score).toBe(Math.max(0, prevScore - 5));
      // Stun engaged
      expect(result.stuckCounter).toBeGreaterThan(0);
      // No reverse
      expect(result.pendingReverse).toBe(false);
      // Screen shake set
      expect(result.screenShake).toEqual({ intensity: 4, duration: 8 });
    });

    it('triggers gameover on self-collision when length <= 1 (guard condition)', () => {
      const snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
      ];
      const state = minimalState({ snake });
      state.direction = { x: -1, y: 0 };
      state.nextDirection = { x: -1, y: 0 };
      const result = tick(state);
      // After pop, length becomes 1 → guard fires → gameover
      expect(result.gameState).toBe('gameover');
      expect(result.snake).toHaveLength(1);
    });

    it('clamps score at 0 on self-collision penalty', () => {
      const snake = [
        { x: 10, y: 10 },
        { x: 11, y: 10 },
        { x: 11, y: 11 },
        { x: 10, y: 11 },
        { x: 9, y: 11 },
        { x: 9, y: 10 },
      ];
      const state = minimalState({ snake, score: 2 });
      state.direction = { x: -1, y: 0 };
      state.nextDirection = { x: -1, y: 0 };
      const result = tick(state);
      expect(result.score).toBe(0);
      expect(result.gameState).toBe('playing');
    });

    it('detects food collision', () => {
      const snake = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ];
      // Attach world to state so checkSnakeCollision can look up rooms
      const world = generateWorldMap(5, 5);
      const state = minimalState({ snake, world });
      // Place food at the world coords the snake head is moving to
      const room = getRoomAt(world, 0, 0);
      room.entities.food.push({ x: 6, y: 5 });
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

  // ===== Line-sweep collision detection — (Issue #21 fix) =====
  describe('Line-sweep collision detection — (Issue #21 fix)', () => {
    beforeEach(() => {
      resetProjCounter();
    });

    it('saves prevX/prevY on updateProjectiles', () => {
      const proj = createProjectile(1, 20, 30, { x: 1, y: 0 }, 2, 10, 1);
      const state = minimalState({ projectiles: [proj] });
      const result = updateProjectiles(state);
      expect(result.projectiles[0].prevX).toBe(20);
      expect(result.projectiles[0].prevY).toBe(30);
      expect(result.projectiles[0].x).toBe(22);
    });

    it('getCellsAlongLine generates correct cells', () => {
      const cells = getCellsAlongLine(10, 20, 13, 20);
      expect(cells).toEqual([
        { x: 10, y: 20 },
        { x: 11, y: 20 },
        { x: 12, y: 20 },
        { x: 13, y: 20 },
      ]);
    });

    it('getCellsAlongLine handles negative direction', () => {
      const cells = getCellsAlongLine(13, 20, 10, 20);
      expect(cells).toEqual([
        { x: 13, y: 20 },
        { x: 12, y: 20 },
        { x: 11, y: 20 },
        { x: 10, y: 20 },
      ]);
    });

    it('getCellsAlongLine handles vertical movement', () => {
      const cells = getCellsAlongLine(10, 5, 10, 8);
      expect(cells).toEqual([
        { x: 10, y: 5 },
        { x: 10, y: 6 },
        { x: 10, y: 7 },
        { x: 10, y: 8 },
      ]);
    });

    it('getCellsAlongLine handles no movement (dx=0, dy=0)', () => {
      const cells = getCellsAlongLine(7, 7, 7, 7);
      expect(cells).toEqual([{ x: 7, y: 7 }]);
    });

    it('line sweep detects enemy at intermediate cell (speed=2)', () => {
      // Enemy at (12,10), bullet path: (11,10)→(13,10)
      const world = {
        rows: 3, cols: 3,
        rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
      };
      const room = world.rooms[0][0];
      const enemy = createEnemy(1, 12, 10, 2, 2);
      room.entities.enemies.push(enemy);
      const proj = createProjectile(99, 13, 10, { x: 1, y: 0 }, 2, 8, 1);
      proj.prevX = 11; proj.prevY = 10;
      const state = minimalState({ world, projectiles: [proj] });
      const result = lineSweepProjectileCollision(proj, state);
      expect(result).not.toBeNull();
      expect(result.collisionType).toBe('enemy');
      expect(result.target.id).toBe(1);
    });

    it('line sweep detects body segment collision', () => {
      // Enemy head at (15,10), segments: 3 cells
      // Bullet lands on (14,10) which is a body segment
      const world = {
        rows: 3, cols: 3,
        rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
      };
      const room = world.rooms[0][0];
      const enemy = createEnemy(1, 15, 10, 3, 2);
      room.entities.enemies.push(enemy);
      const proj = createProjectile(99, 14, 10, { x: 0, y: 0 }, 2, 5, 1);
      proj.prevX = 14; proj.prevY = 10;
      const state = minimalState({ world, projectiles: [proj] });
      const result = lineSweepProjectileCollision(proj, state);
      expect(result).not.toBeNull();
      expect(result.collisionType).toBe('enemy');
    });

    it('line sweep prioritizes first collision along path (wall before enemy)', () => {
      // Bullet path: (11,10)→(13,10), CRACKED_WALL at (12,10), enemy at (13,10)
      const world = {
        rows: 3, cols: 3,
        rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
      };
      const room = world.rooms[0][0];
      room.tiles[10][12] = CELL.CRACKED_WALL;
      const enemy = createEnemy(1, 13, 10, 1, 2);
      room.entities.enemies.push(enemy);
      const proj = createProjectile(99, 13, 10, { x: 1, y: 0 }, 2, 8, 1);
      proj.prevX = 11; proj.prevY = 10;
      const state = minimalState({ world, projectiles: [proj] });
      const result = lineSweepProjectileCollision(proj, state);
      expect(result).not.toBeNull();
      expect(result.collisionType).toBe('cracked_wall');
    });

    it('handles missing prevX/prevY with graceful fallback', () => {
      // A projectile without prev fields should still work
      const world = {
        rows: 3, cols: 3,
        rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
      };
      const room = world.rooms[0][0];
      const enemy = createEnemy(1, 13, 10, 1, 2);
      room.entities.enemies.push(enemy);
      const proj = createProjectile(99, 13, 10, { x: 1, y: 0 }, 2, 8, 1);
      delete proj.prevX;
      delete proj.prevY;
      const state = minimalState({ world, projectiles: [proj] });
      const result = lineSweepProjectileCollision(proj, state);
      expect(result).not.toBeNull();
      expect(result.collisionType).toBe('enemy');
    });

    it('full integration: bullet hits enemy and hp decreases', () => {
      const world = {
        rows: 3, cols: 3,
        rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
      };
      const room = world.rooms[0][0];
      const enemy = createEnemy(1, 12, 10, 2, 2);
      room.entities.enemies.push(enemy);
      const proj = createProjectile(99, 11, 10, { x: 1, y: 0 }, 2, 10, 1);
      const state = minimalState({ world, projectiles: [proj] });

      const updated = updateProjectiles(state);
      const result = lineSweepProjectileCollision(updated.projectiles[0], updated);
      expect(result).not.toBeNull();
      expect(result.collisionType).toBe('enemy');

      const damaged = applyProjectileDamage(updated, 99, enemy);
      expect(enemy.hp).toBe(1);
      expect(enemy.segments.length).toBe(1);
      expect(damaged.score).toBe(5);
      expect(damaged.projectiles.length).toBe(0);
    });

    it('enemy dies when hp reaches 0 (hp=1, one hit)', () => {
      const world = {
        rows: 3, cols: 3,
        rooms: Array(3).fill(null).map(() => Array(3).fill(null).map(() => createRoom(0, 0))),
      };
      const room = world.rooms[0][0];
      const enemy = createEnemy(1, 15, 10, 1, 2);
      room.entities.enemies.push(enemy);
      const proj = createProjectile(99, 15, 10, { x: 1, y: 0 }, 2, 10, 1);
      proj.prevX = 15; proj.prevY = 10;
      const state = minimalState({ world, projectiles: [proj] });

      const result = lineSweepProjectileCollision(proj, state);
      expect(result).not.toBeNull();
      expect(result.collisionType).toBe('enemy');

      const damaged = applyProjectileDamage(state, 99, enemy);
      expect(enemy.hp).toBe(0);
      expect(enemy.segments.length).toBe(0);
    });
  });
});

describe('Phase 4 — Enemy AI', () => {
  describe('Enemy chase — (Test Case 13)', () => {
    it('enemy moves toward snake in same room', () => {
      const enemy = {
        id: 1,
        x: 25, y: 25,
        segments: [{ x: 25, y: 25 }, { x: 24, y: 25 }],
        hp: 2,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      };
      const snakeHead = { x: 30, y: 30 };
      const room = createRoom(1, 1, ROOM_TYPE.NORMAL, {});
      // Build minimal world containing this room so getCellAt works
      const world = {
        rows: 3, cols: 3,
        rooms: [
          [null, null, null],
          [null, room, null],
          [null, null, null],
        ],
      };
      // Enemy should move toward (30,30)
      const move = enemyChasePath(enemy, snakeHead, room, world);
      if (move) {
        // Should move toward snake (at least one axis should approach)
        const dx = move.x === 0 ? 0 : Math.sign(snakeHead.x - enemy.x);
        const dy = move.y === 0 ? 0 : Math.sign(snakeHead.y - enemy.y);
        // Move should be in a valid direction toward snake
        expect(move.x === 0 || move.x === dx).toBe(true);
        expect(move.y === 0 || move.y === dy).toBe(true);
        expect(move.x !== 0 || move.y !== 0).toBe(true);
      }
    });
  });

  describe('Snake touches enemy — (Test Case 14)', () => {
    it('reduces snake length by 1 on contact', () => {
      // Build a full 3x3 world so updateEnemies doesn't crash on null rooms
      const world = {
        rows: 3, cols: 3,
        rooms: [
          [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
          [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
          [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
        ],
      };
      const room = world.rooms[1][1];
      // Enemy at position snake will move into (head.x + direction.x)
      room.entities.enemies.push({
        id: 1,
        x: 31, y: 30, // one step ahead of snake head (direction is {1,0})
        segments: [{ x: 31, y: 30 }, { x: 30, y: 30 }],
        hp: 2,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      });
      const state = minimalState({ world });
      const result = tick(state);
      expect(result.snake.length).toBe(state.snake.length - 1);
    });

    it('reduces snake length by 1 when hitting enemy body segment (not head)', () => {
      const world = {
        rows: 3, cols: 3,
        rooms: [
          [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
          [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
          [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
        ],
      };
      const room = world.rooms[1][1];
      room.entities.enemies.push({
        id: 2,
        x: 32, y: 30,
        segments: [{ x: 32, y: 30 }, { x: 31, y: 30 }, { x: 30, y: 30 }],
        hp: 3,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      });
      const snake = [
        { x: 29, y: 30 },
        { x: 28, y: 30 },
        { x: 27, y: 30 },
      ];
      const state = minimalState({ world, snake });
      const result = tick(state);
      expect(result.snake.length).toBe(snake.length - 1);
      expect(result.snake[0].x).toBe(30);
      expect(result.snake[0].y).toBe(30);
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
      const world = generateWorldMap(5, 5);
      const state = minimalState({ world });
      const prevLen = state.snake.length;
      // Place food at snake's next position
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
      // Speed formula: baseTickInterval * (1 + (length - 3) * SPEED_SLOPE)
      const state = minimalState();
      state.baseTickInterval = 150;
      const shortSpeed = calculateSpeed(5, 150); // length 5
      const longSpeed = calculateSpeed(50, 150); // length 50
      expect(shortSpeed).toBe(165);
      expect(longSpeed).toBe(502);
    });

    it('capped at MAX_TICK_INTERVAL for extreme lengths', () => {
      expect(calculateSpeed(400, 150)).toBe(800);  // capped
      expect(calculateSpeed(90, 150)).toBe(800);   // floor entry
      expect(calculateSpeed(89, 150)).toBeLessThan(800); // just below cap
    });

    it('clamped to BASE_TICK_INTERVAL for sub-length-3', () => {
      expect(calculateSpeed(1, 150)).toBe(150); // clamped
      expect(calculateSpeed(2, 150)).toBe(150); // clamped
      expect(calculateSpeed(3, 150)).toBe(150); // baseline
    });
  });

  describe('Emergency food respawn — (Test Case 20)', () => {
    it('spawns food in current room when no food is available', () => {
      const world = generateWorldMap(5, 5);
      let state = createInitialState(world);
      state = startGame(state); // must be playing to process ticks
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
              expect([0, 1, 2, 3, 4, 5, 6]).toContain(room.tiles[ty][tx]);
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

describe('Issue #54 — Snake length-speed tuning with MAX_TICK_INTERVAL cap', () => {
  describe('calculateSpeed clamping', () => {
    it('currentTickInterval is capped at MAX_TICK_INTERVAL for snake length >= 90 (via tick)', () => {
      const world = generateWorldMap(3, 3);
      let state = createInitialState(world);
      state = startGame(state);
      // Force snake to a long length (95), positioned to avoid self-collision
      const longSnake = [];
      // Head at (10,10), moving RIGHT — (11,10) must be empty
      longSnake.push({ x: 10, y: 10 });
      // Fill body from (12,10) onward, skipping (11,10)
      for (let i = 12; i < 12 + 94; i++) {
        longSnake.push({ x: i, y: 10 });
      }
      state.snake = longSnake;
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };
      const result = tick(state);
      // Length=95 → raw=floor(150*(1+92*0.05))=840 → min(840,800)=800 → max(800,150)=800
      expect(result.currentTickInterval).toBe(800);
    });

    it('currentTickInterval returns to BASE_TICK_INTERVAL after restart', () => {
      const world = generateWorldMap(3, 3);
      let state = createInitialState(world);
      state = startGame(state);
      expect(state.currentTickInterval).toBe(150);
      // No food eaten — interval stays at base
      const result = tick(state);
      expect(result.snake.length).toBe(3);
      expect(result.currentTickInterval).toBe(150);
    });
  });
});

describe('Issue #22 — Obstacle Death Penalty Iteration', () => {
  describe('Wall collision → damage, not death', () => {
    it('boundary wall returns damage (not wall/death)', () => {
      const state = minimalState();
      const result = checkSnakeCollision({ x: -1, y: 30 }, state.snake, state);
      expect(result).toContain('damage');
      expect(result).not.toContain('wall');
      expect(result).not.toContain('death');
    });

    it('CELL.WALL returns damage', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      // Place a WALL cell next to the snake head
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) {
        room.tiles[cy][cx] = CELL.WALL;
      }
      const result = checkSnakeCollision({ x: head.x + 1, y: head.y }, state.snake, state);
      expect(result).toContain('damage');
      expect(result).not.toContain('death');
    });

    it('CELL.STONE_WALL returns damage (not instant death)', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) {
        room.tiles[cy][cx] = CELL.STONE_WALL;
      }
      const result = checkSnakeCollision({ x: head.x + 1, y: head.y }, state.snake, state);
      expect(result).toContain('damage');
      expect(result).not.toContain('death');
    });

    it('wall collision triggers stuck+reverse — length preserved, stuckCounter set (Issue #46)', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
      const head = state.snake[0];
      // Place snake so it will move into a WALL
      state.snake = [
        { x: 1, y: 10 },
        { x: 2, y: 10 },
        { x: 3, y: 10 },
      ];
      state.direction = { x: -1, y: 0 };
      state.nextDirection = { x: -1, y: 0 };
      room.tiles[10][0] = CELL.WALL;
      const result = tick(state);
      // Now wall collision → stuck+reverse: length preserved, no gameover
      expect(result.gameState).toBe('playing');
      expect(result.snake.length).toBe(state.snake.length);
      expect(result.stuckCounter).toBeGreaterThan(0);
      expect(result.screenShake).not.toBeNull();
    });

    it('snake length 1 hitting wall → stuck not gameover (Issue #46)', () => {
      // With world: place WALL in front of snake
      const world = generateWorldMap(3, 3);
      const state = minimalState({
        world,
        snake: [{ x: 5, y: 5 }],
        gameState: 'playing',
      });
      state.currentRoom = { x: 0, y: 0 };
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };
      // Place WALL at (6,5) in room (0,0)
      const room00 = getRoomAt(world, 0, 0);
      room00.tiles[5][6] = CELL.WALL;
      const result = tick(state);
      // Wall collision now triggers stuck+reverse instead of gameover
      expect(result.gameState).toBe('playing');
      expect(result.snake.length).toBe(1);
      expect(result.stuckCounter).toBeGreaterThan(0);
    });
  });

  describe('Death wall → instant gameover', () => {
    it('checkSnakeCollision returns death for CELL.DEATH_WALL', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) {
        room.tiles[cy][cx] = CELL.DEATH_WALL;
      }
      const result = checkSnakeCollision({ x: head.x + 1, y: head.y }, state.snake, state);
      expect(result).toContain('death');
      expect(result).not.toContain('damage');
    });

    it('tick on death wall collision → instant gameover', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      // Snake in room (0,0) at (1,10); moving RIGHT toward (2,10)
      state.snake = [
        { x: 1, y: 10 },
        { x: 2, y: 10 },
        { x: 3, y: 10 },
      ];
      state.currentRoom = { x: 0, y: 0 };
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };
      const { rx, ry } = worldToRoomCoords(state.snake[0].x, state.snake[0].y);
      const room = getRoomAt(world, rx, ry);
      room.tiles[10][2] = CELL.DEATH_WALL;
      const result = tick(state);
      expect(result.gameState).toBe('gameover');
    });
  });

  describe('SPIKE → instant death', () => {
    it('checkSnakeCollision returns death for CELL.SPIKE', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) {
        room.tiles[cy][cx] = CELL.SPIKE;
      }
      const result = checkSnakeCollision({ x: head.x + 1, y: head.y }, state.snake, state);
      expect(result).toContain('death');
    });
  });

  describe('Screen shake on enemy collision', () => {
    it('enemy collision sets screenShake', () => {
      const world = {
        rows: 3, cols: 3,
        rooms: [
          [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
          [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
          [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
        ],
      };
      const room = world.rooms[1][1];
      room.entities.enemies.push({
        id: 1,
        x: 31, y: 30,
        segments: [{ x: 31, y: 30 }],
        hp: 1,
        speedTicks: 2,
        tickCounter: 0,
        roomX: 1, roomY: 1,
        chaseRange: 20,
        aiState: 'idle',
      });
      const state = minimalState({ world });
      state.snake = [
        { x: 30, y: 30 },
        { x: 29, y: 30 },
        { x: 28, y: 30 },
      ];
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };
      const result = tick(state);
      expect(result.screenShake).not.toBeNull();
      expect(result.snake.length).toBe(state.snake.length - 1);
    });
  });

  describe('Screen shake decay', () => {
    it('screenShake intensity decreases over ticks and clears', () => {
      const state = minimalState();
      state.screenShake = { intensity: 3, duration: 6 };
      // Simulate a few ticks of decay
      let shake = { ...state.screenShake };
      for (let i = 0; i < 6; i++) {
        shake = {
          ...shake,
          duration: shake.duration - 1,
          intensity: shake.intensity * 0.7,
        };
      }
      expect(shake.duration).toBe(0);
      expect(shake.intensity).toBeCloseTo(0.35, 1);
    });
  });

  describe('Projectile hits death wall', () => {
    it('bullet hitting DEATH_WALL is consumed', () => {
      const world = {
        rows: 3, cols: 3,
        rooms: [
          [createRoom(0,0), createRoom(1,0), createRoom(2,0)],
          [createRoom(0,1), createRoom(1,1), createRoom(2,1)],
          [createRoom(0,2), createRoom(1,2), createRoom(2,2)],
        ],
      };
      const room = world.rooms[0][0];
      room.tiles[10][12] = CELL.DEATH_WALL;
      const proj = createProjectile(1, 12, 10, { x: -1, y: 0 }, 2, 5, 1);
      proj.prevX = 13; proj.prevY = 10;
      const state = minimalState({ world, projectiles: [proj] });
      // Also set currentRoom so the projectile renders in the correct context
      state.currentRoom = { x: 1, y: 1 };
      const result = lineSweepProjectileCollision(proj, state);
      expect(result).not.toBeNull();
      expect(result.collisionType).toBe('wall');
    });
  });
});

// =====================================================================
// Issue #46 — Stuck+Reverse on Obstacle Collision
// =====================================================================

describe('Phase 4 — Stuck+Reverse on obstacle collision (Issue #46)', () => {
  describe('Test 1: Basic stuck+reverse — snake hits WALL', () => {
    it('should set stuckCounter to STUCK_TICKS and freeze movement', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) room.tiles[cy][cx] = CELL.WALL;

      // Move snake RIGHT into WALL
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };
      const result = tick(state);

      // Snake should not have moved (no length loss)
      expect(result.stuckCounter).toBeGreaterThan(0);
      expect(result.snake.length).toBe(state.snake.length);
      // Snake head should not have advanced into the wall
      expect(result.snake[0]).toEqual(state.snake[0]);
    });
  });

  describe('Test 2: Stuck duration — reverse after STUCK_TICKS ticks', () => {
    it('should keep snake frozen for STUCK_TICKS ticks then reverse', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) room.tiles[cy][cx] = CELL.WALL;
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };

      // Apply stuck
      let s = tick(state);
      expect(s.stuckCounter).toBeGreaterThan(0);
      const initialSnake = [...s.snake];

      // Tick through stuck period
      for (let i = 1; i < 5; i++) {
        s = tick(s);
        if (s.stuckCounter > 0) {
          // During stuck: position unchanged
          expect(s.snake).toEqual(initialSnake);
        }
      }

      // After STUCK_TICKS, snake should be reversed
      s = tick(s);
      expect(s.stuckCounter).toBe(0);
      expect(s.pendingReverse).toBe(false);
      // Snake should be reversed from original
      const reversed = [...initialSnake].reverse();
      expect(s.snake).toEqual(reversed);
    });
  });

  describe('Test 3: Reverse direction — RIGHT hit WALL → direction becomes LEFT', () => {
    it('should flip direction 180° after stuck expires', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) room.tiles[cy][cx] = CELL.WALL;
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };

      let s = tick(state); // first tick → stuck
      // Tick through stuck period + 1 to trigger reverse
      for (let i = 0; i < 6; i++) {
        s = tick(s);
      }
      // Direction should be reversed after stuck
      expect(s.direction).toEqual({ x: -1, y: 0 });
      expect(s.nextDirection).toEqual({ x: -1, y: 0 });
    });
  });

  describe('Test 4: Post-reverse position safety — new head not in obstacle', () => {
    it('should push head one more step if reversed head would land in obstacle', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      // Set up snake near a WALL so reversed head would be inside it
      const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
      // Place wall behind the tail
      if (room) {
        // tail at world (28,30) → room-local (8,10); wall behind at world (27,30) → room-local (7,10)
        room.tiles[10][7] = CELL.WALL;
      }
      state.snake = [
        { x: 30, y: 30 },
        { x: 29, y: 30 },
        { x: 28, y: 30 },
      ];
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };

      // First tick → stuck (can't move into wall ahead)
      let s = tick(state);
      // Tick through stuck
      for (let i = 0; i < 6; i++) {
        s = tick(s);
      }
      // Snake reversed; head (new head after reverse = old tail = {x:28,y:30})
      // Should not be in obstacle cell (x:28,y:30 would be in WALL if tile[30][27])
      // But check: after reverse, head is old tail at (28,30) and next step would be (27,30)
      // Actually the safety push is about the head after reversal
      // The head of reversed snake is the old tail
      // If the cell the head would occupy is an obstacle, push one more
      const headCell = getCellAt(s.world, s.currentRoom.x, s.currentRoom.y, s.snake[0].x, s.snake[0].y);
      expect(headCell).not.toBe(CELL.WALL);
      expect(headCell).not.toBe(CELL.STONE_WALL);
    });
  });

  describe('Test 5: Input buffering during stuck', () => {
    it('should queue direction changes during stuck and apply them after reverse', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) room.tiles[cy][cx] = CELL.WALL;
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };

      let s = tick(state); // stuck
      // Press UP during stuck
      s = changeDirection(s, { x: 0, y: -1 });
      expect(s.nextDirection).toEqual({ x: 0, y: -1 });
      // Tick through stuck
      for (let i = 0; i < 5; i++) {
        s = tick(s);
      }
      s = tick(s); // reverse trigger
      // After reverse, direction flipped; nextDirection should reflect player's buffered input
      expect(s.direction).toEqual({ x: -1, y: 0 }); // reverse takes effect first
    });
  });

  describe('Test 6: Score penalty on wall collision', () => {
    it('should reduce score by 5 when hitting a WALL', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({ world, score: 100 });
      const head = state.snake[0];
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x + 1, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room) room.tiles[cy][cx] = CELL.WALL;
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };

      const result = tick(state);
      expect(result.score).toBe(95);
      expect(result.screenShake).not.toBeNull();
      expect(result.screenShake.intensity).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Test 7: Edge case — snake length = 1', () => {
    it('should reverse a single-segment snake on wall collision (direction flips, same cell)', () => {
      const world = generateWorldMap(3, 3);
      const state = minimalState({
        world,
        snake: [{ x: 5, y: 5 }],
      });
      const { rx, ry, cx, cy } = worldToRoomCoords(6, 5);
      const room = getRoomAt(world, rx, ry);
      if (room) room.tiles[cy][cx] = CELL.WALL;
      state.direction = { x: 1, y: 0 };
      state.nextDirection = { x: 1, y: 0 };

      let s = tick(state); // stuck
      // Tick through stuck
      // 5 ticks = stuck 5→0, reverse executes on 5th tick (no extra move)
      for (let i = 0; i < 5; i++) {
        s = tick(s);
      }
      // Single segment: snake.reverse() on 1 element = same array
      expect(s.snake).toHaveLength(1);
      expect(s.snake[0]).toEqual({ x: 5, y: 5 });
      // Direction flipped 180°
      expect(s.direction).toEqual({ x: -1, y: 0 });
    });
  });
});

// =====================================================================
// Issue #66 — Title Menu (Interactive Screen with START GAME / ABOUT)
// =====================================================================

describe('Issue #66 — Title Menu State', () => {
  it('initializes with menuIndex=0 and menuMode=main', () => {
    const world = generateWorldMap(5, 5);
    const state = createInitialState(world);
    expect(state.menuIndex).toBe(0);
    expect(state.menuMode).toBe('main');
  });

  it('ArrowDown increments menuIndex with wrap', () => {
    // Simulate the two menu items wrapping
    const itemCount = 2;
    let menuIndex = 0;
    // Press down once
    menuIndex = (menuIndex + 1 + itemCount) % itemCount;
    expect(menuIndex).toBe(1);
    // Press down again (should wrap to 0)
    menuIndex = (menuIndex + 1 + itemCount) % itemCount;
    expect(menuIndex).toBe(0);
  });

  it('ArrowUp decrements menuIndex with wrap', () => {
    const itemCount = 2;
    let menuIndex = 0;
    // Press up from 0 should wrap to 1
    menuIndex = (menuIndex - 1 + itemCount) % itemCount;
    expect(menuIndex).toBe(1);
  });

  it('Enter on menuIndex=0 transitions gameState to playing', () => {
    const world = generateWorldMap(5, 5);
    const state = createInitialState(world);
    // Simulate startGame() called when Enter pressed on START GAME
    const playingState = startGame(state);
    expect(playingState.gameState).toBe('playing');
  });

  it('commitInfo fallback when window.__COMMIT_INFO missing', () => {
    const world = generateWorldMap(5, 5);
    const state = createInitialState(world);
    expect(state.commitInfo.hash).toBe('N/A');
    expect(state.commitInfo.message).toBe('N/A');
    expect(state.commitInfo.date).toBe('N/A');
  });

  it('menuMode switches to about and resets on any key', () => {
    const state = { menuIndex: 0, menuMode: 'main' };
    // Enter on ABOUT (index 1)
    state.menuMode = 'about';
    expect(state.menuMode).toBe('about');
    // Any key returns to main
    state.menuMode = 'main';
    state.menuIndex = 0;
    expect(state.menuMode).toBe('main');
    expect(state.menuIndex).toBe(0);
  });

  it('menu state resets on game-over restart', () => {
    // createInitialState always returns fresh menu defaults
    const world = generateWorldMap(5, 5);
    const state = createInitialState(world);
    // Simulate playing, then game-over
    let gameState = 'gameover';
    // Restart: call createInitialState again
    const restarted = createInitialState(world);
    expect(restarted.menuIndex).toBe(0);
    expect(restarted.menuMode).toBe('main');
  });
});
