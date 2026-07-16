# Case Study: Stale Bug Issues Closed as Already-Fixed (#174, #179)

> Date: 2026-07-14 | Issues: #174, #179 | Fix: PR #192 (Issue #189)

## Summary

Two bug issues (#174, #179) arrived as `P2: issues.labeled,workflow/available` events,
both describing "6 pre-existing unit test failures on master (stuckCounter, wall collision,
food edge cases)." Pre-investigation revealed the fix had already been merged as PR #192
(Issue #189 — `fix 6 stale test assertion failures`), hours earlier on the same day.

## Detection Pattern

When processing a `workflow/available` event for a **bug** issue:

```bash
# 1. Check if the tests actually pass on current master
npx vitest run 2>&1 | tail -5
# → "Tests  338 passed | 15 todo" → ALL PASSING

# 2. Check git log for recent fix commits matching the issue keywords
git log --oneline -20
# Look for: "fix.*test.*assertion", "stale", or issue numbers referenced in the bug body
# → "fix: update 6 stale test assertions for #46, #70 to match implementation (Issue #189)"

# 3. Confirm the fix commit is on master
git branch -a --contains <fix-commit-sha>
# → * master, origin/master

# 4. Check the CI run history on master (may be stale)
gh run list --branch master --workflow review --limit 5 --json conclusion,createdAt
# → All runs are BEFORE the fix was merged; no post-fix CI run exists yet
# This is fine — the local test pass is sufficient evidence
```

## When to Close Instead of Spawn

Close the bug issue as resolved when ALL of these hold:

1. **Tests pass locally on master** — `npx vitest run` shows 0 failures
2. **A fix commit exists on master** — `git log --oneline` shows a commit matching the issue scope
3. **The fix is a direct match** — the commit message or PR description references the same test names, issue numbers, or symptoms
4. **No open PR currently handling the same fix** — `gh pr list --state open --search "Issue #<N>"` returns empty

## Clean-Up Procedure

```bash
# Comment on issue linking to the fix
gh issue comment <N> --body \
  "✅ **Already resolved.** Fixed by PR #<PR> (Issue #<I> — <title>), merged <date>."

# Remove workflow label, add status/done
gh issue edit <N> --remove-label "workflow/available" --add-label "status/done"

# Close the issue
gh issue close <N>

# Remove from pending file
# (Python: read ~/.hermes/workflow-pending.json, filter out matching events)
```

## Why This Happens

- Bug issues can be filed independently — the filer may not know another issue already exists
- The `workflow/available` label may be applied without checking for duplicates
- The fix PR's pipeline (research → plan → implement → merge) can complete quickly, while the cron polls every 1 minute — the label event can race the fix

## Relation to Other Patterns

| Pattern | Reference | Scenario |
|---------|-----------|----------|
| Stale `pull_request.synchronize` event | `stale-pending-event-case-study.md` | PR already merged before cron picks up event |
| Stale bug issue (this doc) | `stale-bug-issue-detection.md` | Bug already fixed by another issue's PR |
| Pre-existing CI failure on implement PR | `permanent-stall-unit-test-case-study.md` (deprecated) | CI fails but failure is pre-existing on master |
