#!/usr/bin/env python3
"""Thin workflow dispatcher: receives webhook events, writes to pending file.

Does NOT run gh commands, create PRs, or manage labels.
The workflow operator agent handles all of that.

Outputs [SILENT] to suppress Hermes agent run.
"""
import json, sys, os, time, fcntl

PENDING_FILE = os.path.expanduser("~/.hermes/workflow-pending.json")


def build_event_key(event_type, payload, conclusion=""):
    """Create dedup key for an event."""
    if event_type in ("issues.labeled", "issues.unlabeled"):
        label_name = payload.get("label", {}).get("name", "")
        return f"{event_type}#{payload['issue']['number']}:{label_name}" if label_name else f"{event_type}#{payload['issue']['number']}"
    elif event_type == "check_run":
        action = payload.get("action", "")
        return f"{event_type}.{action}#{payload['check_run']['check_suite']['pull_requests'][0]['number']}:{conclusion}"
    else:
        return f"{event_type}#{payload.get('issue', payload.get('pull_request', {})).get('number', '')}"


def build_event(event_type, issue_number, repo, payload, head_branch="", conclusion=""):
    """Construct an event dict for the pending file."""
    event = {
        "_key": "",
        "type": event_type,
        "issue": issue_number,
        "repo": repo,
        "ts": time.time(),
    }
    # Set _key after construction
    event["_key"] = build_event_key(event_type, payload, conclusion)

    # Extract label name for label events (small, <100 chars)
    if event_type == "issues.labeled" and "label" in payload:
        event["label"] = payload["label"].get("name", "")
    # Extract branch + conclusion for CI events (small, <100 chars each)
    if event_type == "check_run":
        event["branch"] = head_branch
        event["conclusion"] = conclusion

    return event


def main():
    payload_str = sys.stdin.read()
    if not payload_str.strip():
        print("[SILENT]")
        return

    try:
        payload = json.loads(payload_str)
    except json.JSONDecodeError:
        print("[SILENT]")
        return

    # ── Early extraction before lock ──
    event_type = "unknown"
    issue_number = None
    repo = payload.get("repository", {}).get("full_name", "")
    head_branch = ""
    conclusion = ""

    if "issue" in payload:
        issue_number = payload["issue"].get("number")
        event_type = f"issues.{payload.get('action', '')}"
    elif "pull_request" in payload:
        issue_number = payload["pull_request"].get("number")
        event_type = f"pull_request.{payload.get('action', '')}"
    elif "check_run" in payload:
        event_type = "check_run"
        cr = payload.get("check_run", {})
        suite = cr.get("check_suite", {})
        prs = suite.get("pull_requests", [])
        if prs:
            issue_number = prs[0].get("number")
        head_branch = cr.get("head_branch", "") or suite.get("head_branch", "")
        conclusion = cr.get("conclusion", "")

    if not issue_number or not repo:
        print("[SILENT]")
        return

    # ── Atomic read-modify-write with POSIX file lock ──
    # Prevents concurrent webhook calls from losing events.
    # Lock is acquired BEFORE reading, released AFTER writing.
    try:
        f = open(PENDING_FILE, 'r+')
    except FileNotFoundError:
        f = open(PENDING_FILE, 'w+')

    with f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            # Read existing events
            f.seek(0)
            content = f.read()
            pending = {"events": [], "processed_at": None}
            if content.strip():
                try:
                    pending = json.loads(content)
                except (json.JSONDecodeError, ValueError):
                    pending = {"events": [], "processed_at": None}

            # Deduplicate
            event_key = build_event_key(event_type, payload, conclusion)
            existing_keys = {e.get("_key") for e in pending.get("events", [])}
            if event_key in existing_keys:
                print("[SILENT]")
                return

            event = build_event(event_type, issue_number, repo, payload, head_branch, conclusion)
            pending["events"].append(event)

            # Write back atomically
            f.seek(0)
            json.dump(pending, f, indent=2)
            f.truncate()
            f.flush()
            os.fsync(f.fileno())
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

    # Always silent — no agent run needed
    print("[SILENT]")


if __name__ == "__main__":
    main()
