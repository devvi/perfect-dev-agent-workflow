# Plan: 一些门工作不正常 — Door Death Bug Fix

> Issue: #19
> Agent: plan-agent
> Date: 2026-07-07
> Branch: `plan/19-door-death-bug`
> Base: master

---

## 1. Overview

某些门在蛇进入时会导致立即死亡（"像撞到了墙上"），而其他门正常工作。根本原因是 `addRandomDoors()` 中的 Fisher-Yates 洗牌破坏了成对的门方向关联，导致出现"单向门"——房间 A 显示有门通向房间 B，但房间 B 的对应位置仍然是墙壁 tiles。

本计划采用**Approach A（完整修复）**，涵盖生成、碰撞和游戏机制三层。

### 设计决策

- **Approach A（推荐）**：修复 `addRandomDoors()` 配对问题 + 加宽门通道 + 门口保留洁净区 + 门约束检查 + 方向验证
  - 改动 3-4 个文件，预计开发时间 2-3 小时
  - 全面解决所有门相关 bug，防止未来类似问题

---

## 2. Detailed Implementation

### Phase 1: Fix `addRandomDoors()` — Shuffle pairs, not individual keys

**File:** `public/src/engine/generator.js`
**Function:** `addRandomDoors()` (lines ~143-178)

**Problem:** The current code builds `allPossible` as a flat array `[key1_A, key2_A, key1_B, key2_B, ...]`, then shuffles all individual keys and picks pairs `(0,1), (2,3), ...`. After shuffle, index 0 and 1 may be keys from different door pairs, creating mismatched one-way doors.

**Fix:** Refactor to store door pairs as objects and shuffle pairs, always adding both directions together.

**Current code (lines ~149-178):**

```js
export function addRandomDoors(tree, cols, rows, rng = Math.random, density = 0.3) {
  const edges = new Set(tree);
  const allPossible = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1) {
        const key1 = `${x},${y}:right`;
        const key2 = `${x+1},${y}:left`;
        if (!edges.has(key1) && !edges.has(key2)) {
          allPossible.push(key1, key2);
        }
      }
      if (y < rows - 1) {
        const key1 = `${x},${y}:down`;
        const key2 = `${x},${y+1}:up`;
        if (!edges.has(key1) && !edges.has(key2)) {
          allPossible.push(key1, key2);
        }
      }
    }
  }

  // Shuffle — BUG: shuffles individual keys, breaking pairs
  for (let i = allPossible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allPossible[i], allPossible[j]] = [allPossible[j], allPossible[i]];
  }

  const count = Math.floor(allPossible.length / 2 * density);
  for (let i = 0; i < count && i < allPossible.length; i += 2) {
    edges.add(allPossible[i]);
    if (i + 1 < allPossible.length) {
      edges.add(allPossible[i + 1]);
    }
  }

  return edges;
}
```

**New code:**

```js
export function addRandomDoors(tree, cols, rows, rng = Math.random, density = 0.3) {
  const edges = new Set(tree);
  const doorPairs = []; // Array of { key1, key2 } objects

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1) {
        const key1 = `${x},${y}:right`;
        const key2 = `${x+1},${y}:left`;
        if (!edges.has(key1) && !edges.has(key2)) {
          doorPairs.push({ key1, key2 });
        }
      }
      if (y < rows - 1) {
        const key1 = `${x},${y}:down`;
        const key2 = `${x},${y+1}:up`;
        if (!edges.has(key1) && !edges.has(key2)) {
          doorPairs.push({ key1, key2 });
        }
      }
    }
  }

  // Shuffle pairs (safe: pairs stay intact)
  for (let i = doorPairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [doorPairs[i], doorPairs[j]] = [doorPairs[j], doorPairs[i]];
  }

  const count = Math.floor(doorPairs.length * density);
  for (let i = 0; i < count && i < doorPairs.length; i++) {
    edges.add(doorPairs[i].key1);
    edges.add(doorPairs[i].key2);
  }

  return edges;
}
```

**Verification:** After fix, run the test suite. The `addRandomDoors()` unit test should verify that for all generated maps, every door key in `edges` has its matching reverse key also present.

---

### Phase 2: Widen door passages from 3 cells to 5 cells

**File:** `public/src/engine/generator.js`
**Function:** `generateRoomTiles()` (lines ~368-395)

**Problem:** Doors are only 3 cells wide (`mid-1, mid, mid+1`). When the snake is long, its body must squeeze through a narrow gap, making self-collision likely.

**Fix:** Change the door passage from `[mid-1, mid, mid+1]` to `[mid-2, mid-1, mid, mid+1, mid+2]`.

**Current code (lines ~372-394):**

```js
for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      const mid = Math.floor(ROOM_SIZE / 2);
      if (dir === 'up') {
        for (let dx = -1; dx <= 1; dx++) {
          tiles[0][mid + dx] = CELL.DOOR;
        }
      } else if (dir === 'down') {
        for (let dx = -1; dx <= 1; dx++) {
          tiles[ROOM_SIZE - 1][mid + dx] = CELL.DOOR;
        }
      } else if (dir === 'left') {
        for (let dy = -1; dy <= 1; dy++) {
          tiles[mid + dy][0] = CELL.DOOR;
        }
      } else if (dir === 'right') {
        for (let dy = -1; dy <= 1; dy++) {
          tiles[mid + dy][ROOM_SIZE - 1] = CELL.DOOR;
        }
      }
    }
  }
```

