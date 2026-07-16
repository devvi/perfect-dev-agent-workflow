# Review Agent: Pre-Existing Test Failure Detection

> **Problem:** When review-agent runs `npm run test` on a merged implement PR, it finds
> test failures. Are they regressions (implement broke them) or pre-existing (broken
> before the PR)? The answer determines whether to close the issue or spawn self-correct.

## Detection Protocol

### Step 1: Identify failing test files

```bash
npm run test 2>&1 | grep "FAIL"
# Example output:
# FAIL  tests/boss-battle.test.js
# FAIL  tests/metroidvania-snake.test.js
```

### Step 2: Check which files the implement PR changed

```bash
gh pr diff <N> --name-only
# Example:
# public/src/engine/ai.js
# public/src/engine/collision.js
# tests/boss-room-freeze.test.js    ← only this test file was touched
```

### Step 3: Cross-reference

For each failing test file from Step 1: is it in the implement PR's changed file list?

| Failing Test File | Changed by PR? | Verdict |
|---|---|---|
| `tests/boss-battle.test.js` | No | Pre-existing failure |
| `tests/door-bug-fix.test.js` | No | Pre-existing failure |
| `tests/invisible-wall.test.js` | No | Pre-existing failure |
| `tests/metroidvania-snake.test.js` | No | Pre-existing failure |

If the failing test file was NOT modified by the implement PR → it's a **pre-existing failure**. Close issue.

If the failing test file WAS modified by the implement PR → investigate further:
- `git diff <N>..<N-1> -- tests/failing-file.test.js` to see what changed
- Could be a legitimate regression; could also be a coincidental co-change

### Step 4: Confirm test diff for the implement PR's own test file

The implement PR should have modified a test file (or created one). Check that file:

```bash
gh pr diff <N> -- tests/<pr-test-file>.test.js | head -20
# Verify the changes look correct for what was implemented
```

Then run JUST that test file to confirm it passes:

```bash
npx vitest run tests/<pr-test-file>.test.js 2>&1 | tail -5
```

## Real-World Trace: Issue #132 (Boss Room Freeze)

**Event:** `issues.labeled#132` → `workflow/test`

**Implement PR #135** merged. Changed files:
```
public/src/engine/ai.js
public/src/engine/collision.js
public/src/engine/core.js
public/src/engine/generator.js
public/src/engine/world.js
public/src/render/room.js
tests/boss-room-freeze.test.js
```

**Test run (`npm run test`):** 9 failed, 303 passed, 15 todo
```
FAIL  tests/boss-battle.test.js                  (2 failures)
FAIL  tests/door-bug-fix.test.js                 (1 failure)
FAIL  tests/invisible-wall.test.js               (2 failures)
FAIL  tests/metroidvania-snake.test.js            (4 failures)
```

**Cross-reference:** None of these 4 failing test files were in PR #135's diff.
→ All 9 failures are pre-existing.

**Root cause of pre-existing failures:** All failing tests call `assignRoomTypes(world)` and
try to access `.rows` on the return value. But `assignRoomTypes()` is a void function
(it modifies the `world` object in place). These tests were written in the plan PR (#134)
and never ran because `continue-on-error: true` in `opencode-review.yml` masked test failures.

**Verdict:** Review passes. Close issue #132 as done.

## Pitfalls

### "All tests pass" is not a valid assumption
Plan-phase agents write tests that are syntactically valid but semantically wrong.
These tests never ran — CI masks failures with `continue-on-error: true`.
The review phase is the FIRST time these tests execute.

### Don't blame the implement for plan-phase test bugs
When a test file was NOT touched by the implement PR but fails, the bug is in the
plan phase. Open a separate issue if needed, but don't block the current workflow.

### Test todo blocks are fine
`describe.todo()` tests don't fail — they're skipped. Only active `it(...)` / `describe(...)`
blocks can fail. Pre-existing failures are always in active test blocks written by the
plan agent.
