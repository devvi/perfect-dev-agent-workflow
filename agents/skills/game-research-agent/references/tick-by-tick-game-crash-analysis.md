# Tick-by-Tick Game Loop Crash Analysis

## When to Use

Use this technique when investigating a game state transition bug — specifically, when the game:
1. Transitions to a new state (e.g., `bossIntro → playing`)
2. Then crashes/freezes/dies within a few frames
3. The crash happens inside the `tick()` function rather than from an external trigger

## Technique

Walk through the `tick()` function **one call at a time**, tracing every field the next `tick()` call will read. For each tick:

1. **Record the state fields** the tick function reads: `direction`, `nextDirection`, `snake[0]` (head), `stuckCounter`, `pendingReverse`, `invulnerableTicks`, `gameState`
2. **Compute newHead**: `newHead = {x: head.x + direction.x, y: head.y + direction.y}`
3. **Check collisions** against the current snake array using the collision function
4. **Check early-return paths**: stuckCounter, `duringTransition`, self-collision, wall damage — any of these can return early without normal movement
5. **Trace the snake update**: `snake = [newHead, ...snake.slice(0, -1)]` — note whether `newHead` equals `snake[0]` (creates a duplicate head)
6. **Check for self-collision**: after the update, `snake[0]` vs `snake[1]` — are they at the same position?

## Common Trap: Zero-Movement Direction

A `direction = {x: 0, y: 0}` (or any zero vector) causes `newHead = head + {0,0} = head`. The tick function then:

```
Tick N:  snake = [H, A, B]   direction = {0,0}
         newHead = H (same)
         no collision (snake[1] = A ≠ H)
         snake = [H, H, A]   ← HEAD DUPLICATED!

Tick N+1: newHead = H (same)
          self-collision: snake[1] = H === newHead!
          pop tail → snake = [H, A]
          stuckCounter set
```

Result: the snake dies within 5-10 ticks through head duplication → self-collision → length ≤ 1 → gameover.

**Counterintuitive behavior:** the head-duplication bug does NOT fire on Tick N — it fires on Tick N+1, because `snake = [newHead, ...snake]` is called only after collision checking for the current tick. The duplicate is inserted AFTER the check, then discovered on the next tick's check.

## Crash Sequence Template

For a game tick function with this structure:

```
1. Check goal room
2. Handle special states (bossIntro, etc.)
3. Handle stuck/immobilized
4. Compute direction, newHead
5. Check room transition
6. Check collisions (death, self, damage, food)
7. Update snake array
8. Update enemies, boss, projectiles
```

The crash pattern is typically:

| Tick | State | What Happens |
|------|-------|--------------|
| 0 | `bossIntro` | `changeDirection()` sets head + direction, state → `playing` |
| 1 | `playing` | newHead = head (zero direction), no collision, head duplicated in snake |
| 2 | `playing` | Self-collision on duplicate → pop tail, stuck set |
| 3-7 | `playing` | Stuck counting down |
| 8 | `playing` | Self-collision again → pop to length 1 → gameover |

## How to Verify

1. Open the game loop source and find the `tick()` function
2. Note ALL early-return guards (stuckCounter, transition, special states)
3. Trace each tick manually using `read_file` with line numbers
4. To confirm: inject a test that calls `api.tick()` repeatedly and checks `state.gameState` after each call
5. Add a test for the specific number of ticks: `expect(state.gameState).toBe('playing')` after 30 ticks

## Example from #158

This technique was used to diagnose Issue #158 (boss_stability regression). The trace revealed:

- `changeDirection()` placed the head correctly at a FLOOR tile
- But set `direction = {0,0}` to "wait for player input"
- This caused `newHead = head` on the next tick → head duplicated
- The duplicate triggered self-collision after the stuck window expired
- Result: ~8 ticks → gameover

The fix: set `direction = {0, 1}` (DOWN) instead of `{0, 0}`. The snake moves 1 cell per tick into the room, avoiding the duplication entirely. Player input immediately overrides.
