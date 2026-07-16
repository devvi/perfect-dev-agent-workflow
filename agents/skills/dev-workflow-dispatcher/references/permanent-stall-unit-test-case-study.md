# Permanent Stall Protocol — Unit Test Pre-Existing Failure Case Study

> **⚠️ DEPRECATED (2026-07-14):** The Permanent Stall Protocol (bypass CI, merge) has been removed from all active prompts. This case study is preserved for historical reference only. Current policy: CI failure → escalate, do NOT merge.
>
> **PR #161 (2026-07-14):** Boss stability fix. Unit test TC5 failed pre-existing.
> Companion to `references/permanent-ci-blockage-case-study.md` (PR #157, E2E failure).

## Summary

PR #161 (`impl/158-boss-stability`) changed direction from `{0,0}` to `{0,1}` (DOWN) on boss intro dismiss to fix the zero-direction crash. The E2E play-test for boss stability passed (the fix works), but the CI failed at the unit test gate:

| Check | Result | Cause |
|-------|--------|-------|
| Unit tests | ❌ 350 ✅ / 1 ❌ | TC5 pre-existing |
| E2E Play Test | ✅ 2/2 pages | Boss regression FIXED |
| New tests (#158) | ✅ All 9 pass | Correct implementation |

## Detection

Found during proactive stalled scan (lost `check_run.completed` event — never arrived at pending file):

```bash
# Script output: [NO_ACTIONABLE_EVENTS: run stalled scan]
# Stalled scan found only open PR = impl/158-boss-stability (#161)
gh run list --workflow review --branch impl/158-boss-stability --json conclusion,status --limit 3
# → conclusion=failure, no self-correct evidence
```

## Pre-Existing Confirmation

The failing test `TC5: Food at collision cell is eaten before damage (+10 pts)` was:

1. **Not touched by the PR's diff** — `gh pr diff 161 | grep -c "TC5\|Food at collision\|Bug #154"` returned 0 matches
2. **Confirmed failing on master** — `git checkout master && npx vitest run tests/metroidvania-snake.test.js -t "TC5: Food at collision"` produced the identical assertion error
3. **Related to Issue #154** (wall damage health loss), not Issue #158 (boss stability)

The PR **did** touch `tests/metroidvania-snake.test.js` — but only to refactor boss-intro helper functions out of the Issue #142 describe block and add new Issue #158 tests. The TC5 test (in a different section under "Issue #22 — Obstacle Death Penalty") was structurally unmodified.

## Protocol Application

Despite the PR touching the test file, the protocol was applied because:

- The failing code path was untouched (verified via `gh pr diff`)
- The failure reproduced identically on `master`
- The E2E test (the actual regression tracked by Issue #158) now passed
- All 9 new tests for the fix passed

### Steps Taken

1. **Comment on PR** documenting pre-existing nature, E2E pass, and protocol justification
2. **Merge** via `gh pr merge 161 --squash --delete-branch`
3. **Advance labels** on parent issue: `workflow/implement` → `status/done`
4. **Close** parent issue #158

## Key Lesson for the Protocol

The original "When NOT to use" clause said:
> "If local `npm run test` fails on the PR branch"

This is **too broad** for the case where:
- The failure is pre-existing (confirmed on master)
- The PR's diff didn't touch the failing code path
- The PR **did** touch the same file (for unrelated reasons) but not the failing test

The fix: check whether the PR introduced the failure, not whether the target branch has any failures. Use `git checkout master && npx vitest run -t "<test-name>"` to confirm pre-existing status.

## Related

- `references/permanent-ci-blockage-case-study.md` — PR #157 (E2E play-test pre-existing, different variant)
- `references/lost-check-run-implement-pr.md` — detection patterns for lost CI events
- `references/permanent-ci-blockage-case-study.md` — PR #157 (E2E play-test pre-existing variant)
