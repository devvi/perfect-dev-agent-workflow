# Operator Agent Pattern

> The operator agent is spawned via `delegate_task(role='orchestrator')` to manage
> the 6-stage workflow. It reads pending events from the thin route script, checks
> actual GitHub state, and takes action — spawning phase agents for LLM work,
> running gh/git commands for mechanical work.

## Prerequisites

- `delegation.max_spawn_depth: 2` in `~/.hermes/config.yaml` (allows orchestration)
- `delegation.orchestrator_enabled: true`
- Operator spawned with `role='orchestrator'`

## Spawn Template

See `references/spawn-context-templates.md` → **Operator Agent (Cron Poller Spawn)** for the full concrete template with depth-aware phase instructions, branch naming, and auto-merge logic.

High-level outline:

```python
delegate_task(
    goal="Manage the 6-stage workflow for pending GitHub issues.",
    context="""...detailed instructions from spawn-context-templates.md...""",
    role="orchestrator"          # ← REQUIRED to allow spawning phase agents
)
```

## Operator Agent Instructions Template

```
## Workflow Operator Instructions

You manage the 6-stage workflow for the project `devvi/perfect-dev-agent-workflow`.

### Your Tasks
1. Read pending events from ~/.hermes/workflow-pending.json
2. For each pending event, query ACTUAL GitHub state:
   - gh issue view <N> --json labels,state
   - gh pr list --head "research/<N>-*" --state all
   - gh pr list --head "plan/<N>-*" --state all
   - gh pr list --head "impl/<N>-*" --state all
3. Determine next action based on labels + PR state
4. Take action (no duplicates — always check first)
5. For light/standard depth: auto-merge all PRs
6. For deep depth: spawn phase agents via delegate_task

### Phase Mapping

| Issue Label | Phase | Action |
|-------------|-------|--------|
| workflow/research | Research | Create PRD, branch, PR. Light: auto-merge. Deep: spawn research-agent |
| workflow/plan | Plan | Write DESIGN+TASKS, tests. Light: auto-merge. Deep: spawn plan-agent |
| workflow/implement | Implement | Call OpenCode API for code. Light: auto-merge. Deep: spawn implement-agent |
| workflow/test | Review | Review code. Auto-merge if passes. |

### Golden Rule
Every code change must update related tests AND docs.

### Working Context
- Repo: /home/pi/workspace/perfect-dev-agent-workflow/
- Default branch: master (NOT main)
- gh CLI authenticated as devvi
- OpenCode Serve: http://127.0.0.1:18765
```

## Common Mistakes

### ❌ Creating Duplicate PRs
Always check if a branch/PR already exists before creating:
```bash
gh pr list --head "research/94-*" --state all
# If exists, skip creation — just enable auto-merge if not already set
```

### ❌ Using Stale Payload Labels
Webhook payload labels are from event time. Always fetch fresh state:
```python
gh("issue", "view", str(N), "--json", "labels")
```

### ❌ Forgetting Parent Issue Reference in PR Body
`workflow-chain.yml` regex: `(?:Closes|parent)\s*#(\d+)`
PR body MUST include `Parent: #N` or `Closes #N`.

### ❌ Hard-Coding "main" as Default Branch
This repo uses `master`. Check and hard-code correctly.

### ❌ Using `gh pr edit` / `gh pr merge` Without `read:org` Scope

`gh pr edit` and `gh pr merge` require `read:org` scope on the GitHub PAT.
Without it, both commands fail with GraphQL scope errors.

**Fix — use the REST API instead:**

```bash
# Edit PR body/title
gh api repos/devvi/perfect-dev-agent-workflow/pulls/<N> -X PATCH \
  -f body="Parent: #<N>" \
  -f title="Research: title (parent #<N>)"

# Merge PR
gh api repos/devvi/perfect-dev-agent-workflow/pulls/<N>/merge -X PUT \
  -f merge_method=squash
```

`gh issue edit` (for issues, not PRs) works fine without `read:org`.
Always prefer `gh api ... pulls/<N>` for PR operations and `gh issue edit` for issue operations.
