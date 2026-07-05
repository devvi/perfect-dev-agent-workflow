# Perfect Dev Agent Workflow — Architecture

> **Orchestrator:** PiBot (OpenClaw) | **Board:** GitHub Issues | **Worker:** OpenCode Serve (:18765)

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     GitHub (Board)                                │
│                                                                   │
│  Issue #42 "Feature X"                                           │
│  Labels: workflow/available → research → plan → ... → done       │
│  Kanban view → K monitors in real-time                            │
│                                                                   │
│  PRs: research-PR → plan-PR → implement-PR                       │
└────────────────────────┬──────────────────────────────────────────┘
                         │ GitHub API (poll every 5 min)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                  PiBot (OpenClaw Cron)                            │
│                                                                   │
│  1. Poll GitHub for issues with workflow/available               │
│  2. Claim issue → add workflow/research label                    │
│  3. Spawn sub-agent for current stage                            │
│  4. Sub-agent completes → opens PR                               │
│  5. PiBot reviews PR against quality gate                        │
│  6. Pass → auto-merge → spawn next stage agent                   │
│  7. Fail → comment on PR → agent revises → re-review             │
│  8. All stages done → status/done                                │
│  9. Blocked/error → status/blocked → Feishu notify K             │
└────────────────────────┬──────────────────────────────────────────┘
                         │ sessions_spawn (isolated)
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Sub-Agents                                    │
│                                                                   │
│  research-agent    → 读 Issue → 填模板 → 写 PRD → 开 PR          │
│  plan-agent        → 读 PRD → 写 DESIGN → 生成测试用例 → 开 PR   │
│  implement-agent   → 读 DESIGN → TDD → 调 OpenCode → 开 PR      │
│  test-agent        → 跑测试 → 报告结果                            │
│  self-correct-agent → 分析失败 → 修复 → 重跑                      │
│  deploy-agent      → 触发 Vercel 部署                             │
└────────────────────────┬──────────────────────────────────────────┘
                         │ REST API
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                OpenCode Serve (:18765)                            │
│                Code generation + test execution                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## PiBot's Gatekeeping Rules

PiBot (I) review every PR before auto-merge. Here are the criteria for each stage:

### Research PR Gate

| Check | Criterion | Action if fail |
|-------|-----------|----------------|
| Problem definition | Current vs expected behavior stated | Comment + request revision |
| Root cause | Why does current behavior exist? | Comment + request revision |
| Impact analysis | Specific files/modules listed | Comment + request revision |
| Alternatives | ≥2 approaches compared | Comment + request revision |
| Boundary conditions | ≥3 edge cases | Comment + request revision |
| Dependencies | Listed with status | Comment + request revision |
| PR title format | "Research: <name> (parent #N)" | Auto-fix |
| No closing keywords | No Closes/Fixes/Resolves in body | Auto-fix |

**Auto-merge decision:** All checks pass → merge. 1-2 minor issues → merge with comment. ≥3 issues → request revision, do NOT merge.

### Plan PR Gate

| Check | Criterion | Action if fail |
|-------|-----------|----------------|
| Design doc exists | `docs/DESIGN/<N>-*.md` present | Request creation |
| Architecture clear | Module responsibilities stated | Request clarification |
| Phased tasks | ≥3 phases with concrete tasks | Request detail |
| Test cases generated | Actual test code in `tests/`, not placeholders | Request real tests |
| Edge cases covered | Tests include boundary conditions from research | Request additions |
| Plan issue created | Consolidated plan issue exists | Request creation |

**Auto-merge decision:** All core checks (design, tasks, tests) pass → merge. Tests missing → block until added.

### Implement PR Gate

| Check | Criterion | Action if fail |
|-------|-----------|----------------|
| All tests pass | CI green (verified via GitHub API) | Block — trigger self-correct |
| Scope compliance | Only planned features implemented | Comment on scope creep |
| Edge cases handled | Test coverage for boundary conditions | Request additions |
| Closes keywords | Body has "Closes #<parent>" AND "Closes #<plan>" | Auto-fix |
| No regressions | Existing tests still pass | Block |

**Auto-merge decision:** Tests all pass + scope OK → merge. Tests fail → self-correct loop. Scope creep → comment + request trim.

---

## Self-Correct Loop (PiBot Managed)

