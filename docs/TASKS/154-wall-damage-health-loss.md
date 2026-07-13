# TASKS: Wall Damage — Health Loss & Food Drop

## Implement Phase Tasks

| # | Task | File | Details |
|---|------|------|---------|
| 1 | Add `createBounceFood` import | `public/src/engine/core.js:10` | Add to import line: `createBounceFood` |
| 2 | Add bounce food drop in wall-damage block | `public/src/engine/core.js` lines 265–271 | Insert after food-at-cell check, before stuckCounter |
| 3 | Add tail removal in wall-damage block | `public/src/engine/core.js` lines 272–273 | `s.snake = s.snake.slice(0, -1);` |
| 4 | Update Issue #46 wall collision test | `tests/metroidvania-snake.test.js:1281` | Change `toBe(state.snake.length)` → `toBe(state.snake.length - 1)` |
| 5 | Update Issue #46 stuck+reverse test | `tests/gameboy-snake.test.js` | Check Test 2 reversal expects 1-segment snake after tail pop |
| 6 | Run test suite | `npm run test` | Verify all 234+ tests pass |
