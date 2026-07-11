// FILE: public/src/engine/generator.js
// Procedural map generation + connectivity + key/lock placement

import { ROOM_SIZE, MAP_COLS, MAP_ROWS, ROOM_TYPE, CELL, BOSS_ROOM_SIZE, BOSS_CELL_SIZE } from './constants.js';
import { createRoom, getRoomAt, oppositeDir, generateDefaultTiles } from './world.js';
import { createBossEnemy } from './entities.js';

/**
 * Generate a solvable world map
 */
export function generateWorldMap(cols = MAP_COLS, rows = MAP_ROWS, seed = null) {
  let attempts = 0;
  let world = null;

  while (attempts < 3) {
    attempts++;
    world = generateMapInternal(cols, rows, seed ? seed + attempts : null);
    if (verifySolvability(world)) {
      world.regenerationAttempts = attempts;
      return world;
    }
  }

  // Fallback: return a pre-built safe map
  world = buildSafeMap(cols, rows);
  world.regenerationAttempts = attempts;
  return world;
}

/**
 * Internal map generation
 */
function generateMapInternal(cols, rows, seed) {
  const rng = seed ? seededRandom(seed) : Math.random;

  // Create empty rooms array
  const rooms = [];
  for (let y = 0; y < rows; y++) {
    rooms[y] = [];
    for (let x = 0; x < cols; x++) {
      rooms[y][x] = null;
    }
  }

  // Phase 1: Build spanning tree for connectivity
  const tree = buildSpanningTree(cols, rows, rng);
  const allEdges = addRandomDoors(tree, cols, rows, rng);

  // Phase 2: Create rooms with doors
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const connections = {};
      for (const dir of ['up', 'down', 'left', 'right']) {
        const edgeKey = `${x},${y}:${dir}`;
        if (allEdges.has(edgeKey)) {
          const nx = x + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0);
          const ny = y + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
            connections[dir] = { connectedTo: { roomX: nx, roomY: ny }, locked: false, keyId: null };
          }
        }
      }
      rooms[y][x] = createRoom(x, y, ROOM_TYPE.NORMAL, connections);
    }
  }

  const world = { cols, rows, rooms, playerStart: { roomX: 0, roomY: 0 }, keyAssignments: [] };

  // Phase 3: Assign room types
  assignRoomTypes(world, rng);

  // Phase 4: Place keys and locks
  placeKeysAndLocks(world, rng);

  // Phase 5: Generate interior tiles for each room
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const room = rooms[y][x];
      if (room.type === ROOM_TYPE.BOSS) {
        room.tiles = generateBossRoomTiles(room);
      } else {
        room.tiles = generateRoomTiles(room, rng);
      }
    }
  }

  // Phase 6: Place enemies and food
  placeEnemiesAndItems(world, 1, rng);

  return world;
}

/**
 * Seeded random
 */
function seededRandom(seed) {
  let s = seed ? hashString(seed) : Date.now();
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Build a spanning tree using random BFS
 */
export function buildSpanningTree(cols, rows, rng = Math.random) {
  const visited = new Set();
  const tree = new Set(); // Edges in the tree: "x,y:dir"
  const frontier = [[0, 0]];
  visited.add('0,0');

  while (frontier.length > 0) {
    // Pick random from frontier
    const idx = Math.floor(rng() * frontier.length);
    const [cx, cy] = frontier.splice(idx, 1)[0];

    const neighbors = [];
    if (cx > 0) neighbors.push([cx - 1, cy, 'left', 'right']);
    if (cx < cols - 1) neighbors.push([cx + 1, cy, 'right', 'left']);
    if (cy > 0) neighbors.push([cx, cy - 1, 'up', 'down']);
    if (cy < rows - 1) neighbors.push([cx, cy + 1, 'down', 'up']);

    for (const [nx, ny, dir, invDir] of neighbors) {
      const key = `${nx},${ny}`;
      if (!visited.has(key)) {
        visited.add(key);
        tree.add(`${cx},${cy}:${dir}`);
        tree.add(`${nx},${ny}:${invDir}`);
        frontier.push([nx, ny]);
      }
    }
  }

  return tree;
}

/**
 * Add random extra doors to create loops (density 0-1)
 * 
 * IMPORTANT: Shuffles pairs, not individual keys, to prevent mismatched
 * one-way doors. Previously, individual keys were shuffled and re-paired
 * by index, which could pair key1 from one door with key2 from another,
 * resulting in a door on one side but a wall on the other — causing
 * instant death when the snake entered.
 */
export function addRandomDoors(tree, cols, rows, rng = Math.random, density = 0.3) {
  const edges = new Set(tree);
  const pairs = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1) {
        const key1 = `${x},${y}:right`;
        const key2 = `${x+1},${y}:left`;
        if (!edges.has(key1) && !edges.has(key2)) {
          pairs.push([key1, key2]);
        }
      }
      if (y < rows - 1) {
        const key1 = `${x},${y}:down`;
        const key2 = `${x},${y+1}:up`;
        if (!edges.has(key1) && !edges.has(key2)) {
          pairs.push([key1, key2]);
        }
      }
    }
  }

  // Shuffle pairs (not individual keys) — pairs stay intact
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }

  const count = Math.floor(pairs.length * density);
  for (let i = 0; i < count && i < pairs.length; i++) {
    edges.add(pairs[i][0]);
    edges.add(pairs[i][1]);
  }

  return edges;
}

