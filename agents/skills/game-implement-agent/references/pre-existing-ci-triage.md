# Pre-Existing CI Failure Triage (Self-Correct Session)

## Session Context

PR #161 (branch `impl/158-boss-stability`) — fix for Issue #158 (boss stability regression). CI failed with 1 assertion error.

## Diagnosis Steps Used

### 1. Get CI Annotations

```bash
# List check runs for the PR commit
gh api repos/<owner>/<repo>/commits/<sha>/check-runs \
  --jq '.check_runs[] | {name, conclusion, status}'

# Get detailed annotations for the failing check run
gh api repos/<owner>/<repo>/check-runs/<ID>/annotations \
  --jq '.[] | {path, line, message}'
```

### 2. Determine if PR Touched the Failing Test

```bash
# Check if the PR's diff touches the failing test file
git show HEAD -- tests/<failing-test-file>.test.js | grep -c "pattern" || echo "0 matches"
# If 0 lines of diff in the failing test file → pre-existing, unrelated
```

### 3. Verify on Master

```bash
CURRENT=$(git branch --show-current)
git checkout master
npx vitest run 2>&1 | grep -E "Tests:|failed|×"
git checkout "$CURRENT"
```

### 4. Check PR's Own Tests Pass

```bash
# Filter to PR-specific test describe blocks
npm test 2>&1 | grep -E "Issue #158|T[0-9]:"
# All should show ✓ (pass)
```

## Key Finding

The failing test (`TC5: Food at collision cell is eaten before damage`) was:
- In `tests/metroidvania-snake.test.js` at line 1400
- An existing test from Issue #154 (wall damage — health loss & food drop)
- Completely untouched by the PR's diff (0 lines changed in the test file by the PR commit)
- Failing identically on master (`expected 4 to be less than 4`)
- A separate issue from what PR #161 was fixing (#158 — boss stability)

## Decision: Unrelated Pre-Existing → No Fix, Report, Permanent Stall

The PR's code fix (changing `direction/nextDirection` from `{x:0,y:0}` to `{x:0,y:1}` on boss intro dismiss in `core.js`) was correct. All 9 Issue #158 tests (T1-T9) passed. The single CI failure was entirely from an unrelated pre-existing bug.

**Correct action:** Report as pre-existing, no code push needed, candidate for Permanent Stall Protocol merge.
