# Design: #142 — Boss intro Space/Enter crash fix

> Parent Issue: #142
> Agent: plan-agent
> Date: 2026-07-12

---

## 1. Architecture Overview

### Core Idea

Replace direct state mutation in `gameboy.html`'s keyboard handler (Space/Enter branch) and `simulateKey()` with a call to `changeDirection(state, { x: 0, y: 1 })`. This reuses the existing, correct repositioning logic that arrow keys already use — the snake head is moved from `tiles[0][10]` (CELL.WALL) to `tiles[1][10]` (CELL.FLOOR) inside the boss room before setting `gameState = 'playing'`.

### Data Flow

```
   Space/Enter key press
          │
          ▼
    ┌─────────────────────────────────┐
    │  Keyboard handler / simulateKey  │
    │  (gameboy.html)                  │
    │  state.gameState === 'bossIntro' │
    └─────────┬───────────────────────┘
              │
       BEFORE (broken)        AFTER (fixed)
              │                      │
              ▼                      ▼
    (direct mutation)       changeDirection(state, {x:0, y:1})
              │                      │
              ▼                      ▼
    state.gameState =       ┌─────────────────────┐
    'playing'               │ core.js:411-435     │
    HEAD STAYS AT           │ Checks bossIntro    │
    tiles[0][10] = WALL     │ Finds BOSS room     │
              │             │ Repositions head to │
              ▼             │ tiles[1][10] = FLOOR│
        crash on next       │ Sets gameState to   │
        tick (snake dies)   │ 'playing'           │
                            └─────────┬───────────┘
                                      │
                                      ▼
                            Snake head on FLOOR
                            → fight starts normally
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fix location | Input handler (gameboy.html) | The bug is in the input path; the engine (core.js) already handles bossIntro correctly |
| Reuse changeDirection | Yes — call existing function | DRY: same repositioning logic already tested via arrow keys; no duplication |
| Default direction for fix | `{ x: 0, y: 1 }` (down) | Arbitrary safe default — `changeDirection()` ignores direction during bossIntro, only uses it for repositioning |
| New function extraction | No | Over-engineering for a 2-line fix; the implement agent may refactor later if more input sources are added |
| Fix in tick() instead | No | tick() correctly passes through bossIntro — the input handler is the right layer |

---

## 2. Engine Layer

### No Engine Changes Needed

The engine layer (`core.js`) already handles bossIntro dismissal correctly:

```
changeDirection() at core.js:411-435
  ├── Detects state.gameState === 'bossIntro'
  ├── Confirms room.type === ROOM_TYPE.BOSS
  ├── Calculates spawnX = currentRoom.x * ROOM_SIZE + floor(ROOM_SIZE / 2)
  ├── Calculates spawnY = currentRoom.y * ROOM_SIZE + 1
  ├── Creates new head at (spawnX, spawnY) = tiles[1][10] → CELL.FLOOR
  └── Returns new state with gameState = 'playing' + repositioned snake
