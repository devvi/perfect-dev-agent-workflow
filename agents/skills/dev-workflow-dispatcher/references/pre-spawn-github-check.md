# Pre-Spawn GitHub State Check (P3)

> **Problem:** Crontick processes the same issue's events multiple times, spawning duplicate phase agents. Each issue (#200, #201) had 2-3 duplicate PRs from multiple research/plan agents.
>
> **Root cause:** Event-processor groups events by priority per issue-tick but doesn't check GitHub state across ticks. Next tick may see the same issue with a fresh event and spawn again.
>
> **Fix:** Before generating SPAWN, check GitHub for existing phase PRs. Not a time window — a deterministic state check.

## Principle

Do NOT use time-based dedup (e.g., "don't spawn same phase within 10 minutes"). Time windows are fragile:
- Too short: duplicate agents still happen
- Too long: crashed agent stalls the issue for the whole window

Instead: **check GitHub state before every SPAWN.**

## Implementation (in event-processor.py)

```python
def _has_existing_phase_pr(issue_num: int, prefix: str) -> bool:
    """Check if a PR with the given branch prefix already exists for this issue.
    
    Args:
        issue_num: Parent issue number
        prefix: Branch prefix, e.g. 'research/', 'plan/', 'impl/'
    
    Returns:
        True if at least one open or merged PR with this prefix exists
    """
    import subprocess, json
    try:
        result = subprocess.run(
            ["gh", "pr", "list", "--state", "all", "--json",
             "headRefName,state,body",
             "--search", f'"Parent #{issue_num}" in:body'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return False  # gh CLI error — be conservative, don't block
        prs = json.loads(result.stdout)
        for pr in prs:
            if pr["headRefName"].startswith(prefix):
                return True
    except Exception:
        pass
    return False
```

Then, before each SPAWN line:

```python
# For research/plan/implement SPAWNs:
if _has_existing_phase_pr(issue_num, "research/"):
    print(f"[SKIP] research PR already exists for issue #{issue_num}")
    continue  # skip this event
```

Do NOT block self-correct SPAWNs — multiple self-correct iterations for the same issue may be needed.

## When It Fails

| Scenario | What happens | Recovery |
|----------|-------------|----------|
| gh CLI not available | Returns False → SPAWN proceeds → duplicate agent | Next tick's SPAWN check finds the PR created by first agent |
| API timeout | Returns False → may spawn duplicate | Low risk; same recovery as above |
| PR body missing Parent #N | PR not found → duplicate agent | Fix PR body to include Parent #N |
| Branch prefix mismatch | PR not found → duplicate agent | Rare; branch naming is automated |

## Real-World Trace (2026-07-15)

Issue #200: Four research PRs created (#203, #204, #206) by two consecutive cron ticks.
- Tick 1: event-processor output `SPAWN: research,issue=200` → LLM spawns agent → research PR #203
- 60s later, Tick 2: same issue's events still in pending → LLM spawns another agent → research PR #204
- Both agents create valid research PRs. One merges normally, the other stays open as orphan.

With pre-spawn check: Tick 2 would run `_has_existing_phase_pr(200, "research/")`, find PR #203, and skip the event.
