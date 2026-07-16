# Route Script Reference (Thin Pattern)

> The route script (`workflow-dispatcher.py`) is intentionally THIN. It writes webhook
> events to a pending file and outputs `[SILENT]`. All actual work (labels, comments,
> git, PRs, phase agents) is handled by a spawned operator agent.

## Why Thin?

Earlier versions of the route script tried to do everything — gh commands, git operations,
PR creation. This caused three critical bugs:

1. **Duplicate PRs** — script didn't check if branch/PR already existed before creating
2. **Issue auto-close** — gh commands from the script somehow closed the parent issue
3. **State racing** — multiple webhook events for the same issue would race each other

The thin script avoids ALL of these by doing only one thing: writing the event to a file.

## Script Location

`~/.hermes/scripts/workflow-dispatcher.py`

## What It Does

1. Receives webhook payload JSON on stdin
2. Parses event type and issue number
3. Extracts only essential fields (label name, branch, conclusion) — **drops the full payload** (was 10-25KB per event, bloating cron context)
4. Writes a deduplicated entry to `~/.hermes/workflow-pending.json`
5. Prints `[SILENT]` to stdout (suppresses Hermes agent run)

```python
# Core logic — FIXED 2026-07-12: no full payload stored
event_key = f"{event_type}#{issue_number}"
pending = read_pending_file()
if event_key not in existing_keys:
    pending["events"].append({
        "_key": event_key,
        "type": event_type,
        "issue": issue_number,
        "repo": repo,
        "ts": time.time(),
        # label, branch, conclusion added conditionally (<100 chars each)
        # NO "payload" field — was bloating cron context
    })
write_pending_file(pending)
print("[SILENT]")  # ← prevents unnecessary LLM run
```

## Subscription Setup

```bash
hermes webhook subscribe <name> \
  --events "issues,pull_request,check_run" \
  --script "workflow-dispatcher.py" \
  --deliver log
```

- NO `--prompt` — script handles processing
- NO `--skills` — agent should NOT run
- `--deliver log` — prevents delivery errors

## Output Convention

| stdout | Meaning |
|--------|---------|
| `[SILENT]` | Normal — event recorded, no agent needed |
| `{"status": "error", ...}` | Error — agent may run but won't have tools |

## Debugging

The script's stderr is NOT captured in gateway logs. Add file-based logging:

```python
import time
with open("/tmp/workflow-dispatcher.log", "a") as f:
    f.write(f"[{time.time()}] Event: {event_type}#{issue}\\n")
```

```bash
tail -f /tmp/workflow-dispatcher.log
```

## Gateway Log Interpretation

After the script runs successfully and outputs `[SILENT]`, the gateway logs:
```
[webhook] script ignored event=issues route=github-dev-workflow
```

This is **expected, normal behavior** — NOT an error. The "ignore" refers to the gateway NOT spawning a full Hermes agent session (saving LLM tokens). The event was written to `~/.hermes/workflow-pending.json` and will be picked up by the cron poller.

**Quick verification:**
```bash
cat ~/.hermes/workflow-pending.json
# Look for: {"_key": "issues.opened#N", ...} in the events array
```

See `references/gateway-log-debugging.md` for a full guide to interpreting gateway log messages.