```

The `tick()` function at core.js:108-111 correctly passes through `bossIntro` (returns state unchanged). This is sound — the input handler drives the state transition, and the engine only processes game ticks during `'playing'`.

### Data Flow Between Modules

- `gameboy.html` keyboard handler → imports `changeDirection` from `core.js`
- `gameboy.html` simulateKey → imports `changeDirection` from `core.js`
- `changeDirection()` → reads `state.world` via `getRoomAt()` (from `world.js`) → returns repositioned state

---

## 3. Entity Layer

### No Entity Changes Needed

No new entities required. The snake entity already exists and is modified by `changeDirection()` via the existing head-repositioning logic.

---

## 4. Data Layer

### No Data Changes Needed

No new constants, config values, palette entries, or save data schema changes. All necessary constants (`ROOM_SIZE`, `ROOM_TYPE.BOSS`, `CELL.FLOOR`) already exist and are used by `changeDirection()`.

---

## 5. Render Layer

### No Render Changes Needed

The render path is unaffected. `changeDirection()` returns a new state, which `render(ctx, state)` already renders correctly. The boss intro overlay (dialog text) is dismissed because `gameState` transitions from `'bossIntro'` to `'playing'`.

---

## 6. Input/UI Layer

### Affected Code

The bug exists in two code paths within `gameboy.html`:

#### Path A: Keyboard Event Handler (lines 415-421)

**Current (broken):**
```javascript
if (state.gameState === 'bossIntro') {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    state = { ...state, gameState: 'playing' };  // 🐛 No head repositioning
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
    state = changeDirection(state, { x: 0, y: 1 });  // ✅ Repositions head
    render(ctx, state);
    return;
  }
}
```

#### Path B: `simulateKey()` (lines 313-322)

**Current (broken):**
```javascript
simulateKey: (code) => {
  if (!state) return;
  if (code === 'Space' || code === 'Enter') {
    if (state.gameState === 'bossIntro') {
      state = { ...state, gameState: 'playing' };  // 🐛 No head repositioning
    }
```

**Fixed:**
```javascript
simulateKey: (code) => {
  if (!state) return;
  if (code === 'Space' || code === 'Enter') {
    if (state.gameState === 'bossIntro') {
      state = changeDirection(state, { x: 0, y: 1 });  // ✅ Repositions head
    }
```

### Key Bindings

| Action | Key | Context | Change |
|--------|-----|---------|--------|
| Dismiss boss intro | Space | `gameState === 'bossIntro'` | Behaves same as arrow keys now |
| Dismiss boss intro | Enter | `gameState === 'bossIntro'` | Behaves same as arrow keys now |
| Dismiss boss intro (move down) | ArrowDown | `gameState === 'bossIntro'` | Unchanged (already calls changeDirection) |
| Dismiss boss intro (move up) | ArrowUp | `gameState === 'bossIntro'` | Unchanged |
| Dismiss boss intro (move left) | ArrowLeft | `gameState === 'bossIntro'` | Unchanged |
| Dismiss boss intro (move right) | ArrowRight | `gameState === 'bossIntro'` | Unchanged |

### UI State Transitions

```
bossIntro ──Space/Enter──→ playing  (was: crash; fixed: works correctly)
bossIntro ──ArrowKey─────→ playing  (unchanged)
```

---

## 7. Implementation Phases

### Phase 1: Fix Keyboard Handler (gameboy.html:415-421)

| Aspect | Detail |
|--------|--------|
| Files | `public/gameboy.html` |
| Change | Replace `state = { ...state, gameState: 'playing' }` with `state = changeDirection(state, { x: 0, y: 1 })` in the Space/Enter branch of the keyboard handler (line 419) |
| Risk | Low — reuses well-tested `changeDirection()` function |
| Est. lines | 1 character change, ~1 effective line |

### Phase 2: Fix simulateKey() (gameboy.html:313-322)

| Aspect | Detail |
|--------|--------|
| Files | `public/gameboy.html` |
| Change | Same replacement in `simulateKey()` function (line 318): `state = changeDirection(state, { x: 0, y: 1 })` |
| Risk | Low — identical fix to the same bug in a parallel code path |
| Est. lines | 1 character change, ~1 effective line |

### Verification After Each Phase

Both phases change the same file and are trivially safe. They can be done in a single commit or split — no dependency between them (they're independent branches with the same bug and fix). Recommended: single commit with both fixes.

---

## 8. Test Layer

### Test Strategy: Bug-Documenting Tests (Strategy A)

Since the bug fix modifies existing behavior (Space/Enter in bossIntro), we use **bug-documenting tests** that capture the current broken behavior and post-fix expected behavior.

**Pitfall note:** The existing test at line 2809 (`key press dismisses boss intro → gameState = playing`) asserts `gameState = 'playing'` on key press but does NOT check whether the snake head was repositioned. That test is valid for the state transition but insufficient to catch the bug. Our new tests specifically verify head position.

### New Test Cases (to be added as a nested describe block)

#### Bug-Documenting Tests (assert current broken behavior)

| # | Test | What It Verifies |
|---|------|-----------------|
| T1 | `Space in bossIntro leaves head at WALL (BUG)` | Using `createInitialState` + manual `bossIntro` state setup, pressing Space only flips gameState — head position stays at `tiles[0][10]` = WALL. This documents the bug. |
| T2 | `Enter in bossIntro leaves head at WALL (BUG)` | Same as T1 but for Enter key. |
| T3 | `simulateKey('Space') in bossIntro leaves head at WALL (BUG)` | Same bug via the simulateKey API path. |

#### Regression Tests (assert correct behavior that must not change)

| # | Test | What It Verifies |
|---|------|-----------------|
| T4 | `ArrowDown dismisses bossIntro and repositions head to FLOOR` | Arrow keys continue to work correctly — `changeDirection()` repositions head. |
| T5 | `Space/Enter on title screen still calls startGame` | Space/Enter on title screen behavior is unaffected by the fix. |
| T6 | `Arrow keys still move snake during normal play` | Arrow key directional logic unchanged during 'playing' game state. |

#### Post-Fix Placeholders (describe.todo)

| # | Test | What Will Be Enabled |
|---|------|---------------------|
| T7 | `Space in bossIntro repositions head to FLOOR` | After fix: Space calls changeDirection, head moves to `tiles[1][10]` = FLOOR. |
| T8 | `Enter in bossIntro repositions head to FLOOR` | Same for Enter. |
| T9 | `simulateKey('Space') in bossIntro repositions head to FLOOR` | Same via simulateKey API. |

### Edge Cases to Cover

1. **Non-BOSS room with bossIntro state** — If `gameState = 'bossIntro'` somehow exists in a non-BOSS room, `changeDirection()` still safely transitions to 'playing' without crashing (returns `{...state, gameState: 'playing'}` at line 431-434).
2. **Rapid repeated Space presses** — Multiple Space presses during bossIntro: first press transitions to 'playing', subsequent presses are no-ops (handled by `gameState !== 'bossIntro'` guard in changeDirection).
3. **simulateKey called with null state** — simulateKey early-returns if `!state`; no crash.
4. **No world object** — changeDirection gracefully returns `{...state, gameState: 'playing'}` when `state.world` is null/undefined.

### Test Data Fixtures

Tests need a game state with:
- `gameState: 'bossIntro'`
- `currentRoom` set to a BOSS room's coordinates
- A BOSS room in the world at those coordinates
- The snake head at the BOSS room entry position (`tiles[0][10]`)

This can be achieved by creating a world with `generateWorldMap()`, finding the BOSS room, and constructing a state similar to the `minimalState()` helper.

---

## 9. Files Changed (Per-Layer Summary)

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Input/UI | `public/gameboy.html` | Replace direct state mutation with `changeDirection()` call in keyboard handler (Space/Enter) | +1 / -1 |
| Input/UI | `public/gameboy.html` | Same fix in `simulateKey()` function | +1 / -1 |
| Test | `tests/metroidvania-snake.test.js` | New describe block: bug-documenting tests, regression tests, post-fix placeholders | +80 |

### No changes to:

- `public/src/engine/core.js` — already correct
- `public/src/engine/constants.js` — no new constants
- `public/src/engine/world.js` — no changes needed
- Any other file outside `docs/DESIGN/` and `tests/`

---

## 10. Verification Checklist

- [ ] Bug-documenting tests pass on current `master` (confirm they capture the bug correctly)
- [ ] Regression tests pass — arrow key bossIntro dismissal still works
- [ ] Post-fix `describe.todo()` placeholder tests exist for the fix behavior
- [ ] All tests pass: `npm run test` (no new failures introduced)
- [ ] No files outside `docs/DESIGN/` and `tests/` were modified
- [ ] PR body is exactly `Parent #142` (no colon, no extra text)
- [ ] PR label is `workflow/plan`
- [ ] Design confirms the PRD's solution: reuse `changeDirection(state, { x: 0, y: 1 })`
