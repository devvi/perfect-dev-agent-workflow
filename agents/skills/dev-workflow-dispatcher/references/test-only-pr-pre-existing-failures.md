# Test-Only PRs for Pre-Existing CI Failures (2026-07-14)

## Scenario

A PR (PR #173, issue #169) modifies **only** `tests/metroidvania-snake.test.js` to fix pre-existing test failures. CI fails because 6 tests still fail — all pre-existing (they reproduce on master). No implementation code changes needed.

## Trace

- **Issue #169:** `[CI] Pre-existing unit test failures in metroidvania-snake.test.js`
- **PR #173:** `impl/169-ci-pre-existing-test-failures` — 18 insertions, 7 deletions, all test-only
- **Fixed by PR:** 2 of 8 pre-existing failures (Phase 8 Integration BOSS room handling, Issue #70 B4 assertion)
- **Remaining:** 6 failures, all pre-existing (same test, same assertion error, same line as master)

## Comparison Technique

```
# On master:
npx vitest run 2>&1 | grep "^ FAIL\|^  ×\|expected" | head -30
# → 8 failures including "Phase 8" and "B4" (both fixed by PR)

# On PR branch:
npx vitest run 2>&1 | grep "^ FAIL\|^  ×\|expected" | head -30
# → 6 failures — SUBSET of master's 8 (the 2 fixed ones gone)
```

**Key insight:** The 6 PR-branch failures must be a strict subset of master's failures. Any new failure on the PR branch that doesn't appear on master is a regression.

## When PR Touches the Same Test File as Failing Tests

> **⚠️ DEPRECATED (2026-07-14):** The Permanent Stall Protocol (merge under bypass) has been removed. Do NOT merge with CI failures. Escalate to status/blocked.

The old disqualifier says: *"If the pre-existing failure is in a file the PR **did** touch **and the PR's diff affected the failing code path**"*

When a PR only touches tests:

| Situation | Verdict | Reasoning |
|-----------|---------|-----------|
| PR touched test A (fixed it) | Not a disqualifier | The failing test B was not affected by the diff |
| PR attempted to fix test C but failed | Still pre-existing | The failure is identical on master; the PR's change was insufficient but harmless |
| PR changed a shared helper that broke test D | **Regression — disqualifier** | The PR's diff directly caused a new failure |

**The "affected the failing code path" test:** Use `gh pr diff <N>` and verify the specific failing test's assertions / setup were NOT changed. If the PR only changed a different test function within the same file, it's safe.

## Master CI Permanence Check

```bash
gh run list --branch master --workflow review --limit 5 \
  --json conclusion,createdAt,displayTitle
```

If ALL 5+ recent master runs have the same failure pattern (same test names, similar errors), the CI is permanently broken. Document the oldest failing run date.

## Action Protocol

1. **Comment on PR** with the comparison results
2. **Create tracking issue** for remaining failures (use `--body-file` not `--body` to avoid shell escaping issues with multi-line content)
3. **Verify no `ci` label exists** before using it:
   ```bash
   gh label list | grep ci  # if missing, use only "bug"
   ```
4. **Merge under protocol** — `gh pr merge <N> --squash --delete-branch`
5. **Notify** via Feishu: `📋 #N → merged (pre-existing CI bypassed — X/Y failures fixed, tracking #N)`
