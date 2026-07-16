# Stashed Uncommitted Changes from Implement Agents

> **Pattern:** Implement agents sometimes modify test files alongside code files but only commit the code. The test changes end up in `git stash` on the PR branch.

## Trace: PR #170 (Issue #163 — Wall Bounce Food Position Fix, 2026-07-14)

### The Problem
The implement agent for Issue #163:
1. Modified `public/src/engine/core.js` (24 insertions, 1 deletion) — **committed** ✅
2. Modified `tests/metroidvania-snake.test.js` (added 7 Bug #163 test cases) — **NOT committed** ❌

The `git stash` on the PR branch (`impl/163-wall-bounce-food-position`) held the uncommitted test changes:
```
stash@{0}: WIP on impl/163-wall-bounce-food-position: e40658c feat(#163): wall bounce food position fix
```

### Impact
- CI test run (against committed code only) showed 5 failures
- **Misleading pre-existing claim:** PR body claimed "6 pre-existing failures" but only 1 truly reproduced on master
- 2 regressions were real (tail-pop broke length assertions)
- Without recovering the stash, pre-existing vs regression analysis was inaccurate

### Detection
```bash
git checkout <impl/* branch>
git stash list
git stash show -p stash@{0} | head -40
git stash pop
npx vitest run 2>&1 | grep "Tests"
```

## ⚠️ Pitfall: Recovered Stash Tests May Have Room-Transition Bugs

**Observed (2026-07-14, PR #170 TC5):** Applying stashed test changes caused `expected 5 to be 15` — score was just the -5 wall penalty, food bonus never applied.

### Root Cause
The test placed food at `{x: 0, y: 10}` (the collision cell when head at (1,10) moves LEFT). But `minimalState()` defaults to `currentRoom: {x: 1, y: 1}`. The newHead at (0,10) maps to room grid (0,0). `checkRoomTransition` fires because newRx !== currentRoom.x, transitioning to room (0,0) before collision checking. The wall handler then looks for food in room (0,0) — but the test added food to room (1,1).

### Diagnostic
```
score = initial - 5  (food bonus missing) AND
    food-at-collision-cell test
→ Room transition is moving collision to a different room than where food was placed
```

Check:
1. `worldToRoomCoords(newHead.x, newHead.y)` → collision room
2. Does `state.currentRoom` match the collision room?
3. If different → `checkRoomTransition` fires before collision → food in wrong room

### Fix
Override `currentRoom` to match the collision room:
```javascript
const world = generateWorldMap(3, 3);
const state = minimalState({ world, score: 10 });
state.currentRoom = { x: 0, y: 0 };  // ← match collision cell's room
const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
```

### Why the Stash Had This Bug
The implement agent wrote tests on the PR branch where the new code existed. The test happened to work in the agent's testing context but the `currentRoom` mismatch only manifests when the full `tick()` machinery runs `checkRoomTransition`. The bug is latent in the stash and only surfaces when the tests run with the complete game loop.

### Post-Apply Verification Checklist
After applying stashed test changes before committing:
```bash
# 1. Full suite must pass
npx vitest run 2>&1 | grep "Tests"

# 2. Check room alignment for any food-at-collision tests:
#    newHead → worldToRoomCoords(newHead.x, newHead.y) → collision room
#    state.currentRoom → if different, add override
```

### Prevention
- Implement-agent prompt: "Commit ALL file changes — both code AND test files"
- When recovering stash: always add `state.currentRoom` override to match collision room for food-at-collision-cell tests
- Run full suite after stash apply, not isolated files — room-transition bug needs full tick() machinery to manifest

---

## Plan Agent Variant: Test Fixes Stashed on Master

> **Pattern:** Plan agents sometimes modify existing test files (fixing stale assertions as part of design analysis) but stash the changes on **master** instead of committing to the plan branch. The stash persists across branch switches and is invisible until someone checks `git stash list` on master.

### Trace: Issue #189 (Fix 6 Stale Test Assertions, 2026-07-14)

The plan agent for Issue #189 (test-only fix) modified `tests/metroidvania-snake.test.js` to correct 6 stale assertion failures. The changes were **not committed** to the `plan/` branch — only the DESIGN doc was committed. The test changes ended up in `git stash` on master:

```
stash@{0}: WIP on master: 8321120 plan: fix 6 stale test assertion failures for #46, #70 (Issue #189) (#191)
```

The stash contained the exact fix (+17/−26 lines) needed to resolve the issue. Without it, 6 tests fail on master.

### Why This Is Worse Than Implement-Agent Stashing

| Aspect | Implement Agent (PR #170) | Plan Agent (Issue #189) |
|--------|--------------------------|--------------------------|
| Branch affected | `impl/163-wall-bounce-food-position` (PR branch) | **master** (default branch) |
| Visibility | `git stash list` on PR branch shows it | `git stash list` on master — won't be checked unless specifically looking |
| Detection surface | Stalled scan checks PR branch git stash | Only implement pre-validation on master would find it |
| Root cause | Committed only code, forgot test | Modified test assertions (scope violation) then stashed instead of reverting |

### Detection During Implement Pre-Validation

Before running `npx vitest run` to verify test state on master, check for active stashes that could mask failures:

```bash
git stash list
# If stash(es) exist with test file changes:
git stash list | while read line; do echo "$line"; done
git stash show -p stash@{0} | head -20   # verify contents
# If it contains test fixes → apply before running tests
git stash pop
npx vitest run 2>&1 | grep "Tests"       # now you see the real state
```

**Key indicator:** `npx vitest run` on a clean master shows 332 passed, but after a `git stash pop` it shows 338 passed. That's the stash masking real failures.

### Prevention
- **Plan-agent scope rule (already exists):** DO NOT modify existing test files. The "Test-Only Fix" DESIGN pattern exists specifically to document what changes are needed without making them.
- **Cron implement pre-validation:** Check `git stash list` on master before running any test comparison. The stash may contain orphaned fixes from a prior phase agent.
- **After plan branch checkout:** Run `git stash list` to verify no test changes were left behind on master. If stash exists and contains test file diffs, document them in the implement pre-validation context.

### Cross-Reference
- `dev-workflow-dispatcher` skill → "Proactive Stalled Phase Start Detection" → implement pre-validation checklist
- `game-plan-agent` skill → "Scope boundary" rule
