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
WORKFLOW_CONFIG = os.path.expanduser("~/.hermes/workflow-config.json")

# ── Workflow config defaults ────────────────────────────────────
DEFAULT_CONFIG = {
    "enabled": True,
    "work_start_hour": 8,
    "work_end_hour": 22,
    "preset": "daytime",
}

# ── Presets ─────────────────────────────────────────────────────
WORK_HOUR_PRESETS = {
    "daytime": {"work_start_hour": 8, "work_end_hour": 22},
    "night-owl": {"work_start_hour": 23, "work_end_hour": 8},
    "always": {"work_start_hour": 0, "work_end_hour": 24},
}


def read_workflow_config() -> dict:
    """Read workflow config, falling back to env vars then defaults."""
    config = dict(DEFAULT_CONFIG)
    try:
        with open(WORKFLOW_CONFIG) as f:
            config.update(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError, IOError):
        pass
    # Env vars override file config
    if "WORK_START_HOUR" in os.environ:
        config["work_start_hour"] = int(os.environ["WORK_START_HOUR"])
    if "WORK_END_HOUR" in os.environ:
        config["work_end_hour"] = int(os.environ["WORK_END_HOUR"])
    if "WORKFLOW_DISABLED" in os.environ:
        config["enabled"] = not os.environ["WORKFLOW_DISABLED"].lower() in ("1", "true")
    return config


def is_work_hours(cfg: dict = None) -> bool:
    """Check if current time is within configured work hours."""
    if cfg is None:
        cfg = read_workflow_config()
    if not cfg.get("enabled", True):
        return False
    return _time_in_window(cfg)


def _time_in_window(cfg: dict) -> bool:
    """Pure time check — does NOT check enabled flag."""
    hour = datetime.datetime.now().hour
    start = cfg.get("work_start_hour", 8)
    end = cfg.get("work_end_hour", 22)
    if start <= end:
        return start <= hour < end
    else:
        # Wrapping: e.g. 14-2 means afternoon to late night
        return hour >= start or hour < end


def is_paused() -> bool:
    """Check if workflow is paused via pause file."""
    return os.path.exists(os.path.expanduser("~/.hermes/workflow-pause"))


def should_process_event(event_type: str, label: str = "") -> bool:
    """Determine if an event should be processed now.
    
    Outside work hours:
      - CI results (check_run) → YES (pipeline must finish)
      - Phase labels (workflow/research/plan/implement/self-correct) → YES
      - status/done → YES
      - Picker (new issue entry) → NO
      - workflow/available → NO
    """
    if is_work_hours():
        return True
    if is_paused():
        return False
    # Always process pipeline events even outside work hours
    if event_type in ("check_run",):
        return True
    if label.startswith("workflow/") and label not in ("workflow/available",):
        return True  # research, plan, implement, self-correct, status/done
    # Block everything else (available, picker)
    return False


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
             "--search", f"head:{branch}",
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


WORKDIR = os.path.expanduser("~/workspace/.pda/perfect-dev-agent-workflow")

# ── Game Environment ─────────────────────────────────────────
MANIFEST_PATH = os.path.join(WORKDIR, "game-env", "manifest.yaml")

def _load_manifest() -> dict:
    """Load game environment manifest. Falls back to snake defaults."""
    default = {
        "engine": {"name": "web", "runner": "node"},
        "source": {"dir": "public/src/"},
        "test": {"dir": "tests/", "framework": "vitest"},
        "code_gen": {"language": "javascript"},
        "git": {"default_branch": "master"},
    }
    if not os.path.exists(MANIFEST_PATH):
        return default
    try:
        with open(MANIFEST_PATH) as f:
            import yaml
            return {**default, **yaml.safe_load(f)}
    except Exception:
        return default

MANIFEST = _load_manifest()
SRC_DIR = MANIFEST.get("source", {}).get("dir", "public/src/")
TEST_DIR = MANIFEST.get("test", {}).get("dir", "tests/")
DEFAULT_BRANCH = MANIFEST.get("git", {}).get("default_branch", "master")

# ── Issue Picker ─────────────────────────────────────────────────
# Reads backlog, picks candidate, adds workflow/available label.

MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_ISSUES", "3"))
MAX_SPAWN_PER_TICK = int(os.environ.get("MAX_SPAWN_PER_TICK", "3"))
MAX_PHASE_SLOTS = int(os.environ.get("MAX_PHASE_SLOTS", "2"))
# Phase agents (research/plan/implement) capped at MAX_PHASE_SLOTS.
# Review and self-correct don't count toward this cap (reserved slots).

