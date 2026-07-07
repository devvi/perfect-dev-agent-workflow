# Design: 银河城风格贪吃蛇重构

> Parent Issue: #15
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

### Tech Stack
- **Runtime:** Vanilla JavaScript (ES6+), no framework — same as existing
- **Rendering:** HTML5 Canvas 2D API (primary game view + minimap overlay)
- **Styling:** Inline CSS, no external dependencies
- **Testing:** Vitest (isolated engine + generation tests)
- **Deployment:** Single HTML file served from `public/gameboy.html`
- **External:** Zero (no game engines, no libraries, no maps)

### File Structure
```
perfect-dev-agent-workflow/
├── docs/
│   ├── DESIGN/15-metroidvania-snake-overhaul.md  ← This file
│   ├── PRD/15-metroidvania-snake-overhaul.md     ← Research output
│   └── TASKS/15-metroidvania-snake-overhaul.md   ← Task breakdown
├── public/
│   ├── gameboy.html                              ← Main game page (massively expanded)
│   └── src/
│       ├── gameboy-snake-engine.js               ← Old engine (will be replaced)
│       ├── engine/                               ← NEW: Modular engine
│       │   ├── core.js                           ← Game loop, state management
│       │   ├── world.js                          ← WorldMap, Room, TileMap
│       │   ├── generator.js                      ← Procedural map generation + connectivity
│       │   ├── entities.js                       ← Snake, Enemy, Projectile models
│       │   ├── collision.js                      ← Collision detection (world coords)
│       │   ├── combat.js                         ← Attack system, bullet management
│       │   ├── items.js                          ← Gacha machine, power-up effects
│       │   ├── ai.js                             ← Enemy AI (pathfinding, chasing)
│       │   ├── save.js                           ← localStorage save/load
│       │   └── constants.js                      ← Shared constants, enums, palette
│       └── render/                               ← NEW: Rendering layer
│           ├── renderer.js                       ← Main render dispatch
│           ├── room.js                           ← Room rendering (tiles, entities)
│           ├── minimap.js                        ← Minimap + fog of war
│           ├── hud.js                            ← Score, items, speed indicator
│           └── overlays.js                       ← Start/game-over/victory screens
├── tests/
│   └── metroidvania-snake.test.js                ← NEW: Comprehensive test suite
└── index.html                                    ← Main page (updated link)
```

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Engine structure | Split into modular files under `public/src/engine/` | Testability — each module is independently testable; easier maintenance than monolith |
| World coordinate system | World grid (rooms × 20 cells) plus room-local offset | Snake moves in world coords; rendering translates to viewport |
| Game loop | `setInterval` with variable interval based on snake length | Consistent updates; speed ramp via interval adjustment instead of frame skipping |
| Room rendering | Viewport renders only current room | Performance — rendering 25× 20×20 = 10000 cells per frame would be slow |
| Minimap | Separate small canvas with independent draw | Simple — just draw room outlines + explore state |
| Map generation | BFS-based spanning tree + random wall removal | Guarantees connectivity; configurable density |
| State management | Immutable state returns (following existing pattern) | Consistency with existing code; enables easy testing |
| Keys & locks | Graph-based key placement: key → lock path must be reachable pre-lock | Solvability guarantee by construction |
| Test strategy | Pure function tests (no DOM/Canvas dependency) | Same as existing — fast, deterministic tests |

---

## 2. Data Structures

### Constants & Enums

```js
// Room dimensions (matches existing grid)
const ROOM_SIZE = 20;
const MAP_COLS = 5;           // 5×5 = 25 rooms
const MAP_ROWS = 5;
const CELL_SIZE = 20;

// Room types
const ROOM_TYPE = {
  NORMAL:     'normal',
  START:      'start',
  GOAL:       'goal',         // Reach this room to win
  SAVE:       'save',         // Auto-save checkpoint room
  HIDDEN:     'hidden',       // Behind cracked wall
  GACHA:      'gacha',        // Contains Gacha Machine
  KEY_SHRINE: 'key_shrine',   // Contains a key
};

// Direction (extends existing DIR for 4-way + door directions)
const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

const DOOR_DIR = ['up', 'down', 'left', 'right'];

// Cell types within a room
const CELL = {
  FLOOR:       0,
  WALL:        1,
  CRACKED_WALL: 2,
  DOOR:        3,
  STONE_WALL:  4,  // Indestructible wall
};
```

