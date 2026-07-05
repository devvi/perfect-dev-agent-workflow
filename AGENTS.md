# Perfect Dev Agent Workflow — Agent Guide

> This file defines the standard workflow for AI coding agents. Every agent working on this repository MUST follow this workflow. No phase may be skipped.

---

## Workflow Architecture

```
Issue opened (GitHub)
    │
    ▼ [auto: opencode.yml]
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────┐     ┌──────────┐     ┌────────┐
│ Research │ ──→ │   Plan   │ ──→ │Implement │ ──→ │ Test │ ──→ │  Deploy  │
│          │     │          │     │  (TDD)   │     │      │     │          │
│ docs/    │     │docs/     │     │ Phase 1: │     │Run   │     │ Merge   │
│ PRD/     │     │DESIGN/   │     │  Tests   │     │tests │     │ + ship  │
│ docs/    │     │Plan      │     │ Phase 2: │     │      │     │          │
│ TASKS/   │     │Issue     │     │  Data    │     │  ↓   │     │          │
│          │     │          │     │ Phase 3: │     │ pass? │     │          │
│ Research │     │ Plan PR  │     │  Logic   │     │  │   │     │          │
│   PR     │     │          │     │ Phase 4: │     │  ├─yes→│     │          │
└──────────┘     └──────────┘     │  UI      │     │  │   │     │          │
     │                 │          └────┬─────┘     │  │   │     │          │
     │ PR merge        │ PR merge      │          │  │   │     │          │
     │ auto-chain      │ auto-chain    │          │  │   │     │          │
     └─────────────────┘              │          │  │   │     │          │
                                      │          │  └───┤     │          │
                                      │          │  no  │     │          │
                                      │          │  ↓   │     │          │
                                      │          │  ┌───┴─────┴──┐       │
                                      │          │  │Self-correct│       │
                                      │          │  │ (max 3x)   │       │
                                      │          │  │ analyze →  │       │
                                      │          │  │ fix →      │       │
                                      │          │  │ retest     │       │
                                      │          │  └────────────┘       │
                                      │          │                        │
```

**Phase gates:** Each phase produces a PR. When that PR is merged, the next phase triggers automatically via GitHub Actions. Manual restart is always supported via `gh workflow run`.

---

## Stage 0: Pre-Research Context Collection (MANDATORY)

Before beginning any research, the agent MUST gather context:

### Context Checklist
- [ ] Read any related `docs/DESIGN/*.md` for architectural constraints
- [ ] Read any related `docs/REFERENCE/*.md` for project conventions
- [ ] `git log --oneline -20 -- <potentially-affected-files>`
- [ ] `git blame` on key files to understand why code looks the way it does
- [ ] Check existing test files for behavioral contracts
- [ ] Check if the issue references any knowledge base or design notes

---

## Stage 1: /research

**Trigger:** Issue opened (auto) or `gh workflow run -f issue=<N>`

**Goal:** Deep understanding before any code is written.

### Output Requirements
- `docs/PRD/<issue-number>-<feature-name>.md` — structured per RESEARCH_TEMPLATE.md
- `docs/TASKS/<issue-number>-<feature-name>.md` — modules, impacts, dependencies

### Research Quality Gate (auto-validated)
The research must pass these checks before merge:

| Check | Requirement |
|-------|-------------|
| Problem definition | Current vs expected behavior, with concrete scenarios |
| Root cause / Design intent | Why does current behavior exist? Why change? |
| Impact analysis | Direct + indirect affected modules listed with file paths |
| Alternatives | At least 2 approaches compared (pros/cons/risk/effort) |
| Boundary conditions | ≥3 edge cases identified (normal, edge, failure) |
| Dependencies | What this depends on, what depends on this |

### PR Rules
- **NEVER** use `Closes`, `Fixes`, or `Resolves` in research PR title/body
- Title format: `Research: <feature-name> (parent #<N>)`
- Push changes to a branch, open PR via `gh pr create`
- After creating, verify: `gh pr view <N> --json title,body` — no closing keywords

---

## Stage 2: /plan

**Trigger:** Research PR merged (auto) or manual

**Goal:** Concrete implementation strategy with phased tasks.

### Output Requirements
- `docs/DESIGN/<issue-number>-<feature-name>.md` — architecture, data structures, module design
- `docs/TASKS/<issue-number>-<feature-name>.md` — updated with phased breakdown
- **Consolidated Plan Issue** — single issue with all phases as checklist
  ```
  gh issue create --title "[<parent>] Plan: <feature-name>" \
    --label "workflow/plan" \
    --body "Parent: #<parent>\n\n### Phase 1: Tests\n- [ ] ...\n\n### Phase 2: Implementation\n- [ ] ...\n\n..."
  ```

