#!/usr/bin/env python3
"""
stage-gate.py — 本地 Stage Gate 验证器

纯代码，无 prompt 依赖。在 stage 转场前执行机械性检查，确保前置条件满足。
如果检查不通过，自动尝试修复（补 label 等）；修复失败则 exit 1 阻塞转场。

Usage:
  stage-gate.py --issue <N> --stage <stage>       # spawn agent 前验证 issue
  stage-gate.py --issue <N> --stage <stage> --pr <N>   # 加上验证刚创建的 PR

Exit codes:
  0  = pass (可以继续)
  1  = fail (阻塞转场，已修复的自动修复不在此列)
  2  = error (API 调用失败等运行时错误)

Stages: research, plan, implement
"""

import argparse
import json
import re
import subprocess
import sys
from typing import Optional


def gh(*args: str) -> str:
    """Run gh command, return stdout."""
    result = subprocess.run(['gh'] + list(args), capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"gh {' '.join(args)} failed (exit {result.returncode}):\n"
            f"  stderr: {result.stderr.strip()}"
        )
    return result.stdout.strip()


def gh_json(*args: str) -> dict:
    """Run gh command, parse JSON output."""
    return json.loads(gh(*args))


# ── Branch name → workflow label mapping (single source of truth) ──────────

BRANCH_LABEL_MAP = {
    'research/': 'workflow/research',
    'plan/':     'workflow/plan',
    'impl/':     'workflow/implement',
}

STAGE_LABELS = {
    'research':   ['workflow/research', 'workflow/available'],
    'plan':       ['workflow/plan'],
    'implement':  ['workflow/implement'],
}


def derive_label_from_branch(branch: str) -> Optional[str]:
    """Derive expected workflow label from branch prefix. Returns None if no match."""
    for prefix, label in BRANCH_LABEL_MAP.items():
        if branch.startswith(prefix):
            return label
    return None


def validate_branch_name(branch: str) -> Optional[str]:
    """Validate branch name matches a workflow pattern. Returns matched prefix or None."""
    for prefix in BRANCH_LABEL_MAP:
        if branch.startswith(prefix):
            return prefix
    return None


# ── Issue checks ───────────────────────────────────────────────────────────

def check_issue(issue_num: int, stage: str) -> tuple[bool, str]:
    """
    Validate issue state before spawning a phase agent.

    Checks:
    - Issue is open
    - Correct workflow label exists
    """
    issue = gh_json('issue', 'view', str(issue_num), '--json', 'labels,state,title')

    labels = [l['name'] for l in issue['labels']]
    expected = STAGE_LABELS.get(stage, [])

    # 1. Issue must be open
    if issue['state'].lower() != 'open':
        return False, (
            f"Issue #{issue_num} is '{issue['state']}', not open. "
            f"Title: {issue['title']}"
        )

    # 2. Check expected label
    found = any(l in labels for l in expected)
    if not found:
        return False, (
            f"Issue #{issue_num} missing expected labels {expected}. "
            f"Actual labels: {labels}"
        )

    return True, f"Issue #{issue_num} OK (stage={stage}, labels={labels})"


# ── PR checks ──────────────────────────────────────────────────────────────

