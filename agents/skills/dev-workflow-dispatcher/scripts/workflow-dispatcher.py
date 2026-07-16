#!/usr/bin/env python3
"""Workflow dispatcher: processes GitHub webhook events and drives the 6-stage workflow.

Receives webhook payload on stdin (from Hermes gateway route script).
Uses gh CLI for GitHub operations and delegates LLM work via hermes CLI.
Runs as a local script with full system access.

Location: ~/.hermes/scripts/workflow-dispatcher.py
Trigger: hermes webhook subscribe ... --script "workflow-dispatcher.py"

Full reference: See dev-workflow-dispatcher skill SKILL.md
"""

import json, sys, os, subprocess, re, time
from pathlib import Path

REPO = "devvi/perfect-dev-agent-workflow"
WORK_DIR = "/home/pi/workspace/perfect-dev-agent-workflow"
HERMES_HOME = os.environ.get("HERMES_HOME", "/home/pi/.hermes")

def gh(*args):
    """Run gh CLI command and return parsed JSON."""
    result = subprocess.run(
        ["gh", *args, "--repo", REPO],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        print(f"gh error: {result.stderr}", file=sys.stderr)
        return None
    if result.stdout.strip():
        try: return json.loads(result.stdout)
        except: return result.stdout.strip()
    return None

def gh_raw(*args):
    """Run gh CLI command, return raw output."""
    result = subprocess.run(
        ["gh", *args, "--repo", REPO],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout.strip() if result.returncode == 0 else None

def get_issue_labels(number):
    """Fetch current labels on an issue from GitHub."""
    result = gh("issue", "view", str(number), "--json", "labels")
    if result and "labels" in result:
        return [l["name"] for l in result["labels"]]
    return []

def auto_detect_depth(title, body, payload_labels, issue_number=None):
    """Auto-detect issue depth from title, body, payload labels, and actual issue labels."""
    title_lower = title.lower()
    body_lower = (body or "").lower()

    if issue_number:
        actual_labels = get_issue_labels(issue_number)
        existing_depth = [l for l in actual_labels if l.startswith("depth/")]
        if existing_depth:
            return existing_depth[0].split("/")[1]

    existing_depth = [l.split("/")[1] for l in payload_labels if l.startswith("depth/")]
    if existing_depth:
        return existing_depth[0]

    light_keywords = ["typo", "fix", "bump", "update", "rename", "bump version",
                      "light", "simple", "trivial", "minor"]
    deep_keywords = ["refactor", "architecture", "redesign", "migration",
                     "overhaul", "perf", "rewrite", "restructure", "deep",
                     "complex", "multi", "cross"]

    for kw in light_keywords:
        if kw in title_lower or kw in body_lower:
            return "light"
    for kw in deep_keywords:
        if kw in title_lower or kw in body_lower:
            return "deep"
    return "standard"

def ensure_single_depth_label(number, depth, existing_labels):
    """Remove any depth/ labels that don't match the detected depth."""
    depth_label = f"depth/{depth}"
    to_remove = [l for l in existing_labels if l.startswith("depth/") and l != depth_label]
    if to_remove:
        for label in to_remove:
            gh("issue", "edit", str(number), "--remove-label", label)
    if depth_label not in existing_labels:
        gh("issue", "edit", str(number), "--add-label", depth_label)

def slugify(title):
    """Create a URL-friendly slug from a title."""
    s = title.lower()
    s = re.sub(r'[^a-z0-9\u4e00-\u9fff]+', '-', s)
    s = s.strip('-')
    return s[:50]

def handle_research_light(number, title, body):
    """Handle light-depth research: write mini PRD, create PR, enable auto-merge."""
    slug = slugify(title)
    branch = f"research/{number}-{slug}"

    print(f"[dispatch] Light research: creating branch {branch}", file=sys.stderr)

    try:
        subprocess.run(
            ["git", "-C", WORK_DIR, "checkout", "master"],
            capture_output=True, timeout=15
        )
        subprocess.run(
            ["git", "-C", WORK_DIR, "pull", "origin", "master"],
            capture_output=True, timeout=15
        )
        result = subprocess.run(
            ["git", "-C", WORK_DIR, "checkout", "-b", branch],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            subprocess.run(
                ["git", "-C", WORK_DIR, "checkout", branch],
                capture_output=True, timeout=15
            )

        # Write mini PRD
        prd_path = f"{WORK_DIR}/docs/PRD/{number}-{slug}.md"
        prd_content = f"""# Research: #{number} — {title}

> Parent Issue: #{number}
> Agent: research-agent (light)
> Date: {time.strftime('%Y-%m-%d')}

---

## 1. Problem

{body or "Title change required."}

## 2. Solution

{title}

## 3. Implementation Notes

Single file change to update the game title.
"""
        with open(prd_path, 'w') as f:
            f.write(prd_content)

        subprocess.run(
            ["git", "-C", WORK_DIR, "add", prd_path],
            capture_output=True, timeout=15
        )
        subprocess.run(
            ["git", "-C", WORK_DIR, "commit", "-m",
             f"Research: #{number} {title} — light"],
            capture_output=True, timeout=15
        )
        subprocess.run(
            ["git", "-C", WORK_DIR, "push", "origin", branch],
            capture_output=True, timeout=30
        )

        pr_url = gh_raw("pr", "create",
            "--title", f"Research: {title} (parent #{number}) — light",
            "--body", f"## Research for #{number}\n\n[See docs/PRD/{number}-{slug}.md for details]\n\n## Key Decision\nUpdate title to: {title}",
            "--base", "master",
            "--head", branch,
            "--label", "workflow/research")

        if pr_url:
            pr_match = re.search(r'/(\d+)$', pr_url)
            if pr_match:
                subprocess.run(
                    ["gh", "pr", "merge", pr_match.group(1), "--auto", "--squash",
                     "--delete-branch", "--repo", REPO],
                    capture_output=True, timeout=15
                )

        print(f"[dispatch] Created research PR for #{number}: {pr_url}", file=sys.stderr)
        return {"status": "pr_created", "issue": number, "pr": pr_url}

    except Exception as e:
        print(f"[dispatch] Error in research: {e}", file=sys.stderr)
        return {"status": "error", "issue": number, "error": str(e)}

def handle_issues_opened(payload):
    """Handle issues.opened webhook event."""
    issue = payload.get("issue", {})
    number = issue.get("number")
    title = issue.get("title", "")
    body = issue.get("body", "")
    labels = [l["name"] for l in issue.get("labels", [])]

    if not number:
        return {"status": "ignored", "reason": "no issue number"}

    print(f"[dispatch] Issue #{number}: {title}", file=sys.stderr)

    depth = auto_detect_depth(title, body, labels, issue_number=number)
    actual_labels = get_issue_labels(number)
    ensure_single_depth_label(number, depth, actual_labels)

    gh("issue", "edit", str(number),
       "--add-label", "workflow/research",
       "--remove-label", "workflow/available")

    comment = f"🔄 Research phase started (depth: {depth})"
    gh_raw("issue", "comment", str(number), "--body", comment)

    if depth == "light":
        return handle_research_light(number, title, body)

    return {"status": "dispatched", "phase": "research", "issue": number, "depth": depth}

def handle_labeled(payload):
    """Handle issues.labeled webhook event."""
    issue = payload.get("issue", {})
    label = payload.get("label", {}).get("name", "")
    number = issue.get("number")
    title = issue.get("title", "")
    labels = [l["name"] for l in issue.get("labels", [])]

    if not number or not label:
        return {"status": "ignored", "reason": "no issue or label"}

    print(f"[dispatch] Issue #{number}: label added = {label}", file=sys.stderr)

    spawn_map = {
        "workflow/research":   {"phase": "research",   "comment": "Research phase started"},
        "workflow/plan":       {"phase": "plan",       "comment": "Plan phase started"},
        "workflow/implement":  {"phase": "implement",  "comment": "Implement phase started"},
        "workflow/test":       {"phase": "review",     "comment": "Review phase started"},
    }

    if label in spawn_map:
        info = spawn_map[label]
        depth = [l.split("/")[1] for l in labels if l.startswith("depth/")]
        depth = depth[0] if depth else "standard"

        comment = f"🔄 {info['comment']} (depth: {depth})"
        gh_raw("issue", "comment", str(number), "--body", comment)

        # Light research: auto-create PR
        if label == "workflow/research" and depth == "light":
            issue_data = gh("issue", "view", str(number), "--json", "title,body")
            issue_body = (issue_data or {}).get("body", "")
            return handle_research_light(number, title or (issue_data or {}).get("title", ""), issue_body)

        return {"status": "dispatched", "phase": info["phase"], "issue": number, "depth": depth}

    return {"status": "ignored", "reason": f"label {label} not actionable"}

def handle_pull_request_closed(payload):
    """Handle pull_request.closed with merged=true."""
    pr = payload.get("pull_request", {})
    if not pr.get("merged"):
        return {"status": "ignored", "reason": "PR not merged"}
    # workflow-chain.yml handles label advancement
    return {"status": "noted", "event": "pr_merged"}

# ── Main ──
def main():
    payload_str = sys.stdin.read()
    if not payload_str.strip():
        print(json.dumps({"status": "ignored", "reason": "empty payload"}))
        return

    try:
        payload = json.loads(payload_str)
    except json.JSONDecodeError:
        print(json.dumps({"status": "ignored", "reason": "invalid JSON"}))
        return

    action = payload.get("action", "")
    event_type = None

    if "issue" in payload:
        event_type = f"issues.{action}"
    elif "pull_request" in payload:
        event_type = f"pull_request.{action}"
    elif "check_run" in payload:
        event_type = f"check_run.{action}"
    else:
        event_type = f"unknown.{action}"

    print(f"[dispatch] Event: {event_type}", file=sys.stderr)

    if event_type == "issues.opened":
        result = handle_issues_opened(payload)
    elif event_type == "issues.labeled":
        result = handle_labeled(payload)
    elif event_type == "pull_request.closed":
        result = handle_pull_request_closed(payload)
    else:
        result = {"status": "ignored", "event": event_type}

    enriched = dict(payload)
    enriched["_dispatch_result"] = result
    print(json.dumps(enriched))

if __name__ == "__main__":
    main()
