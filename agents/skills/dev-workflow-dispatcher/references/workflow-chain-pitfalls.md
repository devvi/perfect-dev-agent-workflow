# workflow-chain.yml Pitfalls

> The `workflow-chain.yml` GitHub Action advances issue labels when a workflow PR
> is merged. It lives at `.github/workflows/workflow-chain.yml`.

## How It Works

```
PR merged (pull_request.closed + merged=true)
  → Action checks PR body for parent issue reference
  → Maps PR's workflow label (e.g. workflow/research) → next stage label
  → Advances issue labels (add next, remove current)
  → Closes issue if implement PR (last stage)
```

## Critical: PR Body Must Reference Parent Issue

The Action finds the parent issue by regex-matching the PR body:

```javascript
const parentMatch = body.match(/(?:Closes|parent)\s*#(\d+)/i);
```

**The body MUST contain `Parent: #N` or `Closes #N`.**

```markdown
# ✅ Works:
Parent: #94

# ✅ Also works:
Closes #94

# ❌ Does NOT match:
Research for #94
# ❌ Does NOT match:
See #94 for details
# ❌ Does NOT match:
[Parent: #94](...)
```

This is a silent failure — the Action runs successfully but does nothing
(logs `"no parent issue reference in body — can't advance"`).

## Label → Next Stage Mapping

```javascript
const nextStage = {
    'workflow/research':  'workflow/plan',
    'workflow/plan':      'workflow/implement',
    'workflow/implement': 'workflow/test',
    'workflow/test':      null,  // test → close issue (done)
};
```

## Default Branch Name

The Action operates on whatever the repo default branch is. If the default
is `master` (not `main`), ensure all branch operations use `master`.

## PR Label Must Match

The PR must have one of these labels for the Action to process it:
- `workflow/research`
- `workflow/plan`
- `workflow/implement`

Without a workflow label, the Action logs `"PR #N has no workflow label"` and skips.

Available workflow labels (in stage order):
- `workflow/research`
- `workflow/plan`
- `workflow/implement`
- `workflow/test`

## Agent Token May Not Be Able to Set PR Labels

When the Hermes agent creates and merges PRs manually (bypassing the operator agent), it uses
`gh pr edit <N> --add-label workflow/research`. This requires the GitHub PAT to have `read:org` scope;
a `repo`-only PAT will fail with a GraphQL error. The `workflow-chain.yml` Action's own `GITHUB_TOKEN`
has correct scopes, but if the PR merged **without** the workflow label, the Action won't process it.

**Workaround:** After the PR merges, advance the issue label directly (bypassing workflow-chain.yml):
```bash
gh issue edit <ISSUE_N> --remove-label workflow/research --add-label workflow/plan
```

This produces the same state transition that the Action would have done.

## ⚠️ Cascading Impact: `deploy.yml` Also Checks PR Labels

The label-gap problem doesn't stop at `workflow-chain.yml`. The `deploy.yml` Action also checks for
`workflow/implement` on the **PR** (not the issue). When implement PRs merge without the label,
`deploy.yml` logs `"PR #$PR_NUM does NOT have workflow/implement label → skip deploy."` and skips
the Vercel deployment entirely.

**Why this matters:** Even the "advance issue labels manually" workaround only fixes `workflow-chain.yml`
label transitions. It does **nothing** for deployment — `deploy.yml` reads the PR's labels from the
merge event, and the missing label was never there to begin with.

**To fix deployment, pick one:**
1. Add `read:org` scope to the PAT — fixes both PR labels and deployment
2. Modify `deploy.yml` to detect implement PR merges by branch name pattern (`impl/*`)
   instead of checking PR labels — no token scope change needed
3. Manually re-label the PR after creation via `gh pr edit <N> --add-label workflow/implement`
   (still blocked by `read:org` — only works if PAT already has the scope)

## 🟢 FIXED: Deploy Race Condition (2026-07-11)

`deploy.yml` was changed from PR label check (`workflow/implement`) to branch-name check (`impl/*`).
The fix was committed and pushed to master.

**Root cause:** deploy.yml (push trigger) and workflow-chain.yml (pull_request.closed trigger) ran
concurrently. The PR's `workflow/implement` label was added by workflow-chain.yml — but deploy.yml
checked for it first and always found it missing. The operator couldn't add the label pre-merge
(no `read:org` scope), making the label permanently absent at the moment deploy.yml checked.

**Fix approach chosen:** Branch-name check. The PR's `.head.ref` is immutable after creation — no
race condition, no scope dependency.

Confirmed on `devvi/perfect-dev-agent-workflow` with Issue #109 → PR #112:

### Evidence

| Time (UTC) | Event | Detail |
|------------|-------|--------|
| 15:18:12Z | PR #112 merged | Merge commit `78fd6ae` pushed to master |
| 15:18:15Z | `deploy.yml` triggered (push) | Run id=29103150106 on commit `78fd6ae` |
| 15:18:19Z | Deploy `check-implement` runs | **Finds PR #112** via commit-SHA lookup |
| 15:18:19.576Z | Label check fails | `"PR #112 does NOT have workflow/implement label → skip deploy."` |
| 15:18:19.594Z | Deploy skipped | `skip-notify` runs — deploy never happens |
| ~15:18:12Z | `workflow-chain.yml` triggered | Runs concurrently with deploy (pull_request.closed) |
| Later | PR #112 gains `workflow/implement` label | Added by workflow-chain.yml post-merge? Unclear mechanism |

