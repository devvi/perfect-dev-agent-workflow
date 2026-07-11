# Design: #132 — Boss Room Freeze Fix

> Parent Issue: #132
> Agent: plan-agent
> Date: 2026-07-11

---

## 1. Architecture Overview

### Core Idea

Fix the coordinate conversion pipeline so that `worldToRoomCoords()`, `getCellAt()`, and all downstream functions are room-size-aware. Boss rooms use `BOSS_ROOM_SIZE = 80` instead of the hardcoded `ROOM_SIZE = 20`. This unblocks all four root bugs: the snake spawning on `CELL.WALL`, the boss entity being in the wrong grid cell, pillars invisible to collision, and rendering truncated to 20×20.

### Data Flow

```
world_xy [world coords]
    │
    ▼
worldToRoomCoords(wx, wy, room?)  ← now accepts optional room object
    │
    ├─ rx, ry = floor(wx / roomSize), floor(wy / roomSize)
    ├─ cx, cy = ((wx % roomSize) + roomSize) % roomSize
    └─ returns { rx, ry, cx, cy }  [cx,cy now ∈ [0, roomSize-1]]
    │
    ▼
getCellAt(world, wx, wy)  ← reads room → uses room.tiles.length as size
    │
    ├─ room = getRoomAt(world, rx, ry)
    ├─ roomSize = room?.tiles?.length || ROOM_SIZE  (safe fallback)
    └─ returns room.tiles[cy][cx]  [now reads full BOSS_ROOM_SIZE for boss rooms]
    │
    ├── core.js (room transition → snake spawns on FLOOR)
    ├── collision.js (door detection uses room.tiles.length/2)
    ├── ai.js (food spawn uses room.tiles.length bounds)
    └── render/room.js (render loop iterates to room.tiles.length)
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| room size source | Use `room.tiles.length` as canonical size | Always matches the tile array; no separate constant to get out of sync. Falls back to `ROOM_SIZE` (20) for null/undefined rooms |
| `worldToRoomCoords` signature | Accept optional `room` object as third param | Minimal API surface — no new function, backward-compatible default. Callers that have the room object pass it; those that don't get ROOM_SIZE |
| Boss room entrance spawn | Hard-code to `Math.floor(BOSS_ROOM_SIZE/2)` for boss, use `room.tiles.length` generically | The boss door is always at `tiles[0][BOSS_ROOM_SIZE/2]`; the snake must spawn one cell below on CELL.FLOOR |
| `emergencyFoodRespawn` scope | Keep using `ROOM_SIZE` for normal rooms, use `room.tiles.length` for boss rooms | Must not break existing food distribution in 20×20 rooms; boss rooms need 80×80 bounds |
| Render loop bounds | Use `room.tiles.length` in `renderRoom()` | Single loop variable replaces hardcoded `ROOM_SIZE` — automatically handles both room types |

---

## 2. Engine Layer

### State Additions

No new state fields. The existing `room.bossRoom`, `bossDefeated`, and `gameState` already handle boss room flow. Changes are limited to coordinate conversion functions that become room-size-aware.

### Function Signature Changes

```js
// public/src/engine/world.js

export function worldToRoomCoords(wx, wy, room)
// Third param: optional room object. When provided, uses room.tiles.length as
// the room size for modular arithmetic. Falls back to ROOM_SIZE when room is null/undefined.

export function getCellAt(world, wx, wy)
// No signature change. Internally reads room = getRoomAt(...), then uses
// room.tiles.length as the row/column bound instead of ROOM_SIZE.
// Falls back to ROOM_SIZE when room is null/undefined.

export function roomToWorldCoords(rx, ry, cx, cy)
// No change — world-level coord math doesn't depend on room size.
```

```js
// public/src/engine/collision.js

function isDoorCell(room, cx, cy)
// Uses room.tiles.length/2 for door mid calculation instead of ROOM_SIZE/2.
// Also uses room.tiles.length-1 for edge detection.

export function checkSnakeCollision(head, snake, state)
// Uses maxX = world.cols * ROOM_SIZE  (unchanged — world grid is always MAP_COLS*ROOM_SIZE)
// Boss room is one cell in the grid; the room's tile array is larger but the world cell is the same