### Design Must Include
- [ ] Architecture diagram or description
- [ ] Module responsibilities and interfaces
- [ ] Data flow (what changes, when, who triggers)
- [ ] Key decision with rationale (why this approach over alternatives)
- [ ] Test strategy: what gets tested, what level (unit/integration/e2e)

### Test Case Generation (TDD)
During plan phase, the agent MUST generate initial test cases:
- Based on acceptance criteria from research
- Covering boundary conditions identified in research
- Written to `tests/<feature>.test.js` (or appropriate path)

---

## Stage 3: /implement

**Trigger:** Plan PR merged (auto) or manual

**Goal:** Execute phased implementation with strict TDD.

### Rules
- **No scope creep** — implement only what's in the plan
- **TDD mandatory** — write tests before/alongside implementation
- **Phase-gated commits** — commit after each completed phase
- **Check off tasks** — update plan issue body after each task

### Phase Order
1. **Tests** — write all test cases first (they WILL fail initially)
2. **Core logic** — implement the actual functionality
3. **Integration** — wire up with existing modules
4. **Polish** — edge cases, error handling, cleanup

### After Each Phase
```bash
git add -A && git commit -m "feat: <phase name> (#<parent-issue>)"
gh issue edit <plan-issue> --body '<updated checklist>'
```

### After All Phases
Open implementation PR:
```bash
gh pr create --title "<feature-name>" \
  --body "Closes #<parent-issue>\nCloses #<plan-issue>\n\n<summary>"
```
Verify: `gh pr view <N> --json body` must contain both `Closes` references.

---

## Stage 4: /test

**Trigger:** Implementation PR opened (auto via opencode-review.yml)

**Goal:** Verify all tests pass. If not, enter self-correct loop.

### Process
1. Agent runs `npm test` (or project's test command)
2. All tests pass → proceed to deploy
3. Any test fails → enter self-correct

### Test Quality Requirements
- [ ] All generated test cases pass
- [ ] No regression in existing tests
- [ ] Coverage at acceptable level
- [ ] Edge cases from research are covered

---

## Stage 5: Self-correct Loop

**Trigger:** Test failure

**Goal:** Automatic fix with escalating escalation.

### Rules
- **Max 3 attempts** per failure
- Each attempt: analyze failure → fix → verify all tests pass
- Track attempt count in plan issue comment

### Process
```
Attempt 1: analyze failure → apply fix → run tests
  ├── pass → proceed to deploy
  └── fail → Attempt 2: deeper analysis → fix → run tests
       ├── pass → proceed to deploy
       └── fail → Attempt 3: root cause analysis → fix → run tests
            ├── pass → proceed to deploy (with note)
            └── fail → mark issue `status/blocked` → notify human
```

### Escalation Format (when blocked)
```
## Self-correct exhausted (3 attempts)
- Issue: #<N>
- Test failures: <list>
- Attempts: <summarize each attempt + why it failed>
- Known unknowns: <what agent can't figure out>
- Suggested human action: <concrete recommendation>
```

---

## Stage 6: /deploy

**Trigger:** Tests all passing

**Goal:** Merge and deploy.

1. Final check: `git status`, uncommitted changes
2. Push all changes
3. Merge PR (auto via GitHub if CI green)
4. Deploy (project-specific, defined in `deploy.yml`)
5. Update issue labels to `status/done`
6. Post completion summary comment

---

## Workflow Labels

| Label | Stage | Meaning |
|-------|-------|---------|
| `workflow/research` | Stage 1 | Research in progress |
| `workflow/plan` | Stage 2 | Planning in progress |
| `workflow/implement` | Stage 3 | Implementation in progress |
| `workflow/test` | Stage 4 | Testing in progress |
| `workflow/self-correct` | Stage 5 | Auto-fixing failures |
| `workflow/deploy` | Stage 6 | Deploying |
| `status/done` | Complete | Workflow finished |
| `status/blocked` | Any | Needs human intervention |

---

## Git Conventions

### Commits
```
feat: <description> (#<issue>)
fix: <description> (#<issue>)
research: <description> (#<issue>)
plan: <description> (#<issue>)
docs: <description> (#<issue>)
```

### PR Flow
- Research PR: NO closing keywords
- Plan PR: NO closing keywords
- Implement PR: MUST include `Closes #<parent>` and `Closes #<plan>`

Always `git pull --rebase && git push` before creating a PR.

---

## Project-Specific Configuration

Agent runtimes, test commands, and deploy targets vary per project. Configure in `.github/workflows/`:

- `opencode.yml` — set `model`, API keys, agent backend
- `opencode-review.yml` — set test command, timeout
- `deploy.yml` — set deployment target

See `templates/` for reusable workflow fragments.
