# Lost `check_run.completed` Events for Implement PRs

> **Problem detected 2026-07-14 (cron session):** Implement PR #161 (`impl/158-boss-stability`) had a CI failure at 17:51:45 but the `check_run.completed` event never appeared in the pending file. The stalled scan protocol explicitly skips implement PRs, so the PR sits open with no one processing it.

## The Gap

The event system has two layers of catching implement PR CI failures:

1. **Primary: `check_run.completed` webhook** → route script writes to pending file → P1 handler spawns self-correct agent
2. **Fallback: Stalled scan** → runs when pending file is empty → but **explicitly skips implement PRs**

**Result:** If the webhook is lost (gateway restart, network blip, route script bug, event-processor discard), and the stalled scan skips the implement PR, there is **no third layer** to catch the failure. The PR stays open indefinitely with a red CI check and nobody acts on it.

## Detection Pattern

During a stalled scan (script output = `[NO_ACTIONABLE_EVENTS: run stalled scan]`), before reporting `[SILENT]`, check for implement PRs with unhandled CI failures:

```bash
# 1. Find all open implement PRs
gh pr list --state open --json number,headRefName,body,state \
  --jq '.[] | select(.headRefName | startswith("impl/"))'

# 2. For each, check if the parent issue is still OPEN
# 3. Check if any CI has completed (with conclusion=failure)
# 4. If CI failed and no comments/activity → the event was likely lost
```

## What To Do When Detected — Concrete Protocol (2026-07-15)

The safest action depends on context. Two supported paths:

### Option A: Spawn self-correct agent (recommended for new/untouched failures)
When the implement PR has CI failure and NO self-correct activity (no fix commits, no self-correct label):
1. Update issue label: `workflow/implement` → `workflow/self-correct` (REST API, not gh)
2. Update PR label: `workflow/self-correct` (REST API)
3. Spawn self-correct agent via `delegate_task` with CI failure context

```python
# Stalled scan remediation for implement PR with CI failure
def remediate_implement_pr_stalled(pr_num, issue_num, branch):
    """Transition implement PR with lost check_run to self-correct."""
    # Update labels (REST API to avoid read:org scope)
    run(f"gh api repos/devvi/perfect-dev-agent-workflow/issues/{issue_num}/labels "
        f"-X POST --input - <<<'{{\"labels\":[\"workflow/self-correct\"]}}'")
    run(f"gh api repos/devvi/perfect-dev-agent-workflow/issues/{issue_num}"
        f"/labels/workflow/implement -X DELETE", check=False)
    run(f"gh api repos/devvi/perfect-dev-agent-workflow/issues/{pr_num}/labels "
        f"-X POST --input - <<<'{{\"labels\":[\"workflow/self-correct\"]}}'")
    
    # Spawn self-correct agent via delegate_task
    delegate_task(
        goal=f"Spawn self-correct agent for Issue #{issue_num} / PR #{pr_num}",
        context=f"...CI failure context..."
    )
```

### Option B: Re-spawn self-correct for already-in-self-correct PRs
When the PR already has `workflow/self-correct` label and a fix was already pushed, but CI still fails:
1. Check if the failure is a cross-issue sequencing conflict (test files from another issue's plan phase merged to master)
2. Re-spawn self-correct agent with cross-conflict context
3. Do NOT reset labels

**2026-07-15 trace:** PR #211 (impl/200-title-version) had `workflow/self-correct` label and a self-correct fix already pushed (`df9e393`), but CI still failed because master had `tests/201-keyboard-hints.test.js` from #201's plan phase. The #201 source change (ENTER/SPACE hint in overlays.js) was only on PR #212's branch. The CI runs on a merge commit of #211 into master, so the #201 tests fail because the #201 source isn't in master yet.

### Option C: Inspect and escalate (no auto-merge)

When CI failures are confirmed pre-existing and unrelated, do NOT merge. Escalate to status/blocked. The pre-existing failures need a separate fix issue.

### Option D: Log and silence (historical default — now replaced by Option A/B)

The stalled scan used to skip implement PRs entirely (Option D), outputting `[SILENT]` and leaving the PR unhandled. As of 2026-07-15, Option A/B is the standard protocol.

## Real-World Example — PR #161 (2026-07-14)

**State:**
- Repo: `perfect-dev-agent-workflow`
- PR #161: `impl/158-boss-stability` — "fix(#158): boss stability"
- CI: Failed at "Test gate — block merge on failure" step
- Failing test: `TC5: Food at collision cell is eaten before damage (+10 pts)` — a pre-existing test from Issue #154
- PR's code changes: `core.js` (direction change), `test file` (helper extraction) — NOT the failing test
- Parent issue: #158 (OPEN, `workflow/implement` label)
- Pending file: empty (event never arrived)
- Stalled scan: detected nothing (implement PRs skipped)

**Root cause of lost event:** Unknown — the webhook may have been delayed, the route script may have failed to parse the `check_run` payload, or the event-processor.py may have discarded it. The gap is that there's no recovery mechanism.

## Pre-Existing vs New Failure — Diagnostic Workflow

Before deciding Option A (self-correct) vs Option B (Permanent Stall), determine
whether the CI failure was caused by the PR or pre-exists on master:

```bash
# Step 1: Get the exact failing test name from CI logs
gh run view <run-id> --log-failed | grep -E "× |FAIL|failed" | head -10

# Step 2: Check that the failing test file was NOT touched by this PR
gh pr diff <N> --name-only
# If the failing test's file is NOT in the diff → likely pre-existing
# If the file IS in the diff but the failing specific test was not changed,
# verify by running the whole test suite on master

# Step 3: Run tests on master to confirm pre-existing
git checkout master
npm run test 2>&1 | grep "Tests.*failed"
# If the same test fails on master → pre-existing

# Step 4: Run tests on the PR branch for comparison
git checkout <impl/*>
npm run test 2>&1 | grep "Tests.*failed"
# Same test count diff on both branches → pre-existing

# Step 5: Confirm pre-existing failures are NOT transient
# (verify master has been failing for multiple CI runs)
gh run list --branch master --workflow review --limit 5 \
  --json conclusion,createdAt
# 5+ consecutive failures with same pattern → permanent
```

**Real-world example — PR #161 (2026-07-14):**
- Failing test: `TC5: Food at collision cell is eaten before damage (+10 pts)`
- PR diff: only moved `createBossWorld`/`makeBossIntroState` to shared scope
- Same failure on master: confirmed (`expected 3 to be less than 3` on both)
- Test file touched by PR: yes (test refactoring), but specific failing test NOT touched
- Conclusion: pre-existing — the test was buggy from its introduction in PR #157

## Future Improvement Ideas

1. ~~**Add stalled-scan implement PR CI check:** Modify the stalled scan protocol to check implement PRs for recent CI failures and spawn self-correct agents when no event is pending.~~ **Done 2026-07-15:** The stalled scan now checks implement PR CI status and spawns self-correct/review agents when the event was lost.
2. **Health check job:** A separate cron (daily, not 1m) that reports all stalled implement PRs with CI failures.
3. **Route script fix:** Review `workflow-dispatcher.py` to ensure `check_run` payloads from CI workflow runs on `impl/*` branches are correctly parsed — particularly the nested PR number extraction.
4. **Master CI check: Implement self-correct should check if failures are cross-issue conflicts** before assuming its own code is wrong. Add pre-investigation to the self-correct agent context: check if other implement branches exist that are touching the related source files.
