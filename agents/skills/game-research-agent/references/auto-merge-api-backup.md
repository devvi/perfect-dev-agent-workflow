# Auto-Merge API Backup (vs gh pr merge Local Conflict)

## The Problem

`gh pr merge --auto` (and `gh pr merge --squash`) attempts to merge the PR **locally** first — it checks out the target branch, merges the PR branch, and validates the result. If the local repo's `origin/master` is behind GitHub's actual master (very common — other PRs merged between your branch creation and merge), the local merge may encounter false conflicts. The `--auto` flag may never actually be set on the PR.

This is a **gh CLI limitation**, not a GitHub API limitation. The PR itself is clean on GitHub (stage-gate passed, no server-side conflicts).

## Detection

After `gh pr merge --auto --squash --delete-branch`, verify the auto-merge was actually set:

```bash
# Check via REST API (not JSON field — gh pr view's --json may not expose autoMergeRequest)
AUTO_MERGE=$(gh api repos/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/pulls/${PR_NUM} --jq '.auto_merge')
if [ "$AUTO_MERGE" = "null" ] || [ -z "$AUTO_MERGE" ]; then
  echo "⚠️  Auto-merge was NOT set — falling back to direct API merge"
fi
```

## The Backup: Direct API Merge

The GitHub REST API merge endpoint merges **server-side only** — no local validation, no repo checkout:

```bash
gh api repos/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/pulls/${PR_NUM}/merge -X PUT \
  -f merge_method=squash
```

This works when:
- The PR is mergeable on GitHub (stage-gate passed, no server-side conflicts)
- The local repo is stale/conflicted (common — multiple PRs in flight)

## Trigger Conditions

| Condition | `gh pr merge --auto` | Direct API merge |
|-----------|---------------------|-----------------|
| Local repo is clean and up-to-date | ✅ Works | ✅ Works |
| Local repo has uncommitted changes | ❌ Fails (stash fixes this, but not always) | ✅ Works |
| `origin/master` is behind GitHub | ❌ False local conflicts | ✅ Works |
| PR has server-side conflict | ❌ Auto-merge not allowed | ❌ Fails with 405 |
| PR has server-side conflict but mergeable from `master` on GitHub | ❌ Local conflict | ✅ Works (GitHub accepts) |

## Prevention

1. **Always verify** — Run the API check after `gh pr merge --auto` to confirm it was set
2. **If auto-merge fails** — Fall back to direct API merge immediately (don't retry `gh pr merge`)
3. **After API merge** — Clean up locally:
   ```bash
   git checkout master && git pull origin master
   git branch -D research/plan/impl-${ISSUE_N}-* 2>/dev/null; true
   ```
4. **Stale `git stash pop`** — If `git stash pop` fails because the auto-merge already advanced master, just `git stash drop` and pull fresh
5. **Remote branch deletion** — `gh pr merge --delete-branch` only works if the PR was merged via gh CLI, not via API. After API merge:
   ```bash
   git push origin --delete research/plan/impl-${ISSUE_N}-* 2>/dev/null; true
   ```

## Real-World Trace (2026-07-14)

Issue #169 → Research PR #171:
1. Research agent created `docs/PRD/169-*.md` and opened PR #171
2. Stage-gate passed ✅
3. `gh pr merge --auto` failed — local master had advanced with PR #170's merge
4. Auto-merge was never set on the PR (verified: `auto_merge.enabled = null`)
5. **Fix:** `gh api repos/.../pulls/171/merge -X PUT -f merge_method=squash` — merged immediately
6. After merge: advanced issue label, commented handoff

The fix took 2 seconds once the detection was in place.
