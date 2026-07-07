# Tasks: 撞到红色敌人不会掉血

> Parent Issue: #20
> Agent: research-agent
> Date: 2026-07-07

---

## Task Breakdown

### Phase 1 — Fix Core Collision Timing (Approach A + B1)

| # | Task | File | Description | Effort | Depends On |
|---|------|------|-------------|--------|------------|
| 1.1 | Add post-AI enemy collision check | `public/src/engine/core.js` | After `updateEnemies(s)` in `tick()`, add a second overlap check. If snake head overlaps any enemy after AI movement, apply same damage logic as the existing pre-move check. Must prevent double-damage with a flag. | 0.5h | — |
| 1.2 | Prevent enemy from moving onto snake | `public/src/engine/ai.js` | In `updateEnemies()`, before executing enemy move, check if target cell is occupied by any snake segment. If yes, skip the move (enemy stays in place). | 0.5h | — |
| 1.3 | Prevent double-damage in same tick | `public/src/engine/core.js` | Use a flag (e.g., `_enemyDamageApplied`) to track if damage was already dealt in the current tick. Post-AI check only applies if flag is not set. Reset at tick start. | 0.25h | 1.1 |

### Phase 2 — Edge Case Tests

| # | Task | File | Description | Effort |
|---|------|------|-------------|--------|
| 2.1 | AI-phase enemy collision test | `tests/metroidvania-snake.test.js` | Enemy moves onto snake during AI phase → snake loses 1 length | 0.5h |
| 2.2 | Enemy-snake head overlap persistence test | `tests/metroidvania-snake.test.js` | Snake and enemy share same cell for multiple ticks → damage only on first tick (no double-damage) | 0.5h |
| 2.3 | Snake length=1 collision death test | `tests/metroidvania-snake.test.js` | Snake with 1 segment hits enemy → gameover | 0.25h |
| 2.4 | Multiple enemies AI-collision test | `tests/metroidvania-snake.test.js` | Two enemies move onto snake in same tick → both independently checked | 0.5h |
| 2.5 | Food + enemy same cell test | `tests/metroidvania-snake.test.js` | Cell has both food and enemy → enemy damage applied first | 0.5h |

### Phase 3 — Verification

| # | Task | File | Description | Effort |
|---|------|------|-------------|--------|
| 3.1 | Run full test suite | `tests/metroidvania-snake.test.js` | All 43 existing tests + new tests pass | 0.25h |
| 3.2 | Manual gameplay test | `public/gameboy.html` | Open in browser, verify enemy collision works in actual gameplay | 0.5h |
| 3.3 | Regression: projectile collision still works | `tests/metroidvania-snake.test.js` | Enemies still die from bullets | 0.25h |

---

## Total Effort Estimate

**~4 hours** (research already done; this is implementation + testing)

---

## Implementation Notes

### Approach Detail: Post-AI Collision Check (core.js)

```js
// In tick(), after updateEnemies(s):
s = updateEnemies(s);

// Post-AI enemy collision check
if (s.world && s.gameState === 'playing') {
  const head = s.snake[0];
  const { rx, ry } = worldToRoomCoords(head.x, head.y);
  const room = getRoomAt(s.world, rx, ry);
  if (room) {
    const aiOverlap = room.entities.enemies.some(e => e.x === head.x && e.y === head.y);
    if (aiOverlap && !s._enemyDamageApplied) {
      s.snake = s.snake.slice(0, -1);
      s.score = Math.max(0, s.score - 5);
      s._enemyDamageApplied = true;
      if (s.snake.length === 0) {
        s.gameState = 'gameover';
        return s;
      }
    }
  }
}
```

### Approach Detail: Prevent Enemy Moving onto Snake (ai.js)

In `updateEnemies()`, inside the enemy move block:

```js
const onSnake = newState.snake.some(s => s.x === newX && s.y === newY);
if (!onSnake && cellType === 0 && !occupied) {
  enemy.x = newX;
  enemy.y = newY;
  // ...
}
```

### Double-Damage Prevention

Set `_enemyDamageApplied` when pre-move collision applies damage. Check and respect this flag in the post-AI check. Reset at the top of `tick()` or simply don't carry it to the next tick.