export function checkProjectileCollision(proj, state)
// Same: max bounds = world.cols/rows * ROOM_SIZE (unchanged)
```

```js
// public/src/engine/core.js

// Room transition section (lines 202-208):
// After bossIntro dismiss → snake must spawn on CELL.FLOOR below the boss door
// Boss door is at tiles[0][BOSS_ROOM_SIZE/2]; snake spawns at tiles[1][BOSS_ROOM_SIZE/2]
// World-to-room coords for boss room: room.x * room.tiles.length + BOSS_ROOM_SIZE/2
```

### Data Flow Between Modules

- `tick()` in core.js calls → `checkRoomTransition()` → sets `state.currentRoom`
- If new room is `type === ROOM_TYPE.BOSS` → `state.gameState = 'bossIntro'`
- On boss intro dismiss → next tick: snake head moves one cell past the boss door
- `checkSnakeCollision(head, ...)` → `getCellAt(world, head.x, head.y)` → now reads correct tile
- `updateBoss(state)` → boss AI functions → `getCellAt(world, nx, ny)` for charge direction → now reads BOSS_ROOM_SIZE tiles correctly
- `checkBossPillarCollision(state)` → `getCellAt(world, ...)` → now reads STONE_WALL at pillar positions

---

## 3. Entity Layer

No new entity types. The boss entity factory (`createBossEnemy`) is correct — it's the *spawn coordinates* in generator.js that need fixing.

### Fix: Boss Entity Spawn Coordinates (generator.js line 462)

```js
// Current (buggy):
const bossEntity = createBossEnemy('blue_hammer',
  Math.floor(BOSS_ROOM_SIZE / 2),
  Math.floor(BOSS_ROOM_SIZE / 2) - 2
);

