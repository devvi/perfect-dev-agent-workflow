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
├─ scripts/          → Deterministic Python scripts (event-processor, stage-gate, dispatcher)
│                     synced to ~/.hermes/scripts/ via sync-to-hermes.sh
│
├─ agents/skills/    → Agent skill definitions (research, plan, implement, review, dispatcher)
│                     symlinked from ~/.hermes/skills/
│
└─ ~/.hermes/        → Hermes runtime (config, env, pending events, cron jobs)
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
| `status/blocked` | Waiting for dependency to resolve (auto-managed) |
| `status/done` | Issue resolved |
| `priority/critical` | Must handle immediately |
| `priority/high` | Important, next version |
| `priority/medium` | Normal priority (default) |
| `priority/low` | Nice-to-have |

**Review is outside the label chain.** Review agent runs on `check_run.completed` (CI success on `impl/*` branches), before merge. The review agent is the only entity that can merge implement PRs.

**Dependencies are declared in issue body** (`## Dependencies` section), not as labels. See `docs/DESIGN/216-workflow-improvements.md`.

## Architecture Highlights

- **Event pipeline:** GitHub webhook → route script (fcntl file lock) → pending.json → event-processor → SPAWN/BLOCKED instruction → LLM → delegate_task
- **Dependency modeling:** Issue body `## Dependencies` → `Depends on: #N` → BLOCKED signal → `status/blocked` → auto-unblock when resolved
- **Priority sorting:** `priority/critical > high > medium > low` labels → event-processor sorts SPAWN output by priority
- **Work hours:** Config file `~/.hermes/workflow-config.json` → `daytime/night-owl/always` presets or custom hours. Outside hours: no LLM calls, events accumulate.
- **Workflow control:** `/workflow pause|resume|status|hours` (slash command) or natural language. Config change takes effect next cron tick.
- **activeForm:** PRD Section 8 (Continuation Context) → plan agent reads → implement agent writes `docs/PROGRESS/<N>.md` → review agent archives to GDD. Three-layer handoff chain.
- **Self-heal:** CI failure on `impl/*` branch triggers self-correct agent, which diagnoses and pushes fixes automatically
- **Branch Protection:** `master` branch requires `test-and-report` to pass. No CI pass = no merge. Server-side enforced.
- **Parallel processing:** Up to 3 concurrent issue tracks (delegate_task pool). Each issue runs independently.
- **Deterministic preprocessor:** `event-processor.py` handles event grouping, dedup, dependency check, priority sort, and generates `SPAWN:` / `BLOCKED:` instructions. LLM only executes — no silent skipping.
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
| `scripts/workflow-dispatcher.py` | Webhook → pending (file lock protected). Project copy, synced to `~/.hermes/scripts/` |
| `scripts/event-processor.py` | Cron preprocessor: group, dedup, dependency check, priority sort, SPAWN/BLOCKED generation. Project copy, synced |
| `scripts/stage-gate.py` | PR validation: labels, branch, auto-merge disable. Project copy, synced |
| `scripts/workflow-ctl.sh` | Workflow control: pause/resume/status/hours presets. Edits `~/.hermes/workflow-config.json` |
| `scripts/sync-to-hermes.sh` | One-way sync: project scripts/ → ~/.hermes/scripts/ (run after editing) |
| `agents/skills/game-*-agent/SKILL.md` | Agent skills for each phase (research, plan, implement, review) |
| `agents/skills/dev-workflow-dispatcher/SKILL.md` | Event routing: cron prompt, operator agent pattern, stalled scan protocol |
| `docs/DESIGN/216-workflow-improvements.md` | Full design doc for issue picker: dependency modeling, priority, activeForm |
| `.github/workflows/opencode-review.yml` | CI: test + E2E Playwright + status check |
| `.github/workflows/workflow-chain.yml` | Label advancement after PR merge |
| `.github/workflows/deploy.yml` | Vercel deployment |
| `~/.hermes/workflow-config.json` | Runtime config: enabled, work hours, preset |

## Tech Stack

| Component | Purpose |
|-----------|---------|
| Hermes Agent | Agent runtime + event routing |
| OpenCode Serve | LLM code generation engine |
| GitHub Issues | Task queue + state management |
| GitHub Actions | CI/CD execution |
| Vercel | Deployment platform |
| Playwright | E2E browser testing |
