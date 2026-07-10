# Design: #113 — [Bug] 隐形墙致死 (Invisible Wall Death)

> Parent Issue: #113
> Agent: plan-agent
> Date: 2026-07-10

---

## 1. Architecture Overview

### Core Idea
Room/cell data inconsistencies — specifically `getCellAt()` returning `CELL.WALL` as a hardcoded default when a room lookup returns null, and room transition data not being fully reset — cause the snake to collide with invisible obstacles. The fix must ensure (1) `getCellAt()` never returns a wall collision for positions that have no visual wall, (2) room transitions properly clean and reinitialize collision tile data, and (3) all WALL cells in tile data have a corresponding visual render.

### Root Causes Identified
1. **`getCellAt()` null-room fallback** (`world.js:90`): When `getRoomAt()` returns null for a coordinate (e.g., at world boundaries, during room transition edge cases), `getCellAt()` returns `CELL.WALL` — but `renderRoom()` exits early when the room is null, so the wall is invisible.
2. **Room transition tile initialization**: Room `tiles` are set only once during map generation. If a room's tiles are corrupted or if stale data persists through room transitions, interior cells may be WALL when they should be FLOOR.
3. **Border walls vs door passages**: `generateDefaultTiles()` sets ALL border cells to CELL.WALL. Door passages override these to CELL.DOOR, but if a door connection is missing or mismatched, the border remains WALL while the adjacent room shows a door — creating a one-way invisible wall.

### Data Flow
```
Snake moves → newHead coords calculated → checkRoomTransition() (room context)
  → checkSnakeCollision() via getCellAt(world, x, y)
    → worldToRoomCoords() → getRoomAt()
      → if room is null → returns CELL.WALL (BUG: invisible)
      → if room exists → checks room.tiles[cy][cx]
        → if WALL → 'damage' collision → stuck + HP loss
        → if FLOOR/DOOR → passable

Render flow:
  renderRoom() → getRoomAt()
    → if room is null → returns early (nothing drawn — invisible)
    → if room exists → renders tiles from room.tiles[cy][cx]
      → every CELL type has a visual case (no mismatch possible for valid rooms)
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `getCellAt()` null fallback | Return `CELL.FLOOR` instead of `CELL.WALL` | Coordinates outside any valid room should not be deadly — they should be passable (or handled upstream as world bounds) |
| Room transition tile integrity | Add defensive tile reinitialization on room entry | Ensure every room's tiles match its door configuration on every transition, not just at generation time |
| Border wall consistency | Validate door ↔ tile consistency during generation and on load | Prevent one-way invisible walls from mismatched door/tile data |
| Project structure | Fixes contained to `world.js`, `collision.js`, `core.js`, `room.js` | Minimal surface area — no new modules needed |

---

## 2. Engine Layer 变更

### 2.1 `world.js` — `getCellAt()` null guard

**Change:** Replace `CELL.WALL` null-room fallback with `CELL.FLOOR`.

```js
// Before (world.js ~line 89-90):
export function getCellAt(world, wx, wy) {
  const { rx, ry, cx, cy } = worldToRoomCoords(wx, wy);
  const room = getRoomAt(world, rx, ry);
  if (!room) return CELL.WALL;  // ← BUG: invisible death wall
  ...
}

