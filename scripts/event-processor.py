#!/usr/bin/env python3
"""Deterministic event preprocessor for workflow-pending-poller cron.

Reads ~/.hermes/workflow-pending.json, applies deterministic rules:
  - Groups events by issue number
  - Keeps only the highest-priority event per issue
  - Validates check_run.completed fields (branch, conclusion)
  - Removes non-actionable events from the file
  - Outputs simplified actionable event list for LLM

This script runs BEFORE the LLM agent in the cron tick.
Its stdout is injected into the LLM's context.

Output format (to stdout):
  Empty                                → no actionable events
  P1: check_run.completed,issue=N,...  → one per line, sorted P1 first
  P2: issues.labeled,issue=N,...      → labeled events follow

File modification:
  - REMOVES from file: pull_request.*, check_run.created, any non-actionable
  - KEEPS in file: check_run.completed, issues.labeled (for LLM to process)

Uses atomic write (tempfile + rename) to avoid sibling-agent races.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import shutil
import time
from collections import defaultdict

PENDING_FILE = os.environ.get("EVENT_PROCESSOR_PENDING_FILE") or os.path.expanduser("~/.hermes/workflow-pending.json")

# ── Priority definitions ───────────────────────────────────────────
# Lower number = higher priority
PRIORITY = {
    "check_run.completed": 1,  # CI finished — most urgent
    "issues.labeled": 2,       # Phase start — important
}
PRIORITY_MAX = 99  # For events that should be discarded


def read_pending():
    """Read the pending file, return events list."""
    if not os.path.exists(PENDING_FILE):
        return []
    try:
        with open(PENDING_FILE) as f:
            data = json.load(f)
        return data.get("events", [])
    except (json.JSONDecodeError, IOError):
        return []


def write_pending(events):
    """Atomically write events back to pending file."""
    data = {"events": events, "processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    # Atomic write via tempfile + rename
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(PENDING_FILE))
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
        shutil.move(tmp, PENDING_FILE)
    except Exception:
        os.unlink(tmp)
        raise


def _event_action(event):
    """Extract action from event _key (e.g., 'check_run.completed' from 'check_run.completed#154')."""
    key = event.get("_key", "")
    return key.split("#")[0]  # "check_run.completed"


def event_priority(event):
    """Return numeric priority for an event. Lower = higher priority."""
    etype = event.get("type", "")
    action = _event_action(event)

    # check_run.completed — P1 (urgent)
    # Only actionable if branch and conclusion are present
    if etype == "check_run" and action == "check_run.completed":
        branch = event.get("branch", "")
        conclusion = event.get("conclusion", "")
        if branch and conclusion in ("success", "failure"):
            return PRIORITY["check_run.completed"]
        # has some data but incomplete — still forward to LLM for fallback query
        if branch or conclusion:
            return PRIORITY["check_run.completed"] + 1
        # completely empty — treat as discard
        return PRIORITY_MAX

    # issues.labeled — P2 (phase start)
    if etype == "issues.labeled":
        label = event.get("label", "")
        if label.startswith("workflow/"):
            return PRIORITY["issues.labeled"]
        # non-workflow labels — not actionable
        return PRIORITY_MAX

    # Everything else: pull_request.*, check_run.created, check_run.skipped,
    # issues.opened, issues.closed, issues.unlabeled, etc.
    return PRIORITY_MAX


def should_discard(event):
    """Return True if this event should be REMOVED from the pending file."""
    return event_priority(event) == PRIORITY_MAX


def validate_check_run(event):
    """Surface-level validation: branch exists, conclusion is actionable.
    Returns True if the event is potentially actionable (LLM still does
    final validation via gh)."""
    etype = event.get("type", "")
    action = _event_action(event)
    if etype != "check_run" or action != "check_run.completed":
        return True  # not a check_run, skip validation
    branch = event.get("branch", "")
    conclusion = event.get("conclusion", "")
    if not branch:
        return False  # can't determine which PR this is for
    if conclusion not in ("success", "failure"):
        return False  # not actionable
    return True


# ── Stage → branch prefix mapping ─────────────────────────────────
STAGE_BRANCH_PREFIX = {
    "research": "research/",
    "plan": "plan/",
    "implement": "impl/",
    "self-correct": "self-correct/",
}


def _pr_exists_for_issue(stage: str, issue: int) -> bool:
    """Check if a GitHub PR already exists for this stage+issue combination.
    Returns True if a PR exists (SPAWN should be skipped).
    On error (gh unavailable, timeout), returns False so spawn still happens."""
    prefix = STAGE_BRANCH_PREFIX.get(stage)
    if not prefix:
        return False
    branch = f"{prefix}{issue}"
    try:
        result = subprocess.run(
            ["gh", "pr", "list",
             "--search", f"{branch} in:headRefName",
             "--json", "number",
             "--jq", "length",
             "--limit", "1"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            count = int(result.stdout.strip() or "0")
            return count > 0
    except (subprocess.TimeoutExpired, ValueError, OSError):
        pass
    return False  # on error, spawn anyway (cautious)


def preprocess():
    """Main preprocessing logic. Returns list of actionable event summaries."""
    events = read_pending()
    if not events:
        return []  # no output, LLM sees nothing

    # Step 1: Group by issue number
    groups = defaultdict(list)
    for event in events:
        issue = event.get("issue")
        if issue is None:
            # Events without issue number — can't group, check individually
            groups["__unknown__"].append(event)
        else:
            groups[str(issue)].append(event)

    # Step 2: For each group, keep only highest-priority event
    # For check_run events with same priority, keep the LATEST (by ts)
    kept = []
    discarded_keys = set()
    for issue_id, group_events in groups.items():
        if issue_id == "__unknown__":
            # Events without issue number — unlikely to be actionable
            for ev in group_events:
                if not should_discard(ev):
                    kept.append(ev)
                else:
                    discarded_keys.add(ev.get("_key", ""))
            continue

        # Sort by priority first, then by timestamp descending (newest first)
        # For check_run events, this ensures latest conclusion wins
        group_events.sort(key=lambda e: (event_priority(e), -e.get('ts', 0)))
        best = group_events[0]

        if should_discard(best):
            # Even the best event in this group is discardable
            for ev in group_events:
                discarded_keys.add(ev.get("_key", ""))
        else:
            # Keep the best, discard the rest
            kept.append(best)
            for ev in group_events[1:]:
                discarded_keys.add(ev.get("_key", ""))

    # Step 3: Sort kept events by priority (P1 first)
    kept.sort(key=lambda e: event_priority(e))

    # Step 4: Validate check_run events
    valid_kept = [e for e in kept if validate_check_run(e)]

    # Step 5: Filter out invalid check_run events (they go to discard pile)
    for e in kept:
        if not validate_check_run(e):
            discarded_keys.add(e.get("_key", ""))

    # Step 6: Write updated file (remove discarded events)
    remaining = [e for e in events if e.get("_key", "") not in discarded_keys]
    write_pending(remaining)

    # Step 7: Generate imperative output for LLM
    # Format: SPAWN:<agent>,issue=N,pr=N,branch=xxx,conclusion=xxx
    # The LLM MUST execute SPAWN instructions — do NOT output [SILENT]
    output_lines = []
    for event in valid_kept:
        etype = event.get("type", "")
        action = _event_action(event)
        issue = event.get("issue", "")
        if etype == "check_run" and action == "check_run.completed":
            branch = event.get('branch', '')
            conclusion = event.get('conclusion', '')
            if branch.startswith("impl/") and conclusion == "failure":
                # Look up the parent issue from the PR body
                parent_issue = issue  # fallback to PR number
                try:
                    pr_body = subprocess.run(
                        ["gh", "pr", "view", str(issue), "--json", "body", "--jq", ".body"],
                        capture_output=True, text=True, timeout=10
                    ).stdout.strip()
                    m = re.search(r'(?:Closes|parent|Parent)\s*#(\d+)', pr_body)
                    if m:
                        parent_issue = int(m.group(1))
                except Exception:
                    pass
                output_lines.append(
                    f"SPAWN: self-correct,issue={parent_issue},"
                    f"pr={issue},branch={branch},conclusion={conclusion}"
                )
            elif branch.startswith("impl/") and conclusion == "success":
                parent_issue = issue  # fallback to PR number
                try:
                    pr_body = subprocess.run(
                        ["gh", "pr", "view", str(issue), "--json", "body", "--jq", ".body"],
                        capture_output=True, text=True, timeout=10
                    ).stdout.strip()
                    m = re.search(r'(?:Closes|parent|Parent)\s*#(\d+)', pr_body)
                    if m:
                        parent_issue = int(m.group(1))
                except Exception:
                    pass
                output_lines.append(
                    f"SPAWN: review,issue={parent_issue},"
                    f"pr={issue},branch={branch},conclusion={conclusion}"
                )
            else:
                # Non-impl branch or unknown conclusion — let LLM decide
                output_lines.append(
                    f"P1: check_run.completed,issue={issue},"
                    f"branch={branch},conclusion={conclusion}"
                )
        elif etype == "issues.labeled":
            label = event.get("label", "")
            stage_map = {
                "workflow/research": "research",
                "workflow/plan": "plan",
                "workflow/implement": "implement",
                "workflow/self-correct": "self-correct",
            }
            stage = stage_map.get(label)
            if stage:
                # Dedup: check if a PR already exists for this stage+issue
                # before generating SPAWN (prevents redundant re-spawns).
                issue_int = int(issue) if not isinstance(issue, int) else issue
                if _pr_exists_for_issue(stage, issue_int):
                    # PR already exists — skip spawn, let flow continue via PR.
                    # Clean up from pending to avoid re-processing.
                    event_key = event.get("_key", "")
                    if event_key:
                        discarded_keys.add(event_key)
                    continue
                output_lines.append(
                    f"SPAWN: {stage},issue={issue},label={label}"
                )
            else:
                output_lines.append(
                    f"P2: issues.labeled,issue={issue},label={label}"
                )

    return output_lines


def main():
    try:
        lines = preprocess()
        if lines:
            print("\n".join(lines))
        else:
            # No actionable events from pending file. Output STALLED_CHECK signal
            # to trigger the LLM's proactive scan (stalled PRs, labels, phases).
            # The LLM will only run if there's script output.
            print("[NO_ACTIONABLE_EVENTS: run stalled scan]")
    except Exception as e:
        # On error, output nothing and let the LLM handle things normally
        # The pending file is NOT modified on error (safe fallback)
        print(f"[event-processor error: {e}]", file=sys.stderr)


if __name__ == "__main__":
    main()
