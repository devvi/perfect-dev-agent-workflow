# Design: Snake Self-Collision Non-Lethal (Tail Removal + Stun)

| Field | Value |
|-------|-------|
| Issue | #55 |
| Status | Planned |
| Priority | Medium |
| Author | devvi |

## 1. Module Architecture

Two independent game engines are affected. Both follow the same high-level architecture but differ in their integration points.

### 1.1 Engine A — Classic GameBoy Snake

| Module | File | Role |
|--------|------|------|
| Tick orchestrator | `src/gameboy-snake-engine.js` | Main game loop; calls collision detection, then applies collision handling, then returns next state |
| Collision detection | inline (lines 93-130) | `checkCollision()` — checks wall, self, food, and obstacle collisions in a single switch-like chain |
| State mutation | inline (lines 88-180) | Directly builds `next` state object; collision handlers set `next.gameState`, `next.stuckCounter`, etc. |

**Current flow (self-collision):** `tick()` → `checkCollision(newHead, snake)` → returns `'self'` → sets `next.gameState = 'gameover'` → returns `next`.

### 1.2 Engine B — Metroidvania Snake

| Module | File | Role |
|--------|------|------|
| Tick orchestrator | `public/src/engine/core.js` | Main game loop (`tickSnakeState()`, lines 130-280); reads collision tags and dispatches handlers |
| Collision detection | `public/src/engine/collision.js` | `checkSnakeCollision()` (lines 31-108) — returns array of collision tags (`['self']`, `['wall']`, `['self', 'food']`, etc.) |
| Collision handler | `public/src/engine/core.js` (lines 170-240) | `for` loop over collision tags; each tag has an `if/else if` branch with handler logic |

**Current flow (self-collision):** `tickSnakeState(s)` → `checkSnakeCollision(s, newHead, ...)` → returns `['self']` → loop matches `'self'` → `s.gameState = 'gameover'` → returns `s`.

## 2. Component / Module Design with Interfaces and States

### 2.1 Collision Detection Interface

Both engines already produce a well-defined collision type tag. This interface remains unchanged.

**Engine A — `checkCollision(newHead, snake)`**
- Input: `newHead` (point), `snake` (array of points)
- Output: one of `'wall'`, `'self'`, `'food'`, `'obstacle'`, `null`
- No changes needed — already correctly returns `'self'`

**Engine B — `checkSnakeCollision(s, newHead, map, direction)`**
- Input: game state `s`, `newHead`, `map`, `direction`
- Output: array of collision tags, e.g. `['self']` or `['self', 'food']`
- No changes needed — already correctly includes `'self'`

### 2.2 New Self-Collision Handler States

After the change, self-collision leads to a **penalty state** instead of a terminal state:

| State | Description | Entered When | Exited When |
|-------|-------------|-------------|-------------|
| `self_collision_penalty` | Head stays in place; tail removed; stun active | Self-collision detected | Stun counter decrements to 0 |
| `gameover` (edge case) | Snake length ≤ 1 after pop | Self-collision reduces snake to empty | Never (terminal) |

### 2.3 Penalty Parameters

| Parameter | Value | Defined In | Purpose |
|-----------|-------|------------|---------|
| `STUCK_TICKS` | As defined by engine (typically 8-12 frames) | engine constants | Stun duration; player input is ignored during stun |
| `SCORE_PENALTY` | 5 points | engine constants | Score deduction floor at 0 |
| `SNAKE_LENGTH_FLOOR` | 2 (any collision where post-pop length ≤ 1 → gameover) | handler guard | Prevents unplayable empty snake |

### 2.4 Engine B — Visual Feedback Module

Only Engine B has a dedicated screen-shake mechanism. Engine A currently lacks screen shake but uses the stun counter for visual feedback (score color change, HUD flash).

| Component | Behavior on Self-Collision |
|-----------|---------------------------|
| Screen shake (Engine B) | `s.screenShake = { intensity: 4, duration: 8 }` — brief shake communicates penalty |
| Score display (both) | Score value changes (drops by 5) |
| Stun indicator (both) | Stun counter engaged; existing stun UI (overlay/opacity) shows player is briefly locked |

## 3. Data Flow: Collision Detection → Handler → Penalty Application

### 3.1 Engine A Flow

```
tick(direction)
  │
  ├── compute newHead from direction + current head position
  │
  ├── call checkCollision(newHead, snake)
  │     └── returns 'self' when newHead matches any body segment (index > 0)
  │
  ├── collision === 'self'?
  │     │
  │     ├── YES:
  │     │     ├── guard: snake.length <= 1? → set gameState = 'gameover', return
  │     │     ├── set stuckCounter = STUCK_TICKS (prevents movement during stun)
  │     │     ├── set pendingReverse = false (explicitly disable any reverse behavior)
  │     │     ├── snake.pop() → remove last tail segment
  │     │     ├── score = Math.max(0, score - SCORE_PENALTY)
  │     │     └── return next (gameState remains 'playing')
  │     │
  │     └── NO: continue to other collision types
  │
  └── return next (or gameover from other collisions)
```

### 3.2 Engine B Flow

```
tickSnakeState(s)
  │
  ├── compute newHead from s.direction + s.snake[0]
  │
  ├── call checkSnakeCollision(s, newHead, map, direction)
  │     └── returns ['self'] when newHead matches any body segment (index > 0)
  │
  ├── duringTransition check: if true, skip self-collision handler
  │
  ├── collision 'self' present AND !duringTransition?
  │     │
  │     ├── YES:
  │     │     ├── guard: s.snake.length <= 1? → s.gameState = 'gameover', return
  │     │     ├── set s.stuckCounter = STUCK_TICKS
  │     │     ├── set s.pendingReverse = false
  │     │     ├── s.snake.pop() → remove last tail segment
  │     │     ├── s.score = Math.max(0, s.score - SCORE_PENALTY)
  │     │     ├── s.screenShake = { intensity: 4, duration: 8 }
  │     │     └── return s (gameState remains 'playing')
  │     │
  │     └── NO: continue to other collision tags
  │
  └── return s (or gameover from other collisions)
```