// Fixed: convert tile-local coords to world coords
const bossWorldX = room.x * room.tiles.length + Math.floor(BOSS_ROOM_SIZE / 2);
const bossWorldY = room.y * room.tiles.length + Math.floor(BOSS_ROOM_SIZE / 2) - 2;
const bossEntity = createBossEnemy('blue_hammer', bossWorldX, bossWorldY);
bossEntity.roomX = room.x;
bossEntity.roomY = room.y;
```

---

## 4. Data Layer

### Constants (already exist — no additions)

```js
export const BOSS_ROOM_SIZE = 80;   // already defined, used by boss room generation
export const ROOM_SIZE = 20;        // unchanged — still correct for normal rooms
```

No new constants needed. The change is strictly in *how* functions use room size — they read it dynamically from `room.tiles.length` rather than from a constant.

---

## 5. Render Layer

### Rendering Change

| Element | Where | When Visible | Change |
|---------|-------|-------------|--------|
| Room tiles | `renderRoom()` in room.js | Always | Loop bound: `room.tiles.length` instead of `ROOM_SIZE` |
| Snake segments | `drawSnake()` in room.js | Always | Uses `worldToRoomCoords(seg.x, seg.y)` — no change needed if worldToRoomCoords is fixed |
| Door indicators | `renderRoom()` in room.js | Always | Door position detection uses `room.tiles.length` for edge detection |

### Rendering Conditions

- All normal rooms continue to render at 20×20 (ROOM_SIZE tile arrays)
- Boss rooms now iterate to 80×80 (BOSS_ROOM_SIZE tile arrays)
- The canvas size (CANVAS_SIZE = 400) and CELL_SIZE (20) are unchanged — `renderRoom` draws to an off-screen buffer or clips to viewport; the full room is navigable via the camera / minimap

---

## 6. Input/UI Layer

No input/UI changes. The boss intro dialog already exists (`gameState === 'bossIntro'`). The fix is purely in coordinate conversion — the player's controls and UI flow remain identical.

---

## 7. Test Layer

### New Test Descriptions

Strategy A (Bug-Fix Tests) per game-plan-agent specification:

| # | Test Name | What It Verifies | Strategy |
|---|-----------|-----------------|----------|
| T1 | `getCellAt returns CELL.WALL for boss room coords (BUG)` | Documents current bug: coords (0,40) inside boss room return CELL.WALL because coordinate conversion clamps to ROOM_SIZE | Bug-documenting |
| T2 | `worldToRoomCoords clamps to [0,19] for boss room (BUG)` | Documents current bug: worldToRoomCoords returns cx,cy in [0,19] range | Bug-documenting |
| T3 | `getCellAt still returns correct value for normal room` | Regression: normal room tiles should still work | Regression |
| T4 | `getCellAt returns WALL for true room border in normal room` | Regression: real walls on room edge unchanged | Regression |
| T5 | `roomToWorldCoords is unaffected by room size` | Regression: world→room→world roundtrip | Regression |
| T6 | `boss room pillar positions exist at correct tile indices` | Post-fix: pillars at (5,5), (74,5), (5,74), (74,74) | describe.todo() |
| T7 | `snake spawns on CELL.FLOOR in boss room after intro` | Post-fix: boss room entry should land on floor | describe.todo() |
| T8 | `emergencyFoodRespawn uses correct bounds for boss rooms` | Post-fix: food spawns within 80×80 area | describe.todo() |

### Edge Cases to Cover

1. Null/undefined room passed to `worldToRoomCoords` must fall back to ROOM_SIZE=20 (no crash)
2. Room with `tiles` array that isn't square (edge case: `tiles.length ≠ tiles[0].length`)
3. Snapping into boss room from any door direction (currently hardcoded to top entry)
4. Projectile traveling across boss room (projectile collision must read full 80×80)
5. Food spawning on tile floor in boss room's broader area (not just top-left 20×20)
6. Boss entity world coordinates after fixing (boss at (roomX*80+40, roomY*80+38))

### Test Data Fixtures

```js
// Helper: create a world with a boss room at (4, 4)
function createBossRoomWorld() {
  const world = generateWorldMap(5, 5);
  const assigned = assignRoomTypes(world);
  // Boss room is at the room that was replaced (find it and ensure tiles)
  for (let y = 0; y < assigned.rows; y++) {
    for (let x = 0; x < assigned.cols; x++) {
      if (assigned.rooms[y][x].type === ROOM_TYPE.BOSS) {
        // Ensure boss room tiles are 80×80
        if (assigned.rooms[y][x].tiles.length === ROOM_SIZE) {
          assigned.rooms[y][x].tiles = generateBossRoomTiles(assigned.rooms[y][x]);
        }
      }
    }
  }
  return assigned;
}
```

---

## 8. Files Changed (Per-Layer Summary)

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Engine | `public/src/engine/world.js` | `worldToRoomCoords()` and `getCellAt()` become room-size-aware using `room.tiles.length` | +15 |
| Engine | `public/src/engine/core.js` | Boss room transition spawn position fix (snake on FLOOR after boss intro dismiss) | +10 |
| Engine | `public/src/engine/generator.js` | Boss entity spawn uses world coords (room offset + tile-local offset) | +5 |
| Engine | `public/src/engine/collision.js` | `isDoorCell()` uses `room.tiles.length` for mid/edge detection | +8 |
| Engine | `public/src/engine/ai.js` | `emergencyFoodRespawn()` uses `room.tiles.length` bounds for boss rooms; `trySpawnPeriodicFood()` food coords consistent | +10 |
| Render | `public/src/render/room.js` | `renderRoom()` loop bound uses `room.tiles.length`; door indicator edge detection | +5 |
| Test | `tests/boss-room-freeze.test.js` | Bug-documenting + regression + todo tests | +200 |

---

## 9. Verification Checklist

- [ ] All new tests pass
- [ ] No regressions in existing tests (npm run test: all 234+ tests pass)
- [ ] Boss room `getCellAt(world, bossRoomX * 80 + 1, bossRoomY * 80 + 40)` returns CELL.FLOOR (not CELL.WALL)
- [ ] Boss room `getCellAt(world, bossRoomX * 80 + 5, bossRoomY * 80 + 5)` returns CELL.STONE_WALL (pillar visible)
- [ ] Normal room `getCellAt(world, x, y)` for interior cell returns CELL.FLOOR (regression)
- [ ] Boss entity has correct world coordinates after generator fix
- [ ] `emergencyFoodRespawn` spawns food within the full 80×80 boss room, not just top-left 20×20
- [ ] `renderRoom` renders all 80×80 tiles for boss rooms (no black/gap areas in visible area)