def check_pr(pr_num: int) -> tuple[bool, str]:
    """
    Validate PR state before allowing auto-merge or post-merge processing.

    Checks:
    1. Branch name matches a known workflow pattern
    2. Workflow label matches branch name (auto-fix if missing)
    3. PR body has Parent: #N or Closes #N reference (warn only)
    4. PR is open
    """
    try:
        pr = gh_json('pr', 'view', str(pr_num), '--json',
                      'labels,headRefName,body,state,title,number')
    except RuntimeError as e:
        return False, str(e)

    branch = pr['headRefName']
    issues = []

    # ── 1. Branch name validation ──
    matched_prefix = validate_branch_name(branch)
    if not matched_prefix:
        return False, (
            f"PR #{pr_num}: branch '{branch}' doesn't match any workflow pattern "
            f"(expected: {list(BRANCH_LABEL_MAP.keys())})"
        )

    expected_label = BRANCH_LABEL_MAP[matched_prefix]
    actual_labels = [l['name'] for l in pr.get('labels', [])]

    # ── 2. Label check + auto-fix ──
    if expected_label not in actual_labels:
        print(f"⚠  Label MISSING: PR #{pr_num} expected '{expected_label}', "
              f"has {actual_labels}. Auto-fixing...")
        fix = subprocess.run(
            ['gh', 'issue', 'edit', str(pr_num), '--add-label', expected_label],
            capture_output=True, text=True
        )
        if fix.returncode != 0:
            return False, (
                f"Auto-fix FAILED: could not add '{expected_label}' to PR #{pr_num}.\n"
                f"  Error: {fix.stderr.strip()}\n"
                f"  PR labels: {actual_labels}\n"
                f"  Expected from branch '{branch}': {expected_label}\n"
                f"  Try manual: gh issue edit {pr_num} --add-label {expected_label}"
            )
        print(f"✅  Auto-fixed: added '{expected_label}' to PR #{pr_num}")
    else:
        print(f"✅  Label OK: PR #{pr_num} has '{expected_label}'")

    # ── 3. Body reference check ──
    body = pr.get('body', '') or ''
    has_parent_ref = bool(re.search(r'(?:Closes|parent)\s*#\d+', body, re.IGNORECASE))
    if not has_parent_ref:
        issues.append(f"PR #{pr_num} body missing 'Parent: #N' or 'Closes #N' reference")
        print(f"⚠  Body MISSING: PR #{pr_num} has no parent reference in body")

    # ── 4. State check ──
    pr_state = pr['state']
    if pr_state.upper() != 'OPEN':
        issues.append(f"PR #{pr_num} is '{pr_state}', not OPEN")
        print(f"❌  State: PR #{pr_num} is {pr_state} (expected OPEN)")

    # ── 5. Force-disable auto-merge on implement PRs only ──
    # Implement PRs must go through CI + review before merge.
    # Research/plan PRs (docs-only) should auto-merge immediately.
    if pr_state.upper() == 'OPEN' and matched_prefix == 'impl/':
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

    if issues:
        return False, '; '.join(issues)

    return True, f"PR #{pr_num} OK (branch={branch}, label={expected_label})"


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Stage Gate — deterministic PR/issue validator',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Validate issue before spawning research agent
  stage-gate.py --issue 42 --stage research

  # Validate PR created by implement-agent before enabling auto-merge
  stage-gate.py --pr 117
        """
    )
    parser.add_argument('--issue', type=int, help='Issue number')
    parser.add_argument('--stage',
                        choices=['research', 'plan', 'implement'],
                        help='Target stage (required with --issue)')
    parser.add_argument('--pr', type=int, help='PR number')

    args = parser.parse_args()

    if not args.issue and not args.pr:
        print("❌  Either --issue or --pr is required")
        sys.exit(2)

    try:
        if args.issue:
            stage = args.stage
            if not stage:
                print("❌  --stage is required with --issue")
                sys.exit(2)

            ok, msg = check_issue(args.issue, stage)

            # If a PR is also specified, validate it too
            if args.pr:
                pr_ok, pr_msg = check_pr(args.pr)
                if not pr_ok:
                    print(f"❌  PR GATE FAILED: {pr_msg}")
                    sys.exit(1)
                print(f"✅  PR GATE PASSED: {pr_msg}")

        elif args.pr:
            if args.stage:
                print("⚠  --stage ignored when --pr is specified")
            ok, msg = check_pr(args.pr)
        else:
            print("❌  No check specified")
            sys.exit(2)

        if ok:
            print(f"\n✅  STAGE GATE PASSED: {msg}")
            sys.exit(0)
        else:
            print(f"\n❌  STAGE GATE FAILED: {msg}")
            sys.exit(1)

    except RuntimeError as e:
        print(f"\n❌  STAGE GATE ERROR: {e}")
        sys.exit(2)


if __name__ == '__main__':
    main()
