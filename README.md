# Perfect Dev Agent Workflow

**AI-driven game development workflow.** Event-driven, knowledge-aware, self-correcting, parallel.

## Two Parts

```
├─ framework/       → Reusable agent framework for game makers
│                     ARCHITECTURE.md, quickstart.md, templates, CICD copies
│
├─ (root)           → Experiment: Metroidvania Snake game
│                     public/, tests/, docs/, .github/workflows/
│
└─ .hermes/skills/  → Hermes Agent skills (research, plan, implement, review, dispatcher)
```

## Quick Start

```bash
# New game maker? Start here:
cat framework/quickstart.md

# Understand the architecture:
cat framework/ARCHITECTURE.md

# See how it runs:
# Create a GitHub Issue → workflow runs automatically
```

## How It Works

```
你提 Issue → research → plan → implement → CI
                 ↑                         ├── success → review → merge → deploy
          Obsidian 知识库（设计笔记）         └── failure → self-correct → push → 重跑 CI
```

Each phase creates a PR. Research/Plan PRs auto-merge; Implement PRs are blocked by **Branch Protection** until CI passes + review approves.

## Workflow Labels

| Label | Meaning |
|-------|---------|
| `workflow/available` | Issue pending, waiting to start |
| `workflow/research` | Research agent running |
| `workflow/plan` | Design agent running |
| `workflow/implement` | Implementation agent running |
| `workflow/self-correct` | CI failure — self-healing |
| `status/done` | Issue resolved |

**Review is outside the label chain.** Review agent runs on `check_run.completed` (CI success on `impl/*` branches), before merge. The review agent is the only entity that can merge implement PRs.

## Architecture Highlights

- **Event pipeline:** GitHub webhook → route script (fcntl file lock) → pending.json → event-processor → SPAWN instruction → LLM → delegate_task
- **Self-heal:** CI failure on `impl/*` branch triggers self-correct agent, which diagnoses and pushes fixes automatically
- **Branch Protection:** `master` branch requires `test-and-report` to pass. No CI pass = no merge. Server-side enforced.
- **Parallel processing:** Up to 3 concurrent issue tracks (delegate_task pool). Each issue runs independently.
- **Deterministic preprocessor:** `event-processor.py` handles event grouping, dedup, priority, and generates `SPAWN:` instructions. LLM only executes — no silent skipping.
- **Stage Gate:** `stage-gate.py` validates PR labels, branch names, and force-disables auto-merge on every PR. Prevents agents from merging their own work.

## Requirements

- Hermes Agent (event gateway + agent runtime)
- OpenCode Serve (:18765, LLM code generation)
- GitHub (issues, PRs, Actions)
- Vercel (deployment — optional)
- Obsidian knowledge base (research — optional)
- Branch Protection: `master` requires `test-and-report` check

## Key Files

| File | Purpose |
|------|---------|
| `~/.hermes/scripts/workflow-dispatcher.py` | Webhook → pending (file lock protected) |
| `~/.hermes/scripts/event-processor.py` | Cron preprocessor: group, dedup, priority, SPAWN generation |
| `~/.hermes/scripts/stage-gate.py` | PR validation: labels, branch, auto-merge disable |
| `~/.hermes/skills/*/SKILL.md` | Agent skills for each phase |
| `.github/workflows/opencode-review.yml` | CI: test + E2E Playwright + status check |
| `.github/workflows/workflow-chain.yml` | Label advancement after PR merge |
| `.github/workflows/deploy.yml` | Vercel deployment |

## Tech Stack

| Component | Purpose |
|-----------|---------|
| Hermes Agent | Agent runtime + event routing |
| OpenCode Serve | LLM code generation engine |
| GitHub Issues | Task queue + state management |
| GitHub Actions | CI/CD execution |
| Vercel | Deployment platform |
| Playwright | E2E browser testing |
