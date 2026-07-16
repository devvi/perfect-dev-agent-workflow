# check_run Event Dedup + Branch Extraction Fix

## Problem

The route script's dedup key was `check_run#<N>` for ALL check_run events (created, queued, in_progress, completed). The `created` event arrived first with `conclusion=null`. The `completed` event arrived later with the actual result but was dedup'd away — same key. The cron never saw the CI result.

Additionally, `check_run.head_branch` was empty in some webhook payloads (PR-triggered workflows). The branch name lived under `check_suite.head_branch` instead.

## Fix (applied 2026-07-13)

Two changes to `~/.hermes/scripts/workflow-dispatcher.py`:

### 1. Action-specific dedup keys

```python
if event_type == "check_run":
    action = payload.get("action", "")
    event_key = f"{check_run}.{action}#{issue_number}"
else:
    event_key = f"{event_type}#{issue_number}"
```

Now `check_run.created#157` and `check_run.completed#157` are distinct events.

### 2. Branch extraction fallback

```python
head_branch = cr.get("head_branch", "") or suite.get("head_branch", "")
```

Falls back to `check_suite.head_branch` when `check_run.head_branch` is empty.

## Detection

If a PR has CI results but no review agent spawned:

```bash
# Check pending file for incomplete events
cat ~/.hermes/workflow-pending.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d.get('events', []):
    if 'check_run' in e['_key']:
        print(f'{e[\"_key\"]} branch={repr(e.get(\"branch\",\"\"))} conclusion={repr(e.get(\"conclusion\"))}')"
```

If branch is empty or conclusion is None, the fix hasn't been applied or the webhook payload structure differs.