### 3.3 Key Design Invariant: First Collision Wins

Both engines use early-return semantics for collision handling. The first collision type matched in the chain wins, and no subsequent collisions are processed for that tick. This is preserved:

- **Engine A:** `checkCollision()` returns a single tag; no stacking occurs.
- **Engine B:** `checkSnakeCollision()` returns an array; the handler loop uses `if/else if` — first match wins.
- **Consequence:** If self-collision and food collision happen on the same tick, only the first-handled type applies. The PRD recommends self-collision be handled before food in the chain to prevent eating-through-self issues.

## 4. Test Specifications (Text Only — No Code)

### 4.1 Happy Path

| # | Scenario | Setup | Expected Behavior |
|---|----------|-------|-------------------|
| 1 | Snake head moves into own body (mid-body) | Snake length 4, head adjacent to segment 3; direction set to turn into body | Self-collision detected; head stays in place; tail segment removed (length becomes 3); score drops by 5; gameState remains 'playing'; stun counter set to STUCK_TICKS |
| 2 | Snake head moves into own body (near tail) | Snake length 4, head adjacent to last segment | Same behavior as #1; no special casing for tail-adjacent collisions |
| 3 | Snake head moves into own body (Engine B only) | Same setup in metroidvania engine, map present, collision.js detection path | Same behavior as #1 plus screen shake activated |
| 4 | Repeated self-collision in tight space | Snake length 4; successive self-collisions forced | Each collision removes one tail segment; after 3 collisions, snake length reaches 1; final collision triggers gameover |

### 4.2 Edge Cases

| # | Scenario | Setup | Expected Behavior |
|---|----------|-------|-------------------|
| 5 | Snake length 2 self-collides (only head + tail) | Snake length 2 (head + tail); head turns back into the only body segment | Self-collision detected; guard condition `length <= 1` after pop triggers gameover (empty snake) |
| 6 | Snake length 1 self-collides | Snake length 1 (head only, no body); head moves | Self-collision not possible with length 1 (no body segments to collide with); no special handling needed; guard is defensive only |
| 7 | Self-collision during room transition (Engine B) | Snake crossing room boundary; body segments temporarily overlap | `duringTransition` flag is true; self-collision skipped; snake continues normally |
| 8 | Simultaneous self-collision + food collision (Engine B) | Food right behind the body segment the head moves into | Collision array contains `['self', 'food']`; self-collision handler matches first; food is not consumed; food remains on board |
| 9 | Score below penalty threshold | Score = 2; self-collision occurs | Score becomes `Math.max(0, 2-5) = 0`; no negative scores allowed |
| 10 | Stun already active from wall collision | `stuckCounter > 0` from previous wall bump; player moves into own body | Self-collision is still detected; stun counter is reset to STUCK_TICKS (overwritten); penalty applies |

### 4.3 Regression Checks

| # | Scenario | What to Verify |
|---|----------|----------------|
| 11 | Wall collision still works | Wall collision still triggers stuck + reverse + score penalty; gameState remains 'playing' |
| 12 | Enemy collision still works | Enemy collision still triggers length reduction (enemy-specific amount); gameState remains 'playing' |
| 13 | Food consumption still works | Food collision still grows snake + increments score |
| 14 | Obstacle collision still works | Hard obstacles still trigger gameover; soft obstacles still trigger damage |
| 15 | Game over from other causes | Enemy eating head, obstacles, hard walls — all still trigger gameover correctly |
| 16 | Score display (Engine A) | Score value decrements visually; no negative display |

### 4.4 Visual / UX Checks

| # | Scenario | What to Verify |
|---|----------|----------------|
| 17 | Screen shake on self-collision (Engine B) | Screen visibly shakes for the configured duration |
| 18 | Stun indicator visible | During stun frames, player input is ignored; visual hint (opacity/overlay) reflects locked state |
| 19 | No visual glitch at penalty moment | Snake body smoothly re-draws with one fewer segment; no extra frames with overlapping head/body |

## 5. Rejected Alternatives

### Alternative B — Head-overlap + middle segment removal
- **Rejected because:** Complex index math; removing a middle body segment creates a "hole" in the snake that must be bridged on the next tick; edges cases near the head/tail add branching that increases bug surface.

### Alternative C — Reverse direction + tail removal
- **Rejected because:** Wall collision already uses reverse — reusing for self-collision reduces gameplay variety; self-collision often occurs in tight spaces where reversing makes no difference.

### Alternative D — Status quo (instant death)
- **Rejected because:** Inconsistent with wall, enemy, and obstacle collision behaviors that have all moved to non-lethal; self-collision becomes the "cheap death" outlier.

## 6. Open Questions

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Should Engine A also have screen shake? | Unresolved | Engine A lacks a screen-shake mechanism; adding one is out of scope for #55. Score flash + stun indicator is sufficient. |
| 2 | Should self-collision handler priority be before or after food in Engine B? | Open | Current order (from Issue #46) places wall before food. Self-collision should follow the same pattern: place before food to prevent eating-through-self. Final order to be confirmed during implementation. |
| 3 | Visual feedback for Engine A — color flash on score? | Deferred | Can be addressed as part of a broader visual polish pass. Issue #55 focuses on gameplay mechanics only. |
