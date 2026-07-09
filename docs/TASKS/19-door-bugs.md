# Tasks: #19 — 一些门工作不正常 (Bug)

| 字段 | 值 |
|------|----|
| Issue | #19 |
| 优先级 | P0 |

## Overview

修复门通行问题。核心变更：扩大门通道宽度（3→5 格），重新排序碰撞检测顺序使房间过渡先于碰撞检测，增加门约束执行逻辑，以及生成器保护措施。Agent: research-agent → plan-agent, Date: 2026-07-07. Status: Research complete — ready for planning.

## Phase 1: Door Passage Redesign (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `generator.js` — `generateRoomTiles()` | Widen door passages from 3→5 cells. Change `mid ± 1` to `mid ± 2` for all 4 door directions (UP/DOWN/LEFT/RIGHT). Update `drawDoorIndicator()` in room renderer to match | 无 | P0 |
| 1.2 | `generator.js` — `generateRoomTiles()` | Add no-build zone around doors. Prevent interior wall placement within 2 cells of any door passage cell. Add wall coordinate validation before placement | 1.1 | P0 |
| 1.3 | `render/room.js` — `drawDoorIndicator()` | Match visual indicators to new 5-cell passage width. Keep arrow symbols centered | 1.1 | P0 |

## Phase 2: Collision Logic Rework (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `core.js` — `tick()` | Move `checkRoomTransition()` before `checkSnakeCollision()`. Apply room change to state before cell-type collision check | 无 | P0 |
| 2.2 | `collision.js` (new function) | Create `checkDoorPassable(state, doorDir)` that validates: locked (key in inventory), size gate (length >= required), direction (movement aligns with door) | 2.1 | P0 |
| 2.3 | `core.js` — `tick()` / `collision.js` | During active room transition, exclude body segments in the door passage of the previous room from self-collision check. Pass transition context through | 2.1 | P0 |
| 2.4 | `collision.js` — `checkRoomTransition()` | Only allow room transition if snake's movement direction aligns with the door direction. E.g., moving RIGHT → right door = pass; moving UP → right door = blocked | 2.1 | P0 |
| 2.5 | `core.js` — `tick()` | When a locked/size-gated door blocks passage, display message ("NEEDS KEY" / "NEEDS LENGTH N+") instead of silently blocking. Update game state with message | 2.2 | P0 |

## Phase 3: Generation Safeguards (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 3.1 | `generator.js` — `findEmptyFloorCell()` | Already checks `CELL.FLOOR` (door cells are `CELL.DOOR`), but add explicit door-cell exclusion for safety | 无 | P0 |
| 3.2 | `generator.js` — `spawnEnemyInRoom()` | Same safeguard as 3.1 for enemy placement | 无 | P0 |
| 3.3 | `generator.js` — `verifySolvability()` | Already partially implemented (bfsWithKeys), but ensure it correctly handles the new door width and no-build zones | 1.1, 1.2 | P0 |

## Phase 4: Testing (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `tests/metroidvania-snake.test.js` | Door transition test (normal): verify snake moves through right/left/up/down door → adjacent room updates | 2.1 | P0 |
| 4.2 | `tests/metroidvania-snake.test.js` | Door transition test (self-collision avoidance): long snake (15+ cells) through door → no self-collision death | 2.3 | P0 |
| 4.3 | `tests/metroidvania-snake.test.js` | Locked door test: without key → blocked; with key → passes | 2.2 | P0 |
| 4.4 | `tests/metroidvania-snake.test.js` | Size gate test: below min length → blocked; at/above → passes | 2.2 | P0 |
| 4.5 | `tests/metroidvania-snake.test.js` | Direction validation test: moving OUT of door direction = blocked; moving INTO door direction = passes | 2.4 | P0 |
| 4.6 | `tests/metroidvania-snake.test.js` | No-build zone test: verify interior walls are not placed within 2 cells of door passages | 1.2 | P0 |
| 4.7 | `tests/metroidvania-snake.test.js` | Edge: door at map boundary — room at map edge has no door outward → try to transition → blocked safely | 2.2 | P0 |
| 4.8 | `tests/metroidvania-snake.test.js` | Edge: all doors locked + no key — map regeneration ensures at least one unlockable path to goal | 3.3 | P0 |

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

## Dependency Graph

```
Phase 1 (Door Passage Redesign)
├─ 1.1 (widen passages 3→5) ──────────────┐
├─ 1.2 (no-build zone)       ←── 1.1       │
├─ 1.3 (door render indicators) ←── 1.1    │
                                            │
Phase 2 (Collision Logic Rework)            │
├─ 2.1 (reorder tick()) ───────────────────┤
├─ 2.2 (door constraints)    ←── 2.1       │
├─ 2.3 (self-collision protect) ←── 2.1    │
├─ 2.4 (direction validation) ←── 2.1      │
├─ 2.5 (blocked door feedback) ←── 2.2     │
                                            │
Phase 3 (Generation Safeguards)             │
├─ 3.1 (food door exclusion) ──────────────┤
├─ 3.2 (enemy door exclusion) ─────────────┤
├─ 3.3 (solvability verify)  ←── 1.1+1.2  │
                                            │
Phase 4 (Testing)                           │
├─ 4.1 (normal transition)   ←── 2.1       │
├─ 4.2 (self-collision)      ←── 2.3       │
├─ 4.3 (locked door)         ←── 2.2       │
├─ 4.4 (size gate)           ←── 2.2       │
├─ 4.5 (direction validation) ←── 2.4      │
├─ 4.6 (no-build zone)       ←── 1.2       │
├─ 4.7 (map boundary)        ←── 2.2       │
├─ 4.8 (all locked)          ←── 3.3       │
                                            │
All done ────────────────────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `generator.js` | 修改 | ±30 |
| `render/room.js` | 修改 | ±5 |
| `core.js` | 修改 | ±40 |
| `collision.js` | 修改 | ±30 |
| `tests/metroidvania-snake.test.js` | 修改 | +120 |