// After:
export function getCellAt(world, wx, wy) {
  const { rx, ry, cx, cy } = worldToRoomCoords(wx, wy);
  const room = getRoomAt(world, rx, ry);
  if (!room) return CELL.FLOOR;  // ← FIX: safe passable default
  ...
}
```

### 2.2 `core.js` — Room transition defensive tile reinit

**Change:** When entering a new room, verify tiles are consistent with room doors. If a door exists but the border tile is CELL.WALL, fix it to CELL.DOOR.

```js
// In tick(), after room transition (~line 176):
function ensureTileConsistency(room) {
  // If room has a door in a direction but the border tile at that
  // position is still WALL (not DOOR), fix it to prevent invisible barriers
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      const mid = Math.floor(ROOM_SIZE / 2);
      if (dir === 'up') {
        for (let dx = -2; dx <= 2; dx++)
          if (tiles[0][mid + dx] === CELL.WALL) tiles[0][mid + dx] = CELL.DOOR;
      } else if (dir === 'down') { ... }
      ...
    }
  }
}
```

### 2.3 `collision.js` — Damage handling clarification

**Change:** Add a guard in `checkSnakeCollision()` to ensure wall-type cells that don't have a visual counterpart are treated as FLOOR. If `getCellAt()` returns WALL but the room doesn't render a wall there (room is null), the collision should not be 'damage'.

This is handled by the `getCellAt()` fix above — since `getCellAt()` returns FLOOR for null rooms, `checkSnakeCollision()` will correctly report no wall collision.

### State Additions

```js
// No new state fields needed.
// The fix is purely defensive logic in existing functions.
```

### Game Loop Changes (`core.js`)
- `tick()`: Add `ensureTileConsistency()` call after room transition
- No new update functions; purely data integrity fixes

---

## 3. Entity Layer 变更

No entity changes required.

### World / Map Changes
No world structure changes. All fixes are in the behavior of existing functions.

---

## 4. Data Layer 变更

### New Constants
No new constants.

### Save Data Changes
No save data changes.

---

## 5. Render Layer 变更

### 5.1 `room.js` — Render null-room guard

**Change:** `renderRoom()` already returns early when room is null (line 14). No change needed — the fix in `getCellAt()` ensures snake doesn't collide with null-room areas.

No other render changes needed.

---

## 6. Input / UI Layer 变更

No input or UI changes.

---

## 7. Test Layer 变更

### 7.1 Test Structure

| # | Test File | Focus |
|---|-----------|-------|
| 1 | `tests/invisible-wall.test.js` (new) | All invisible wall scenarios |

### 7.2 Coverage Requirements

| Area | Normal Path | Edge Cases | Failure Paths |
|------|-------------|------------|---------------|
| `getCellAt` null room fallback | ✅ | ≥3 | ✅ |
| Room transition tile consistency | ✅ | ≥2 | ✅ |
| Door vs tile consistency | ✅ | ≥2 | ✅ |
| Render matching collision | ✅ | ≥2 | ✅ |
| No regression on existing collision | ✅ | ≥1 | ✅ |

---

## 8. Implementation Phases

### Phase 1: `getCellAt()` null guard (core fix)
**Files:** `public/src/engine/world.js`
- Change `CELL.WALL` to `CELL.FLOOR` fallback in `getCellAt()`
- Verify all tests still pass
- **Risk:** Low — minimal change, highly targeted

### Phase 2: Room transition tile consistency (defensive)
**Files:** `public/src/engine/core.js`
- Add `ensureTileConsistency()` called after room transition in `tick()`
- Verify doors always have matching CELL.DOOR tiles
- **Risk:** Low — only runs during transitions, idempotent

### Phase 3: Test coverage
**Files:** `tests/invisible-wall.test.js` (new)
- Test all edge cases from PRD + design doc
- Verify with existing test suite (`npm run test`)
- **Risk:** Low — tests only, no production code changes

---

## 9. Test Specifications

### Normal Path Tests
1. **Snake passes through null-room areas**: Create state with null room at position, ensure `getCellAt()` returns FLOOR not WALL
2. **Snake reverses on real WALL**: Verify CELL.WALL still causes collision → 'damage' → stuck+reverse
3. **Door cells passable**: CELL.DOOR cells don't trigger wall collision

### Edge Case Tests
1. **`getCellAt()` null-room → FLOOR**: Direct unit test of `getCellAt()` with null world
2. **`getCellAt()` null-room → FLOOR (different coord)**: Same test at a different coordinate to confirm non-flaky
3. **Room border cells not invisible**: Every border cell of a generated room is either WALL (rendered) or DOOR (connected) — never WALL without render
4. **Door-less room has all-WALL border, all rendered**: Room with no doors should have CELL.WALL on all border cells, each visually rendered

### Failure Path Tests
1. **Room with corrupted tiles degrades gracefully**: Set a room's tiles to a partial array — ensure snake doesn't die from invisible wall
2. **Rapid room transitions**: Simulate high-frequency room switching — verify no stale collision data persists
3. **Null room on render doesn't crash**: renderRoom called with null game room doesn't throw

---

## 10. Files Changed（按層匯總）

### Engine Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/engine/world.js` | `getCellAt()`: null-room fallback `CELL.WALL` → `CELL.FLOOR` | ±1 |
| `public/src/engine/core.js` | Add `ensureTileConsistency()` after room transition | ±25 |

### Test Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/invisible-wall.test.js` | New test suite: all invisible wall scenarios | ±120 |

---

## 11. Verification Checklist

- [ ] `getCellAt()` returns `CELL.FLOOR` for null rooms (not `CELL.WALL`)
- [ ] Room transition properly ensures door ↔ tile consistency
- [ ] Snake passing through null-room areas doesn't take damage
- [ ] Real CELL.WALL cells still cause stuck+reverse
- [ ] All border cells in any room are either WALL or DOOR
- [ ] No regression on door-bug-fix.test.js (door pair correctness)
- [ ] No regression on metroidvania-snake.test.js (all phases)
- [ ] No regression on existing collision behavior
- [ ] All pre-existing tests still pass
