# CI-Gated Merge Policy

> **Design rule:** The implement agent must NOT merge its own PR. The cron/`check_run.completed` handler is the single authority for merging implement PRs, and only merges after CI passes.

## The Problem (Timeline)

This policy was added 2026-07-12 after discovering a race condition that let broken code reach master:

| Time (UTC+0) | Event |
|-------------|-------|
| 13:21:26 | PR #145 created (impl/* branch → master) |
| 13:21:29 | CI starts running (GitHub Actions triggered by push) |
| 13:21:46 | **PR #145 auto-merged** — only 20s after creation |
| 13:22:04 | CI finishes — **❌ FAILURE** — arrived 18s too late |

**Root cause:** The implement agent called `gh pr merge --auto` immediately after `gh pr create`. Without branch protection, GitHub merged instantly — CI didn't even have time to finish.

**Self-correct never triggered** because by the time the `check_run.completed` webhook arrived, the PR was already merged. The self-correct loop was designed to fire on CI failure, but the merge happened first, making self-correct pointless.

## The Fix: Two Changes

### 1. Implement Agent: Stop Auto-Merging

**Before (broken):**
```bash
python3 ~/.hermes/scripts/stage-gate.py --issue "$ISSUE_N" --stage implement --pr "$PR_NUM"
if [ $? -eq 0 ]; then
  gh pr merge "$PR_NUM" --auto --squash --delete-branch  # ← BUG: merged before CI
fi
```

**After (fixed):**
```bash
python3 ~/.hermes/scripts/stage-gate.py --issue "$ISSUE_N" --stage implement --pr "$PR_NUM"
if [ $? -eq 0 ]; then
  echo "✅ Stage gate passed — PR #$PR_NUM is ready for CI"
  echo "   → CI passes → cron auto-merges"
  echo "   → CI fails  → self-correct triggers"
fi
```

**Changed:** `game-implement-agent` Step 9 (main flow) + Step 6 (Direct Fallback)

### 2. Cron/Check_Run Handler: CI Success → Review Gate → Merge

**Before (incomplete):**
```
check_run.completed:
  if failure and impl/* → spawn self-correct
  if success → nothing to do (CI passed)        # ← BUG: nobody merges on success
```

**First fix (2026-07-12, still no code review):**
```
check_run.completed — handle FIRST:
  if success and impl/*:
    → PR is OPEN → gh pr merge --squash --delete-branch  # ← CI passes but no review
  if failure and impl/*:
    → PR is OPEN → spawn self-correct agent
```

**Final fix (2026-07-12, pre-merge review gate):**
```
check_run.completed — handle FIRST in the cron cycle:
  if success and impl/*:
    → PR is OPEN → spawn REVIEW agent via delegate_task
      → Review passes → gh pr merge --squash --delete-branch
      → Review fails → post issues on PR, mark status/blocked
  if failure and impl/*:
    → PR is OPEN → spawn self-correct agent
```

**Changed:** `dev-workflow-dispatcher` SKILL.md check_run section + cron prompt template

## Merge Authority Chain

| Layer | Responsibility | Fail-safe |
|-------|---------------|-----------|
| **Implement agent** | Create PR, push code, stage-gate | Do NOT set auto-merge |
| **Route script** | Write check_run event to pending | Store essential fields only (< 0.3KB) |
| **Cron poller** | Read pending, evaluate CI conclusion | Spawn review agent (not merge) on CI success |
| **Review agent** | Code quality check against DESIGN | Merge only if review passes; document and block if fails |
| **Self-correct agent** | Fix CI failures on impl/* branches | Max 3 attempts, then status/blocked |
| **Branch protection** (GitHub) | Block merge if CI failed | Manual setup in repo Settings — NOT the primary defense |

## Invariants

1. **Never `gh pr merge --auto` from the implement agent.** The merge decision belongs to the review agent, which evaluates both CI results AND code quality before merging.
2. **Three outcomes for check_run events on impl/* branches:**
   - CI success + review pass → merge
   - CI success + review fail → document and block
   - CI failure → self-correct
   There is no "do nothing" path.
3. **Review is a PRE-MERGE gate, not post-merge.** The review agent runs when CI passes but BEFORE merge. If review fails, code never reaches master.
4. **Workflow is self-contained.** Branch protection is an optional extra layer — the workflow should be correct without it. The agent must not rely on GitHub settings as a safety net.
5. **Stale events are expected** — if the cron was delayed and the PR was already merged by some other path, mark stale and skip, rather than trying to re-merge.
