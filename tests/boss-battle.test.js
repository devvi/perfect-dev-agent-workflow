// tests/boss-battle.test.js
// Boss battle integration tests — Issue #127

import { describe, it, expect } from 'vitest';

import { ROOM_SIZE, ROOM_TYPE } from '../public/src/engine/constants.js';
import { generateWorldMap, assignRoomTypes } from '../public/src/engine/generator.js';
import { createBossEnemy, buildBossSegments } from '../public/src/engine/entities.js';

describe('Boss Room Generation', () => {
  it('assignRoomTypes creates a BOSS room (replaces former GOAL)', () => {
    const world = generateWorldMap(5, 5);
    assignRoomTypes(world);
    let bossRoom = null;
    for (let y = 0; y < world.rows; y++) {
      for (let x = 0; x < world.cols; x++) {
        if (world.rooms[y][x].type === ROOM_TYPE.BOSS) bossRoom = world.rooms[y][x];
      }
    }
    expect(bossRoom).not.toBeNull();
  });

  it('boss room has bossConfig', () => {
    const world = generateWorldMap(5, 5);
    assignRoomTypes(world);
    let bossRoom = null;
    for (let y = 0; y < world.rows; y++) {
      for (let x = 0; x < world.cols; x++) {
        if (world.rooms[y][x].type === ROOM_TYPE.BOSS) bossRoom = world.rooms[y][x];
      }
    }
    expect(bossRoom.bossConfig).toBeDefined();
    expect(bossRoom.bossConfig.bossType).toBe('blue_hammer');
    expect(bossRoom.bossConfig.pillars.length).toBe(4);
  });
});

describe('Boss Entity', () => {
  it('createBossEnemy returns a boss with correct HP', () => {
    const boss = createBossEnemy('blue_hammer', 5, 5);
    expect(boss).toBeDefined();
    expect(boss.boss).toBe(true);
    expect(boss.hp).toBe(6);
    expect(boss.phase).toBe(1);
  });

  it('buildBossSegments creates 6 segments in 2 rows', () => {
    const segments = buildBossSegments(10, 10);
    expect(segments.length).toBe(6);
    expect(segments[0].x).toBe(10);
    expect(segments[3].y).toBe(11);
  });
});
