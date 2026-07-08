# PRD: [Feature] 蛇撞到自己，不会即死

| Field | Value |
|-------|-------|
| Issue | #55 |
| Priority | Medium |
| Labels | feature, workflow/research |
| Author | devvi |

## 1. Background

When the snake collides with its own body, the game currently triggers an instant game over. This behavior is inconsistent with the design philosophy established by recent changes:

- **Wall collision** (Issue #46): Changed from instant death → stuck + reverse + score penalty
- **Obstacle death penalty** (Issue #22): Hard obstacles → instant death, but regular obstacles → damage only
- **Enemy collision** (Issue #20): Changed from instant death → length reduction

Self-collision is the last remaining "trivial death" trigger. Making self-collision non-lethal aligns it with the other collision types and creates a more forgiving, skill-friendly gameplay experience.

## 2. Root Cause Analysis

Two engines are affected, each with the same self-collision → gameover mapping:

### Engine A: Classic GameBoy Snake (`src/gameboy-snake-engine.js`)

**File:** `src/gameboy-snake-engine.js`, lines 124–127:

```js
// Self collision → instant gameover (lethal)
if (collision === 'self') {
  next.gameState = 'gameover';
  return next;
}
```

The collision check at line 93 calls `checkCollision(newHead, next.snake)` which scans body segments (skipping the head at index 0). If any body segment overlaps the head's new position, `'self'` is returned.

### Engine B: Metroidvania Snake (`public/src/engine/core.js`)

**File:** `public/src/engine/core.js`, lines 199–201:

```js
// Self collision — with protection during room transition
if (collisions.includes('self') && !duringTransition) {
  s.gameState = 'gameover';
  return s;
}
```

The collision detection is in `public/src/engine/collision.js`, `checkSnakeCollision()`, lines 66–69:

```js
// Check self collision (skip first segment which is head)
for (let i = 1; i < snake.length; i++) {
  if (snake[i].x === head.x && snake[i].y === head.y) {
    return ['self'];
  }
}
```

Both engines handle self-collision identically: **immediate game over with no recovery**.

## 3. Impact Assessment

| Factor | Assessment |
|--------|------------|
| **Game difficulty** | Self-collision is common in tight corridors. Instant death here is disproportionately punishing vs. wall collision (non-lethal since #46). |
| **Player frustration** | Dying immediately from self-collision feels arbitrary when other penalties (wall bump, enemy hit) are non-lethal. |
| **Design coherence** | The wall/obstacle/enemy collision "family" has moved to non-lethal. Self-collision is an outlier. |
| **Test impact** | ~5 test cases explicitly assert `gameState === 'gameover'` on self-collision. These must be updated. |
| **Two engines** | Both engines must be changed, doubling the implementation surface but not the complexity. |

## 4. Alternatives Considered

### Alternative A (Recommended): Remove tail segment on self-collision

**Behavior:** When the snake head overlaps any body segment, do **not** move the head into that position (prevent merging). Instead, **remove 1 segment from the tail** and apply a brief stun/vulnerability window. The head stays in place.

**Rationale:** This mirrors the enemy collision penalty (length reduction) and avoids the visual oddity of the head sharing a cell with a body segment.

**Pseudo-code:**
```
if (selfCollision) {
  // Don't move head into body; head stays put
  // Remove last segment
  next.snake.pop();
  // Apply short stun (skip next tick or reduce score)
  next.stunCounter = STUN_TICKS;
  next.score = Math.max(0, next.score - 5);
  return next;
}
```

**Pros:**
- Visually clean — head never overlaps body
- Consistency with existing `damage` penalty pattern (score loss + stun)
- Natural penalty: shorter snake = easier to self-collide again → skill spiral

**Cons:**
- Head staying in place could feel like "input ignored" if not communicated visually (screen shake / flash)

### Alternative B: Allow head to push into body, remove overlap segment

**Behavior:** Move the head into the overlapping cell. The overlapped body segment is removed, and the tail segment is also removed. Net length reduction could be 0–2 depending on head position.

**Pseudo-code:**
```
if (selfCollision) {
  // Move head into new position (overlapping a body segment)
  // Find the overlapping body segment index
  const overlapIdx = snake.findIndex((s, i) => i > 0 && match(s, newHead));
  // Remove that segment and the tail
  next.snake = [newHead, ...snake.slice(1, overlapIdx), ...snake.slice(overlapIdx + 1, -1)];
  // Score penalty
  next.score = Math.max(0, next.score - 5);
  return next;
}
```

**Pros:**
- Snake still moves (no "stuck" feel)
- The body gap created by removing the overlapped segment looks natural

**Cons:**
- Complex index math — more bug-prone
- Removing middle segment creates a "hole" that the snake body must bridge on the next tick (potential visual glitch)
- Edge case: if head overlaps the 2nd segment and tail is removed, length stays the same

### Alternative C: Reverse direction + tail removal (penalty sandwich)

**Behavior:** Like wall collision: reverse direction + remove tail + score penalty.

```
if (selfCollision) {
  next.pendingReverse = true;
  next.stuckCounter = STUCK_TICKS;
  next.snake.pop();  // remove tail as extra penalty
  next.score = Math.max(0, next.score - 5);
  return next;
}
```

**Pros:**
- Reuses the wall-collision pattern (proven, tested)
- Reversing away from the collision feels intuitive

**Cons:**
- Doubling down on "reverse" for yet another collision type reduces gameplay variety
- Self-collision often happens in tight spaces where reversing is no better than waiting

### Alternative D: Keep as-is (status quo)

**Behavior:** Self-collision = instant game over.

**Pros:** Zero implementation cost.

**Cons:** Inconsistent with the game's evolving design direction; self-collision becomes the "cheap death" trap.

## 5. Recommended Approach: Alternative A

**Remove tail segment on self-collision, no head movement, apply stun + score penalty.**

### Why Alternative A?

1. **Design consistency** — same length-reduction penalty as enemy collision (Issue #20), same score penalty as wall collision (Issue #46)
2. **Visual clarity** — head never overlaps body; the stun counter (used for wall reverse) can be reused as a visual feedback mechanism
3. **Simplest implementation** — only two changes (one per engine), minimal branching
4. **Easy to test** — assert `snake.length === previous.length - 1` and `gameState === 'playing'`

### Implementation Plan

**Engine A (`src/gameboy-snake-engine.js`):**

Replace lines 124–127:
```js
// Self collision → non-lethal: remove tail, stun, score penalty
if (collision === 'self') {
  next.stuckCounter = STUCK_TICKS;
  next.pendingReverse = false;  // don't reverse, just stun
  next.snake.pop();             // remove 1 tail segment
  next.score = Math.max(0, next.score - 5);
  return next;
}
```

**Engine B (`public/src/engine/core.js`):**

Replace lines 199–201:
```js
// Self collision → non-lethal: remove tail, stun, score penalty
if (collisions.includes('self') && !duringTransition) {
  s.stuckCounter = STUCK_TICKS;
  s.pendingReverse = false;
  s.snake.pop();
  s.score = Math.max(0, s.score - 5);
  s.screenShake = { intensity: 4, duration: 8 };
  return s;
}
```

**Collision detection (`public/src/engine/collision.js`):**

No change needed — the `['self']` tag is already correctly returned. Only the handler changes.

### Interaction with Room Transition (`duringTransition`)

The existing protection `!duringTransition` on Engine B should remain:
- During room transitions the snake is briefly in an intermediate state where body segments may overlap
- The `duringTransition` flag prevents false-positive self-collision during these frames
- This was correctly added in a previous fix and should be preserved

## 6. Boundary / Scope Items

| # | Item | Description |
|---|------|-------------|
| 1 | **Zero-length snake** | If the snake is length 1 (e.g., after previous combat), `snake.pop()` would produce an empty snake. This should trigger a gameover because an empty snake is unplayable. **Guard:** `if (next.snake.length <= 1) { next.gameState = 'gameover'; return next; }` |
| 2 | **Tight-corner spiral** | In very tight spaces, repeated self-collision could reduce the snake to a length of 1 in rapid succession. The `length <= 1` guard prevents an infinite loop of pop → self-collision on next tick. |
| 3 | **Existing test cases** | The following tests currently assert `gameState === 'gameover'` on self-collision and must be updated:
|   | | - `tests/gameboy-snake.test.js:303` — `should set gameState to "gameover" on self collision` |
|   | | - `tests/gameboy-snake.test.js:534` — `should still trigger gameover on self collision, not stuck` (will need full rewrite) |
|   | | - `tests/metroidvania-snake.test.js:283` — `detects self-collision` (only checks collision type, not affected) |
| 4 | **Visual feedback** | Self-collision currently has no visual indicator other than "game over" screen. The new behavior should include visual feedback (screen shake, brief flash) to communicate that the penalty was applied. Initial implementation from Issue #46 (stun counter + score display change) should be sufficient. |
| 5 | **Score penalty stacking** | In a single tick, could other penalties (wall, enemy) stack with self-collision? The current `return`-early pattern prevents stacking, and this should be preserved: the first collision handler wins. |
| 6 | **Two-engine parity** | Both engines must implement the same behavior. The metroidvania engine is the more complex target (room transitions, world entities). The classic engine is straightforward. |

## 7. Acceptance Criteria

- [ ] Engine A: Self-collision removes 1 tail segment + score penalty + stun, not gameover
- [ ] Engine B: Same behavior, with `duringTransition` protection preserved
- [ ] Length 1 self-collision triggers gameover (empty snake is unplayable)
- [ ] Screen shake / visual feedback on self-collision
- [ ] Existing self-collision gameover tests updated to assert new behavior
- [ ] New tests for edge cases (length=1 guard, stun counter)
- [ ] Wall collision (Issue #46) behavior is not regressed
- [ ] Enemy collision (Issue #20) behavior is not regressed

## 8. References

- Issue #55: [Feature] 蛇撞到自己，不会即死
- Issue #46: Stuck+Reverse on wall collision (established the non-lethal collision pattern)
- Issue #22: Obstacle death penalty (hard obstacles = death, soft = damage)
- Issue #20: Enemy collision no longer instant death (length reduction pattern)
- Engine A: `src/gameboy-snake-engine.js` (tick function lines 88–152)
- Engine B: `public/src/engine/core.js` (tick function lines 130–280)
- Collision detection: `public/src/engine/collision.js` (checkSnakeCollision lines 31–108)
- Tests: `tests/gameboy-snake.test.js` (lines 300–310, 530–545), `tests/metroidvania-snake.test.js` (lines 283–298)