# ── Distributed lock (multi-agent coordination) ────────────────────
# Each cron instance has a unique label (workflow/lock-{id}).
# Lock is acquired before SPAWN, released by the spawned agent.
# TTL = 300s; expired locks are cleaned by reconcile().
INSTANCE_ID = os.environ.get("WORKFLOW_INSTANCE_ID", "pi").lower()
LOCK_LABEL = f"workflow/lock-{INSTANCE_ID}"
OTHER_LOCK_LABEL = "workflow/lock-pi" if INSTANCE_ID == "mbot" else "workflow/lock-mbot"
LOCK_TTL = 300  # 5 minutes
LOCK_STATE_FILE = os.path.expanduser("~/.hermes/lock-state.json")

def _read_lock_state() -> dict:
    if os.path.exists(LOCK_STATE_FILE):
        try:
            with open(LOCK_STATE_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}

def _write_lock_state(state: dict):
    with open(LOCK_STATE_FILE, "w") as f:
        json.dump(state, f)

def _try_acquire_lock(issue_num: int) -> bool:
    """Try to acquire a distributed lock on the given issue.
    Returns True if lock acquired, False if held by another instance.
    """
    now = time.time()
    
    # Fetch current issue labels
    raw = gh("issue", "view", str(issue_num), "--json", "labels")
    if not raw:
        return False
    try:
        labels = [l["name"] for l in json.loads(raw).get("labels", [])]
    except (json.JSONDecodeError, KeyError):
        return False
    
    state = _read_lock_state()
    locked_at = state.get(str(issue_num), 0)
    
    # Check if other instance holds a live lock
    if OTHER_LOCK_LABEL in labels:
        if locked_at and (now - locked_at) < LOCK_TTL:
            return False  # Other instance holds a valid lock
        # Lock expired — clean it
        try:
            subprocess.run(
                ["gh", "issue", "edit", str(issue_num),
                 "--remove-label", OTHER_LOCK_LABEL],
                check=True, capture_output=True, timeout=10
            )
        except: pass
        del state[str(issue_num)]
    
    # Add our own lock label
    try:
        subprocess.run(
            ["gh", "issue", "edit", str(issue_num),
             "--add-label", LOCK_LABEL],
            check=True, capture_output=True, timeout=10
        )
    except subprocess.CalledProcessError:
        return False
    
    # Post-lock confirmation: if both locks exist (race), keep ours — the lock
    # state file on our side is authoritative. If we already proceeded to SPAWN,
    # duplicate output is handled by downstream dedup.
    # The other instance's reconcile() will clean up its redundant lock later.
    
    # Record lock time
    state[str(issue_num)] = now
    _write_lock_state(state)
    return True

def _release_lock(issue_num: int):
    """Release the distributed lock for this issue."""
    state = _read_lock_state()
    if str(issue_num) in state:
        del state[str(issue_num)]
        _write_lock_state(state)
    try:
        subprocess.run(
            ["gh", "issue", "edit", str(issue_num),
             "--remove-label", LOCK_LABEL],
            check=True, capture_output=True, timeout=10
        )
    except: pass

def _clean_expired_locks():
    """Remove expired lock labels and state (called by reconcile)."""
    raw = gh("issue", "list", "--state", "open", "--label", LOCK_LABEL, "--json", "number")
    if not raw:
        return
    try:
        locked_issues = json.loads(raw)
    except json.JSONDecodeError:
        return
    state = _read_lock_state()
    changed = False
    for iss in locked_issues:
        n = str(iss["number"])
        locked_at = state.get(n, 0)
        if locked_at and (time.time() - locked_at) >= LOCK_TTL:
            try:
                subprocess.run(
                    ["gh", "issue", "edit", n, "--remove-label", LOCK_LABEL],
                    check=True, capture_output=True, timeout=10
                )
            except: pass
            if n in state:
                del state[n]
                changed = True
    if changed:
        _write_lock_state(state)

# Stage labels that count toward concurrency limit
ACTIVE_STAGE_LABELS = [
    "workflow/research", "workflow/plan", "workflow/implement",
    "workflow/self-correct",
]
WORKFLOW_LABELS = set(ACTIVE_STAGE_LABELS + ["workflow/available", "workflow/backlog", "status/done"])


def current_workflow_count() -> int:
    """Count how many issues are currently in active stages."""
    raw = gh(
        "issue", "list",
        "--label", ",".join(ACTIVE_STAGE_LABELS),
        "--state", "open",
        "--json", "number",
        "--jq", "length",
    )
    try:
        return int(raw) if raw else 0
    except (ValueError, TypeError):
        return 0


