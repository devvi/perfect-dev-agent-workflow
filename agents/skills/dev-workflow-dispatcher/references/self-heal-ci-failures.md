# Self-Heal: CI Failure → Auto-Correct + CI Success → Auto-Merge

**Status:** UPDATED 2026-07-12

## The Flow (Two Paths)

### Path A: CI Success → Review Gate → Merge

```
CI success on impl/* branch
  → check_run.completed webhook fires (conclusion="success")
  → Route script writes event to pending file
  → Cron reads pending event
  → Finds check_run with conclusion="success" and branch starting with "impl/"
  → Spawns REVIEW agent via delegate_task
    → Review agent checks code quality against DESIGN
    → PASS: gh pr merge --squash --delete-branch
    → FAIL: posts detailed issues on PR, marks status/blocked
  → Post Feishu: "📋 #N → review" / "✅ #N → merged" / "❌ #N → blocked"
```

### Path B: CI Failure → Self-Heal

```
CI failure on impl/* branch
  → check_run.completed webhook fires
  → Route script (patched 2026-07-11):
     Extracts PR number from check_run.check_suite.pull_requests[0].number
     Stores head_branch + conclusion in pending event
  → Cron reads pending event
  → Finds check_run with conclusion="failure" and branch starting with "impl/"
  → Sends error to the existing OpenCode session:
     POST /session/<session-id>/message
     {"parts":[{"type":"text","text":"CI failed: <error>. Fix and push."}]}
  → OpenCode fixes → git push → CI re-runs
  → Max 3 attempts, then mark status/blocked
  → Post Feishu: "🔄 #N → self-correct"
```

## Why Two Paths Now (2026-07-12 Change)

Before the fix, the implement agent called `gh pr merge --auto` immediately after creating the PR. This caused:

- PR merged before CI finished (no branch protection)
- Self-correct never triggered because the PR was already merged
- Broken code reached master

**New design:** The implement agent NO LONGER auto-merges. It creates the PR and stops. The cron/operator handles the full pipeline:

| Step | What Happens |
|------|-------------|
| CI passes | Cron spawns review agent |
| Review passes | Review agent merges PR |
| Review fails | Issues documented, PR blocked, self-correct loop |
| CI fails | Self-correct agent fixes → re-push → re-run CI → re-review |

This ensures code is both TESTED (CI) and REVIEWED (quality gate) before reaching master.

## Route Script Changes

Before the fix, `check_run` events were silently dropped because the route script didn't extract the PR number from the nested `check_run.check_suite.pull_requests[]` field. The script only checked `payload.issue` and `payload.pull_request` fields.

**Fix applied to `~/.hermes/scripts/workflow-dispatcher.py`:**

```python
elif "check_run" in payload:
    event_type = "check_run"
    cr = payload.get("check_run", {})
    suite = cr.get("check_suite", {})
    prs = suite.get("pull_requests", [])
    if prs:
        issue_number = prs[0].get("number")
    head_branch = cr.get("head_branch", "")
    conclusion = cr.get("conclusion", "")
```

The event is enriched with `branch` and `conclusion` fields so the cron handler can filter only `impl/*` branches with `failure` conclusion.

## Self-Heal vs Self-Correct

- **Self-HEAL** — CI failed on OpenCode-generated code → send error back to same OpenCode session → fixes itself. No new agent spawned.
- **Self-CORRECT** — CI failed on direct-edits code (no OpenCode session) → spawn self-correct agent as fallback. Agent reads error, fixes, pushes.

The cron prompt prefers self-HEAL (OpenCode) first. Falls back to self-CORRECT (new agent) only if no OpenCode session exists.

## Verification

```bash
# Route script processes check_run events:
echo '{"action":"completed","check_run":{"id":999,"conclusion":"failure","head_branch":"impl/127-test","check_suite":{"pull_requests":[{"number":131}]}}}' | \
  python3 ~/.hermes/scripts/workflow-dispatcher.py
cat ~/.hermes/workflow-pending.json
# Should show: {"_key": "check_run#131", "branch": "impl/127-test", "conclusion": "failure"}
```
