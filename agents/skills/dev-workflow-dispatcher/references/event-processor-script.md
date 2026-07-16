# Event Processor Script (event-processor.py)

> A deterministic Python preprocessor that runs before the cron LLM agent.
> Location: `~/.hermes/scripts/event-processor.py`
> Trigger: Cron `script` parameter on `workflow-pending-poller`

## Purpose

The cron agent (LLM) must handle `check_run.completed` events deterministically.
LLMs are unreliable for grouping, sorting, and prioritizing multi-event files.
This script does ALL deterministic preprocessing before the LLM sees anything.

## How It Works

```
Cron tick:
  1. event-processor.py runs (Python, deterministic)
     - Reads ~/.hermes/workflow-pending.json
     - Groups events by issue number
     - Keeps only highest-priority event per issue
     - Discards non-actionable events (pull_request.*, check_run.created, etc.)
     - Validates check_run.completed fields (branch, conclusion)
     - Atomically writes cleaned file (discarded events removed)
     - stdout: simplified actionable event list (or empty)
  2. Script output → injected into LLM context (cron job `script` parameter)
  3. LLM reads context and makes branching decision only
```

## Output Format

```
P1: check_run.completed,issue=N,branch=impl/xxx,conclusion=success
P2: issues.labeled,issue=N,label=workflow/implement
```

## Stalled Scan Signal (Critical)

**When the pending file is empty** (no events at all), the script must NOT produce empty stdout. The Hermes cron scheduler checks script output before deciding whether to launch the LLM:

```
script produced no output → skipping AI call → [SILENT] → 0-byte output file
```

If the LLM never runs, proactive scans (stalled PRs, stalled labels, stalled phases) never execute. The script must output a deterministic signal to force the LLM to run:

```
[NO_ACTIONABLE_EVENTS: run stalled scan]
```

The cron LLM prompt checks for this signal and runs the Stalled PR Resolution Protocol (merge unmerged research/plan PRs, advance labels, detect stalled phases). Without this signal, stalled PRs sit open indefinitely.

**Design rule:** The script must ALWAYS output something — either actionable events or the stalled scan signal. Never exit silently when the file is clean.

## Priority Rules

| Priority | Event Type | Conditions | Action |
|----------|-----------|------------|--------|
| P1 | `check_run.completed` | branch != "", conclusion ∈ {success, failure} | Forward to LLM for spawn |
| P2 | `issues.labeled` | label starts with "workflow/" | **GitHub PR dedup check** → forward to LLM or skip |
| Discard | Everything else | pull_request.*, check_run.created, check_run.skipped, non-workflow labels | Remove from file |

## GitHub PR Dedup (2026-07-15)

Before generating a `SPAWN:` instruction for `issues.labeled` events, the script queries GitHub to check if a PR already exists with a branch matching the stage+issue pattern:

```python
STAGE_BRANCH_PREFIX = {
    "research": "research/",
    "plan": "plan/",
    "implement": "impl/",
    "self-correct": "self-correct/",
}

def _pr_exists_for_issue(stage, issue):
    prefix = STAGE_BRANCH_PREFIX.get(stage)
    branch = f"{prefix}{issue}"
    result = subprocess.run(
        ["gh", "pr", "list",
         "--search", f"{branch} in:headRefName",
         "--json", "number",
         "--jq", "length",
         "--limit", "1"],
        capture_output=True, text=True, timeout=10
    )
    return int(result.stdout.strip() or "0") > 0
```

**Why this is needed:** Before this fix, two concurrent `issues.labeled` webhooks for the same issue would produce two identical `SPAWN:` outputs. The cron agent would spawn two phase agents, each creating their own PR for the same issue (observed: Issues #200, #201 each had duplicate research PRs).

**Behavior:**
- **PR already exists** → skip SPAWN, remove event from pending file
- **No PR exists** → normal SPAWN output
- **`gh` fails (timeout, unavailable)** → default to SPAWN (cautious — don't drop events)
- **Unknown stage** → skip check (don't block non-standard labels)

**Why `--search` over `--head`:** The `--head` flag treats the input as an exact branch name and can't do pattern matching. `--search "branch in:headRefName"` is a search qualifier that matches substrings, robust against shell glob expansion.

## Atomic Write Pattern

Uses `tempfile.mkstemp()` + `shutil.move()` to atomically update the pending file,
avoiding the sibling-agent race condition that `write_file` suffers from.

## Test Cases (verified 2026-07-14)

| Input | Output | File After | 
|-------|--------|-----------|
| pull_request.opened + check_run.created + check_run.completed(failure) | P1: issue=154, conclusion=failure | Only check_run.completed remains |
| check_run(success) + issues.labeled | P1 then P2 in order | Both remain (for LLM to process) |
| Non-workflow label ("bug") | Empty | Removed from file |
| Stale check_run (empty branch) | Empty | Removed from file |
| Two different issues | One line each | Both remain |
| Empty file | Empty | Empty |
| Skipped conclusion | Empty | Removed from file |
| **Same issue, multiple issues.labeled at different stages** (available → depth/standard → research → plan, plus unlabeled events) | **P2: issue=169, label=workflow/plan** (most recent workflow label) | Only the `workflow/plan` event remains; all older `issues.labeled` + `issues.unlabeled` events for #169 are removed |

## Known Gap: Same-Issue `issues.labeled` Prioritization

**Observed (2026-07-14):** The script's per-issue priority logic picks the *first* P2-matching event for each issue, not the *most recent* chronologically. When issue #169 had events for `workflow/available`, `workflow/research`, and `workflow/plan`, the script surfaced `workflow/available` (the oldest) instead of `workflow/plan` (the current label).

**Root cause:** The priority rule "keep highest-priority per issue" was designed for cross-type prioritization (P1 check_run > P2 issues.labeled > discard). Within the same event type, there is no second-order sort by timestamp or label recency.

**Impact:** The LLM receives a stale label event. Workaround: the cron prompt has a dedicated "After processing all script-output events" section that checks the pending file for remaining events — the correct `workflow/plan` event is still in the file. But this is an extra LLM round-trip that the script should ideally handle.

**Recommended fix:** For `issues.labeled` events on the same issue, sort by `ts` (timestamp) and keep the most recent one. Since workflow labels only advance forward (available → research → plan → implement), the most recent label event is always the current one. `issues.unlabeled` events can be safely discarded because the last labeled event represents the active state.

## Design Maxim

**Never ask an LLM to do what a Python script can do deterministically.**

- Script handles: read JSON, group by field, sort, emit summary, atomic file write
- LLM handles: verify GitHub state (is the PR still open?), branch decision (review or self-correct?)
- Any single-cron architecture that mixes event types in one LLM prompt should
  use a script preprocessor to do the deterministic event management
