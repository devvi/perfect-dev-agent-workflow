# Boss Room Freeze — Diagnostic Reference

## The Three Root Causes of Boss Room Freeze

### Root Cause 1: Coordinate Conversion Not Room-Size-Aware (#132)

**Problem:** `worldToRoomCoords()` and `getCellAt()` use hardcoded `ROOM_SIZE = 20` for modular arithmetic. Boss room tiles are 80×80, so only the top-left 20×20 portion of the boss room was accessible.

**Symptom:** Snake enters boss room, immediately dies on CELL.WALL at tiles[0][10] because `getCellAt()` clamps cx,cy to [0,19] range.

**Also broken:** boss entity spawns at wrong world coords (generator.js used tile-local coords without room offset), pillars at positions > 19 never rendered, `renderRoom()` only iterated to 20.

**Fix:** Make `worldToRoomCoords()` and `getCellAt()` room-size-aware:
- `worldToRoomCoords(wx, wy, room)` — optional `room` param, use `room.tiles.length` for room size
- `getCellAt(world, wx, wy)` — internally reads `room.tiles.length` for bounds check
- `renderRoom()` — loop bound uses `room.tiles.length`
- `isDoorCell()` — uses `room.tiles.length/2` for mid calculation
- Boss entity coords: `bossWorldX = room.x * tiles.length + Math.floor(BOSS_ROOM_SIZE / 2)`

### Root Cause 2: direction/nextDirection Not Reset on BossIntro Dismissal (#142)

**Problem:** `changeDirection()` in core.js handles `gameState === 'bossIntro'` by repositioning the head to tiles[1][10] (FLOOR) and setting `gameState = 'playing'`, but does NOT reset `direction` or `nextDirection`. The snake retains whatever entry direction it was moving when it crossed the door.

**Symptom:** On the tick immediately after Space/Enter dismisses bossIntro, the snake moves back toward the wall it entered from. If the cell is WALL → stuck+reverse (5 tick freeze). If the cell is DOOR → room transition fires → `checkDoorPassable` blocks it (boss_door locked) → perma-freeze.

**Entry-direction dependence:**
| Entry Direction | newHead After Fix | Result |
|----------------|-------------------|--------|
| UP ({0,-1}) from below | tiles[0][10] | WALL or DOOR → freeze |
| DOWN ({0,1}) from above | tiles[2][10] | FLOOR → moves OK |
| RIGHT ({1,0}) from left | tiles[1][11] | FLOOR → moves OK |
| LEFT ({-1,0}) from right | tiles[0][9] | FLOOR or WALL → depends on room generation |

**Fix** — add to `changeDirection()` bossIntro branch:
```javascript
return {
  ...state,
  gameState: 'playing',
  snake: [head, ...state.snake.slice(1)],
  direction: { x: 0, y: 0 },
  nextDirection: { x: 0, y: 0 },
};
```

### Root Cause 3: Game Loop Not Restarted After Paused-State Dismissal (#142)

**Problem:** When `gameState` enters `'bossIntro'` (or any non-'playing' state), `scheduleNextTick()` refuses to schedule the next timeout:
```javascript
function scheduleNextTick() {
  if (!state || state.gameState !== 'playing') return;  // ← skips during bossIntro
  // ...
}
```
After Space/Enter dismisses bossIntro via `changeDirection()`, `gameState = 'playing'` but no tick has been scheduled. The game loop is DEAD.

**Symptom:** Snake head appears on screen (rendered by the one `render()` call after dismiss) but never moves. Direction keys only update `nextDirection` in the state object; no tick runs to apply the movement.

**Fix in `gameboy.html` keyboard handler:**
```javascript
if (state.gameState === 'bossIntro') {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    state = changeDirection(state, { x: 0, y: 1 });
    render(ctx, state);
    // CRITICAL: restart the game loop — entering bossIntro stopped it
    if (state.gameState === 'playing') {
      runTick();
    }
    return;
  }
}
```

**General rule:** ANY game state that pauses the game loop by being !'playing' must explicitly restart it when transitioning back to 'playing'. The keyboard handler that performs the state transition owns this responsibility.

### Why These Three Are Often Confused

