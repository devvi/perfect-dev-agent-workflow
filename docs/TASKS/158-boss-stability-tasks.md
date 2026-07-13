# TASKS: #158 — Boss Room Stability — E2E Play-Test Regression Fix

## Implement Phase Tasks

| # | Task | File | Details |
|---|------|------|---------|
| 1 | Fix direction on bossIntro dismiss | `public/src/engine/core.js:438-439` | Change `direction: { x: 0, y: 0 }` → `{ x: 0, y: 1 }`, same for `nextDirection` |
| 2 | Add bug-documenting test (T1) | `tests/metroidvania-snake.test.js` | Verify `changeDirection()` returns `{0,0}` direction on current master (will break post-fix) |
| 3 | Add post-fix direction test (T2) | `tests/metroidvania-snake.test.js` | After fix: direction is `{ x: 0, y: 1 }` for BOSS room bossIntro |
| 4 | Add head position test (T3) | `tests/metroidvania-snake.test.js` | Head placed at `(roomX*20+10, roomY*20+1)` = `tiles[1][10]` |
| 5 | Add 30-tick survival test (T4) | `tests/metroidvania-snake.test.js` | `tick()` 30× after dismiss → gameState is `playing` or `won`, not `gameover` |
| 6 | Add DOWN movement test (T5) | `tests/metroidvania-snake.test.js` | First tick: head moves to `tiles[2][10]` |
| 7 | Add direction override test (T6) | `tests/metroidvania-snake.test.js` | Player can override direction after dismiss |
| 8 | Add regression tests (T7–T9) | `tests/metroidvania-snake.test.js` | Non-BOSS room safe transition, rapid Space presses, arrow keys in normal play |
| 9 | Run test suite | `npm run test` | Verify all unit tests pass (vitest run, no --watch) |
| 10 | Commit and push | git | `git commit -m "fix(#158): set boss dismiss direction to DOWN {0,1} instead of {0,0}"` |