**New code — replace `-1..1` with `-2..2`:**

```js
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
```

**Verification:** Visually inspect door passage width in rendered game. Verify snake of length up to ~10 can pass through doors without self-collision.

---

### Phase 3: Add 1-cell clear zone around doors (prevent wall blocks)

**File:** `public/src/engine/generator.js`
**Function:** `generateRoomTiles()` — wall placement loop (lines ~397-414)

**Problem:** Interior walls can be placed at positions right next to door passages (e.g., `wx=17, wy=mid` can block approach to right-side door at `cx=19`).

**Fix:** After placing door cells, mark adjacent cells as protected. Then in the wall placement loop, skip protected cells.

**Add after door placement (after the door loop, before wall loop):**

```js
  // Mark cells adjacent to doors as protected (prevent wall placement)
  const protectedCells = new Set();
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      const mid = Math.floor(ROOM_SIZE / 2);
      if (dir === 'up') {
        for (let dx = -2; dx <= 2; dx++) {
          protectedCells.add(`1,${mid+dx}`); // cell just below top door
          if (mid+dx-1 >= 0) protectedCells.add(`0,${mid+dx-1}`);
          if (mid+dx+1 < ROOM_SIZE) protectedCells.add(`0,${mid+dx+1}`);
        }
      } else if (dir === 'down') {
        for (let dx = -2; dx <= 2; dx++) {
          protectedCells.add(`${ROOM_SIZE-2},${mid+dx}`); // cell just above bottom door
        }
      } else if (dir === 'left') {
        for (let dy = -2; dy <= 2; dy++) {
          protectedCells.add(`${mid+dy},1`); // cell just right of left door
        }
      } else if (dir === 'right') {
        for (let dy = -2; dy <= 2; dy++) {
          protectedCells.add(`${mid+dy},${ROOM_SIZE-2}`); // cell just left of right door
        }
      }
    }
  }
```

**Modified wall placement loop:**

```js
  // Add some interior walls for cover
  const wallCount = 3 + Math.floor(rng() * 5);
  for (let i = 0; i < wallCount; i++) {
    const wx = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
    const wy = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
    // Skip protected cells (door approaches), center spots, and occupied tiles
    const isCenter = wx === Math.floor(ROOM_SIZE / 2) && wy === Math.floor(ROOM_SIZE / 2);
    if (!isCenter && tiles[wy][wx] === CELL.FLOOR && !protectedCells.has(`${wy},${wx}`)) {
      // Small clusters
      const len = 1 + Math.floor(rng() * 3);
      for (let j = 0; j < len; j++) {
        const px = wx + (j % 2);
        const py = wy + Math.floor(j / 2);
        if (py < ROOM_SIZE - 1 && px < ROOM_SIZE - 1
            && tiles[py][px] === CELL.FLOOR
            && !protectedCells.has(`${py},${px}`)) {
          tiles[py][px] = CELL.WALL;
        }
      }
    }
  }
```

**Verification:** Generate 100 maps and verify no wall cell is within 1 cell of any door passage.

---

### Phase 4: Validate room transition direction against door direction

**File:** `public/src/engine/collision.js`
**Function:** `checkRoomTransition()` (lines ~109-130)

**Problem:** Room transition only checks if world coordinates changed rooms. It allows transition through any boundary edge, even if that edge doesn't have a matching door on either side (the snake crosses the world boundary at a non-door cell).

Wait — actually, if the snake tries to cross a WALL boundary, `checkSnakeCollision()` returns `['wall']` first, which sets `gameState = 'gameover'`. So this isn't the primary issue.

The real problem from Phase 1 is: room A's door exists (so tiles show DOOR cells), but room B's matching door does NOT exist (so tiles remain WALL at that position). When `checkSnakeCollision()` runs **before** `checkRoomTransition()`, the snake is at coord B(0, mid) which is CELL.WALL → death.

However, there is still an ordering issue to fix: the door validation should be strengthened.

**Fix:** Add a door-direction validation in `checkRoomTransition()` (or in `tick()`) to verify the snake is using an actual door, not just crossing a room boundary at a non-door position.

Since the Phase 1 fix already ensures both sides have door tiles, we should also add an extra safety check: **ensure `checkSnakeCollision()` is called AFTER the room transition check, not before.** This way, if the snake's new head is at a DOOR cell in the new room, it transitions first before collision can kill it.

**Current order in `tick()` (core.js):**
1. Calculate new head position
2. `checkSnakeCollision()` → `['wall']` → gameover ← **BUG: runs before room transition**
3. `checkRoomTransition()` ← too late

**Fix in core.js:** Move the wall/death collision check to after room transition, or better yet, skip the WALL check for cells that are at room boundary and correspond to a door in the current room.