| Issue | #132 (RC1) | #142-RC2 | #142-RC3 |
|-------|------------|----------|----------|
| Root cause | `getCellAt` uses ROOM_SIZE=20 for 80×80 boss tiles | `changeDirection` doesn't reset direction | Game loop stops, never restarts |
| Fix location | `world.js`, `collision.js`, `render/room.js` | `core.js` (changeDirection) | `gameboy.html` (keyboard handler) |
| Symptom | Head on WALL immediately | Head on FLOOR but moves back into wall on next tick | Head on FLOOR, visible, doesn't respond to input |
| Detection difficulty | Easy — crashes immediately | Medium — need to trace one tick | Hard — game renders fine, just no movement |

## Two Code Paths That Must Both Be Fixed

| Path | File | Status |
|------|------|--------|
| Keyboard handler (Space in bossIntro) | `gameboy.html` line 464-468 | Must call `changeDirection()` AND `runTick()` (NOT direct mutation) |
| `simulateKey('Space')` for E2E tests | `gameboy.html` line 362-367 | Must call `changeDirection()` (NOT `state = { ...state, gameState: 'playing', nextDirection: {0,0} }`) |

These two paths diverged during the #142 fix cycle (2026-07-12—13). At different points, one was fixed while the other was reverted — a classic self-heal overwrite bug.

## E2E Test Blind Spot: `api.tick(n)` Bypasses Game Loop Scheduling

The `api.tick(n)` helper in `__GAME_API__` calls `tick(state)` directly in a for-loop:
```javascript
tick: (n = 1) => {
  for (let i = 0; i < n; i++) {
    if (state) state = tick(state);  // Direct call, no scheduling
  }
  return state ? state.gameState : null;
}
```

**What this misses:**
- `scheduleNextTick()` / `runTick()` are NEVER exercised
- Game loop lifecycle bugs are invisible (e.g. loop stops after bossIntro, never restarts)
- The test sees tick results but doesn't verify the loop keeps running

**Workaround for E2E tests that need to verify game loop continuity:**
1. Use Playwright's `page.keyboard.press()` to simulate REAL keyboard input (which triggers the event handler including runTick)
2. OR add a separate `api.restartGameLoop()` helper for test setup
3. OR use `page.evaluate()` to inspect `gameLoop` and `gameRunning` variables
4. OR verify with a real keyboard sequence: press Space → wait 100ms → press Arrow → wait 200ms → check snake moved

**Always pair `api.tick(n)` tests with at least one keyboard-driven integration scenario.**

## Tick-by-Tick Trace

```javascript
// Paste into browser console while on gameboy.html with a game running:
const api = window.__GAME_API__;
if (!api || api.getState().gameState !== 'bossIntro') {
  console.log('Not in bossIntro state — enter a boss room first');
} else {
  api.simulateKey('Space');
  const trace = [];
  for (let i = 0; i < 30; i++) {
    api.tick(1);
    const s = api.getState();
    const head = s.snake[0];
    trace.push({
      tick: i,
      gs: s.gameState,
      head: `${head.x},${head.y}`,
      room: `${Math.floor(head.x/20)},${Math.floor(head.y/20)}`,
      dir: JSON.stringify(s.direction),
      ndir: JSON.stringify(s.nextDirection),
    });
    if (s.gameState !== 'playing') break;
  }
  console.table(trace);
}
// Key signal: if head stays at same position for > 2 ticks while gameState = 'playing' and direction changes, the issue is direction reset.
```

## Boss Room Geometry Quick Reference

| Property | Value | Notes |
|----------|-------|-------|
| World grid cell | 20×20 (ROOM_SIZE) | The boss room occupies one 20×20 world grid cell |
| Boss tile array | 80×80 (BOSS_ROOM_SIZE) | Room-local coordinate system |
| Standard door passages | `tiles[0][8..12]`, `tiles[79][8..12]`, etc. | Aligned to ROOM_SIZE mid (10), not BOSS_ROOM_SIZE mid (40) |
| BOSS_DOOR | `tiles[0][40]` | Decorative/exit-only; never used for entry |
| Pillars | `tiles[5][5]`, `tiles[74][5]`, `tiles[5][74]`, `tiles[74][74]` | Cells 5,5 / 74,5 / 5,74 / 74,74 |
| Snake spawn after intro | `tiles[1][10]` (FLOOR) | Always FLOOR regardless of entry direction |