### World State

```js
// === WORLD MAP ===
WorldMap {
  cols: 5,
  rows: 5,
  rooms: Room[][],              // 2D array of rooms
  playerStart: { roomX, roomY, cellX, cellY },
  keyAssignments: [             // Map key_id → locked door location
    { keyId, lockRoom, lockDoorDir },
  ],
  keysFound: Set<keyId>,        // Player's collected keys
}

// === ROOM ===
Room {
  x, y,                         // Grid position in world
  type: ROOM_TYPE,              // normal/start/goal/save/hidden/gacha/key_shrine
  explored: false,              // Has player ever entered?
  tiles: Cell[][],              // 20×20 grid of CELL enum values
  doors: {                      // directional doors
    up:    { connectedTo: { roomX, roomY }, locked: false, keyId: null },
    down:  { connectedTo: { roomX, roomY }, locked: false, keyId: null },
    left:  { connectedTo: { roomX, roomY }, locked: false, keyId: null },
    right: { connectedTo: { roomX, roomY }, locked: false, keyId: null },
  },
  sizeGate: null | {            // Length lock
    requiredLength: number,
    doorDir: string,            // Which door requires length
  },
  entities: {
    enemies: [ Enemy ],
    food:    [ { x, y } ],
    items:   [ { x, y, type } ],
  },
  gachaMachine: null | { x, y },  // Gacha machine location (GACHA rooms)
  savePoint: null | { x, y },    // Save point location (SAVE rooms)
}

// === GAME STATE ===
GameState {
  // Player
  snake: Segment[],             // Snake body array (world coords)
  direction: { x, y },          // Current movement direction
  nextDirection: { x, y },      // Buffered direction

  // Room tracking
  currentRoom: { x, y },        // Which room the head is in
  previousRoom: { x, y },       // Previous room (for door transition)

  // Combat
  projectiles: [ Projectile ],  // Active bullets
  fireCooldown: 0,              // Frames until can fire again
  fireRate: 3,                  // Frames between shots (lower = faster)
  projectileSpeed: 2,           // Cells per tick
  projectileDecay: 10,          // Max travel distance in cells
  projectilePower: 1,           // Damage per hit
  doubleShot: false,            // Power-up: fire two bullets
  maxProjectiles: 3,

  // Inventory
  inventory: {
    keys: Set<keyId>,
    items: [ PowerUp ],
  },
  keysFound: Set<keyId>,

  // Game progress
  gameState: 'title' | 'playing' | 'paused' | 'gameover' | 'won',
  tickCount: 0,
  score: 0,
  enemiesKilled: 0,
  roomsExplored: 0,

  // Speed
  baseTickInterval: 150,        // ms per tick at length 3
  currentTickInterval: 150,

  // Save
  savePoint: null | SaveData,   // Last save point data
}
```

### Entities

```js
// === SNAKE SEGMENT ===
Segment { x, y }    // World coordinates (not room-local)

// === PROJECTILE ===
Projectile {
  id: number,
  x, y,                       // World position
  dir: { x, y },              // Flight direction
  speed: number,              // Cells per tick
  remainingRange: number,     // Cells until despawn
  power: number,              // Damage on hit
}

// === ENEMY ===
Enemy {
  id: number,
  x, y,                       // World position
  segments: [ { x, y } ],    // Body segments (length = hp)
  hp: number,                 // Equal to length
  speedTicks: number,          // Moves every N ticks
  tickCounter: number,        // Counts toward next move
  roomX, roomY,               // Home room (doesn't leave by default)
  chaseRange: number,         // Max cells to chase (default: full room)
  aiState: 'idle' | 'chase' | 'return',
}

// === POWER-UP ===
PowerUp {
  type: 'fireRate' | 'damage' | 'doubleShot' | 'range' | 'speed',
  duration: number,           // Remaining ticks (0 = permanent)
  stack: number,              // Multiplier/level
}
```

