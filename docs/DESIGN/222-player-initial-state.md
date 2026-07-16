# DESIGN: Player Initial State Modification (Issue #222)

> Parent Issue: #222
> Agent: plan-agent
> Date: 2026-07-17
> Depth: light

---

## 1. Overview & Implementation

Modify the player's starting conditions to increase initial pressure and encourage early room transitions:

1. **Reduce starting snake length from 3 to 2 segments** — less health margin at spawn
2. **Place 2 enemies in the start room** — prevents idle safety, forces dodge-or-leave play

Both changes are minimal, leaf-level modifications (2-3 lines each) with no architectural impact.

### 1.1 Reduce Starting Snake Length

**File:** `public/src/engine/entities.js` (line 9-14)

Remove the third (tail) segment from `createSnake()`:

```js
// Current (3 segments):
export function createSnake(startWorldX, startWorldY) {
  return [
    { x: startWorldX, y: startWorldY },
    { x: startWorldX - 1, y: startWorldY },
    { x: startWorldX - 2, y: startWorldY },  // ← remove this line
  ];
}

// Changed (2 segments):
export function createSnake(startWorldX, startWorldY) {
  return [
    { x: startWorldX, y: startWorldY },
    { x: startWorldX - 1, y: startWorldY },
  ];
}
```

**Impact:** Player starts with 2 HP instead of 3. One hit → 1 HP remaining, second hit → game over.

### 1.2 Add 2 Enemies to Start Room

**File:** `public/src/engine/generator.js` (line 688-692)

Add enemy placement before the `continue` in the START room branch of `placeEnemiesAndItems()`:

```js
// Current:
if (room.type === ROOM_TYPE.START) {
  placeFoodInRoom(room, 3, world, rng);
  continue;
}

// Changed:
if (room.type === ROOM_TYPE.START) {
  placeFoodInRoom(room, 3, world, rng);
  // Place 2 enemies in start room to create initial pressure
  for (let e = 0; e < 2; e++) {
    const enemy = spawnEnemyInRoom(room, world, rng);
    if (enemy) room.entities.enemies.push(enemy);
  }
  continue;
}
```

**Enemy specs** (from `spawnEnemyInRoom`, unchanged): HP 1-3, speed every 2 ticks, chase range 20 cells, idle→chase AI.

### 1.3 Test Assertion Updates

**Files to update:**
- `tests/gameboy-snake.test.js:40` — `toHaveLength(3)` → `toHaveLength(2)`
- `tests/gameboy-snake.test.js:219` — `toHaveLength(3)` → `toHaveLength(2)`
- `tests/gameboy-vercel.test.js:115` — `toHaveLength(3)` → `toHaveLength(2)`
- `tests/gameboy-snake.test.js:42` — Remove assertion for `state.snake[2]` (no longer exists)

---

## 2. Boundary Conditions & Edge Cases

| # | Condition | Expected Behavior | Risk |
|---|-----------|-------------------|------|
| 1 | **Start room at (0,0)** | `spawnEnemyInRoom` uses `findEmptyFloorCell` — center 5×5 cleared, ample space for 2 enemies | Low |
| 2 | **No floor cells available** (start room fully obstructed) | `spawnEnemyInRoom` returns `null` → enemy silently skipped; food still placed | Low (graceful fallback) |
| 3 | **Safe map fallback** (`buildSafeMap()`) | Also calls `placeEnemiesAndItems()` → also gets 2 enemies + 2-segment snake | Low |
| 4 | **Multiple playthroughs (RNG variance)** | RNG controls *which* floor cells enemies spawn on, not *how many* (always 2) | Low |
| 5 | **Both enemies on same path** | Valid gameplay — harder corridor but still dodgeable | Low (playable) |
| 6 | **Enemy killed with projectiles** | Damage mechanics unchanged; enemies die normally, food reward works as usual | Low |
| 7 | **Snake length 0 from enemy hits** | Game over triggers correctly (existing logic at core.js:~290-293, ~356-359) | Low |
| 8 | **Food still present** | 3 food items in start room unchanged — eating grows snake back toward survivability | Low |

---

## 3. Test Plan

> **Design principle:** These are test case *descriptions*. The implement agent writes the actual runnable test code from these descriptions.

### Test Case 1: Normal Path — Snake Starts with 2 Segments

**Type:** Unit
**Focus:** Verify initial snake length

**Setup:**
1. Call `createInitialState()` (or `createSnake(10, 10)` directly)
2. Inspect the returned snake array