/**
 * Assign room types (START, GOAL, SAVE, GACHA, KEY_SHRINE)
 */
export function assignRoomTypes(world, rng = Math.random) {
  const { cols, rows, rooms } = world;

  // Start at (0,0)
  rooms[0][0].type = ROOM_TYPE.START;
  world.playerStart = { roomX: 0, roomY: 0 };

  // Goal at a far corner (with preference for bottom-right-ish)
  const goalOptions = [];
  for (let y = 2; y < rows; y++) {
    for (let x = 2; x < cols; x++) {
      const dist = Math.abs(x - 0) + Math.abs(y - 0);
      if (dist >= 4) goalOptions.push({ x, y });
    }
  }
  const goal = goalOptions.length > 0
    ? goalOptions[Math.floor(rng() * goalOptions.length)]
    : { x: cols - 1, y: rows - 1 };
  rooms[goal.y][goal.x].type = ROOM_TYPE.BOSS;

  // Place save rooms (2-3)
  const saveCount = 2 + Math.floor(rng() * 2);
  let placed = 0;
  for (let attempts = 0; attempts < 50 && placed < saveCount; attempts++) {
    const rx = Math.floor(rng() * cols);
    const ry = Math.floor(rng() * rows);
    const room = rooms[ry][rx];
    if (room.type === ROOM_TYPE.NORMAL && !(rx === goal.x && ry === goal.y)) {
      room.type = ROOM_TYPE.SAVE;
      placed++;
    }
  }

  // Place key shrines (1-2)
  const keyCount = 1 + Math.floor(rng() * 2);
  placed = 0;
  for (let attempts = 0; attempts < 50 && placed < keyCount; attempts++) {
    const rx = Math.floor(rng() * cols);
    const ry = Math.floor(rng() * rows);
    const room = rooms[ry][rx];
    if (room.type === ROOM_TYPE.NORMAL) {
      room.type = ROOM_TYPE.KEY_SHRINE;
      placed++;
    }
  }

  // Place gacha rooms (1-2)
  const gachaCount = 1 + Math.floor(rng() * 2);
  placed = 0;
  for (let attempts = 0; attempts < 50 && placed < gachaCount; attempts++) {
    const rx = Math.floor(rng() * cols);
    const ry = Math.floor(rng() * rows);
    const room = rooms[ry][rx];
    if (room.type === ROOM_TYPE.NORMAL) {
      room.type = ROOM_TYPE.GACHA;
      room.gachaMachine = { x: Math.floor(ROOM_SIZE / 2), y: Math.floor(ROOM_SIZE / 2) };
      placed++;
    }
  }
}

/**
 * Place keys and locks ensuring solvability
 * Finds paths from start to goal and places locks on those paths
 */