def get_issue_target_files(issue_num: int) -> set:
    """Get files that this issue's implement phase will modify.
    Reads DESIGN doc if available, otherwise returns empty set."""
    try:
        import glob
        design_files = glob.glob(
            f"/home/pi/workspace/.pda/perfect-dev-agent-workflow/docs/DESIGN/{issue_num}-*.md"
        )
        if design_files:
            with open(design_files[0]) as f:
                content = f.read()
            files = set()
            for m in re.finditer(r'\`([^\`]+?\.(?:js|html|css|yml|json))\`', content):
                files.add(m.group(1))
            return files
    except Exception:
        pass
    return set()


def _get_active_issue_target_files() -> set:
    """Get target files for all currently active (impl stage) issues."""
    all_files = set()
    for label in ACTIVE_STAGE_LABELS:
        raw = gh(
            "issue", "list",
            "--label", label, "--state", "open",
            "--json", "number",
            "--jq", ".[].number",
        )
        if raw:
            for n in raw.strip().split("\n"):
                try:
                    all_files |= get_issue_target_files(int(n.strip()))
                except ValueError:
                    pass
    return all_files


def _count_active_phase_agents() -> int:
    """Count how many phase agents (research/plan/implement) are currently
    running on GitHub by checking issue labels. Returns count of issues
    in any active phase stage."""
    phase_labels = ["workflow/research", "workflow/plan", "workflow/implement"]
    total = 0
    for label in phase_labels:
        raw = gh("issue", "list", "--state", "open",
                 "--label", label,
                 "--json", "number",
                 "--jq", "length",
                 "--limit", "50")
        if raw and raw.strip().isdigit():
            total += int(raw.strip())
    return total


def _has_file_conflict(issue_num: int, active_files: set) -> bool:
    """Check if this issue's target files overlap with currently active issues."""
    if not active_files:
        return False
    target = get_issue_target_files(issue_num)
    if not target:
        return False  # no DESIGN doc yet → conservative: assume no conflict
    return bool(target & active_files)


def _pick_candidate() -> int | None:
    """Scan backlog and pick the best candidate issue to start.
    
    Criteria (in order):
    1. No workflow/* label
    2. Has priority label (critical > high > medium > low)
    3. Dependencies resolved
    4. No file conflict with current implement-stage issues
    5. Within concurrency limit
    """
    active_files = _get_active_issue_target_files()
    
    # Fetch all OPEN issues without workflow labels
    raw = gh(
        "issue", "list", "--state", "open",
        "--json", "number,labels,title",
        "--limit", "30",
    )
    if not raw:
        return None
    
    try:
        issues = json.loads(raw)
    except json.JSONDecodeError:
        return None
    
    # Filter: only pick from workflow/backlog
    candidates = []
    for iss in issues:
        label_names = [l.get("name", "") for l in iss.get("labels", [])]
        if "workflow/backlog" not in label_names:
            continue
        if "bug" not in label_names and "enhancement" not in label_names:
            continue
        candidates.append(iss)
    
    if not candidates:
        return None
    
    # Sort by priority label
    def _sort_key(iss):
        label_names = [l.get("name", "") for l in iss.get("labels", [])]
        for idx, p in enumerate(PRIORITY_LABEL_ORDER):
            if p in label_names:
                return idx
        return len(PRIORITY_LABEL_ORDER)  # lowest priority if no label
    
    candidates.sort(key=_sort_key)
    
    # Try each candidate
    for candidate in candidates:
        n = candidate["number"]
        
        # Check dependencies
        unresolved = _has_unresolved_dependencies(n)
        if unresolved:
            continue
        
        # Check file conflict (only against implement-stage issues)
        if _has_file_conflict(n, active_files):
            continue
        
        return n
    
    return None


def pick_next_issue():
    """Entry point: called after slot freed or at window entry.
    Fills up to MAX_CONCURRENT issues."""
    if is_paused():
        return
    
    current = current_workflow_count()
    while current < MAX_CONCURRENT:
        candidate = _pick_candidate()
        if candidate is None:
            break
        gh("issue", "edit", str(candidate), "--add-label", "workflow/available")
        print(f"[PICKER] marked #{candidate} as workflow/available", file=sys.stderr)
        current += 1


