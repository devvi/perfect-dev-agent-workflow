# Perfect Dev Agent Workflow — Framework Architecture

> **A reusable, event-driven game development agent framework for experienced game makers.**
> This framework powers the snake-game experiment (at `experiments/snake-game/`), but is designed to be project-agnostic.

## Philosophy

```
你不是在学怎么配 CI/CD。
你是在把你的游戏设计经验变成可重复的代理流程。

你写 Obsidian 笔记 → research agent 自动消化
你画架构草图 → plan agent 自动生成设计文档
你验收玩法 → implement agent 改代码，review agent 把关
```

The framework treats the game maker's existing knowledge (Obsidian vault, design patterns, taste) as the primary input. CI/CD is just plumbing.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub (Event Source)                      │
│  Issue created / Label changed / PR merged → webhook         │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                Hermes Gateway (Event Router)                  │
│                                                              │
│  route-script → pending.json → cron poller → operator agent  │
│  (thin, no gh)                    (every 1m, reads local)     │
└────────────────────────┬────────────────────────────────────┘
                         │ delegate_task
    ┌────────────────────┼────────────────────┐
    ▼                    ▼                    ▼
┌──────────┐       ┌──────────┐       ┌──────────────┐
│research  │       │  plan    │       │  implement   │
│ agent    │       │  agent   │       │  agent       │
│          │       │          │       │              │
│ PRD      │       │ DESIGN   │       │ code + tests │
│ Obsidian │       │ test     │       │ OpenCode     │
│ search   │       │ descs    │       │ layered impl │
└──────────┘       └──────────┘       └──────────────┘
     │                   │                    │
     └───────────────────┼────────────────────┘
                         │ PR merged → CI → Review → Deploy
                         ▼
                  GitHub Actions
                  (test gate, E2E, deploy)
```

## Key Design Decisions

### Event-Driven, Not Polling

| Layer | Mechanism | Cost When Idle |
|-------|-----------|----------------|
| Webhook | GitHub → route script (instant) | 0 |
| Pending file | Local JSON (read-only) | 0 |
| Cron poller | Every 1 min, reads local file | ~0.001¢/check |
| No GitHub polling | Never calls API unless there's work | 0 |

### Three-Layer Safety

1. **Route script never runs gh/git** — prevents issue-closing, duplicate-PR bugs
2. **Stage-gate after each PR creation** — verify label exists, auto-fix via REST API
3. **CI test gate** — `continue-on-error: true` removed, test failure blocks merge

### Skill System

```
game-research-agent       — generates PRD from Issue + Obsidian knowledge
  └─ obsidian-knowledge-search  — searches wiki, extracts patterns, caches to REFERENCE/
game-plan-agent           — generates DESIGN doc + test case descriptions (not runnable files)
game-implement-agent      — generates code + test files via OpenCode (layered pattern)
  └─ OpenCode Serve (:18765)  — LLM-powered code generation
game-review-agent         — reviews code against DESIGN before merge
```

### Teleport Testing

E2E tests use state injection via `window.__GAME_API__`, not keyboard navigation:

```javascript
api.teleport(bossRoom.x, bossRoom.y);  // instant
api.simulateKey('Space');               // dismiss intro
api.tick(10);                           // run 10 frames
api.getState().gameState;               // verify
```

This makes E2E regression tests fast, deterministic, and easy to write for any gameplay scenario.

## Quickstart for a New Game Project

```bash
# 1. Copy the framework templates
cp -r framework/templates my-game/
cp -r framework/cicd my-game/.github/workflows/

# 2. Configure
export PROJECT_ROOT=/path/to/my-game
export TEST_COMMAND="npm test"
export DEPLOY_URL="my-game.vercel.app"

# 3. Add your game code
# 4. Write design notes in Obsidian wiki
# 5. Create your first Issue → workflow runs
```

See `framework/quickstart.md` for detailed setup.

## Project Structure Convention

```
project-root/
├── framework/                    ← This framework (read-only reference)
│   ├── ARCHITECTURE.md
│   ├── quickstart.md
│   ├── templates/                ← Template copies for new projects
│   └── cicd/                     ← CI/CD workflow copies
├── experiments/
│   └── <game-name>/              ← Your game project
│       ├── public/               ← Game source
│       ├── tests/                ← Game-specific tests
│       └── docs/                 ← PRD, DESIGN, REFERENCE
│
├── .github/                      ← Runtime (GitHub requires these at root)
│   ├── workflows/                ← Active CI/CD (used by this project)
│   └── ISSUE_TEMPLATE/
├── vercel.json
└── AGENTS.md
```

## Known Limitations

| Issue | Status | Workaround |
|-------|--------|------------|
| Phase agents occasionally skip PR labels | Stage-gate auto-fixes via REST API | Check stage-gate logs after PR creation |
| Self-heal (CI failure auto-fix) not battle-tested | Configured, waiting for first real trigger | Manually re-run failed CI via `gh run rerun` |
| Review phase (pre-merge via check_run) | Not battle-tested | CI success → spawn review agent → merge |
| 50-turn limit on complex features | Layer splitting + checkpoint pattern | For 8+ file changes, manually trigger next session |
