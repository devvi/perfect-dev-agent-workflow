# Stage-Gate Auto-Merge Disable

## Problem

The implement agent has `terminal` access and can run `gh pr merge --auto` (or `gh pr merge --squash`) immediately after creating a PR. On PR #153 (2026-07-13), the agent merged at 68 seconds, while CI finished at 29 seconds (fail). The PR was merged with failed CI before review could run.

## Fix (applied 2026-07-13)

`stage-gate.py` now forcefully disables auto-merge on every Open PR:

```python
if pr_state.upper() == 'OPEN':
    try:
        subprocess.run(
            ['gh', 'api', f'repos/devvi/perfect-dev-agent-workflow/pulls/{pr_num}',
             '-X', 'PATCH',
             '-f', 'auto_merge=false'],
            capture_output=True, text=True, timeout=10
        )
        print(f"🔒  Auto-merge disabled on PR #{pr_num}")
    except Exception as e:
        print(f"⚠   Could not disable auto-merge on PR #{pr_num}: {e}")
```

The REST API endpoint `PATCH /repos/:owner/:repo/pulls/:number` with `auto_merge=false` cancels any pending auto-merge request. After this, `gh pr merge --auto` will either fail or be a no-op.

## Detection

```bash
# Check if an implement PR has auto-merge enabled
gh pr view <N> --json autoMergeRequest
# If autoMergeRequest is non-null, auto-merge is still enabled
```

## Enforcement Chain

1. **stage-gate.py** runs after `gh pr create` in the implement agent's workflow
2. Disables auto-merge via REST API
3. Blocked PR check: if PR is already merged when stage-gate runs, the `pr_state != 'OPEN'` check catches it and exits with error

## Future Enhancement

The cron poller should also check for auto-merge on open PRs and disable it as a second line of defense.
