// FILE: public/src/engine/save.js
// localStorage save/load system

import { SAVE_KEY } from './constants.js';

/**
 * Save the game state to localStorage
 */
export function saveGame(state, world) {
  try {
    let saveData;

    // If state already looks like serialized save data, save it directly
    if (state && state.snake && state.currentRoom && state.inventory && !state.world) {
      // state is already serialized save data
      saveData = { ...state };
      if (!saveData.version) saveData.version = 1;
      saveData.timestamp = Date.now();
    } else if (world && world.rows) {
      // Build compact save data from state + world
      const exploredMap = [];
      for (let ry = 0; ry < world.rows; ry++) {
        exploredMap[ry] = [];
        for (let rx = 0; rx < world.cols; rx++) {
          exploredMap[ry][rx] = world.rooms[ry][rx].explored;
        }
      }

      saveData = {
        version: 1,
        snake: state.snake.map(s => ({ x: s.x, y: s.y })),
        currentRoom: { ...state.currentRoom },
        direction: { ...state.direction },
        inventory: {
          keys: [...state.keysFound],
          items: state.inventory.items.map(it => ({ ...it })),
        },
        exploredMap,
        score: state.score,
        fireRate: state.fireRate,
        projectileSpeed: state.projectileSpeed,
        projectileDecay: state.projectileDecay,
        projectilePower: state.projectilePower,
        doubleShot: state.doubleShot,
        maxProjectiles: state.maxProjectiles,
        timestamp: Date.now(),
        worldState: serializeWorld(world),
      };
    } else {
      return false;
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    return true;
  } catch (e) {
    console.warn('Save failed:', e);
    return false;
  }
}

/**
 * Serialize world to a storable format
 */
function serializeWorld(world) {
  return {
    cols: world.cols,
    rows: world.rows,
    rooms: world.rooms.map(row =>
      row.map(room => ({
        x: room.x,
        y: room.y,
        type: room.type,
        explored: room.explored,
        tiles: room.tiles,
        doors: room.doors,
        sizeGate: room.sizeGate,
        entities: {
          enemies: room.entities.enemies.map(e => ({
            id: e.id, x: e.x, y: e.y, segments: e.segments.map(s => ({...s})),
            hp: e.hp, speedTicks: e.speedTicks, tickCounter: e.tickCounter,
            roomX: e.roomX, roomY: e.roomY, chaseRange: e.chaseRange,
            aiState: e.aiState, returnCount: e.returnCount,
          })),
          food: room.entities.food.map(f => ({ ...f })),
          items: room.entities.items.map(i => ({ ...i })),
        },
        gachaMachine: room.gachaMachine ? { ...room.gachaMachine } : null,
        savePoint: room.savePoint ? { ...room.savePoint } : null,
      }))
    ),
    playerStart: world.playerStart,
    keyAssignments: world.keyAssignments,
  };
}

/**
 * Load the saved game from localStorage
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);

    // Version check
    if (data.version !== 1) {
      clearSave();
      return null;
    }

    // Shape validation
    if (!data.snake || !data.currentRoom || !data.inventory) {
      clearSave();
      return null;
    }

    return data;
  } catch (e) {
    console.warn('Load failed:', e);
    clearSave();
    return null;
  }
}

/**
 * Rebuild GameState and WorldMap from save data
 */
export function applySave(saveData) {
  // Restore keys as Set
  const keysFound = new Set(saveData.inventory.keys || []);

  // Restore items
  const items = (saveData.inventory.items || []).map(it => ({ ...it }));

  // Rebuild world
  const world = deserializeWorld(saveData.worldState);

  // Mark explored rooms
  if (saveData.exploredMap) {
    for (let ry = 0; ry < world.rows; ry++) {
      for (let rx = 0; rx < world.cols; rx++) {
        if (saveData.exploredMap[ry] && saveData.exploredMap[ry][rx]) {
          world.rooms[ry][rx].explored = true;
        }
      }
    }
  }

  const state = {
    snake: saveData.snake.map(s => ({ ...s })),
    direction: { ...saveData.direction },
    nextDirection: { ...saveData.direction },
    currentRoom: { ...saveData.currentRoom },
    previousRoom: { ...saveData.currentRoom },
    projectiles: [],
    fireCooldown: 0,
    fireRate: saveData.fireRate || 3,
    projectileSpeed: saveData.projectileSpeed || 2,
    projectileDecay: saveData.projectileDecay || 10,
    projectilePower: saveData.projectilePower || 1,
    doubleShot: saveData.doubleShot || false,
    maxProjectiles: saveData.maxProjectiles || 3,
    world,
    inventory: { keys: keysFound, items },
    keysFound,
    gameState: 'playing',
    tickCount: 0,
    score: saveData.score || 0,
    enemiesKilled: 0,
    roomsExplored: countExplored(world),
    baseTickInterval: 150,
    currentTickInterval: 150,
    savePoint: {
      snake: saveData.snake.map(s => ({ ...s })),
      currentRoom: { ...saveData.currentRoom },
      direction: { ...saveData.direction },
      score: saveData.score || 0,
      keysFound: new Set(saveData.inventory.keys || []),
      items: items.map(it => ({ ...it })),
    },
    gachaMessage: null,
  };

  // Mark current room explored
  const room = world.rooms[saveData.currentRoom.y][saveData.currentRoom.x];
  if (room) room.explored = true;

  // Reset all combat rooms on load — fair retry, no stale combat state (Issue #224)
  for (let y = 0; y < world.rows; y++) {
    for (let x = 0; x < world.cols; x++) {
      const combatRoom = world.rooms[y][x];
      if (combatRoom.type === 'combat') {
        combatRoom.combatActive = false;
        combatRoom.combatActivated = false;
        combatRoom.combatEnemyCount = 0;
        combatRoom.entities.enemies = [];
      }
    }
  }

  return { state, world };
}

/**
 * Deserialize world from stored data
 */
function deserializeWorld(worldData) {
  const rooms = worldData.rooms.map(row =>
    row.map(roomData => ({
      ...roomData,
      entities: {
        enemies: roomData.entities.enemies || [],
        food: roomData.entities.food || [],
        items: roomData.entities.items || [],
      },
    }))
  );

  return {
    cols: worldData.cols,
    rows: worldData.rows,
    rooms,
    playerStart: worldData.playerStart,
    keyAssignments: worldData.keyAssignments,
  };
}

/**
 * Count explored rooms
 */
function countExplored(world) {
  let count = 0;
  for (let ry = 0; ry < world.rows; ry++) {
    for (let rx = 0; rx < world.cols; rx++) {
      if (world.rooms[ry][rx].explored) count++;
    }
  }
  return count;
}

/**
 * Clear the save data
 */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    // Silently fail
  }
}
