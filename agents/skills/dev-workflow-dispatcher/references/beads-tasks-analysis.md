# Beads & Claude Code Tasks — Design Analysis

> **Why this reference exists:** Beads and Claude Code Tasks are the two best-known examples of "AI agent task management" — this file captures their architecture, key ideas, and why they were NOT adopted as dependencies, so future design decisions can reference the analysis.

## Beads (`bd`)

**Author:** Steve Yegge (ex-Amazon, ex-Google, ex-Sourcegraph)
**Repo:** `github.com/gastownhall/beads` — 25k+ stars, 9.7k+ commits
**CLI:** `bd` — distributed, Git-backed graph issue tracker for AI coding agents

### Core Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Storage | Dolt (Git-for-databases) | SQL database with cell-level merge, native branching, version history |
| Sync | `issues.jsonl` (JSON Lines) | Append-only text file committed to Git; daemon syncs SQLite ↔ JSONL |
| Interface | CLI + Unix socket | `bd` commands + daemon for agent tool calls |

### Key Concepts Adopted in This Workflow

| Beads Concept | Our Implementation | Why |
|---------------|-------------------|-----|
| `bd prime` / `bd remember` | `docs/PROGRESS/` files + PRD Continuation Context section | Same goal (execution memory), no new infrastructure |
| `bd ready` (DAG-based ready queue) | event-processor priority sort + pre-spawn validation | Same filtering, using GitHub labels instead of Dolt |
| `bd update --claim` (atomic claim) | event-processor outputs SPAWN + cron removes event from pending file | Same race prevention, using pending file as lock |
| Hash-based IDs (`bd-a1b2`) | GitHub issue numbers (`#N`) | Native to GitHub, no collision risk in single-project context |
| Hierarchical IDs (epic.task.subtask) | Label chain (`workflow/research` → `plan` → `implement`) + DESIGN sections | Adequate for linear workflow; scale up when cross-issue DAG needed |

### Key Concepts Explicitly NOT Adopted

| Beads Feature | Rejected Because |
|---------------|-----------------|
| Dolt database | Heavy dependency (Go binary, SQL schema, daemon process, Dolt remotes). Our data is already in GitHub Issues — adding a second data store doubles failure surface |
| Background daemon | Adds systemd service, socket file, crash-recovery logic. Our event-processor runs once per minute on cron — simpler and sufficient |
| `bd sync` / Dolt push-pull | Git-native sync is elegant for agent-to-agent, but our agents coordinate through GitHub (the single source of truth) — no sync needed |
| `bd compact` (LLM-based memory decay) | Impractical at our scale (few dozen issues). Useful at thousands-of-issues scale |
| Cross-machine sync | Our agents all run on the same RPi — no cross-machine coordination |

### Verdict

Beads is the right tool when:
- You have **multiple agents running on different machines**
- You need **offline-first** task management
- Your tasks have **complex DAG dependencies** across issues
- You're willing to maintain a Dolt database + daemon

It's too heavy when:
- All agents run on one machine (ours)
- GitHub Issues already serves as the single source of truth
- The workflow is linear per-issue (no cross-issue DAG)
- You have zero tolerance for new infrastructure maintenance

## Claude Code Tasks

**Released:** January 2026 (alongside Opus 4.5)
**Credited inspiration:** Beads (confirmed by Anthropic engineer Antoine Brugeat)
**Scope:** Session-level task coordination built into Claude Code

### Core Design

| Tool | Purpose |
|------|---------|
| TaskCreate | Create task with subject, description, activeForm |
| TaskGet | Retrieve full task details including dependencies |
| TaskUpdate | Modify status, owner, dependencies |
| TaskList | List all tasks with summary info |

### Key Concepts Adopted

| Tasks Concept | Our Implementation | Why |
|---------------|-------------------|-----|
| `activeForm` (present-tense continuation context) | PRD `## Continuation Context` section + Progress Log `Current State` line | Same purpose — gives the next reader a "where am I" anchor |
| Dependency via `addBlockedBy` / `addBlocks` | Label chain + pre-spawn validation | Linear workflow doesn't need a generic DAG tool |
| `CLAUDE_CODE_TASK_LIST_ID` (env-var-based persistence) | `docs/PROGRESS/` files | Same goal (path-based persistence), file-based instead of env-var |
| Cross-session shared task list | event-processor polling local pending file | Same polling model, one-hop instead of shared memory |

### Key Concepts NOT Adopted

| Tasks Feature | Rejected Because |
|---------------|-----------------|
| Ctrl+T panel UI | Our agents don't have a terminal UI — they interact through tools |
| `launchSwarm` subagent coordination | Our delegation model uses Hermes `delegate_task` — different abstraction level |
| `~/.claude/tasks/` persistence | Claude Code-specific path. Our Progress Log lives in the project repo |

### The Three-Layer Memory Model (Community Best Practice)

```
Strategic   → GitHub Issues / Linear    → product roadmap, quarterly planning
Project     → Beads                     → persistent task graph, git-backed
Execution   → Claude Code Tasks         → session-level "what I'm doing now"
```

In our workflow:
```
Strategic   → GitHub Issues (already here)    ← unchanged
Project     → Docs (PRD + DESIGN + GDD)       ← lightweight substitute for Beads
Execution   → Progress Log (docs/PROGRESS/)   ← NEW: lightweight substitute for Tasks
```

## Takeaways for Future Workflow Evolution

1. **Don't add Beads.** The analysis confirms it introduces more failure surface than it solves for our single-machine, GitHub-centric workflow.
2. **The Progress Log pattern is the right level of weight.** One file per issue, committed with code, no daemon, no database.
3. **If we ever need cross-issue DAG:** The simplest approach is a `Depends on: #N` field in the issue template + event-processor parsing it, not Beads.
4. **activeForm is a convention, not a feature.** The key insight is that "present-tense what-am-I-doing" context costs nearly nothing to write but saves the next agent 5-15 tool calls. The value is in the convention, not the tool.
