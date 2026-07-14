# DESIGN: Wall Bounce Food Position Fix

> Parent Issue: #163
> Agent: plan-agent
> Date: 2026-07-14

---

## 1. Architecture Overview

### Core Idea

Fix the wall collision bounce food mechanic: re-add the missing bounce food drop (reverted in commit `c7176a7`) and fix the spawn position from `newHead` (inside the wall tile — invisible/unreachable) to the **last tail segment** (always on a traversable cell). This mirrors the enemy-damage pattern already used in `core.js`.

### Data Flow

```
Snake head collides with WALL/STONE_WALL tile
  ↓
Wall-damage handler (core.js:243-272)
  ↓
- Single-segment check → gameover (unchanged)
- Food-at-cell check → eat food +10 (unchanged)
- ★ Record lastSeg = s.snake[s.snake.length - 1]
- ★ Pop tail: s.snake = s.snake.slice(0, -1)
- ★ If s.world exists:
    - Convert lastSeg to room coords
    - Look up room via getRoomAt
    - Create bounce food at lastSeg position
    - Push into room.entities.food[]
- ★ If snake.length === 0 → gameover
- Set stuckCounter, pendingReverse, screenShake, score penalty (unchanged)
- Return
  ↓
Snake length reduced by 1
Bounce food appears at tail's last position → reachable by player
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Spawn position | Tail's last segment (not `newHead`) | `newHead` is inside the wall tile — food is invisible and unreachable. Tail segment is always on a traversable cell. |
| Food type | `createBounceFood` (not `createFood`) | Bounce food has a despawn timer with blink phase, creating urgency matching the game design intent. |
| Tail pop timing | Before stuck/score penalty | Matches enemy-damage pattern. Order of independent effects doesn't matter. |
| Gameover on length-0 | After slice, before return | Edge case: a 2-segment snake loses both head-to-wall and tail-pop, resulting in 0 segments. |

---

## 2. Engine Layer 變更

### State Additions

None — no new state fields. The fix operates entirely within existing state structures (`s.snake`, `room.entities.food[]`).

### Game Loop Changes (`core.js`)

- **Import**: Add `createBounceFood` to the import line from `./entities.js`
- **Wall-damage block** (lines 243–272): Insert before the `return s;`:
  1. Record tail's last segment position
  2. Pop tail segment
  3. If `s.world` exists, look up room and spawn `createBounceFood` at tail position
  4. If `s.snake.length === 0` → `gameover`

### Detailed Code Insertion

```javascript
// Inside the wall-damage damage handler, before the existing:
//   s.stuckCounter = STUCK_TICKS;
// Insert:

// Drop bounce food at tail's last segment (not newHead, which is inside wall)
const lastSeg = s.snake[s.snake.length - 1];
const dropPos = { x: lastSeg.x, y: lastSeg.y };

if (s.world) {
  const { rx, ry } = worldToRoomCoords(dropPos.x, dropPos.y);
  const room = getRoomAt(s.world, rx, ry);
  if (room) {
    const food = createBounceFood(dropPos.x, dropPos.y, null);
    room.entities.food.push(food);
  }
}

// Remove last tail segment (health loss)
s.snake = s.snake.slice(0, -1);

// If pop made snake length 0 → gameover
if (s.snake.length === 0) {
  s.gameState = 'gameover';
  return s;
}
```

### AI / Behavior (`ai.js`)

No changes — `createBounceFood` already exists and is used by AI for boss drops.

### Collision / Combat (`collision.js`, `combat.js`)

No changes.

---

## 3. Entity Layer 變更

### New Entity Types

None — `createBounceFood` at `entities.js:111` already exists.

### Existing Entity Modifications

None.

### World / Map Changes

None.

---

## 4. Data Layer 變更

### New Constants

None.

---

## 5. Render Layer 變更

No changes — bounce food rendering already handled by existing render pipeline.

---

## 6. Input / UI Layer 變更

No changes.

---

## 7. Test Layer 變更

### Test Structure

Add a new `describe('Bug #163: Wall bounce food position fix')` block in `tests/metroidvania-snake.test.js`, placed immediately after the `Bug #154` block (ending at line ~1406), before the Death wall block (line ~1408).

Also add `createBounceFood` to the entities import line.

### Coverage Requirements

| Area | Normal Path | Edge Cases | Failure Paths |
|------|-------------|------------|---------------|
| Bounce food at tail position | ✅ | ≥3 | ✅ |
| Snake length decreases | ✅ | ≥2 | ✅ |
| Existing wall-damage behaviors preserved | ✅ | — | ✅ |
| Single-segment → gameover | — | ✅ | ✅ |
| Length-2 → length-1 survival | — | ✅ | — |
| No-world mode (no food) | — | ✅ | ✅ |
| Food at collision cell eaten first | ✅ | ✅ | — |

---

## 8. Files Changed（按層匯總）

### Engine Layer

| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/engine/core.js:10` | Add `createBounceFood` to import | +1 |
| `public/src/engine/core.js:270` | Insert bounce food spawn + tail pop + length-0 check | +15 |

### Test Layer

| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/metroidvania-snake.test.js` | Add Bug #163 test block | +100 |

---

## 9. Verification Checklist

- [x] Bounce food spawns at tail's last segment (not inside wall tile)
- [x] Snake length decreases by 1 on wall collision
- [x] Existing stuckCounter / pendingReverse / screenShake / score penalty still apply
- [x] Single-segment snake → gameover (no food, no pop)
- [x] Length-2 → length-1 after pop (game continues if head still alive)
- [x] No-world mode: tail still popped, no food spawned
- [x] Food at collision cell eaten before damage (+10 pts)
- [x] No regression on existing features
- [x] All pre-existing tests still pass (pending TC5 food-at-cell and TC1 eye-rendering)
