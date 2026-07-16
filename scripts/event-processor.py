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

import datetime
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

# ── Work hours ────────────────────────────────────────────────
# Outside work hours, no LLM calls are made (script outputs nothing).
# Events still accumulate in pending file.
WORK_START_HOUR = int(os.environ.get("WORK_START_HOUR", "8"))
WORK_END_HOUR = int(os.environ.get("WORK_END_HOUR", "22"))


def is_work_hours() -> bool:
    """Check if current time is within configured work hours."""
    hour = datetime.datetime.now().hour
    if WORK_START_HOUR <= WORK_END_HOUR:
        return WORK_START_HOUR <= hour < WORK_END_HOUR
    else:
        # Wrapping: e.g. 22-8 means night shift
        return hour >= WORK_START_HOUR or hour < WORK_END_HOUR


# ── Priority labels ───────────────────────────────────────────
PRIORITY_LABEL_ORDER = [
    "priority/critical",
    "priority/high",
    "priority/medium",
    "priority/low",
]


def issue_priority_sort_key(issue_num: int) -> int:
    """Return sort index for an issue's priority label. Lower = higher priority.
    Caches results to avoid redundant gh calls per tick."""
    raw = gh("issue", "view", str(issue_num), "--json", "labels")
    if not raw:
        return PRIORITY_LABEL_ORDER.index("priority/medium")
    try:
        data = json.loads(raw)
        label_names = [l.get("name", "") for l in data.get("labels", [])]
        for idx, p in enumerate(PRIORITY_LABEL_ORDER):
            if p in label_names:
                return idx
        return PRIORITY_LABEL_ORDER.index("priority/medium")
    except (json.JSONDecodeError, ValueError):
        return PRIORITY_LABEL_ORDER.index("priority/medium")

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


def gh(*args: str) -> str:
    """Run gh command, return stdout. Returns empty string on error."""
    try:
        result = subprocess.run(['gh'] + list(args),
                                capture_output=True, text=True, timeout=10)
        return result.stdout.strip() if result.returncode == 0 else ""
    except (subprocess.TimeoutExpired, OSError):
        return ""


def get_issue_body(issue_num: int) -> str:
    """Fetch issue body via gh CLI."""
    return gh("issue", "view", str(issue_num), "--json", "body", "--jq", ".body")


def parse_dependencies(body: str) -> list[dict]:
    """Parse ## Dependencies section from issue body.

    Matches:
      Depends on: #42              → full dependency
      Depends on (design): #49     → design-only dependency

    Returns [{"issue": 42, "type": "full"}, {"issue": 49, "type": "design"}]
    """
    deps = []
    in_deps_section = False
    for line in body.split("\n"):
        stripped = line.strip()
        # Detect ## Dependencies heading (case-insensitive)
        if re.match(r'^#{2,3}\s+Dependencies', stripped, re.IGNORECASE):
            in_deps_section = True
            continue
        # Exit section at next heading (## or deeper)
        if in_deps_section and re.match(r'^#{2,}\s', stripped):
            break
        if not in_deps_section:
            continue
        # Match: Depends on: #42  or  Depends on (design): #49
        m = re.match(
            r'Depends on\s*(?:\((\w+)\))?\s*:\s*#(\d+)',
            stripped, re.IGNORECASE
        )
        if m:
            dep_type = m.group(1).lower() if m.group(1) else "full"
            if dep_type not in ("full", "design"):
                dep_type = "full"  # unknown type → treat as full
            deps.append({"issue": int(m.group(2)), "type": dep_type})
    return deps


def check_dependency_resolved(dep: dict) -> bool:
    """Check if a single dependency is satisfied.

    full: target issue has status/done or is CLOSED
    design: target issue is at workflow/plan stage or beyond
    """
    raw = gh("issue", "view", str(dep["issue"]),
             "--json", "state,labels")
    if not raw:
        return False  # conservative: treat as unresolved
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return False

    # Closed issue = always resolved
    if data.get("state", "").lower() == "closed":
        return True

    labels = [l.get("name", "") for l in data.get("labels", [])]

    if dep["type"] == "full":
        return "status/done" in labels

    if dep["type"] == "design":
        for wf in ("workflow/plan", "workflow/implement", "workflow/self-correct"):
            if wf in labels:
                return True
        return False

    return False


def _has_unresolved_dependencies(issue_num: int) -> list[dict]:
    """Check if an issue has unresolved dependencies.
    Returns list of unresolved deps, or empty list if none.
    """
    body = get_issue_body(issue_num)
    if not body:
        return []
    deps = parse_dependencies(body)
    if not deps:
        return []
    unresolved = [d for d in deps if not check_dependency_resolved(d)]
    return unresolved


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

    # Step 3: Sort kept events by priority (P1 first), then by issue priority label
    def _sort_key(e):
        ep = event_priority(e)
        if e.get("type") == "issues.labeled":
            issue_num = int(e.get("issue", 0))
            return (ep, issue_priority_sort_key(issue_num))
        return (ep, 2)  # non-labeled events at same priority as medium
    kept.sort(key=_sort_key)

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
                # ── Dependency check ──
                # For workflow/available, check if the issue has unresolved
                # dependencies before allowing research phase to start.
                if label == "workflow/available":
                    issue_int = int(issue) if not isinstance(issue, int) else issue
                    unresolved = _has_unresolved_dependencies(issue_int)
                    if unresolved:
                        dep_str = ",".join(
                            f"#{d['issue']}({d['type']})" for d in unresolved
                        )
                        output_lines.append(
                            f"BLOCKED: issue={issue_int},depends-on={dep_str}"
                        )
                        continue
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
        # Outside work hours → no output, no LLM call
        if not is_work_hours():
            return

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