def reconcile():
    """After crash or pause resume: check GitHub state vs pending events.
    Finds issues with workflow labels but no corresponding pending event."""
    events = []
    try:
        events = read_pending()
    except Exception:
        pass
    existing_keys = {e.get("_key") for e in events}
    
    for label in ("workflow/available", "workflow/research", "workflow/plan",
                  "workflow/implement", "workflow/self-correct"):
        raw = gh(
            "issue", "list",
            "--label", label, "--state", "open",
            "--json", "number",
            "--jq", ".[].number",
        )
        if not raw:
            continue
        for n_str in raw.strip().split("\n"):
            try:
                n = int(n_str.strip())
            except ValueError:
                continue
            event_key = f"issues.labeled#{n}:{label}"
            if event_key not in existing_keys:
                # Missing event — add a synthetic one
                events.append({
                    "_key": event_key,
                    "type": "issues.labeled",
                    "issue": n,
                    "repo": "devvi/perfect-dev-agent-workflow",
                    "ts": time.time(),
                    "label": label,
                })
    
    if events:
        write_pending(events)
    
    # Clean expired locks
    _clean_expired_locks()


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

    # SPAWN lines must come first — LLM reads top-to-bottom
    output_lines.sort(key=lambda l: (0 if l.startswith("SPAWN:") else 1,
                                     0 if "review" in l or "self-correct" in l else
                                     1 if l.startswith("SPAWN:") else 2))
    return output_lines


def main():
    try:
        cfg = read_workflow_config()
        
        # Pause check
        if is_paused():
            return
        
        # Window entry detection: if we just entered work hours, reconcile + pick
        was_outside = False
        try:
            state_file = os.path.expanduser("~/.hermes/.workflow-state.json")
            if os.path.exists(state_file):
                with open(state_file) as f:
                    state = json.load(f)
                was_outside = state.get("last_hour", -1) != datetime.datetime.now().hour
        except Exception:
            pass
        
        in_window = _time_in_window(cfg)
        if in_window and was_outside:
            # Just entered work hours
            reconcile()
            pick_next_issue()
        
        # Save current hour for window entry detection
        try:
            with open(os.path.expanduser("~/.hermes/.workflow-state.json"), "w") as f:
                json.dump({"last_hour": datetime.datetime.now().hour, "window_open": in_window}, f)
        except Exception:
            pass
        
        # Outside hours → only process pipeline events, block picker + available
        if not in_window:
            # Only process pipeline events via standard preprocess
            pass  # fall through to preprocess with proper filtering
        
        lines = preprocess()
        
        # Filter lines by window/pause state
        if not in_window or is_paused():
            # Remove SPAWN for available/since it's blocked outside hours
            filtered = []
            for line in lines:
                if line.startswith("SPAWN:") and "workflow/available" in line:
                    continue
                if line.startswith("SPAWN:"):
                    filtered.append(line)
                elif line.startswith("BLOCKED:"):
                    filtered.append(line)
                elif line.startswith("P1:") or line.startswith("P2:"):
                    filtered.append(line)
            lines = filtered
        
        # Cap: phase agents (research/plan/implement) at MAX_PHASE_SLOTS
        # Review and self-correct don't count (reserved slots).
        # First count what's already running on GitHub.
        active_phase = _count_active_phase_agents()
        available_phase_slots = max(0, MAX_PHASE_SLOTS - active_phase)
        
        phase_count = 0
        capped = []
        for line in lines:
            if line.startswith("SPAWN: review") or line.startswith("SPAWN: self-correct"):
                # Reserved slots — always pass
                capped.append(line)
            elif line.startswith("SPAWN:"):
                # Phase agent — count against available phase slots
                is_phase = False
                for ph in ("research", "plan", "implement"):
                    if line.startswith(f"SPAWN: {ph}"):
                        is_phase = True
                        if phase_count < available_phase_slots:
                            phase_count += 1
                            capped.append(line)
                        # else: silently drop, no slot available
                        break
                if not is_phase:
                    # Unknown SPAWN type — let through
                    capped.append(line)
            else:
                capped.append(line)
        lines = capped
        
        # Acquire distributed locks for phase SPAWN lines
        # (review/self-correct don't need locks — they're fast operations)
        locked_lines = []
        for line in lines:
            if line.startswith("SPAWN: review") or line.startswith("SPAWN: self-correct"):
                locked_lines.append(line)
                continue
            if line.startswith("SPAWN:"):
                # Extract issue number from SPAWN
                m = re.search(r'issue=(\d+)', line)
                if m:
                    issue_num = int(m.group(1))
                    if _try_acquire_lock(issue_num):
                        locked_lines.append(line)
                    # else: skip — other instance processing this issue
                else:
                    locked_lines.append(line)
            else:
                locked_lines.append(line)
        lines = locked_lines
        
        if lines:
            print("\n".join(lines))
            
            # If there was a status/done event, trigger picker to fill slot
            if in_window and any("status/done" in l for l in lines):
                pick_next_issue()
        else:
            # No events → try picker to fill empty slots
            if in_window and not is_paused():
                pick_next_issue()
            print("[NO_ACTIONABLE_EVENTS: run stalled scan]")
    except Exception as e:
        print(f"[event-processor error: {e}]", file=sys.stderr)


if __name__ == "__main__":
    main()