```
Test failure detected
    │
    ▼
PiBot spawns self-correct-agent (attempt N)
    │
    ├── Agent analyzes failure + applies fix
    ├── Agent re-runs tests
    │
    ├── All pass → PiBot merges PR → proceed to deploy
    └── Still fail → N++ 
         ├── N ≤ 3 → retry (upgrade model: flash → pro for attempt 3)
         └── N > 3 → PiBot marks status/blocked → Feishu notify K
```

---

## Merge Conflict Resolution (PiBot Managed)

When PiBot auto-merges a PR, conflicts can happen if multiple branches touch the same files.

### Conflict Detection
```bash
# Before merging, check if branch is behind main
gh pr view <N> --json mergeable,mergeStateStatus
# If mergeStateStatus is DIRTY or BLOCKED → conflict detected
```

### Conflict Resolution Flow
```
Merge conflict detected
    │
    ▼
PiBot spawns conflict-resolver-agent
    │
    ├── 1. git fetch origin main
    ├── 2. git rebase origin/main (or merge)
    ├── 3. Identify conflicts: git diff --name-only --diff-filter=U
    ├── 4. For each conflicted file:
    │     - Read both versions
    │     - Determine correct resolution based on:
    │       a. Design intent from docs/DESIGN/
    │       b. Which changes are more recent/authoritative
    │       c. Test expectations (preserve test changes)
    │     - Apply resolution
    ├── 5. git add resolved files + git rebase --continue
    ├── 6. Run tests to verify resolution didn't break anything
    ├── 7. Force-push resolved branch
    │
    ├── Resolution successful + tests pass → PiBot retries merge ✅
    │
    └── Cannot resolve automatically →
        PiBot comments on PR with:
        - Which files conflict
        - What changed on main vs branch
        - Why automatic resolution failed
        - Suggested manual resolution
        → Marks PR with label `status/blocked`
        → Notifies K via Feishu
```

### Conflict Agent Rules
- Always prefer main's changes for infrastructure files (.github/, configs)
- Always preserve test changes from the feature branch
- For business logic: prefer the version that aligns with design docs
- If uncertain: flag for human, do NOT guess on business logic
- After resolution: MUST run full test suite before pushing

---

## Sub-Agent Specifications

### research-agent

```
Role: Deep analysis, no code
Input: Issue #N title + body + project context
Output: docs/PRD/<N>-<slug>.md + docs/TASKS/<N>-<slug>.md
Actions: 
  - Fill RESEARCH_TEMPLATE.md (all 7 sections)
  - git log/blame on affected files
  - Read existing docs/DESIGN/ for architectural constraints
  - Open research PR via gh CLI
Rules: No Closes/Fixes/Resolves in PR body
```

### plan-agent

```
Role: Design + test case generation (TDD)
Input: docs/PRD/<N>-*.md + docs/TASKS/<N>-*.md
Output: docs/DESIGN/<N>-<slug>.md + tests/<feature>.test.js + Plan Issue
Actions:
  - Create architecture design doc
  - Generate test cases covering all boundary conditions from research
  - Create consolidated plan issue via gh CLI
  - Open plan PR via gh CLI
Rules: Tests must be real, runnable code (not comments)
```

### implement-agent

```
Role: TDD implementation
Input: docs/DESIGN/<N>-*.md + tests/<feature>.test.js + Plan Issue
Output: Feature code + passing tests + Implement PR
Actions:
  - Phase 1: Ensure tests are complete (they should fail)
  - Phase 2: Implement core logic (via OpenCode Serve REST API)
  - Phase 3: Integration
  - Phase 4: Polish + edge cases
  - Commit after each phase
  - Open implement PR with Closes #<parent> + Closes #<plan>
Rules: TDD mandatory. No scope creep. Pull before push.
```

---

## Deployment (Vercel)

On implement PR merge to main:
- Vercel auto-detects push → builds → deploys
- PiBot monitors deploy status
- On success: update issue → `status/done`, post summary
- On failure: mark `status/blocked`, notify K

`vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": null
}
```

---

## File Structure (in target project)

```
project/
├── .github/
│   └── workflows/
│       └── review.yml          # CI self-healing only (test → fix → push)
├── docs/
│   ├── PRD/                    # Research output
│   ├── DESIGN/                 # Architecture & decisions
│   ├── TASKS/                  # Task breakdowns
│   └── REFERENCE/              # Project conventions
├── templates/
│   └── RESEARCH_TEMPLATE.md    # 7-section research template
├── tests/                      # Test cases (plan → implement)
├── AGENTS.md                   # This file
└── vercel.json                 # Vercel config
```