**But wait** — the cleaner approach is: in `checkSnakeCollision()`, when we detect CELL.WALL, check if this cell is at a valid door position and the room's door data structure says there's a door there. If so, treat it as `['door']` instead.

Actually, let me re-think. The simplest fix that covers the core issue is:

In `checkSnakeCollision()`, when we get `cellType === CELL.WALL`, check if this cell is on the room boundary AND part of a door passage. If the cell is at a position that *should* be a door in the target room (i.e., the snake is transitioning into it), let it pass through as `['door']`.

But this is complex. Let me reconsider.

**Simpler approach:** The root cause is Phase 1 (mismatched pairs). Once Phase 1 is fixed, both sides will have DOOR cells, so `getCellAt()` will return `CELL.DOOR` instead of `CELL.WALL`, and the collision check will naturally include `'door'`. The existing code already handles `CELL.DOOR` as not-lethal.

So **Phases 1-3 alone may be sufficient.** Phase 4 is an additional safety net.

**For safety, add this in `checkSnakeCollision()`** — when the cell is WALL and the snake is at a room boundary, check if the *other* room has a door there (it might be a tile mismatch):

```js
  // Check cell type
  let cellType = -1;
  if (world) {
    cellType = getCellAt(world, head.x, head.y);
  }
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
    // Safety: Check if this is a door in the source room (mismatched pair workaround)
    if (world) {
      const { rx, ry, cx, cy } = worldToRoomCoords(head.x, head.y);
      const room = getRoomAt(world, rx, ry);
      if (room && isDoorCell(room, cx, cy)) {
        // This is a wall cell that SHOULD be a door — let it pass
        // (defensive coding for any remaining generation edge cases)
      } else {
        return ['wall'];
      }
    } else {
      return ['wall'];
    }
  }
```

And add a helper function `isDoorCell(room, cx, cy)`:

```js
function isDoorCell(room, cx, cy) {
  // Check if this cell position is part of a door in the room's data structure
  const mid = Math.floor(ROOM_SIZE / 2);
  if (cy === 0 && room.doors.up) {
    return cx >= mid - 2 && cx <= mid + 2;
  }
  if (cy === ROOM_SIZE - 1 && room.doors.down) {
    return cx >= mid - 2 && cx <= mid + 2;
  }
  if (cx === 0 && room.doors.left) {
    return cy >= mid - 2 && cy <= mid + 2;
  }
  if (cx === ROOM_SIZE - 1 && room.doors.right) {
    return cy >= mid - 2 && cy <= mid + 2;
  }
  return false;
}
```

This ensures that even if something goes wrong in generation, the snake won't die on what should be a door cell.

---

### Phase 5: Unit Tests

**File:** `tests/generator.test.js` (or create `tests/door-bug-fix.test.js`)

Add tests to verify:

1. **`addRandomDoors()` pairing correctness:** After fix, for any generated map, verify that for every `"x,y:dir"` door key in edges, the matching reverse `"nx,ny:oppositeDir"` is also in edges. Run this for 500 random seeds.

2. **Door tile symmetry:** For any generated map, verify that if room A at `(x,y)` has a door in direction `dir`, then the adjacent room B at `(nx,ny)` has a door in the opposite direction, AND the tiles at both door positions are `CELL.DOOR`.

3. **Wall avoidance:** Verify that no interior wall is placed within 1 cell of any door passage.

4. **Door passage width:** Verify door passages are 5 cells wide.

5. **Traversal test:** Simulate snake approach toward each door and verify no wall collision at door cells.

---

## 3. Files Changed

| File | Lines | Change | Risk |
|------|-------|--------|------|
| `public/src/engine/generator.js` | 149-178 (addRandomDoors) | Shuffle pairs instead of individual keys | **Medium** — core generation change |
| `public/src/engine/generator.js` | 372-394 (generateRoomTiles door) | Widen doors from 3→5 cells | **Low** |
| `public/src/engine/generator.js` | 395-414 (wall placement) | Add protected cells around doors | **Low** |
| `public/src/engine/collision.js` | 33-38 (checkSnakeCollision) | Add `isDoorCell()` fallback for mismatched tile defense | **Low** |
| `tests/generator.test.js` (new) | full file | Verify door symmetry, wall avoidance | **Low** |

---

## 4. Verification Plan

1. **`npm test`** — all existing tests pass
2. **Manual gameplay** — generate 10+ maps, walk through every door in each, verify no unexpected death
3. **Edge cases:**
   - First door always works (start room exits)
   - Corner room doors work
   - Long snake (length 10+) can pass through 5-cell wide doors
   - Locked doors (from key/lock system) still display and function correctly
4. **Browser dev console** — no errors; door cell types show as CELL.DOOR (3) on both sides

---

## 5. Rollback Plan

If the fix causes regression (e.g., maps fail generation, doors become invisible, tests fail):
- Phase 1 is the only change that could affect generation correctness; revert `addRandomDoors()` but keep the test changes
- Phases 2-3 are purely additive and low-risk
- Phase 4 is defensive and has no effect if generation is correct

**Quick rollback:** `git revert <commit-hash>`
