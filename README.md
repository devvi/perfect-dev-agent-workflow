# Perfect Dev Agent Workflow

AI-driven development workflow. PiBot orchestrates. GitHub is the board. OpenCode ships.

```
K creates Issue ──→ PiBot polls GitHub
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
     ┌─────────┐  ┌─────────┐  ┌─────────┐
     │Research │  │  Plan   │  │Implement│
     │ Agent   │  │ Agent   │  │ Agent   │
     └────┬────┘  └────┬────┘  └────┬────┘
          │            │            │
          ▼            ▼            ▼
     ┌─────────────────────────────────────┐
     │         PiBot Review Gate            │
     │  research PR → 审核 → auto-merge    │
     │  plan PR     → 审核 → auto-merge    │
     │  implement PR → 审核 → auto-merge   │
     │  test fail   → self-correct loop    │
     └─────────────────────────────────────┘
                       │
                       ▼
                 ┌──────────┐
                 │  Vercel  │
                 │  Deploy  │
                 └──────────┘
```

## Architecture

| Layer | Component | Role |
|-------|-----------|------|
| **Board** | GitHub Issues + Labels + Kanban | K creates issues, watches progress |
| **Orchestrator** | PiBot (OpenClaw cron) | Polls issues, dispatches agents, reviews PRs, auto-merges |
| **Workers** | OpenCode Serve (:18765) | Writes code, runs tests (via sub-agent spawn) |
| **CI** | GitHub Actions | Self-healing: test → fix → push |
| **Deploy** | Vercel | Auto-deploy on merge to main |

## Workflow Stages

| # | Stage | Agent | Output | Gate (PiBot) |
|---|-------|-------|--------|--------------|
| 1 | Research | `research-agent` | `docs/PRD/`, Research PR | 7-section completeness check |
| 2 | Plan | `plan-agent` | `docs/DESIGN/`, Test cases, Plan PR | Design quality + test coverage |
| 3 | Implement | `implement-agent` | Code, Implement PR (via OpenCode) | Tests pass + review |
| 4 | Test | CI self-healing | Test report | All green |
| 5 | Self-correct | `self-correct-agent` | Fixes (max 3 attempts) | Re-test after each |
| 6 | Deploy | Vercel | Live deploy | — |

## Quick Start

```bash
# 1. Add workflow labels
bash scripts/setup-labels.sh

# 2. Set up Vercel
npx vercel link
npx vercel env add

# 3. Set up OpenClaw cron (PiBot handles this)

# 4. Create an Issue — PiBot picks it up automatically
```