### Save Data
```js
SaveData {
  snake: Segment[],
  currentRoom: { x, y },
  direction: { x, y },
  inventory: {
    keys: [ keyId ],
    items: [ PowerUp ],
  },
  exploredMap: boolean[][],   // Which rooms have been explored
  score: number,
  timestamp: number,
}
```

---

## 3. Key Functions / Components

### Engine Module: `core.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `createInitialState()` | `() → GameState` | Generates full initial state: generates world map, places player at start |
| `startGame(state)` | `(GameState) → GameState` | Transitions from title to playing |
| `tick(state)` | `(GameState) → GameState` | Main game tick: snake move, projectile move, enemy AI, collision checks, state updates |
| `changeDirection(state, dir)` | `(GameState, DIR) → GameState` | Set nextDirection (ignores reverse) |
| `fire(state)` | `(GameState) → GameState` | Fire projectile from snake head. Deducts 1 from length. Checks cooldown/max. |
| `interact(state)` | `(GameState) → GameState` | Use gacha machine / interact with special tiles |

### Engine Module: `world.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `createRoom(x, y, type, connections)` | `(number, number, ROOM_TYPE, object) → Room` | Builds a room with walls, doors, floor tiles |
| `getRoomAt(world, rx, ry)` | `(WorldMap, number, number) → Room` | Safely get room, returns null if out of bounds |
| `worldToRoomCoords(wx, wy)` | `(number, number) → { rx, ry, cx, cy }` | Convert world coords to room-local coords |
| `roomToWorldCoords(rx, ry, cx, cy)` | `(number, number, number, number) → { x, y }` | Convert room-local to world coords |
| `getCellAt(world, wx, wy)` | `(WorldMap, number, number) → CELL` | Get tile type at world position |

### Engine Module: `generator.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `generateWorldMap(cols, rows, seed)` | `(number, number, string?) → WorldMap` | Procedurally generate a solvable world map |
| `buildSpanningTree(cols, rows)` | `(number, number) → EdgeSet` | BFS spanning tree for basic connectivity |
| `addRandomDoors(tree, density)` | `(EdgeSet, number) → EdgeSet` | Add extra door connections for loops |
| `assignRoomTypes(map)` | `(WorldMap) → WorldMap` | Assign START/GOAL/SAVE/GACHA/KEY_SHRINE rooms |
| `placeKeysAndLocks(map)` | `(WorldMap) → WorldMap` | Assign keys and locks ensuring solvability |
| `generateRoomTiles(room, connections)` | `(Room, DoorSet) → CELL[][]` | Generate interior walls and floor layout |
| `placeEnemiesAndItems(map, difficulty)` | `(WorldMap, number) → WorldMap` | Place enemies, food, items across rooms |
| `verifySolvability(map)` | `(WorldMap) → boolean` | BFS from start: check goal reachable with keys |

### Engine Module: `collision.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `checkSnakeCollision(head, snake, state)` | `(Segment, Segment[], GameState) → CollisionResult` | Wall/self/food/enemy/door detection |
| `checkProjectileCollision(proj, state)` | `(Projectile, GameState) → CollisionResult` | Bullet hits enemy/cracked wall/wall |
| `checkRoomTransition(state, newHead)` | `(GameState, Segment) → GameState` | Detect if head crosses a door → room switch |

### Engine Module: `combat.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `fireProjectile(state)` | `(GameState) → GameState` | Create projectile, deduct snake length, set cooldown |
| `updateProjectiles(state)` | `(GameState) → GameState` | Move all projectiles, decrement range, despawn |
| `applyProjectileDamage(state, projId, target)` | `(GameState, number, Entity) → GameState` | Damage enemy, remove projectile |
| `updateCooldowns(state)` | `(GameState) → GameState` | Decrement fire cooldown |

