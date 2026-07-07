# Tasks: 一些门工作不正常 (Bug #19)

> Parent Issue: #19
> Agent: research-agent → plan-agent
> Date: 2026-07-07
> Status: Research complete — ready for planning

---

## Task List

### Phase 1 — Door Passage Redesign

| # | Task | File | Description | Dependencies |
|---|------|------|-------------|--------------|
| 1.1 | Widen door passages from 3→5 cells | `generator.js` - `generateRoomTiles()` | Change `mid ± 1` to `mid ± 2` for all 4 door directions (UP/DOWN/LEFT/RIGHT). Update `drawDoorIndicator()` in room renderer to match. | None |
| 1.2 | Add no-build zone around doors | `generator.js` - `generateRoomTiles()` | Prevent interior wall placement within 2 cells of any door passage cell. Add wall coordinate validation before placement. | 1.1 |
| 1.3 | Update door render indicators | `render/room.js` - `drawDoorIndicator()` | Match visual indicators to new 5-cell passage width. Keep arrow symbols centered. | 1.1 |

### Phase 2 — Collision Logic Rework

| # | Task | File | Description | Dependencies |
|---|------|------|-------------|--------------|
| 2.1 | Reorder collision/transition in tick() | `core.js` - `tick()` | Move `checkRoomTransition()` before `checkSnakeCollision()`. Apply room change to state before cell-type collision check. | None |
| 2.2 | Add door constraint enforcement | `collision.js` (new function) | Create `checkDoorPassable(state, doorDir)` that validates: locked (key in inventory), size gate (length >= required), direction (movement aligns with door) | 2.1 |
| 2.3 | Add self-collision protection | `core.js` - `tick()` / `collision.js` | During active room transition, exclude body segments in the door passage of the previous room from self-collision check. Pass transition context through. | 2.1 |
| 2.4 | Add direction validation for transitions | `collision.js` - `checkRoomTransition()` | Only allow room transition if snake's movement direction aligns with the door direction. E.g., moving RIGHT → right door = pass; moving UP → right door = blocked. | 2.1 |
| 2.5 | Add blocked door feedback | `core.js` - `tick()` | When a locked/size-gated door blocks passage, display message ("NEEDS KEY" / "NEEDS LENGTH N+") instead of silently blocking. Update game state with message. | 2.2 |

### Phase 3 — Generation Safeguards

| # | Task | File | Description | Dependencies |
|---|------|------|-------------|--------------|
| 3.1 | Ensure food never placed in door cells | `generator.js` - `findEmptyFloorCell()` | Already checks `CELL.FLOOR` (door cells are `CELL.DOOR`), but add explicit door-cell exclusion for safety. | None |
| 3.2 | Ensure enemies never placed in door cells | `generator.js` - `spawnEnemyInRoom()` | Same safeguard as 3.1 for enemy placement. | None |
| 3.3 | Verify solvability with locked doors | `generator.js` - `verifySolvability()` | Already partially implemented (bfsWithKeys), but ensure it correctly handles the new door width and no-build zones. | 1.1, 1.2 |

### Phase 4 — Testing

| # | Task | File | Description | Dependencies |
|---|------|------|-------------|--------------|
| 4.1 | Door transition test (normal) | `tests/metroidvania-snake.test.js` | Verify snake moves through right/left/up/down door → adjacent room updates | 2.1 |
| 4.2 | Door transition test (self-collision avoidance) | `tests/metroidvania-snake.test.js` | Long snake (15+ cells) through door → no self-collision death | 2.3 |
| 4.3 | Locked door test | `tests/metroidvania-snake.test.js` | Without key → blocked; with key → passes | 2.2 |
| 4.4 | Size gate test | `tests/metroidvania-snake.test.js` | Below min length → blocked; at/above → passes | 2.2 |
| 4.5 | Direction validation test | `tests/metroidvania-snake.test.js` | Moving OUT of door direction = blocked; moving INTO door direction = passes | 2.4 |
| 4.6 | No-build zone test | `tests/metroidvania-snake.test.js` | Verify interior walls are not placed within 2 cells of door passages | 1.2 |
| 4.7 | Edge: door at map boundary | `tests/metroidvania-snake.test.js` | Room at map edge has no door outward → try to transition → blocked safely | 2.2 |
| 4.8 | Edge: all doors locked + no key | `tests/metroidvania-snake.test.js` | Map regeneration ensures at least one unlockable path to goal | 3.3 |

---

## Notes for Plan Agent

### Critical Path
Phase 1 → Phase 2 → Phase 4 (must fix generation + collision before tests pass)

### Key Change: Collision Order
The single most impactful fix is reordering `tick()` so room transition is checked BEFORE collision detection. Currently:
```
newHead → checkSnakeCollision() [may return WALL for door cells]
          → checkRoomTransition() [too late, already dead]
```

Should be:
```
newHead → checkRoomTransition() [update room context first]
          → checkSnakeCollision() [now checks cells in correct room]
```

### Door Coordinate Reference
```
ROOM_SIZE = 20, mid = 10
Width change: 3 cells (rows 9-11) → 5 cells (rows 8-12)

Right door (room 0):    world (19, 8-12)  → local tiles[8-12][19]
Left door (room 1):      world (20, 8-12)  → local tiles[8-12][0]
Up door (room above):    local tiles[0][8-12]
Down door (room below):  local tiles[19][8-12]
```
