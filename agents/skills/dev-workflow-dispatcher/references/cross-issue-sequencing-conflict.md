# Cross-Issue Sequencing Conflicts

> **Problem discovered 2026-07-15:** Two implement PRs running in parallel can cause CI failures on one due to test files from another's plan phase being merged to master, without the corresponding source change.

## The Pattern

```
Issue A Plan PR merges to master        → adds tests/A-feature.test.js to master
Issue B Implement PR runs CI            → merge commit includes tests/A-feature.test.js
                                        → tests/A-feature.test.js fails (A's source not on master)
                                        → CI FAILURE on PR B, even though B's code is correct
```

**Key insight:** The plan phase commits test files to master. If those tests reference source code from Issue A's implement phase, and Issue A's implement PR hasn't merged yet, then any other PR (Issue B) whose CI runs on master will fail those tests — because master has the test expectations but not the source implementation.

## Real-World Trace — PR #211 and #212 (2026-07-15)

### PR #212 (impl/201-keyboard-hints)
- **Issue #201:** Title screen keyboard hints — change "ENTER  Select" → "ENTER/SPACE  Select"
- **Source change:** `public/src/render/overlays.js` line 66 — 1-line string change
- **Test file:** `tests/201-keyboard-hints.test.js` (added by plan PR #210 which merged to master)
- **CI:** FAILURE — 4 tests fail in `tests/201-keyboard-hints.test.js`
- **Root cause:** The tests read the source file but fail because... well, the source DOES contain the expected string (`'ENTER/SPACE  Select'`). The failure appears to be a test file reading issue (the test reads the source and gets only the first line). This is a different pattern than the cross-issue conflict.

### PR #211 (impl/200-title-version)
- **Issue #200:** Title screen version display — add version label
- **Source change:** This is a test-only PR — the version display code was already in master from Issue #175
- **Test file:** `tests/title-version.test.js` (added by plan PR #209)
- **CI:** FAILURE × 2 — both runs fail:
  - Run 1 (29352869393): `tests/201-keyboard-hints.test.js` — 4 failures (cross-issue!)
  - Run 2 (29354628393): `tests/201-keyboard-hints.test.js` — 4 failures (same)
- **Root cause:** Master merged `tests/201-keyboard-hints.test.js` from #201's plan PR #210. PR #211's branch doesn't change `overlays.js` (the #201 source file). When CI runs on the merge commit of #211 into master, it includes #201's test file but not #201's source change. The #201 tests fail because they expect `'ENTER/SPACE  Select'` but the merge commit still has `'ENTER  Select'` in `overlays.js`.

### Git State at Time of Failure

```
master HEAD: 0c95fd3 — Plan: DESIGN doc and test cases for #201 keyboard hints (#210)
                          └─ adds tests/201-keyboard-hints.test.js to master

impl/200-title-version (PR #211):
  merge-base: 5ed3ba7 — Merge research PR #206 for #200
  commits:     6346a8f fix: CI job
               58b37be feat(#200): add version display tests
               df9e393 fix(tests): clear random food in C2/C4
  master at branch point: 5ed3ba7 (does NOT have tests/201-keyboard-hints.test.js)

impl/201-keyboard-hints (PR #212):
  commits: 169bf34 feat(#201): show ENTER/SPACE as select hint
  master at branch point: older (no #201 plan files)
```

## Detection

Check for cross-issue sequencing conflict when:

1. An implement PR has CI failures in a test file from a DIFFERENT issue number
2. The PR's `git diff master --stat` does NOT touch the failing test file
3. The failing tests reference source code changes from another open implement PR
4. On master, the test file exists (was added by a plan phase merge) but the source change it tests does NOT exist on master

```bash
# Detection commands
# 1. Get the failing test file from CI
gh run view <run-id> --log-failed | grep -oP "tests/\S+\.test\.js" | head -1

# 2. Check if the failing file is from a different issue
#    (check the test file's git log for its origin issue)
git log --oneline -- <failing-test-file> | head -3

# 3. Check if the PR touches the failing file
gh pr diff <PR-N> --name-only | grep <failing-test-file> || echo "Not touched by PR"

# 4. Check if the source code referenced by the test exists on master
#    (e.g., if test looks for 'ENTER/SPACE  Select' in overlays.js)
grep "expected string" <failing-test-file>  # extract what the test checks for
grep "that string" public/src/<source-file>  # check if master has it
```

## Remediation

### Option A: Wait (if the other PR is close to merging)
If Issue A's implement PR is mergable or has CI passing, merge it first, then rebase Issue B's branch on master. This resolves the conflict without code changes.

### Option B: Delete the conflicting test file from the branch
If Issue A's tests are self-contained (no production code dependency on Issue B), delete them from Issue B's branch. This prevents the CI merge commit from running them:

```bash
git rm tests/A-feature.test.js
git commit -m "chore: remove A-feature tests (belong to Issue A, not Issue B)"
git push
```

**⚠️ This is a workaround, not a clean fix.** The tests will still need to pass when the branch eventually merges — but they'll pass once Issue A's source is on master.

### Option C: Fix the test or CI workflow
If the failing tests are legitimately testing functionality that SHOULD be on master but isn't yet (because plan phase merged test ahead of source), the CI workflow needs multi-branch awareness. This is a design-level change to the workflow itself.

### Option D: Merge master into the branch after the blocking PR merges

If the blocking issue's implement PR (e.g., PR #212 for Issue #201) has since merged to master, merge master into the stalled PR branch rather than rebasing. This approach is preferred when the branch has merge conflicts that need resolution:

```bash
git fetch origin master
git merge origin/master
# Resolve conflicts if any
git add <resolved-files>
git commit -m "Merge branch 'origin/master' into <branch>"
git push origin <branch>
```

**Conflict resolution pattern for cross-issue test files:** When the conflict is in a test file that was added by the other issue's plan phase (e.g., `tests/201-keyboard-hints.test.js`), and the other issue's implement PR has since merged to master:
- Keep master's version of the test file (it's active and passing now that the other issue's source code is on master)
- The branch's version likely has `describe.skip(...)` — replace with master's `describe(...)`
- Do NOT re-introduce `.skip` or other compatibility workarounds

**Verification:** After pushing, wait for CI. If CI now passes (all tests green), proceed with review + merge.

### Option E: Self-correct with cross-conflict awareness (rebased)
If the PR is already in self-correct and the self-correct agent has tried Option B but CI still fails (because GitHub's merge commit includes master's test file), rebase on master after the other PR merges:

```bash
git fetch origin master
git rebase origin/master
git push --force-with-lease origin <branch>
```

### Option F: Report-and-block (no code changes)
If the CI failure is entirely in test files from a different issue (cross-issue), and the self-correct agent determines no PR code change will fix it, the correct action is:

1. **Document the finding** on the PR — which test file is failing, which issue it belongs to, and why the PR can't fix it
2. **Use an existing label only** — set the parent issue to `status/blocked` with a comment explaining the cross-issue dependency
3. **Do NOT create new labels** — `workflow/needs-review`, `workflow/test`, or any ad-hoc label does not exist in the workflow system. Using them creates orphan labels with no downstream handlers
4. **Do NOT merge** — wait for the blocking issue's implement PR to merge first, then rebase

**Real-world trace (2026-07-15):** Self-correct agent for PR #211 (impl/200-title-version) correctly diagnosed the cross-issue conflict with Issue #201 but set `workflow/needs-review` — an orphan label. The correct action was `status/blocked` with a dependency comment.

## Prevention

1. **Sequencing:** If two implement PRs have overlapping files (one's test file references another's source), merge them in order — source PR first, then test PR. This avoids the cross-issue CI failure entirely.

2. **Test file isolation:** Plan-phase test files should only test the feature they belong to, using mocks or stubs for dependencies that don't exist yet.

3. **Plan PR test self-containment:** The plan phase should verify that test files pass on master even without the implement source (using mocks or conditional logic).
