# Project Handover: Perfect Dev Agent Workflow

> For: @Mbot (new Hermes agent, company intranet)
> From: Pi-based Hermes agent (original)
> Version: 2026-07-17

## 1. Project Location

```
Local (Pi): /home/pi/workspace/.pda/perfect-dev-agent-workflow
GitHub:     https://github.com/devvi/perfect-dev-agent-workflow
Vercel:     https://perfect-dev-agent-workflow.vercel.app/gameboy.html
```

## 2. Architecture Overview

```
GitHub Webhook → route script → pending.json → event-processor → SPAWN → LLM → delegate_task
```

### Data Flow

1. **GitHub webhook** → `workflow-dispatcher.py` writes to `pending.json`
2. **Cron tick (every 1m)** → `event-processor.py` reads pending, outputs SPAWN instructions
3. **Cron LLM** reads SPAWN → calls `delegate_task` to spawn sub-agents
4. **Sub-agents** run research/plan/implement/review/self-correct tasks

### Agent Slot Allocation

```yaml
max_concurrent_children: 4
# 2 phase slots (research/plan/implement) + 2 reserved (review/self-correct)
# Phase agents capped at 2; review/self-correct bypass cap
```

## 3. Running Services (Pi)

| Service | Port | Type | Purpose |
|---------|------|------|---------|
| `hermes-gateway.service` | 8644 | systemd --user | Hermes agent runtime + webhook |
| `hermes-ngrok.service` | 4040 | systemd --user | ngrok tunnel → GitHub webhook |
| `opencode-server.service` | 18765 | systemd --user | LLM code generation engine |
| `hermes-workflow-dashboard.service` | 8080 | systemd --user | Workflow dashboard (Material Design) |
| VNC | 5900 | system | Remote desktop access |

### Manage Services

```bash
systemctl --user status hermes-gateway
systemctl --user restart hermes-gateway
journalctl --user -u hermes-gateway -n 50 --no-pager
```

### Webhook URL (ngrok)

Ngrok tunnel changes on restart. Sync via cron:
- `~/.hermes/scripts/webhook-sync.py` (runs every 15m, no_agent)
- Webhook URL: `https://<ngrok-id>.ngrok-free.app/webhooks/dev-workflow`

### Dashboard

```
http://192.168.31.213:8080/dashboard.html
```
- Shows active agents (with names from first message fallback)
- Pipeline issues, cron jobs, infrastructure status
- Auto-refresh every 15s

## 4. Workflow Labels

| Label | Purpose |
|-------|---------|
| `workflow/backlog` | Default when issue created via template |
| `workflow/available` | Picked from backlog, entering pipeline |
| `workflow/research` | Research agent running (phase slot) |
| `workflow/plan` | Plan agent running (phase slot) |
| `workflow/implement` | Implement agent running (phase slot) |
| `workflow/self-correct` | CI failure — self-healing (reserved slot) |
| `status/done` | Issue resolved |
| `priority/critical/high/medium/low` | Priority queue |

## 5. Key Files (in project)

### Scripts (synced to ~/.hermes/scripts/)

| Script | Role | Sync |
|--------|------|------|
| `scripts/event-processor.py` | Cron: group, dedup, dep check, cap SPAWN, picker | `cp scripts/* ~/.hermes/scripts/` |
| `scripts/workflow-dispatcher.py` | Thin webhook → pending.json (fcntl lock) | Same |
| `scripts/stage-gate.py` | PR validation + disable auto-merge | Same |
| `scripts/workflow-ctl.sh` | Pause/resume/status/hours | Same |
| `scripts/sync-to-hermes.sh` | One-way sync project → ~/.hermes/ | Run after editing |

### Agent Skills (in ~/.hermes/skills/software-development/)

| Skill | File |
|-------|------|
| `game-research-agent` | Issue → PRD (Obsidian search) |
| `game-plan-agent` | PRD → DESIGN + test cases |
| `game-implement-agent` | DESIGN → code (via OpenCode) |
| `game-review-agent` | Code review → merge → GDD update |
| `dev-workflow-dispatcher` | Event routing + cron prompt logic |

### Config

| File | Purpose |
|------|---------|
| `~/.hermes/config.yaml` | Provider, toolsets, delegation (max_async_children=4) |
| `~/.hermes/workflow-config.json` | Work hours, preset, enabled flag |
| `~/.hermes/workflow-pending.json` | Pending webhook events (read/write by route script) |
| `~/.hermes/skills/*/SKILL.md` | Skill definitions |
| `~/.hermes/cron/jobs.json` | Cron jobs (persistent schedule) |

## 6. Current State (as of handover)

### Active Issues

- #222 [Feature] 玩家初始状态修改 → workflow/research (PR #226 OPEN)
- #223 [Bug] 带锁的房间不工作 → workflow/implement (PR #231 BEHIND)
- #224 [Feature] 增加战斗房间 → workflow/implement (PR #232 CLEAN)

### PR Status