### Engine Module: `ai.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `updateEnemies(state)` | `(GameState) → GameState` | Tick all enemies: move toward snake if in range |
| `enemyChasePath(enemy, snakeHead, room)` | `(Enemy, Segment, Room) → { x, y }` | Simple greedy pathfinding (avoid walls, move toward snake) |

### Engine Module: `items.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `useGachaMachine(state)` | `(GameState) → GameState` | Consume 5 snake length, grant random power-up |
| `getRandomPowerUp()` | `() → PowerUp` | Weighted random power-up generation |
| `applyPowerUp(state, powerUp)` | `(GameState, PowerUp) → GameState` | Apply power-up effect to state |
| `tickPowerUps(state)` | `(GameState) → GameState` | Decrement durations, remove expired |

### Engine Module: `save.js`

| Function | Signature | Responsibility |
|----------|-----------|----------------|
| `saveGame(state)` | `(GameState) → void` | Write SaveData to localStorage |
| `loadGame()` | `() → SaveData/null` | Read SaveData from localStorage |
| `applySave(saveData)` | `(SaveData) → GameState` | Rebuild GameState from save |
| `clearSave()` | `() → void` | Remove localStorage save |

### Rendering (separate module, pure rendering — no game state mutation)

| Function | Responsibility |
|----------|----------------|
| `renderMainView(ctx, state, room)` | Draw current room: tiles, entities, snake, projectiles, overlays |
| `renderMinimap(ctx, state, world)` | Draw minimap with room outlines, explore state, player position |
| `renderHUD(ctx, state)` | Score, length, current items, keys |
| `renderOverlay(ctx, state)` | Title/gameover/victory/menu screens |
| `renderScanlines(ctx)` | Existing scanline effect |
| `renderGachaUI(ctx, state)` | Draw gacha machine interaction overlay |
| `renderCrackedWallHint(ctx, wallCell)` | Visual crack indicator on destructible walls |

---

## 4. Rendering / UI Strategy

### Layer Order (bottom to top)
1. **LCD background** — `#9bbc0f`
2. **Room tiles** — Floor (gap pattern), walls (solid dark), doors (highlight), cracked walls (hairline cracks)
3. **Food items** — Small animated dots
4. **Enemies** — Red-tinted segments (different shade from snake)
5. **Snake** — Green segments (same palette, head brighter)
6. **Projectiles** — Small bright dots with motion trail
7. **Gacha machine / save point** — Special markers
8. **HUD** — Score, length, keys, current items (top of game canvas)
9. **Minimap** — Bottom-right corner overlay (100×100px)
10. **Overlay** — Game-over, victory, title, gacha UI
11. **Scanlines** — Same as existing (semi-transparent horizontal lines)
12. **Cracked wall hint** — Subtle animation on crack tiles

### Viewport Strategy
- **Main canvas:** 400×400px (same as existing)
- Only current room is rendered on the main canvas
- Minimap is rendered on a separate smaller canvas positioned via CSS overlay
- Room transitions: instant swap (no scrolling; door = immediate new room render)

### Minimap
- Each room = small rectangle (e.g., 16×16px per room on 100×100px minimap)
- Colors: black (unexplored), dark green (explored), bright green (current), gold (goal), blue (save)
- Player indicator: blinking dot
- Door indicators: small gaps/notches on room edges
- Size gate indicators: small lock icon on door

### HUD Elements
- **Top bar:** SCORE [left], LENGTH [center], KEYS [right]
- **Item slots:** Below score, show active power-ups with remaining duration
- **Room name:** Bottom of game canvas (optional)

### GameBoy Shell Integration
- Same shell as existing, but added:
  - A/B buttons now have specific functions: A = fire, B = interact/gacha
  - SELECT/START: SELECT = pause/toggle minimap, START = menu
  - Visual indicators for firing and interaction

---

## 5. Input Handling

