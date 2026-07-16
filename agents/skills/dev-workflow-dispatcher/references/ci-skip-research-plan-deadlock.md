# CI Deadlock: Research/Plan PRs Blocked by SKIPPED Status Check

## The Deadlock

The `opencode-review.yml` workflow had a job-level `if` condition:
```yaml
test-and-report:
  if: startsWith(github.event.pull_request.head.ref, 'impl/')
```

This caused the entire `test-and-report` job to be **SKIPPED** for research/plan branches. When `test-and-report` is configured as a **required status check** in branch protection, a SKIPPED check is NOT the same as SUCCESS — and `gh pr merge` refuses with:

```
GraphQL: Required status check "test-and-report" is expected. (mergePullRequest)
```

This blocked ALL research and plan PRs from merging, even though they're documentation-only and never trigger CI.

## The Fix: Single Job with Conditional Steps

Remove the job-level `if` and gate individual steps instead:

```yaml
test-and-report:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6

    # Early exit for research/plan branches — always succeeds
    - name: Non-impl branch — skip tests
      if: "!startsWith(github.event.pull_request.head.ref, 'impl/')"
      run: |
        echo "Branch type: ${{ github.event.pull_request.head.ref }}"
        echo "CI tests only run on impl/* branches. Reporting success."

    # All test steps gated on impl/*
    - name: Setup Node.js
      if: startsWith(github.event.pull_request.head.ref, 'impl/')
      uses: actions/setup-node@v4
      ...
```

**Why this works:**
- The job always runs → the `test-and-report` check always completes
- For non-impl branches: checkout + early exit → SUCCESS
- For impl branches: checkout + full test pipeline → real CI
- Branch protection sees `test-and-report: SUCCESS` for all PRs

## What Does NOT Work: Duplicate Job Names

YAML 1.x does NOT support duplicate keys — the last occurrence wins. Adding a second `test-and-report` job with a different `if` condition results in only the last job being parsed:
```yaml
# ❌ This does NOT work — YAML keeps only the last test-and-report job
test-and-report:
  if: startsWith(github.event.pull_request.head.ref, 'impl/')
  ...

test-and-report:  # ← overwrites the first!
  if: "!startsWith(github.event.pull_request.head.ref, 'impl/')"
  ...
```

## The Trigger

Observed 2026-07-15: Issues #200 and #201 had research PRs blocked for hours. PRs #202, #203 all showed SKIPPED on the `test-and-report` check. The cron dispatcher could not merge them.

## Detection

When trying to merge a research or plan PR and getting:
```
Required status check "test-and-report" is expected
```
Check the PR's CI status:
```
gh pr view <N> --json statusCheckRollup
# Look for conclusion: "SKIPPED"
```