export function placeKeysAndLocks(world, rng = Math.random) {
  const { cols, rows, rooms } = world;
  const keyAssignments = [];
  let keyId = 0;

  // Find key shrine rooms
  const keyShrines = [];
  const goalPos = findRoomOfType(world, ROOM_TYPE.BOSS);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (rooms[y][x].type === ROOM_TYPE.KEY_SHRINE) {
        keyShrines.push({ x, y });
      }
    }
  }

  // For each key shrine, place a lock on a door closer to the goal
  for (const shrine of keyShrines) {
    const kid = `key_${keyId++}`;
    // Find a door between shrine and goal to lock
    const path = findPath(world, shrine.x, shrine.y, goalPos.x, goalPos.y);
    if (path.length >= 2) {
      // Lock the door on the path between two rooms
      const fromX = path[0].x;
      const fromY = path[0].y;
      // Find which direction connects path[0] to path[1]
      const toX = path[1].x;
      const toY = path[1].y;
      const dir = toX > fromX ? 'right' : toX < fromX ? 'left' : toY > fromY ? 'down' : 'up';

      if (rooms[fromY][fromX].doors[dir]) {
        // Don't lock the start room doors
        if (!(fromX === 0 && fromY === 0)) {
          rooms[fromY][fromX].doors[dir].locked = true;
          rooms[fromY][fromX].doors[dir].keyId = kid;
          keyAssignments.push({ keyId: kid, lockRoom: { x: fromX, y: fromY }, lockDoorDir: dir });
        }
      }
    }
  }

  world.keyAssignments = keyAssignments;
  return world;
}

/**
 * Find the first room of a given type
 */