| Input | Action | State |
|-------|--------|-------|
| Arrow Up | `changeDirection(state, DIR.UP)` | playing |
| Arrow Down | `changeDirection(state, DIR.DOWN)` | playing |
| Arrow Left | `changeDirection(state, DIR.LEFT)` | playing |
| Arrow Right | `changeDirection(state, DIR.RIGHT)` | playing |
| A button / Z key | `fire(state)` | playing |
| B button / X key | `interact(state)` | playing (at gacha/save) |
| START / Enter | start / restart / confirm | any |
| SELECT / Shift | toggle pause | playing |
| Any arrow (idle) | start game | title |
| Space | restart after gameover/won | gameover/won |

---

## 6. Phased Implementation Tasks

### Phase 1 — Map Generation Engine (Core Architecture)

| Task | File | Description |
|------|------|-------------|
| 1.1 | `constants.js` | Enums, room constants, palette |
| 1.2 | `world.js` | Room/WorldMap data structures + coordinate helpers |
| 1.3 | `generator.js` | Procedural map generation (spanning tree + random doors) |
| 1.4 | `generator.js` | Key/lock placement + solvability verification |
| 1.5 | `core.js` | World coordinate snake movement + room transitions |
| 1.6 | `collision.js` | Wall/self/food collision in world coords |

### Phase 2 — Minimap & Fog of War

| Task | File | Description |
|------|------|-------------|
| 2.1 | `render/minimap.js` | Minimap rendering (rooms, explore state) |
| 2.2 | `render/minimap.js` | Fog of war overlay |
| 2.3 | `core.js` | Room enter → explore state update |

### Phase 3 — Combat & Projectiles

| Task | File | Description |
|------|------|-------------|
| 3.1 | `combat.js` | Projectile data structure + fire logic |
| 3.2 | `combat.js` | Projectile flight + decay |
| 3.3 | `collision.js` | Bullet → enemy/wall/cracked wall collision |
| 3.4 | `combat.js` | Cooldown system + max projectiles |

### Phase 4 — Enemy AI

| Task | File | Description |
|------|------|-------------|
| 4.1 | `entities.js` | Enemy data structure + spawn |
| 4.2 | `ai.js` | Enemy chase AI (greedy pathfinding) |
| 4.3 | `collision.js` | Snake ↔ enemy collision (damage) |
| 4.4 | `collision.js` | Projectile ↔ enemy collision |

### Phase 5 — Enhanced Food System

| Task | File | Description |
|------|------|-------------|
| 5.1 | `entities.js` | Food spawn across rooms |
| 5.2 | `ai.js` | Enemy food-stealing logic |
| 5.3 | `core.js` | Speed curve (length → tick interval) |
| 5.4 | `entities.js` | Emergency food respawn |

### Phase 6 — Save & Hidden Rooms

| Task | File | Description |
|------|------|-------------|
| 6.1 | `save.js` | Save/load from localStorage |
| 6.2 | `items.js` | Gacha machine + power-up system |
| 6.3 | `generator.js` | Hidden room generation (cracked walls) |
| 6.4 | `render/room.js` | Cracked wall visual + gacha UI |

### Phase 7 — UI Integration

| Task | File | Description |
|------|------|-------------|
| 7.1 | `public/gameboy.html` | Expanded HTML: minimap canvas, action buttons |
| 7.2 | `render/hud.js` | HUD rendering |
| 7.3 | `render/overlays.js` | Title/gameover/victory screens |
| 7.4 | `public/gameboy.html` | A/B button binding |
| 7.5 | `gameboy.html` | Keyboard mapping updates |
| 7.6 | `gameboy.html` | Visual polish (transitions, animations) |

### Phase 8 — Testing & Deployment

| Task | File | Description |
|------|------|-------------|
| 8.1 | Tests | E2E flow: generate map → explore → fight → win |
| 8.2 | Tests | LocalStorage save/load |
| 8.3 | Verif. | Vercel deployment check |
| 8.4 | Docs | Update README, STATUS |

---

## 7. Acceptance Test Cases

Mapped to research boundary conditions (Section 5 of PRD):

