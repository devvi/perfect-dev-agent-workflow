# Event-Driven Workflow — Hermes Integration

## Architecture

```
GitHub (devvi/perfect-dev-agent-workflow)
  │ Issues / PR / CI 事件
  ▼ Webhook (ngrok tunnel)
Hermes Webhook (port 8644)
  │ Load skill: dev-workflow-dispatcher
  │ Delegate sub-agents per stage
  ▼
Hermes delegate_task → Sub-Agents
  research-agent → plan-agent → implement-agent (via OpenCode) → review-agent
```

## Webhook Setup

| Component | URL |
|-----------|-----|
| Hermes webhook | `http://localhost:8644/webhooks/github-dev-workflow` |
| ngrok tunnel | Dynamic — regenerate on restart |
| GitHub hook | `https://<ngrok-url>/webhooks/github-dev-workflow` |

## Event-Driven Flow (No Polling)

Unlike the previous cron-based orchestration, this workflow is fully event-driven:

1. **`issues` event** — new issue or label change → spawn phase agent
2. **`pull_request` event** — PR merge → trigger next phase
3. **`check_run` event** — CI complete → decide self-correct or advance

Label advancement on PR merge is handled by `.github/workflows/workflow-chain.yml` (GitHub Action).

## Agent Skills

All agent logic lives in Hermes skills under `~/.hermes/skills/software-development/`:

| Skill | Function |
|-------|----------|
| `dev-workflow-dispatcher` | Webhook event router, stage dispatcher |
| `game-research-agent` | Research + PRD generation (includes Obsidian wiki search) |
| `game-plan-agent` | DESIGN doc + test case generation |
| `game-implement-agent` | OpenCode Serve API integration |
| `game-review-agent` | Code quality review |

## Model

OpenCode uses `deepseek-v4-flash-free` via OpenCode Zen API.

## Sub-Agent Spawning

Sub-agents run via Hermes `delegate_task` — isolated sessions with full tool access.
Results re-enter the dispatcher session when complete.
