# Research: Boss intro Space/Enter crash

> Parent Issue: #142
> Agent: Hermes Agent (subagent)
> Date: 2026-07-12

---

### Research Options
- [x] 搜索 Obsidian 知识库（勾选后强制搜索，不受 depth 限制。如不勾选，仅 standard/deep 深度会自动搜索。）

---

## 1. Problem Definition

### Current Behavior

Pressing Space or Enter during the `bossIntro` game state causes the game to freeze. The snake dies on the next game tick because the head remains positioned on a `CELL.WALL` tile. Arrow keys work correctly and initiate the boss fight.

**Steps to reproduce:**
1. Play through the game until reaching the boss room
2. Enter the boss room → `gameState` transitions to `'bossIntro'`
3. Press Space or Enter → `gameState` transitions to `'playing'`
4. Next tick → `checkSnakeCollision()` reads `getCellAt(head)` → returns `CELL.WALL`
5. Snake dies (head collides with wall) → game over

The critical detail: the snake head enters the boss room at world grid position `(currentRoom.x * 20 + 10, currentRoom.y * 20 + 0)`, which maps to room-local `tiles[0][10]` — a `CELL.WALL` cell at the top border of the boss room.

### Expected Behavior

Both Space/Enter and arrow keys should initiate the boss fight, with the snake head repositioned to a `CELL.FLOOR` tile inside the boss room (specifically `tiles[1][10]`, one cell below the top border, at the horizontal center).

| Key | Action | Snake head repositioned? | Result |
|-----|--------|--------------------------|--------|
| Arrow keys | `changeDirection()` | ✅ Yes (to `tiles[1][10]`) | Fight starts normally |
| Space/Enter | Direct state mutation | ❌ No (stays at `tiles[0][10]` = WALL) | Crash on next tick |

### User Scenarios

- **Scenario A (Primary):** Any player reaching the boss room for the first time who presses Space/Enter to start the fight — the game crashes, making the boss appear broken or impossible to start
- **Scenario B (Keyboard exploration):** Player tries both Space/Enter and arrow keys — Space crashes, arrow keys work. Confusing and inconsistent UX
- **Scenario C (simulateKey callers):** Any external API caller using `__GAME_API__.simulateKey('Space')` — same crash, because `simulateKey` has the identical bug

---

## 2. Root Cause Analysis

### Code Path Divergence

Two code paths handle `bossIntro` dismissal, and they are **inconsistent**:

#### Path 1: Arrow Keys (Correct) — `changeDirection()` in `core.js:411-435`

```javascript
export function changeDirection(state, dir) {
  if (state.gameState === 'bossIntro') {
    const room = state.world ? getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y) : null;
    if (room && room.type === ROOM_TYPE.BOSS) {
      const spawnX = state.currentRoom.x * ROOM_SIZE + Math.floor(ROOM_SIZE / 2);
      const spawnY = state.currentRoom.y * ROOM_SIZE + 1;
      const head = { x: spawnX, y: spawnY };
      return {
        ...state,
        gameState: 'playing',
        snake: [head, ...state.snake.slice(1)],
      };
    }
  }
  // ...
}
```

This function:
1. Detects `bossIntro` game state
2. Verifies the room is a `BOSS` type
3. Repositions the snake head to `tiles[1][10]` = `CELL.FLOOR`
4. Returns the new state with `gameState: 'playing'`

The logic was deliberately designed to handle the wall-position problem (see comments at lines 414-416 in `core.js`).

#### Path 2: Space/Enter Keys (Broken) — Keyboard handler in `gameboy.html:415-421`

```javascript
if (state.gameState === 'bossIntro') {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    state = { ...state, gameState: 'playing' };
    render(ctx, state);
    return;
  }
}
```

This only sets `gameState = 'playing'`. **It does NOT move the snake head.** The head remains at the entry wall position, and the next tick kills the snake.

#### Path 3: `simulateKey()` (Also Broken) — `gameboy.html:313-322`

```javascript
simulateKey: (code) => {
  if (!state) return;
  if (code === 'Space' || code === 'Enter') {
    if (state.gameState === 'bossIntro') {
      state = { ...state, gameState: 'playing' };
    }
    // ...
  }
}
```

Same bug: only sets `gameState = 'playing'` without repositioning the snake.

#### Tick Function — `core.js:108-111`

```javascript
if (state.gameState === 'bossIntro') {
  return state;
}
```

The `tick()` function correctly passes through `bossIntro` without processing — the state transition must happen via the keyboard handler. This is sound design, but it means the keyboard handler **must** correctly prepare the snake position before setting `gameState = 'playing'`.

### Why Did This Bug Occur?