export function findRoomOfType(world, type) {
  for (let y = 0; y < world.rows; y++) {
    for (let x = 0; x < world.cols; x++) {
      if (world.rooms[y][x].type === type) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

/**
 * BFS to find path between two rooms
 */
export function findPath(world, startX, startY, endX, endY) {
  const visited = new Set();
  const queue = [[{ x: startX, y: startY }]];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];

    if (last.x === endX && last.y === endY) return path;

    const room = world.rooms[last.y][last.x];
    for (const dir of ['up', 'down', 'left', 'right']) {
      const door = room.doors[dir];
      if (!door) continue;
      const nx = door.connectedTo.roomX;
      const ny = door.connectedTo.roomY;
      const key = `${nx},${ny}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([...path, { x: nx, y: ny }]);
      }
    }
  }

  return [];
}

/**
 * Verify that the goal room is reachable from start considering keys
 */
export function verifySolvability(world) {
  // First, do a simple BFS ignoring locks - just check connectivity
  // Then try to find a path that respects key/lock ordering
  return bfsWithKeys(world);
}

/**
 * BFS that respects key/lock ordering
 */
function bfsWithKeys(world) {
  const { cols, rows, rooms } = world;

  // Find start and goal
  const start = findRoomOfType(world, ROOM_TYPE.START);
  const goal = findRoomOfType(world, ROOM_TYPE.BOSS);

  // State: (roomX, roomY, keysFound[])
  const visited = new Set();
  const queue = [{ x: start.x, y: start.y, keys: new Set() }];
  visited.add(`${start.x},${start.y}:`);

  while (queue.length > 0) {
    const current = queue.shift();
    const room = rooms[current.y][current.x];

    // Check if we found a key
    if (room.type === ROOM_TYPE.KEY_SHRINE) {
      // Find the key assignment for this shrine (approximate)
      for (const ka of world.keyAssignments) {
        current.keys.add(ka.keyId);
      }
    }

    if (current.x === goal.x && current.y === goal.y) return true;

    for (const dir of ['up', 'down', 'left', 'right']) {
      const door = room.doors[dir];
      if (!door) continue;

      // Check if locked
      if (door.locked && door.keyId) {
        if (!current.keys.has(door.keyId)) continue; // locked and no key
      }

      const nx = door.connectedTo.roomX;
      const ny = door.connectedTo.roomY;
      const keyArr = [...current.keys].sort().join(',');
      const stateKey = `${nx},${ny}:${keyArr}`;

      if (!visited.has(stateKey)) {
        visited.add(stateKey);
        queue.push({ x: nx, y: ny, keys: new Set(current.keys) });
      }
    }
  }

  return false;
}

function isNearDoor(cx, cy, room) {
  const mid = Math.floor(ROOM_SIZE / 2);
  if (room.doors['up'] && cy <= 3 && Math.abs(cx - mid) <= 3) return true;
  if (room.doors['down'] && cy >= ROOM_SIZE - 4 && Math.abs(cx - mid) <= 3) return true;
  if (room.doors['left'] && cx <= 3 && Math.abs(cy - mid) <= 3) return true;
  if (room.doors['right'] && cx >= ROOM_SIZE - 4 && Math.abs(cy - mid) <= 3) return true;
  return false;
}

/**
 * Generate boss room tiles (80×80 grid with 4 pillars + BOSS door)
 */
export function generateBossRoomTiles(room) {
  const tiles = Array.from({ length: BOSS_ROOM_SIZE }, () =>
    Array(BOSS_ROOM_SIZE).fill(CELL.FLOOR)
  );
  // Border walls
  for (let i = 0; i < BOSS_ROOM_SIZE; i++) {
    tiles[0][i] = tiles[BOSS_ROOM_SIZE - 1][i] = CELL.WALL;
    tiles[i][0] = tiles[i][BOSS_ROOM_SIZE - 1] = CELL.WALL;
  }
  // 4 pillars at room corners (offset from walls)
  const p = 5;
  const pillarPositions = [
    { x: p, y: p },
    { x: BOSS_ROOM_SIZE - p - 1, y: p },
    { x: p, y: BOSS_ROOM_SIZE - p - 1 },
    { x: BOSS_ROOM_SIZE - p - 1, y: BOSS_ROOM_SIZE - p - 1 },
  ];
  pillarPositions.forEach(pos => {
    tiles[pos.y][pos.x] = CELL.STONE_WALL;
  });
  room.pillars = pillarPositions.map(pos => ({ ...pos, hp: 1 }));
  // BOSS door on top wall
  const doorPos = Math.floor(BOSS_ROOM_SIZE / 2);
  tiles[0][doorPos] = CELL.BOSS_DOOR;
  room.bossRoom = true;
  room.bossConfig = { bossType: 'blue_hammer', pillars: pillarPositions };
  // Place the boss entity in the boss room
  const bossEntity = createBossEnemy('blue_hammer', Math.floor(BOSS_ROOM_SIZE / 2), Math.floor(BOSS_ROOM_SIZE / 2) - 2);
  bossEntity.roomX = room.x;
  bossEntity.roomY = room.y;
  room.entities.enemies.push(bossEntity);
  return tiles;
}

/**
 * Generate interior tiles for a room
 */
export function generateRoomTiles(room, rng = Math.random) {
  const tiles = generateDefaultTiles();

  // Add door passages in the border walls (5 cells wide for comfortable passage)
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      const mid = Math.floor(ROOM_SIZE / 2);
      if (dir === 'up') {
        for (let dx = -2; dx <= 2; dx++) {
          tiles[0][mid + dx] = CELL.DOOR;
        }
      } else if (dir === 'down') {
        for (let dx = -2; dx <= 2; dx++) {
          tiles[ROOM_SIZE - 1][mid + dx] = CELL.DOOR;
        }
      } else if (dir === 'left') {
        for (let dy = -2; dy <= 2; dy++) {
          tiles[mid + dy][0] = CELL.DOOR;
        }
      } else if (dir === 'right') {
        for (let dy = -2; dy <= 2; dy++) {
          tiles[mid + dy][ROOM_SIZE - 1] = CELL.DOOR;
        }
      }
    }
  }

  // Mark cells adjacent to doors as protected (prevent wall placement blocking door approaches)
  const protectedCells = new Set();
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      const mid = Math.floor(ROOM_SIZE / 2);
      if (dir === 'up') {
        for (let dx = -2; dx <= 2; dx++) {
          protectedCells.add(`1,${mid+dx}`);
        }
      } else if (dir === 'down') {
        for (let dx = -2; dx <= 2; dx++) {
          protectedCells.add(`${ROOM_SIZE-2},${mid+dx}`);
        }
      } else if (dir === 'left') {
        for (let dy = -2; dy <= 2; dy++) {
          protectedCells.add(`${mid+dy},1`);
        }
      } else if (dir === 'right') {
        for (let dy = -2; dy <= 2; dy++) {
          protectedCells.add(`${mid+dy},${ROOM_SIZE-2}`);
        }
      }
    }
  }

  // Add some interior walls for cover (skip protected cells near doors)
  const wallCount = 3 + Math.floor(rng() * 5);
  for (let i = 0; i < wallCount; i++) {
    const wx = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
    const wy = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
    // Don't place walls on doors, protected door approaches, or center gacha spot
    const isCenter = wx === Math.floor(ROOM_SIZE / 2) && wy === Math.floor(ROOM_SIZE / 2);
    const nearDoor = isNearDoor(wx, wy, room);
    if (!isCenter && !nearDoor && tiles[wy][wx] === CELL.FLOOR) {
      // Small clusters
      const len = 1 + Math.floor(rng() * 3);
      for (let j = 0; j < len; j++) {
        const px = wx + (j % 2);
        const py = wy + Math.floor(j / 2);
        if (py < ROOM_SIZE - 1 && px < ROOM_SIZE - 1 && tiles[py][px] === CELL.FLOOR && !protectedCells.has(`${py},${px}`)) {
          tiles[py][px] = CELL.WALL;
        }
      }
    }
  }

  // For gacha rooms, ensure clear area around machine
  if (room.gachaMachine) {
    const gx = room.gachaMachine.x;
    const gy = room.gachaMachine.y;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = gx + dx;
        const py = gy + dy;
        if (py > 0 && py < ROOM_SIZE - 1 && px > 0 && px < ROOM_SIZE - 1) {
          tiles[py][px] = CELL.FLOOR;
        }
      }
    }
  }

  // For save rooms, add save point marker
  if (room.type === ROOM_TYPE.SAVE) {
    const sx = Math.floor(ROOM_SIZE / 2);
    const sy = Math.floor(ROOM_SIZE / 2);
    room.savePoint = { x: sx, y: sy };
    // Clear save point area
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = sx + dx;
        const py = sy + dy;
        if (py > 0 && py < ROOM_SIZE - 1 && px > 0 && px < ROOM_SIZE - 1) {
          tiles[py][px] = CELL.FLOOR;
        }
      }
    }
  }

  // Add some DEATH_WALL cells in rooms far from start or in hidden rooms
  const distFromStart = Math.abs(room.x - 0) + Math.abs(room.y - 0);
  if (!room.gachaMachine && room.type !== ROOM_TYPE.START && room.type !== ROOM_TYPE.SAVE &&
      !room.savePoint && (room.type === ROOM_TYPE.HIDDEN ||
      (room.type === ROOM_TYPE.NORMAL && distFromStart >= 4 && rng() < 0.3))) {
    const deathWallCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < deathWallCount; i++) {
      const wx = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
      const wy = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
      if (tiles[wy][wx] === CELL.FLOOR) {
        // Only place in corners/edges, not in the center path
        const isCenterCorridor = wx > ROOM_SIZE / 2 - 2 && wx < ROOM_SIZE / 2 + 2 &&
                                 wy > ROOM_SIZE / 2 - 2 && wy < ROOM_SIZE / 2 + 2;
        if (!isCenterCorridor) {
          tiles[wy][wx] = CELL.DEATH_WALL;
        }
      }
    }
  }

  // For start room, ensure center is clear
  if (room.type === ROOM_TYPE.START) {
    const sx = Math.floor(ROOM_SIZE / 2);
    const sy = Math.floor(ROOM_SIZE / 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const px = sx + dx;
        const py = sy + dy;
        if (py > 0 && py < ROOM_SIZE - 1 && px > 0 && px < ROOM_SIZE - 1) {
          tiles[py][px] = CELL.FLOOR;
        }
      }
    }
  }

  // For goal room, make a clear path to center
  if (room.type === ROOM_TYPE.GOAL) {
    const gx = Math.floor(ROOM_SIZE / 2);
    const gy = Math.floor(ROOM_SIZE / 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const px = gx + dx;
        const py = gy + dy;
        if (py > 0 && py < ROOM_SIZE - 1 && px > 0 && px < ROOM_SIZE - 1) {
          tiles[py][px] = CELL.FLOOR;
        }
      }
    }
  }

  return tiles;
}

/**
 * Place enemies and items across rooms
 */
export function placeEnemiesAndItems(world, difficulty = 1, rng = Math.random) {
  const { cols, rows, rooms } = world;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const room = rooms[y][x];

      // Skip start room for enemies (but still place some food)
      if (room.type === ROOM_TYPE.START) {
        placeFoodInRoom(room, 3, world, rng);
        continue;
      }

      // Don't place enemies in start or save rooms
      if (room.type === ROOM_TYPE.SAVE || room.type === ROOM_TYPE.GOAL || room.type === ROOM_TYPE.BOSS) {
        placeFoodInRoom(room, 2, world, rng);
        continue;
      }

      // Place enemies (more in rooms farther from start)
      const dist = Math.abs(x) + Math.abs(y);
      const enemyCount = Math.min(Math.floor(dist * 0.5 * difficulty) + (rng() < 0.4 ? 1 : 0), 3);
      for (let e = 0; e < enemyCount; e++) {
        const enemy = spawnEnemyInRoom(room, world, rng);
        if (enemy) room.entities.enemies.push(enemy);
      }

      // Place food (random amount)
      placeFoodInRoom(room, 1 + Math.floor(rng() * 3), world, rng);
    }
  }

  return world;
}

/**
 * Place food in a room
 */
function placeFoodInRoom(room, count, world, rng = Math.random) {
  for (let i = 0; i < count; i++) {
    const pos = findEmptyFloorCell(room, world, rng);
    if (pos) {
      room.entities.food.push({ x: pos.wx, y: pos.wy });
    }
  }
}

/**
 * Find an empty floor cell in a room (world coords)
 */
export function findEmptyFloorCell(room, world, rng = Math.random) {
  for (let tries = 0; tries < 50; tries++) {
    const cx = 1 + Math.floor(rng() * (ROOM_SIZE - 2));
    const cy = 1 + Math.floor(rng() * (ROOM_SIZE - 2));
    if (room.tiles[cy][cx] === CELL.FLOOR) {
      // Check no entity on this cell
      const { x: wx, y: wy } = worldToRoomLocalToWorld(room, cx, cy);
      const hasEnemy = room.entities.enemies.some(e => Math.abs(e.x - wx) + Math.abs(e.y - wy) < 2);
      const hasFood = room.entities.food.some(f => f.x === wx && f.y === wy);
      if (!hasEnemy && !hasFood) {
        return { wx, wy, cx, cy };
      }
    }
  }
  return null;
}

/**
 * Convert room-local coords to world coords (simplified)
 */
function worldToRoomLocalToWorld(room, cx, cy) {
  return {
    x: room.x * ROOM_SIZE + cx,
    y: room.y * ROOM_SIZE + cy,
  };
}

/**
 * Spawn an enemy in a room
 */
function spawnEnemyInRoom(room, world, rng = Math.random) {
  const pos = findEmptyFloorCell(room, world, rng);
  if (!pos) return null;

  const hp = 1 + Math.floor(rng() * 3); // 1-3 HP
  const segments = [];
  for (let i = 0; i < hp; i++) {
    segments.push({ x: pos.wx - i, y: pos.wy });
  }

  return {
    id: generateEnemyId(),
    x: pos.wx,
    y: pos.wy,
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

let _enemyIdCounter = 1000;
function generateEnemyId() {
  return _enemyIdCounter++;
}

/**
 * Build a safe fallback map (manually constructed, always solvable)
 */
function buildSafeMap(cols, rows) {
  const rooms = [];
  for (let y = 0; y < rows; y++) {
    rooms[y] = [];
    for (let x = 0; x < cols; x++) {
      const connections = {};
      if (x > 0) connections.left = { connectedTo: { roomX: x - 1, roomY: y }, locked: false, keyId: null };
      if (x < cols - 1) connections.right = { connectedTo: { roomX: x + 1, roomY: y }, locked: false, keyId: null };
      if (y > 0) connections.up = { connectedTo: { roomX: x, roomY: y - 1 }, locked: false, keyId: null };
      if (y < rows - 1) connections.down = { connectedTo: { roomX: x, roomY: y + 1 }, locked: false, keyId: null };
      rooms[y][x] = createRoom(x, y, ROOM_TYPE.NORMAL, connections);
    }
  }

  const world = { cols, rows, rooms, playerStart: { roomX: 0, roomY: 0 }, keyAssignments: [] };
  rooms[0][0].type = ROOM_TYPE.START;
  rooms[rows - 1][cols - 1].type = ROOM_TYPE.BOSS;
  world.playerStart = { roomX: 0, roomY: 0 };

  // Add some save, gacha, key rooms
  rooms[0][1].type = ROOM_TYPE.SAVE;
  rooms[0][1].savePoint = { x: Math.floor(ROOM_SIZE / 2), y: Math.floor(ROOM_SIZE / 2) };
  rooms[1][1].type = ROOM_TYPE.GACHA;
  rooms[1][1].gachaMachine = { x: Math.floor(ROOM_SIZE / 2), y: Math.floor(ROOM_SIZE / 2) };
  rooms[1][0].type = ROOM_TYPE.KEY_SHRINE;

  // Generate tiles for all rooms
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const room = rooms[y][x];
      if (room.type === ROOM_TYPE.BOSS) {
        room.tiles = generateBossRoomTiles(room);
      } else {
        rooms[y][x].tiles = generateRoomTiles(rooms[y][x], () => 0.5);
      }
    }
  }

  // Place food and enemies
  placeEnemiesAndItems(world, 1, () => 0.5);

  return world;
}
