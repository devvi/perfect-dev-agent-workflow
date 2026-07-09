# Design: #55 — Snake Self-Collision Non-Lethal (Tail Removal + Stun)

> Parent Issue: #55
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

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

---

## 2. Detailed Design

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

### 2.5 Data Flow: Collision Detection → Handler → Penalty Application

#### Engine A Flow

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

#### Engine B Flow

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

#### Key Design Invariant: First Collision Wins

Both engines use early-return semantics for collision handling. This is preserved:
- **Engine A:** `checkCollision()` returns a single tag; no stacking occurs.
- **Engine B:** `checkSnakeCollision()` returns an array; the handler loop uses `if/else if` — first match wins.
- **Consequence:** If self-collision and food collision happen on the same tick, only the first-handled type applies. The PRD recommends self-collision be handled before food in the chain to prevent eating-through-self issues.

### 2.6 Rejected Alternatives

| Alternative | Rejected Because |
|-------------|-----------------|
| Alternative B — Head-overlap + middle segment removal | Complex index math; removing a middle body segment creates a "hole" in the snake that must be bridged on the next tick; edge cases near the head/tail add branching that increases bug surface |
| Alternative C — Reverse direction + tail removal | Wall collision already uses reverse — reusing for self-collision reduces gameplay variety; self-collision often occurs in tight spaces where reversing makes no difference |
| Alternative D — Status quo (instant death) | Inconsistent with wall, enemy, and obstacle collision behaviors that have all moved to non-lethal; self-collision becomes the "cheap death" outlier |

### 2.7 Open Questions

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Should Engine A also have screen shake? | Unresolved | Engine A lacks a screen-shake mechanism; adding one is out of scope for #55. Score flash + stun indicator is sufficient. |
| 2 | Should self-collision handler priority be before or after food in Engine B? | Open | Current order (from Issue #46) places wall before food. Self-collision should follow the same pattern: place before food to prevent eating-through-self. Final order to be confirmed during implementation. |
| 3 | Visual feedback for Engine A — color flash on score? | Deferred | Can be addressed as part of a broader visual polish pass. Issue #55 focuses on gameplay mechanics only. |

---

## 3. Files Changed

| File | Change Description | Est. Lines |
|------|--------------------|------------|
| `src/gameboy-snake-engine.js` | Replace self-collision → gameover with stun + tail removal + score penalty | ~20 |
| `public/src/engine/core.js` | Replace self-collision → gameover with stun + tail removal + score penalty in Engine B | ~15 |
| `tests/gameboy-snake.test.js` | Update existing self-collision tests + add new penalty tests | ~40 |
| `tests/metroidvania-snake.test.js` | Update existing self-collision tests + add new penalty tests | ~40 |

---

## 4. Verification Checklist

- [ ] Snake head moves into own body (mid-body) → head stays in place; tail segment removed (length becomes 3); score drops by 5; gameState remains 'playing'; stun counter set to STUCK_TICKS
- [ ] Snake head moves into own body (near tail) → same behavior; no special casing for tail-adjacent collisions
- [ ] Repeated self-collision in tight space → each collision removes one tail segment; after 3 collisions, snake length reaches 1; final collision triggers gameover
- [ ] Snake length 2 self-collides (only head + tail) → guard condition `length <= 1` after pop triggers gameover (empty snake)
- [ ] Snake length 1 self-collides — not possible with length 1 (no body segments to collide with); guard is defensive only
- [ ] Self-collision during room transition (Engine B) → `duringTransition` flag is true; self-collision skipped; snake continues normally
- [ ] Simultaneous self-collision + food collision (Engine B) → self-collision handler matches first; food is not consumed
- [ ] Score below penalty threshold (score = 2) → score becomes `Math.max(0, 2-5) = 0`; no negative scores
- [ ] Stun already active from wall collision → self-collision still detected; stun counter is reset to STUCK_TICKS (overwritten); penalty applies
- [ ] Wall collision still works (no regression from #46)
- [ ] Enemy collision still works → length reduction; gameState remains 'playing'
- [ ] Food consumption still works → snake grows + increments score
- [ ] Obstacle collision still works → hard obstacles trigger gameover; soft obstacles trigger damage
- [ ] Game over from other causes — enemy eating head, obstacles, hard walls — all still trigger gameover correctly
- [ ] Screen shake on self-collision (Engine B) — screen visibly shakes for configured duration
- [ ] Stun indicator visible — visual hint reflects locked state
