# Self-Heal: Verify Fix After Deploy

When the implement agent pushes a fix that gets deployed, the self-heal cycle must
verify the fix works on the **production URL**, not just in local tests.

## The Boss Room Bug Case (Issue #142)

The fix was applied, merged, and deployed 5 times over 2 days. Root causes:

1. **Agent A's fix overwritten by Agent B** in same branch — `git log` showed
   commit 1 had the correct fix, commit 2 reverted it without detection.
2. **E2E test used simulated `enterBossRoom()`** — skipped `checkRoomTransition`.
3. **Fix verified only locally** — deployed version differed from branch due to
   merge conflicts or stale CI.

## Known Failure Patterns

### Pattern: Keyboard handler fixed but simulateKey wasn't (or vice versa)

In gameboy.html, there are TWO independent code paths that handle bossIntro dismissal:

| Path | Location | Trigger |
|------|----------|---------|
| Keyboard event handler | `gameboy.html` ~line 464 | Real key press by player |
| `simulateKey()` | `gameboy.html` ~line 362 | E2E test via `api.simulateKey('Space')` |

A fix can be applied to one path and not the other. Verification must check BOTH. Pattern:
```bash
# Check keyboard handler uses changeDirection:
grep -c "state = changeDirection" public/gameboy.html
# Should show 2 occurrences (keyboard handler + simulateKey)
```

### Pattern: head repositioned but direction/nextDirection not reset

A fix that calls `changeDirection()` during bossIntro correctly places the head on FLOOR
but may not reset `direction`/`nextDirection`. The snake retains its entry direction and
immediately moves back into the wall/door on the next tick. Verify:
```bash
# Check that direction and nextDirection are both set to {0,0} in the bossIntro branch:
grep -A10 "state.gameState === 'bossIntro'" public/src/engine/core.js | grep -E "direction|nextDirection"
# Should show direction: { x: 0, y: 0 } and nextDirection: { x: 0, y: 0 }
```

### Pattern: Verify after deployment

```bash
curl -s "https://perfect-dev-agent-workflow.vercel.app/gameboy.html" \
  | grep -c "expected_fix_marker"
node tests/play-test.mjs --url "https://perfect-dev-agent-workflow.vercel.app"
```
