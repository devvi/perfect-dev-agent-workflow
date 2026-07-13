# PRD: Wall Damage Handler Missing Snake Length Check

## 1. Problem Definition

**Current behavior:** When a snake with only 1 segment (head only) collides with a Wall or Stone_Wall tile, it does NOT trigger game over. Instead, it sets `stuckCounter`, `pendingReverse`, and `screenShake` — but on a 1-element array, `.reverse()` is a no-op, and the snake remains alive indefinitely.

**Expected behavior:** A snake with ≤1 segment hitting a wall should immediately trigger `gameState = 'gameover'`.

**User scenario:** Play until snake is reduced to 1 segment (by enemy damage), then hit a wall. Player expects the game to end, but instead the snake is stuck forever. This breaks the core gameplay loop.

## 2. Root Cause Analysis

In `public/src/engine/core.js`, the wall damage handler (lines 244-267):

```javascript
if (collisions.includes('damage')) {
    // ...food edge case handling...
    s.stuckCounter = STUCK_TICKS;
    s.pendingReverse = true;
    s.screenShake = { intensity: 4, duration: 8 };
    s.score = Math.max(0, s.score - 5);
    return s;  // <-- Returns without checking snake length!
}
```

**The wall damage handler never checks if the snake has only 1 segment.** This is an oversight.

**Contrast with other handlers that DO check:**
- Self-collision (line 232): `if (s.snake.length <= 1) { s.gameState = 'gameover'; }`
- Enemy damage (line 326): `if (s.snake.length === 0) { s.gameState = 'gameover'; }`
- Wall damage (line 244): **No check at all** ← THE BUG

## 3. Impact Analysis

| File | Impact | Change Required |
|------|--------|-----------------|
| `public/src/engine/core.js` (line ~244) | Direct — wall damage handler | Add snake length check before stuck/reverse logic |
| Tests | Existing tests may not cover this edge case | Add test: 1-segment snake → wall → gameover |
| No other files | Bug is isolated to one handler | No other changes needed |

## 4. Solution Comparison

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| **A. Add length check at start of wall damage block** | Minimal change, matches pattern in self-collision handler, clearly localized | None | ~1 line + test |
| B. Refactor to a shared `checkGameOver()` helper | DRY, cleaner code | More files changed, risk of introducing new bugs in other handlers | Medium |

**Recommendation: Approach A** — add a single `if (s.snake.length <= 1)` check at the beginning of the wall damage block (after line 247, before the stuck/reverse logic). This matches the existing pattern in the self-collision handler and introduces zero risk of regression.

## 5. Boundary Conditions & Acceptance Criteria

| Condition | Expected Behavior |
|-----------|-------------------|
| Snake length = 1, hits wall | `gameState = 'gameover'` |
| Snake length = 2+, hits wall | Existing behavior (stuck + reverse, no gameover) — **unchanged** |
| Snake length = 1, hits self-collision | Game over (already works — line 232) |
| Snake length = 0 (edge case impossible) | N/A — `length === 0` can't reach wall collision handler |

## 6. Dependencies & Blockers

None. The fix is a single line in an isolated handler with no external dependencies.

## 7. Spike/Experiment

Not needed. The fix is trivial and the root cause is fully understood.
