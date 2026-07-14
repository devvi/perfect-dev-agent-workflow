# DESIGN: Fix Bounce Food Drop Position on Wall Collision

> Parent Issue: #193
> Agent: plan-agent
> Date: 2026-07-14

---

## 1. Summary

When the snake collides with a WALL/STONE_WALL, bounce food is currently dropped at the **tail** position (`s.snake[length-1]`). After `STUCK_TICKS` elapse and `snake.reverse()` executes (head/tail swap), the snake's head lands directly on the food, auto-eating it — defeating the purpose of dropping food.

**Fix:** Change the drop position from the tail (`s.snake[length-1]`) to the head's last valid position (`s.snake[0]` — the cell right before the wall).

---

## 2. Root Cause

In `public/src/engine/core.js`, the damage collision handler (wall/stone_wall) contains:

```javascript
// Line 272-274 (current)
const lastSeg = s.snake[s.snake.length - 1];  // ← tail position
const dropPos = { x: lastSeg.x, y: lastSeg.y };
```

The comment says "not at newHead, which is inside the wall" — correct reasoning, but the tail is the wrong choice. After reverse, the tail becomes the head.

---

## 3. Fix

| File | Change |
|------|--------|
| `public/src/engine/core.js` | Line 273: `s.snake.length - 1` → `0` |

```javascript
// After fix
const headPos = s.snake[0];  // ← last valid head position (before the wall)
const dropPos = { x: headPos.x, y: headPos.y };
```

### Why `s.snake[0]`?

- `s.snake[0]` is the head's current position — the last valid position before the collision attempt
- It's always on a FLOOR cell (cannot be inside a wall because wall collision was just detected)
- After `reverse()`, this position becomes the tail, so the snake must actively move to reach the food

---

## 4. Trace

```
Before fix:
  Wall collision at newHead=[5,4] (inside wall)
  Current head: s.snake[0]=[5,5] (last valid)
  Tail: s.snake[last]=[12,12]
  Bounce food → [12,12] (tail)
  After reverse: head=[12,12], food=[12,12] → auto-eat ❌

After fix:
  Wall collision at newHead=[5,4] (inside wall)
  Current head: s.snake[0]=[5,5] (last valid)
  Bounce food → [5,5] (head position)
  After reverse: head=[12,12], food=[5,5] → snake must move to eat ✅
```

---

## 5. Scope

- **1 line changed** in `public/src/engine/core.js`
- No new files
- Existing tests should continue to pass (the bounce food test only checks that food is created, not its position)
- No production logic change beyond the drop coordinate

---

## 6. Files Changed

| File | Change Type | Lines |
|------|------------|-------|
| `public/src/engine/core.js` | Modify | 1 |

---

## 7. Test Layer

Existing bounce food tests in `tests/metroidvania-snake.test.js` verify that bounce food is created on wall collision. They do not assert the drop position — they should pass without modification.

No new tests needed for a 1-line coordinate change. The existing CI suite (338 passing tests) covers the bounce food creation path.