The boss room feature (Issue #127) introduced two separate handling paths:
1. `changeDirection()` was written to handle bossIntro dismissal correctly, because it was the explicit design contract: "arrow keys dismiss the intro and reposition the snake"
2. The Space/Enter keyboard handler was added later or in parallel, and the developer **forgot to apply the same repositioning logic** — likely because Space/Enter don't need direction change logic, so the handler took a simpler shortcut that missed the wall-position problem

Similarly, `simulateKey()` was written to mirror the keyboard handler and inherited the same bug.

### Reference: Obsidian Knowledge Base

From the existing REFERENCE cache (`docs/REFERENCE/boss-battle-design.md`, created 2026-07-11, fresh):

**Section 3.5 — Knowledge Gap for Boss Intro:**
> - `BOSS_INTRO` game state (similar to PAUSED but with boss dialog)
> - Player must press key to dismiss and start fight

The knowledge base correctly identifies the boss intro design pattern (pause + key dismiss). The bug is that the implementation of the key dismiss path (Space/Enter) is inconsistent with the directional key dismiss path. The design intent is clear: **any key dismisses the intro and repositions the snake**, but Space/Enter were not wired to the repositioning logic.

---

## 3. Impact Analysis

### Affected Code

| File | Lines | Function | Impact |
|------|-------|----------|--------|
| `public/gameboy.html` | 415-421 | Keyboard handler (`bossIntro` Space/Enter) | Directly buggy — skips head repositioning |
| `public/gameboy.html` | 313-322 | `simulateKey()` | Same bug — inherited from keyboard handler |
| `public/src/engine/core.js` | 411-435 | `changeDirection()` | **Already correct** — this is the fix target |
| `public/src/engine/core.js` | 108-111 | `tick()` | Not buggy — correctly passes through bossIntro |

### Risk Assessment

| Factor | Rating | Notes |
|--------|--------|-------|
| Reproduction rate | 100% | Every Space/Enter press in bossIntro crashes |
| User-facing | Critical | Blocks game completion for Space/Enter users |
| Fix complexity | Low | ~4 character change: replace direct mutation with `changeDirection()` call |
| Regression risk | Low | Reuses existing, tested `changeDirection()` logic |
| Test coverage | Existing | `changeDirection()` bossIntro path is already exercised by arrow-key tests |

### Priority

**P0 — Critical.** This is a game-blocking bug for any player who naturally presses Space/Enter to start the boss fight. Arrow keys are discovered only by trial and error, making this a significant UX failure.

---

## 4. Solution Recommendation

### Fix: Reuse `changeDirection()` for Space/Enter handler

Replace the direct state mutation in both the keyboard handler and `simulateKey()` with a call to `changeDirection(state, {x: 0, y: 1})`.

The argument `{x: 0, y: 1}` (downward direction) is a safe default — `changeDirection()` only checks `gameState === 'bossIntro'` at the top, repositions the head, and returns. The direction value itself doesn't matter for the first tick because the snake will be at `tiles[1][10]` where any direction is valid.

#### Change 1: `gameboy.html` keyboard handler (lines 415-421)

**Current (broken):**
```javascript
if (state.gameState === 'bossIntro') {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    state = { ...state, gameState: 'playing' };
    render(ctx, state);
    return;
  }
}
```

**Fixed:**
```javascript
if (state.gameState === 'bossIntro') {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    state = changeDirection(state, { x: 0, y: 1 });
    render(ctx, state);
    return;
  }
}
```

#### Change 2: `gameboy.html` simulateKey (lines 315-323)

**Current (broken):**
```javascript
if (code === 'Space' || code === 'Enter') {
  if (state.gameState === 'bossIntro') {
    state = { ...state, gameState: 'playing' };
  } else if (state.gameState === 'title') {
```

**Fixed:**
```javascript
if (code === 'Space' || code === 'Enter') {
  if (state.gameState === 'bossIntro') {
    state = changeDirection(state, { x: 0, y: 1 });
  } else if (state.gameState === 'title') {
```

### Why This Works

1. **Reuses existing tested logic** — `changeDirection()` already handles bossIntro correctly, including:
   - Verifying room type is BOSS
   - Repositioning snake head to `tiles[1][10]` (FLOOR)
   - Setting `gameState = 'playing'`
2. **Minimal change surface** — only 2 lines changed, no new code
3. **Consistent behavior** — Space/Enter now behave identically to arrow keys for bossIntro dismissal
4. **No regression risk** — `changeDirection()` is already called for arrow key input, so the path is well-exercised

### Rejected Alternatives

| Alternative | Reason Rejected |
|-------------|-----------------|
| Duplicate repositioning logic in keyboard handler | DRY violation — same logic duplicated in two places |
| Move repositioning logic to a separate function | Over-engineering for a 2-line fix; follow-up refactoring if more input handlers are needed |
| Fix in `tick()` instead | Wrong layer — tick is correct to pass through bossIntro; input handling is the keyboard's job |

---

## 5. Architecture Impact

### No architectural changes needed

This is a pure bug fix — no new files, no new exports, no new game states, no refactoring. The architecture already has the correct function (`changeDirection()`) and the correct state machine (`bossIntro → playing`). The fix simply connects the Space/Enter key path to the existing correct logic.

### Pre-investigation Findings

The pre-investigation (shared in the issue body) accurately identified:
1. The exact location of the bug (gameboy.html:415-421 and simulateKey at 316-317)
2. How `changeDirection()` correctly handles bossIntro dismissal (core.js:411-435)
3. The fix recommendation (replace direct mutation with `changeDirection()` call)

This PRD validates and elaborates on those findings with:
- Full code-path analysis showing the divergence
- The `simulateKey()` bug (also broken, same root cause)
- Impact analysis across all affected code paths
- Rejected alternatives analysis
- Connection to the Obsidian knowledge base (boss intro design patterns)

### Related Issues

- **#127** — Boss battle feature (introduced bossIntro state and changeDirection logic)
- **#132** — Boss room freeze (different root cause: coordinate scaling; same boss entry area)
