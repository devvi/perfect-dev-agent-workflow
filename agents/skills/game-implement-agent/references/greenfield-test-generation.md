# Greenfield Test Generation for Implement Agent

When the DESIGN doc describes a greenfield feature (entirely new code), the implement agent generates test files from prose descriptions in DESIGN doc Section 7. This reference helps write correct test code.

## Strategy: Code Exists After Implementation

Unlike the old Plan-phase approach (which used inline helpers because source didn't exist), you implement **production code first**, then write tests against real source modules. Use real imports for all functions after they exist.

```javascript
import { describe, it, expect } from 'vitest';
import { createWorld, getRoomAt } from '../public/src/engine/generator.js';
```

## Converting Prose Descriptions to Test Code

Each row in the DESIGN doc test case table maps to one or more test assertions:

**DESIGN doc row:**
| # | 场景 | 输入/设置 | 预期行为 | 验证条件 |
|---|------|-----------|---------|---------|
| 1 | 正常路径 | snake at (25,25), dir=RIGHT | 蛇头移到 (26,25) | head.x === 26 |

**Generated test code:**
```javascript
it('moves right by one cell', () => {
  const state = createInitialState(world);
  startGame(state);
  state.snake = [{ x: 25, y: 25 }, { x: 24, y: 25 }];
  state.direction = { x: 1, y: 0 };
  const result = tick(state);
  expect(result.snake[0].x).toBe(26);
  expect(result.snake[0].y).toBe(25);
});
```

## Common Pitfalls When Generating Tests

### 1. Nonexistent enum values

If the DESIGN doc references `ROOM_TYPE.BOSS` but the constant hasn't been added yet during your implementation, import it properly — your implementation should add it. Never hardcode literal values that the source module should export.

### 2. Mutation vs return-value patterns

Some functions mutate state in-place. `assignRoomTypes(world, rng)` modifies `world` and returns nothing. Test the mutated object, not the return value:

```javascript
// ❌ Wrong
const w = assignRoomTypes(world, rng);
expect(w.rooms[0][0].type).toBe(...);

// ✅ Correct
assignRoomTypes(world, rng);
expect(world.rooms[0][0].type).toBe(...);
```

### 3. `createInitialState()` returns `gameState: 'title'`

`tick()` only processes when `gameState === 'playing'`. Always call `startGame()` first:

```javascript
const state = createInitialState(world);
const started = startGame(state);  // gameState → 'playing'
const result = tick(started);
```

### 4. `minimalState().currentRoom` defaults to `{x:1, y:1}`

Snake positions are in world coordinates. Room is computed by `worldToRoomCoords(newHead)`, NOT `state.currentRoom`. Set explicit `currentRoom` matching your snake positions.

### 5. Border walls are default

Rooms have WALL tiles at column 0 and row 0 by default. Don't expect FLOOR at the edges. For wall-collision tests, place an interior wall explicitly.

## Reference: Minimal World Construction

When the DESIGN doc's test description involves specific room layouts, prefer building a minimal world over calling `generateWorldMap()`:

```javascript
const world = createWorld(2, 2);
world.rooms[0][0] = createRoom(ROOM_TYPE.NORMAL, 0, 0);
world.rooms[0][1] = createRoom(ROOM_TYPE.BOSS, 1, 0);
```

This avoids flaky random generation and makes coordinate geometry directly verifiable. See `game-plan-agent/references/minimal-test-world-creation.md` for more detail.

## E2E Test Generation

When the DESIGN doc mentions a regression scenario that requires E2E testing (teleport pattern), add the scenario to `tests/play-test.mjs`. Use the teleport pattern:

```javascript
const result = await page.evaluate(() => {
  const api = window.__GAME_API__;
  api.teleport(bossRoom.x, bossRoom.y);
  api.simulateKey('Space');
  api.tick(10);
  return api.getState().gameState;
});
```