### What Actually Happened

- **Deploy never ran** — all 5 deploy runs on commit `78fd6ae` skipped (no label or no PR found)
- **Issue #109 still closed as COMPLETED** — workflow-chain.yml eventually processed it, likely via
  a subsequent push event where the label was already attached
- **No Vercel URL posted** — zero issues in recent history (#94, #95, #101, #102, #109) have
  a `🚀 Vercel:` comment
- **The issue workflow DID complete** — confirming that workflow-chain.yml can close issues even
  when deploy.yml skips them (they are independent pipelines)

### Root Cause

`push` (deploy.yml) and `pull_request.closed` (workflow-chain.yml) fire SIMULTANEOUSLY.
`deploy.yml` runs first and sees the PR without the workflow label because:

1. The operator agent cannot add PR labels (no `read:org` scope on PAT)
2. Even if workflow-chain.yml eventually adds the label, it hasn't run yet when deploy.yml
   checks — the events race and deploy always loses
3. This is NOT just a scope issue — it's a fundamental event-ordering problem

### Diagnosing on Your Own Deploys

```bash
# Find deploy runs on the merge commit
gh run list --workflow deploy --repo <owner>/<repo> --json headSha,conclusion,createdAt \
  --jq '.[] | select(.headSha == "<MERGE_COMMIT>")'

# Check what check-implement decided
gh run view <RUN_ID> --repo <owner>/<repo> --log \
  | grep -E 'has workflow/implement|does NOT have|No merged PR found|should_deploy'

# Check if the PR ever got the label
gh pr view <PR_NUM> --repo <owner>/<repo> --json labels --jq '[.labels[].name]'
```

### The Fix (Race-Condition-Free Design Change)

Even adding `read:org` to the PAT only fixes PR label assignment. The race remains:
push fires at the same time as pull_request.closed, so deploy.yml can never see
labels added by workflow-chain.yml (which hasn't run yet).

**Recommended:** Change `deploy.yml` to detect implement PR merges by branch name:

```yaml
# Replace label check with branch-name check — no race, no scope issue
FROM_BRANCH=$(gh pr view $PR_NUM --json headRefName --jq '.headRefName')
if [[ "$FROM_BRANCH" == impl/* ]]; then
  echo "should_deploy=true"
fi
```

This is race-condition-free because the PR's branch name is immutable — it was set at
creation time and never changes. The label, by contrast, is set post-merge by a concurrent
Action and is never visible to the push trigger.

## Branch-Fallback Label-Add Fails Without `pull-requests: write`

The `workflow-chain.yml` has a branch-name fallback that fires when the PR lacks a
workflow label. It derives the label from the branch prefix (e.g. `research/` →
`workflow/research`) and then tries to add that label to the PR:

```javascript
if (matchedPrefix) {
    activeLabel = branchLabelMap[matchedPrefix];
    // ❌ This fails when GITHUB_TOKEN only has pull-requests:read
    await github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pr.number,  // This is the PR number, treated as an issue
        labels: [activeLabel],
    });
}
```

**Error:** `HttpError: Resource not accessible by integration (403)`
The Action's `GITHUB_TOKEN` has `pull-requests: read` only — adding labels to a PR
requires `pull-requests: write`.

**Impact:** The entire label advancement **fails** — the issue never gets its `workflow/plan`
label, and the workflow stalls at the research phase even though the PR merged successfully.

**Fix:** Wrap the PR label addition in a try/catch. The PR label is cosmetic; the branch-name
derivation already correctly identifies the active label, so the addLabels call is unnecessary
for correct operation:

```javascript
try {
    await github.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pr.number,
        labels: [activeLabel],
    });
} catch (labelErr) {
    // PR label is cosmetic — branch-name derivation already works
    console.log(`PR #${pr.number}: could not add workflow label (${labelErr.status} ${labelErr.message}) — continuing with branch-derived label`);
}
```

**Verified on PR #139 (research/138-mobile-support):** The fix was committed to master
as commit `127fc64`. After the fix, the issue label advancement to `workflow/plan`
succeeds because `issues.addLabels` / `issues.removeLabel` on the **parent issue number**
only needs `issues: write` (which the token has).

## Troubleshooting

| Symptom | Likely Cause |
|---------|-------------|
| PR merged but issue label didn't change | PR body missing `Parent: #N` or `Closes #N`; OR branch-fallback label-add crashed (check Action logs for `HttpError: Resource not accessible by integration`) |
| Issue closed unexpectedly | Could be route script (if script runs `gh issue edit --state closed`). Check issue events timeline: `gh api repos/<owner>/<repo>/issues/<N>/events` |
| Action ran but nothing happened | Check Action logs: `gh run list --workflow workflow-chain` |

### Diagnosing Branch-Fallback Failure

```bash
# Check the workflow-chain run for the merged PR
gh run list --workflow workflow-chain.yml --json name,conclusion,createdAt,headBranch \
  --jq '.[] | select(.conclusion == "failure")'
# View the log to see which step failed
gh run view <RUN_ID> --log | grep -i "error\|HttpError\|addLabels"
```
