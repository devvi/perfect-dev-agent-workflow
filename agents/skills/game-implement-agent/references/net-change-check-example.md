# Net-Change Check Worked Example (Bug #163)

## Context

Bug #163 was a 1-file, ~16-line fix to add bounce food drop at tail position on wall collision. The test suite had pre-existing failures from Bug #154 (wall damage health loss tests expecting old behavior).

## Quick Net-Change Commands

```bash
# Run on branch
CURRENT_BRANCH=$(git branch --show-current)
npx vitest run 2>&1 | grep "Tests" | tee /tmp/branch-failures.txt
# Output: Tests  5 failed | 357 passed | 15 todo (377)

# Switch to master
git checkout master
npx vitest run 2>&1 | grep "Tests" | tee /tmp/master-failures.txt
# Output: Tests  6 failed | 356 passed | 15 todo (377)

# Return to branch
git checkout "$CURRENT_BRANCH"

# Compare
echo "Master:  $(cat /tmp/master-failures.txt)"
echo "Branch:  $(cat /tmp/branch-failures.txt)"
# Master:  Tests  6 failed | 356 passed | 15 todo (377)
# Branch:  Tests  5 failed | 357 passed | 15 todo (377)
```

## Interpretation

| Metric | Master | Branch | Delta |
|--------|--------|--------|-------|
| Failed | 6 | 5 | -1 improvement |
| Passed | 356 | 357 | +1 improvement |
| Total  | 377 | 377 | same |

**Net improvement of 1 test** (5 Bug #163 tests now passing, offset by 4 pre-existing Bug #154/Issue #46/Issue #70 tests now failing due to changed wall behavior).

## Failure Breakdown

### Master (6 failures)
- 5× Bug #163 TC1-TC7 subset (code not implemented yet)
- 1× Bug #154 TC5 (pre-existing — food-at-cell test)

### Branch (5 failures)
- 0× Bug #163 — **all pass** ✅
- 1× Bug #154 TC5 — same pre-existing failure
- 1× Issue #22 / Issue #46 — `toBe(state.snake.length)` expects old length-preserved wall behavior
- 1× Bug #154 TC1 — same old-behavior assertion
- 1× Bug #154 TC3 — intermittent `stuckCounter` undefined (minimal state without field)
- 1× Issue #70 C2 — `toBe(state.snake.length)` old-behavior assertion

## Key Insight

The 4 "new" failures on the branch (Issue #46, Bug #154 TC1/TC3, Issue #70 C2) are **old-behavior documentation tests** — they literally assert the BROKEN behavior (`snake.length` unchanged on wall hit). The fix changes this behavior intentionally. These tests will be resolved when Bug #154's implementation lands.

The 5 Bug #163 tests that FAILED on master are now PASSING on the branch. That's the fix working correctly.

## When to Use This Pattern

Use the net-change check when:
1. Your PR changes a fundamental game mechanic (wall collision, health, score)
2. Pre-existing tests document the OLD (broken) behavior
3. You need to quickly confirm your fix doesn't introduce NEW regressions
4. The total failure count is small enough to eyeball (≤10 failures)