| # | Test | Expected | Phase |
|---|------|----------|-------|
| 1 | World map generation (5×5) creates 25 rooms | Map.rooms has 25 entries | P1 |
| 2 | Map generation guarantees solvability (100 runs) | All 100 runs: goal reachable from start | P1 |
| 3 | Snake moves in world coords through rooms | Coords transition correctly at door boundaries | P1 |
| 4 | Room transition at door: head enters connected room | `currentRoom` updates; room content loaded | P1 |
| 5 | Length gate: < req → blocked; >= req → pass (edge: equal) | Blockade vs passage | P1 |
| 6 | Key door: without key → blocked; with key → unlocked | Door state changes | P1 |
| 7 | Room unexplored → entered → marked explored | `room.explored` transitions | P2 |
| 8 | Minimap shows explored rooms; unexplored are black | Visual verify | P2 |
| 9 | Fire projectile: snake length -1, bullet created | `snake.length` decrements by 1 | P3 |
| 10 | Projectile decays after max travel distance | Projectile removed when range = 0 | P3 |
| 11 | Fire cooldown: can't fire during cooldown | `fire()` returns state unchanged | P3 |
| 12 | Max projectiles (3): 4th fire blocked | Only 3 projectiles exist at once | P3 |
| 13 | Enemy chase: snake in room → enemy moves toward it | Enemy position changes toward snake | P4 |
| 14 | Snake touches enemy → snake length -1 | Length decrements by 1 | P4 |
| 15 | Projectile hits enemy → enemy hp -1 | Enemy.hp and length decrease | P4 |
| 16 | Enemy hp reaches 0 → enemy removed | Enemy disappears from room | P4 |
| 17 | Snake eats food → length +1, food respawns | Length increments; new food spawns not on snake | P5 |
| 18 | Enemy walks over food → food consumed, enemy grows | Food removed; enemy hp+1 | P5 |
| 19 | Speed curve: length 3 → 150ms ; length 20 → slower | Tick interval increases with length | P5 |
| 20 | No food accessible → emergency respawn triggered | Food appears in current room | P5 |
| 21 | Enter save room → auto-save | localStorage has valid save data | P6 |
| 22 | Die after save → load from save point | State restored to save point | P6 |
| 23 | Fire at cracked wall → wall removed, hidden room revealed | CELL.CRACKED_WALL → CELL.FLOOR | P6 |
| 24 | Use gacha machine → length -5, receive power-up | Length decreases; inventory has new item | P6 |
| 25 | Power-up: doubleShot → fire creates 2 projectiles | Two projectiles spawned per fire | P6 |
| 26 | Reach goal room → game victory | `gameState === 'won'` | P7 |
| 27 | Snake length hits 0 → game over (load save) | `gameState === 'gameover'` | P7 |
| 28 | Unsolvable map edge case → regenerate (max 3 attempts) | Generation succeeds within 3 tries | P1 |
| 29 | Save data format mismatch → reset, no crash | Save cleared, game loads fresh | P6 |
| 30 | Enemy follows through door → returns to home after 2 rooms | Enemy re-appears in home room | P4 |

---

## 8. Error Handling / Boundary Cases

| Condition | Handling |
|-----------|----------|
| Map generation fails 3 times in a row | Fallback to pre-built "safe map" layout |
| Snake length = 0 | Immediate gameover; load save point if available |
| All rooms exhausted of food | Emergency food respawn in current room (single food item) |
| Projectile fired at door lock | No effect — locks are indestructible |
| Enemy follows through door | After 2 room transitions away from home, enemy despawns and respawns at home room |
| localStorage full or disabled | Save silently fails; game continues without save |
| Canvas size mismatch | Same HiDPI handling as existing code |
| Multiple keys pressed between ticks | Direction buffer = last valid input (same as existing) |
| Gacha interaction with length < 5 | Show "NOT ENOUGH LENGTH" message; no consumption |
| Same room marked as both gacha and save | Generator avoids assigning conflicting types |
| Player enters locked door room from the side without lock | Lock is on specific door direction; other entrances work normally |
