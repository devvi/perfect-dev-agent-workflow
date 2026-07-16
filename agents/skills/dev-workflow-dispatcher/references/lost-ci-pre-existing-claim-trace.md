# Lost CI Event — Pre-Existing Claim Verification Trace (2026-07-14)

## Context

During the stalled scan cycle on 2026-07-14, PR #170 (`impl/163-wall-bounce-food-position`) was found with a CI failure that had no self-correct evidence. The PR body claimed **"6 pre-existing failures (Bug #154, Issue #46, Issue #70) — not regressions"**.

## Verification Process

The cron poller checked actual test results on master vs the PR branch to verify the claim:

### Step 1: Check CI log annotations
```
gh run view 29317800966 --log-failed
→ Test gate blocked: exit code 1
```

### Step 2: Run isolated test comparison
```bash
# On the PR branch (impl/163-wall-bounce-food-position):
npx vitest run -t "Bug #163"
# → All 7 Bug #163 tests PASS ✅

# On master, run the claimed "pre-existing" failing tests:
git checkout master
npx vitest run -t "Issue #46|Bug #154"
# → Only 1 failure: Bug #154 TC5 ("expected 3 to be less than 3")
```

### Step 3: Compare failure counts
| Criteria | Master | PR Branch (CI) | Verdict |
|----------|--------|-----------------|---------|
| Bug #154 TC5 | ✅ FAIL | ❌ FAIL | **Truly pre-existing** (same test, same error) |
| Issue #46 stuckCounter (expected 3, got 2) | ✅ PASS | ❌ FAIL | **Regression** — PR caused it |
| Bug #154 TC1 (expected 2, got 3) | ✅ PASS | ❌ FAIL | **Regression** — PR caused it |
| Phase 4 stuck+reverse Test 1 | ✅ PASS | ❌ FAIL | **Regression** — PR caused it |

### Root Cause

The PR's tail-pop implementation in `core.js` intentionally decreased snake length on wall collision (part of the Bug #163 fix: pop tail, drop bounce food at tail position). The Issue #46 tests expected the **old behavior** (length preserved at 3 after wall collision). After the PR:
- length=2 (popped by tail-pop) instead of expected length=3
- Tests `toBe(state.snake.length + 1)` → `expected 2 to be 3`

**The PR author (implement agent) did NOT run the net-change check before claiming these were "pre-existing".** They assumed that because the failures were in the same test file as other known pre-existing bugs, all failures were pre-existing. This was incorrect.

## Lessons

1. **PR body accuracy matters** — Downstream consumers (cron poller, review agent) rely on PR body claims. Inaccurate claims can cause misdirected effort (e.g., Permanent Stall Protocol bypass attempted on a PR with actual regressions).

2. **Always run master comparison** — The net-change check `npx vitest run 2>&1 | grep "Tests"` on both branches is the single most valuable diagnostic. Takes ~16s total on RPi.

3. **Compare failure NAMES, not just counts** — Same count doesn't mean same failures. Master may have 1 failure from Bug #154, branch may have 5 failures from different tests. Always diff the failure names.

4. **The implement agent added a tail-pop behavior change that intentionally broke Issue #46 tests.** This is by design (Bug #163 requires tail-pop). The self-correct agent was correctly dispatched to update the Issue #46 test assertions to match the new behavior.

## Related Files

- `dev-workflow-dispatcher` skill: Step 4.5 — pre-gather master CI context before spawning self-correct
- `game-implement-agent` skill: Step 8 — net-change check before PR creation
- `game-implement-agent` skill: Step 0 (Self-Correct) — distinguish pre-existing vs regression
- `references/net-change-check-example.md` — worked example of the net-change check technique
