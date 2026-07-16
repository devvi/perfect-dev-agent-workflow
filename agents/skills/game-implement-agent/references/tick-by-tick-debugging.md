# Tick-by-Tick Tracing for Game Freeze/Debug Bugs

## When to use this

A bug fix was applied but the game still freezes/crashes. The E2E test passes but real gameplay fails. You need to find the exact tick where things go wrong and what the game state looks like at that point.

## Setup

```javascript
// Run this in a Playwright page context after the fix is applied
async function traceGameFreeze(page) {
  const result = await page.evaluate(() => {
    const api = window.__GAME_API__;
    const boss = api.getBossRoom();
    if (!boss) return 'no_boss_room';
    
    // Set up the scenario
    api.teleport(boss.x, boss.y);
    api.enterBossRoom();  // Simulate entering boss room
    api.simulateKey('Space');  // Dismiss intro (with proposed fix)
    
    // Trace each tick
    const trace = [];
    for (let i = 0; i < 30; i++) {
      const gs = api.tick(1);
      const s = api.getState();
      const head = s.snake[0];
      const roomX = Math.floor(head.x / 20);
      const roomY = Math.floor(head.y / 20);
      const room = s.world.rooms[roomY] && s.world.rooms[roomY][roomX];
      trace.push({
        tick: i + 1,
        gameState: gs,
        headPos: `${head.x},${head.y}`,
        roomCoords: `(${roomX},${roomY})`,
        roomType: room ? room.type : '?',
        direction: JSON.stringify(s.direction),
        snakeLen: s.snake.length
      });
      if (gs !== 'playing') break;
    }
    return trace;
  });
  console.table(result);
  return result;
}
```

## Reading the Output

The trace table shows each tick's state. The critical signal is when `headPos` stops changing (snake stuck) or `gameState` changes unexpectedly.

### Real-world example: Boss room freeze

```
tick | gameState | headPos | roomCoords | roomType | direction
 1   | playing   | 71,41   | (3,2)      | boss     | {x:1,y:0}
 2   | playing   | 72,41   | (3,2)      | boss     | {x:1,y:0}
...
 8   | playing   | 78,41   | (3,2)      | boss     | {x:1,y:0}
 9   | playing   | 79,41   | (3,2)      | boss     | {x:1,y:0}  ← HIT RIGHT BORDER
10   | playing   | 79,41   | (3,2)      | boss     | {x:1,y:0}  ← STUCK
...
```

**Diagnosis:** Head at x=79 (the right border of a 20×20 world cell), room at (3,2), type=**boss** (80×80 tiles). The coordinate system mismatch: the world uses `ROOM_SIZE=20` but the boss room internal tiles are `BOSS_ROOM_SIZE=80`. `headPos` never progresses past x=79 because `checkRoomTransition` blocks movement (no RIGHT door on the boss room).

The head was placed at `(roomX*20+10, roomY*20+1)` by `changeDirection()`, then the snake's existing direction (RIGHT) moved it 8 cells to x=79. The room transition to room (4,2) fails because the boss room has no right door defined.

**Fix:** Don't reposition the head at all. Keep it at the entry door position. Set `nextDirection` to `{x:0, y:0}` so the snake waits for player input.

### Pattern: what to check for each freeze

| headPos behavior | Likely cause |
|-----------------|--------------|
| Stops at exact border (x=0, x=79, y=0, y=79) | Coordinate mismatch: ROOM_SIZE vs boss room size |
| Stops at random position | Collision with wall/enemy/self |
| Oscillates between 2 positions | Stuck handler flips direction |
| Never changes after tick 1 | Room transition blocked (no door) |
| Teleports to wildly different position | World coordinate overflow / wrong room calc |
