// tests/boss-battle.test.js
// Boss battle integration tests — Issue #127

import { describe, it, expect, beforeEach } from 'vitest';

// Import game engine modules
import { ROOM_SIZE, ROOM_TYPE } from '../public/src/engine/constants.js';
import { generateWorld, findRoomOfType } from '../public/src/engine/generator.js';
import { getRoomAt, getCellAt } from '../public/src/engine/world.js';
import { createInitialState, tick } from '../public/src/engine/core.js';

describe('Boss Battle', () => {
  let state;
  let world;

  beforeEach(() => {
    // Generate a full game world
    world = generateWorld();
    state = createInitialState(world);
  });

  it('should generate a boss room in every world', () => {
    const bossRoom = findRoomOfType(world, ROOM_TYPE.BOSS);
    expect(bossRoom).not.toBeNull();
    expect(bossRoom.x).toBeGreaterThanOrEqual(0);
    expect(bossRoom.y).toBeGreaterThanOrEqual(0);
  });

  it('should have a boss entity in the boss room', () => {
    const bossPos = findRoomOfType(world, ROOM_TYPE.BOSS);
    const bossRoom = world.rooms[bossPos.y][bossPos.x];
    expect(bossRoom.bossRoom).toBe(true);

    const boss = bossRoom.entities.enemies.find(e => e.boss);
    expect(boss).toBeDefined();
    expect(boss.hp).toBeGreaterThan(0);
    expect(boss.phase).toBeGreaterThanOrEqual(1);
  });

  it('should have boss room tiles generated (not default)', () => {
    const bossPos = findRoomOfType(world, ROOM_TYPE.BOSS);
    const bossRoom = world.rooms[bossPos.y][bossPos.x];
    expect(bossRoom.tiles.length).toBe(ROOM_SIZE);

    // Boss room should have walls on edges
    expect(bossRoom.tiles[0][0]).toBe(1); // WALL
    expect(bossRoom.tiles[ROOM_SIZE - 1][ROOM_SIZE - 1]).toBe(1); // WALL
  });

  it('should handle boss room entry without crashing', () => {
    // Simulate entering the boss room
    const bossPos = findRoomOfType(world, ROOM_TYPE.BOSS);
    state = { ...state, currentRoom: { x: bossPos.x, y: bossPos.y } };

    // Multiple ticks should not throw
    for (let i = 0; i < 10; i++) {
      expect(() => {
        state = tick(state);
      }).not.toThrow();
    }
  });

  it('should not crash when boss entity is processed in updateEnemies', () => {
    const bossPos = findRoomOfType(world, ROOM_TYPE.BOSS);
    state = { ...state, currentRoom: { x: bossPos.x, y: bossPos.y }, gameState: 'playing' };

    // Tick multiple times with playing state
    expect(() => {
      for (let i = 0; i < 100; i++) {
        state = tick(state);
      }
    }).not.toThrow();
  });

  it('should have boss door marked in boss room', () => {
    const bossPos = findRoomOfType(world, ROOM_TYPE.BOSS);
    const bossRoom = world.rooms[bossPos.y][bossPos.x];

    // The boss room entrance should have a door
    expect(bossRoom.doors).toBeDefined();
    expect(bossRoom.doors.length).toBeGreaterThanOrEqual(1);
  });
});