**Assertions:**
- `state.snake` has length 2
- `state.snake[0]` is the head at `{ x: 10, y: 10 }`
- `state.snake[1]` is the first body segment at `{ x: 9, y: 10 }`
- `state.snake[2]` does NOT exist (undefined)

### Test Case 2: Normal Path — Start Room Has 2 Enemies

**Type:** Integration
**Focus:** Verify enemy placement in start room

**Setup:**
1. Generate a world (e.g. `generateWorldMap()`) or build a minimal world with a START room
2. Call `placeEnemiesAndItems(world)`
3. Find the START room (room type `ROOM_TYPE.START`, typically at grid `(0,0)`)

**Assertions:**
- START room's `entities.enemies` array has length exactly 2
- Both enemies have valid `x`, `y` coordinates on floor cells
- Enemies are NOT overlapping each other (different positions)
- Enemies are NOT overlapping food items
- Food count in start room is 3 (unchanged)

### Test Case 3: Edge Case — Enemy Placement Failure (No Floor Cells)

**Type:** Unit/Integration
**Focus:** Graceful fallback when enemies can't spawn

**Setup:**
1. Construct a minimal world where the START room has zero floor cells available for enemies (e.g., all floor cells occupied by food or the room is tiny)
2. Call `placeEnemiesAndItems(world)`

**Assertions:**
- `spawnEnemyInRoom` returns `null` for each attempt
- The function does NOT throw an error
- Start room food is still placed (3 items)
- World generation completes without crashing

### Test Case 4: Edge Case — Safe Map Fallback

**Type:** Integration
**Focus:** Verify `buildSafeMap()` also uses the new behavior

**Setup:**
1. Call `buildSafeMap()` which internally calls `placeEnemiesAndItems()`
2. Find the START room

**Assertions:**
- START room has 2 enemies (same as normal path)
- Snake length is 2 (from `createSnake()`)

### Test Case 5: Regression — Existing Snake Manipulation Tests Still Pass

**Type:** Regression
**Focus:** Ensure existing tests that depend on snake length assertions are updated

**Setup:**
- Run the full test suite: `npx vitest run`

**Assertions:**
- `tests/gameboy-snake.test.js` — all tests pass (specifically the initial state and tick assertion tests)
- `tests/gameboy-vercel.test.js` — all tests pass (specifically the `createInitialState()` test)
- No test expects `snake.length === 3` or `state.snake[2]`

**Potential Pitfalls:**
- Some tests may check `toHaveLength(3)` indirectly (via snapshots or chained assertions) — grep for `snake.length.*3`, `toHaveLength(3)`, `toContainEqual.*snake` in all test files
- `tests/metroidvania-snake.test.js` may have implicit length=3 assumptions in room-transition tests

---

## 4. Files Modified

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Entity | `public/src/engine/entities.js:9-14` | `createSnake()` — remove one segment | -1 |
| Data/Gen | `public/src/engine/generator.js:688-692` | `placeEnemiesAndItems()` — add enemy loop in START case | +4 |
| Test | `tests/gameboy-snake.test.js:~40,42,219` | Update length assertions, remove snake[2] assertion | ~4 |
| Test | `tests/gameboy-vercel.test.js:~115` | Update length assertion | +1 |
| Test | (potential) `tests/metroidvania-snake.test.js` | Update any implicit length=3 assertions if found | TBD |

---

## 5. Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Enemy count | Exactly 2 | Matches issue requirement. Too few (1) = trivial, too many (3+) = overwhelming with 2 HP |
| Enemy placement function | `spawnEnemyInRoom` (existing) | Reuses proven logic for floor-cell placement, collision-free positioning, and RNG-based variant selection. No new helper needed |
| Food count in start room | Unchanged (3) | Preserves ability to recover HP by eating. If food were reduced, the start room would feel unfair |
| Snake length reduction | Remove tail only | Head and first body segment define facing direction — removing either breaks movement logic. Only the tail is additive |
| `buildSafeMap()` | Affected automatically | Same function `placeEnemiesAndItems()` is called — no separate handling needed |

---

## 6. Verification Checklist

- [ ] `createSnake(10, 10)` returns array of length 2
- [ ] `createInitialState().snake` has length 2
- [ ] Generated world's START room has exactly 2 enemies in `entities.enemies`
- [ ] Enemies are on floor cells (not overlapping walls/obstacles)
- [ ] Safe map fallback (`buildSafeMap()`) also produces 2-enemy start rooms
- [ ] No existing test expects snake length = 3 (all updated)
- [ ] Full test suite passes: `npx vitest run`
