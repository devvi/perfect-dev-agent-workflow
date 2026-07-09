# Perfect Dev Agent Workflow — OpenClaw Integration

## Architecture

```
PiBot (OpenClaw cron)
  │
  ├── Poll GitHub every 5 min
  ├── Dispatch stage agents (isolated sessions)
  ├── Review PRs → auto-merge or request revision
  └── Notify K via Feishu on status changes
```

## Cron Job

A single cron job (`pda-workflow-dispatcher`) polls GitHub Issues and PRs every 5 minutes:

1. **Find unclaimed issues** (label: `workflow/available`)
   - Claim → spawn `research-agent`

2. **Monitor PRs by stage**
   - Research PRs → review against 7 criteria → auto-merge or revise
   - Plan PRs → review design + tests → auto-merge or revise
   - Implement PRs → check CI → auto-merge or self-correct

3. **Report to K** via Feishu DM on significant status changes

## Sub-Agent Architecture

Each stage runs in an isolated OpenClaw session:
- `research-agent` — deep analysis, opens research PR
- `plan-agent` — design + TDD test generation, opens plan PR
- `implement-agent` — phased implementation via OpenCode, opens implement PR
- `self-correct-agent` — analyze + fix test failures

## Setup

```bash
# 1. Apply the skill
openclaw skills apply perfect-dev-agent-workflow

# 2. Set up the cron job (from SKILL.md cron configuration)

# 3. Verify
openclaw cron list
```

## Required Environment

- `gh` CLI authenticated (devvi)
- OpenCode Serve running on :18765
- GitHub repo with workflow labels set up
