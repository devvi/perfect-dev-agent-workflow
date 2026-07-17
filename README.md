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
                    ┌──────┐     research     ┌──────────┐
Issue ──→ backlog ──→ pick │ ──→ workflow/ ──→ │          │
(新创建)    workflow/  └──────┘    available     │ research │
           backlog    ↑ Picker                  │ (phase)  │
                      │ (工作窗口内)              └────┰─────┘
                                                   PR merge
                                                      │
                                              ┌───────▼──────┐
                                              │   plan       │
                                              │  (phase)     │
                                              └───────┰──────┘
                                                     PR merge
                                                        │
                                              ┌─────────▼────────┐
                                              │   implement      │
                                              │   (phase)        │
                                              └─────────┰────────┘
                                                     PR created
                                                        │
                                              ┌─────────┴─────────┐
                                         CI fail              CI pass
                                              │                    │
                                    ┌─────────▼────────┐  ┌───────▼───────┐
                                    │  self-correct    │  │   review      │
                                    │  (reserved slot) │  │ (reserved)    │
                                    │  fix → push       │  │ approve→merge │
                                    └─────────┰────────┘  └───────┰───────┘
                                           re-CI              deploy
                                              │                    │
                                              └────────────────────┘
                                                         │
                                                   status/done
```

### Agent Slot Allocation

```
Total: 4 (config.yaml max_concurrent_children: 4)

┌─────────────────────┐
│ 2 phase slots       │ ← research / plan / implement
│ (MAX_PHASE_SLOTS)   │    实时从 GitHub issue label 计数
└─────────────────────┘
┌─────────────────────┐
│ 2 reserved slots    │ ← review / self-correct（不计数）
│ (非 cap)            │    随到随 SPAWN，不跟 phase 竞争
└─────────────────────┘
```

- Review = CI pass 后审查代码质量（读 DESIGN → 跑 checklist → approve/merge）
- Self-correct = CI fail 后修复测试（diagnose → fix → push → re-CI）
- 两者不串联，不冲突，各走各的 slot
- 池满 → 跳过，下次 tick 重试，不阻塞 cron

## Workflow Labels

| Label | Meaning |
|-------|---------|
| `workflow/backlog` | Backlog — waiting to be picked into workflow |
| `workflow/available` | Picked from backlog, entering pipeline |
| `workflow/research` | Research agent running (phase slot) |
| `workflow/plan` | Design agent running (phase slot) |
| `workflow/implement` | Implementation agent running (phase slot) |
| `workflow/self-correct` | CI failure — self-healing (reserved slot) |
| `status/blocked` | Waiting for dependency to resolve (auto-managed) |
| `status/done` | Issue resolved |
| `priority/critical` | Must handle immediately |
| `priority/high` | Important, next version |
| `priority/medium` | Normal priority (default) |
| `priority/low` | Nice-to-have |

**Review is outside the label chain.** Review agent runs on `check_run.completed` (CI success on `impl/*` branches), before merge. The review agent is the only entity that can merge implement PRs. Uses reserved slot — doesn't compete with phase agents.

**Dependencies are declared in issue body** (`## Dependencies` section), not as labels. See `docs/DESIGN/216-workflow-improvements.md`.

## Architecture Highlights

- **Event pipeline:** GitHub webhook → route script (fcntl file lock) → pending.json → event-processor → SPAWN/BLOCKED instruction → LLM → delegate_task
- **Dependency modeling:** Issue body `## Dependencies` → `Depends on: #N` → BLOCKED signal → `status/blocked` → auto-unblock when resolved
- **Priority sorting:** `priority/critical > high > medium > low` labels → event-processor sorts SPAWN output by priority
- **Agent slot allocation:** 4 total slots — 2 phase (research/plan/implement) + 2 reserved (review/self-correct). Phase agents capped at 2; review/self-correct bypass cap. Pool full → skip, retry next tick.
- **Work hours:** Config file `~/.hermes/workflow-config.json` → `daytime/night-owl/always` presets or custom hours. Outside hours: no new issues picked, existing pipeline continues.
- **Issue picker:** `pick_next_issue()` runs inside event-processor. Fills available phase slots from backlog (workflow/backlog). Triggers on window open + status/done.
- **Crash recovery:** `reconcile()` on window entry — syncs GitHub labels with pending state, regenerates missing events.
- **Workflow control:** `/workflow pause|resume|status|hours` (slash command) or `touch ~/.hermes/workflow-pause`. Config change takes effect next cron tick.
- **activeForm:** PRD Section 8 (Continuation Context) → plan agent reads → implement agent writes `docs/PROGRESS/<N>.md` → review agent archives to GDD. Three-layer handoff chain.
- **Self-heal:** CI failure on `impl/*` branch triggers self-correct agent (reserved slot), which diagnoses and pushes fixes automatically
- **Review:** CI success on `impl/*` branch triggers review agent (reserved slot). Reads DESIGN → runs quality checklist → approves/merges → updates GDD.
- **Branch Protection:** `master` branch requires `test-and-report` to pass. No CI pass = no merge. Server-side enforced.
- **Deterministic preprocessor:** `event-processor.py` handles event grouping, dedup, dependency check, priority sort, and generates `SPAWN:` instructions. LLM only executes — no silent skipping.
- **Stage Gate:** `stage-gate.py` validates PR labels, branch names, and force-disables auto-merge on every PR.
- **Implement dedup:** Before generating `SPAWN: implement`, checks if `impl/*` branch PR already exists for this issue. Skips if found.

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
| `scripts/event-processor.py` | Cron preprocessor: group, dedup, dependency check, priority sort, phase/reserved slot capping, picker, reconcile. SPAWN output. Project copy, synced |
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