| PR | Issue | Status | Merge? |
|----|-------|--------|--------|
| #225 | #223 research | MERGED | ✅ |
| #229 | #223 plan | MERGED | ✅ |
| #226 | #222 research | OPEN | ❌ behind |
| #228 | #224 research | OPEN | ❌ behind |
| #230 | #224 plan | MERGED | ✅ |
| #231 | #223 implement | OPEN | ❌ blocked/behind |
| #232 | #224 implement | OPEN | ❌ clean (needs review) |

### Pending Events

Multiple stale events in `~/.hermes/workflow-pending.json` — event-processor handles dedup.

## 7. Known Issues & Fixes Applied

| Issue | Fix | PR |
|-------|-----|----|
| LLM didn't execute SPAWN (investigated instead) | Shortened cron prompt + removed "use your judgment" | #218 |
| review/self-correct competed with phase agents for slots | reserved slots: 2 phase + 2 review/self-correct | #238 |
| Implement dedup search syntax wrong | `head:{branch}` instead of `in:headRefName` | #238 |
| async pool full → sync fallback → cron deadlock | prompt: "skip, retry next tick" | #238 |
| SPAWN output order P1 before SPAWN | sort: review/self-correct → phase → P1/P2 | #238 |
| Agents unnamed in dashboard | first message fallback in server.py | #240 |
| Dashboard crashes | systemd Restart=always | #240 |

### Still Open

- **Pre-existing test failures (C2/C4 random food)** — All implement PRs failing CI due to flaky tests. Fix exists on #211 branch but never merged. Blocks #231/#232/#222 review.
- **Research PR stuck** #226 BEHIND — needs rebase/merge.
- **Review agent never triggered for #232** — CI CLEAN but no review happened (concurrency was full at the time).
- **Work hours checked from cron** — Need to ensure new agent's timezone matches or use `night-owl` preset (23:00-08:00).

## 8. Conventions

### Issue Templates

Issues created via template get:
- `bug`/`enhancement` + `workflow/backlog` + `priority/medium` + `depth/standard`
- Optional toggle: `"搜索知识库"` → research agent will search Obsidian

### Commit Message Style

```
type(scope): description

Only list changes in the diff. No runtime ops or features not written.
```

### PR Merge Policy

- Research/plan PRs: auto-merge (lightweight docs)
- Implement PRs: CI must pass + review agent must approve
- Branch protection: `test-and-report` + 1 approval on master

## 9. Environment Secrets (NOT in repo)

| Secret | Location |
|--------|----------|
| Feishu webhook URL | `~/.hermes/config.yaml` + deploy secrets |
| GitHub webhook secret | `~/.hermes/env.yaml` |
| ngrok token | systemd service env |
| OpenCode API key | opencode config |
| Vercel token | GitHub Actions secrets |

## 10. Quick Onboarding

```bash
# 1. Clone and set up
git clone https://github.com/devvi/perfect-dev-agent-workflow ~/workspace/perfect-dev-agent-workflow

# 2. Copy scripts to hermes runtime
cd ~/workspace/perfect-dev-agent-workflow
cp scripts/*.py ~/.hermes/scripts/
cp scripts/*.sh ~/.hermes/scripts/

# 3. Link skills
ln -sf ~/workspace/perfect-dev-agent-workflow/agents/skills/* ~/.hermes/skills/software-development/

# 4. Set up cron job
cronjob action=create \
  name="workflow-pending-poller" \
  schedule="every 1m" \
  deliver="local" \
  script="event-processor.py" \
  workdir="~/workspace/perfect-dev-agent-workflow"

# 5. Test event processing
EVENT_PROCESSOR_PENDING_FILE=~/.hermes/workflow-pending.json \
  python3 ~/.hermes/scripts/event-processor.py

# 6. Pause/resume workflow
touch ~/.hermes/workflow-pause   # pause all
rm ~/.hermes/workflow-pause      # resume
/workflow hours night-owl        # set 23:00-08:00 window
```

## 11. Full Workflow Diagram

```
                    ┌──────┐     research     ┌──────────┐
Issue ──→ backlog ──→ pick │ ──→ workflow/ ──→ │          │
(新创建)    workflow/  └──────┘    available     │ research │
           backlog    ↑ Picker                  │ (phase)  │
                      │ (工作窗口内              └────┰─────┘
                      │     23:00-08:00)           PR merge
                         │
                      ┌───▼──────┐
                      │   plan   │
                      │  (phase) │
                      └───┰──────┘
                         PR merge
                         │
                      ┌───▼────────┐
                      │ implement  │
                      │  (phase)   │
                      └───┰────────┘
                         PR created
                         │
                  ┌──────┴──────┐
              CI fail         CI pass
                  │               │
        ┌─────────▼──────┐  ┌────▼────────┐
        │ self-correct   │  │   review    │
        │ (reserved slot)│  │ (reserved)  │
        │ fix → push     │  │ approve→merge│
        └─────────┰──────┘  └────┰────────┘
              re-CI            deploy
                  │               │
                  └───────┬───────┘
                          │
                    status/done

Total pool: 4 slots
┌───────────────────────┐
│ 2 phase slots         │ ← research/plan/implement
└───────────────────────┘
┌───────────────────────┐
│ 2 reserved slots      │ ← review/self-correct (uncapped)
└───────────────────────┘
```
