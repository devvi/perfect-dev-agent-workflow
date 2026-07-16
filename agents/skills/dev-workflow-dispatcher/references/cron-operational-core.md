# Cron Operational Core

> Minimal cron prompt template. The actual cron job should use this as its prompt
> instead of loading the full dev-workflow-dispatcher skill (which is 100KB+ of
> reference material the LLM doesn't need for per-tick decisions).

## Script Output Processing

Read the event-processor.py stdout (injected as context). It is the only input needed.

### If output starts with SPAWN:
You MUST execute the instruction. Do NOT output [SILENT].

| SPAWN pattern | Action |
|---------------|--------|
| `SPAWN: self-correct,issue=N,branch=xxx,conclusion=failure` | Spawn self-correct agent via delegate_task. Context: issue, branch, CI failure. Do NOT merge. |
| `SPAWN: review,issue=N,branch=xxx,conclusion=success` | Spawn review agent via delegate_task. Context: issue, branch, DESIGN doc path. |
| `SPAWN: {research,plan,implement},issue=N` | Spawn phase agent via delegate_task. Context: issue number, depth, prior PR status. |

### If output starts with P1: or P2:
A non-standard event. Use judgment:
- P1: check_run — verify CI result, decide review vs self-correct vs skip
- P2: issues.labeled — check GitHub state, spawn phase agent if appropriate

### If output is [NO_ACTIONABLE_EVENTS: run stalled scan]:
→ Scan for stalled unmerged research/plan PRs (open, mergable, body has Parent #N)
→ If found: merge (gh pr merge --squash --delete-branch), advance workflow label
→ If nothing found: output [SILENT]

### If no script output at all:
→ output [SILENT]

## Pre-Spawn Validation Checklist

Before spawning any phase agent, validate against GitHub state:

1. Fetch current issue state: `gh issue view <N> --json state,labels`
2. If issue closed or label gone → skip (stale event)
3. For plan phase: verify research PR is merged (branch prefix `research/`)
4. For implement phase: verify BOTH research and plan PRs merged
5. For implement: check OpenCode health: `curl -s --max-time 5 http://127.0.0.1:18765/health`
6. For implement: verify DESIGN + PRD docs exist under docs/DESIGN/, docs/PRD/

## Critical Rules

- **Do NOT touch `impl/*` PRs.** Implement branches are handled by the event pipeline (check_run.completed → event-preprocessor → SPAWN review/self-correct).
- **Do NOT merge implement PRs** under any circumstance. Not via stalled scan, not via Permanent Stall Protocol — that protocol has been removed.
- **Do NOT investigate stashes on implement branches.** If CI is lost, the event pipeline will retry or escalate.
- **Research/plan PRs auto-merge** — they have no CI gate. The stalled scan merges them if workflow-chain missed them.
