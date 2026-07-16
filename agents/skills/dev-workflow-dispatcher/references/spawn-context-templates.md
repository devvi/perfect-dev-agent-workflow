# Agent Spawn Templates (Depth-Aware)

Each template includes `{depth_level}` which is one of: `light`, `standard`, `deep`.
The depth is determined from the issue's `depth/light`, `depth/standard`, or `depth/deep` label.
Default (no label) = `standard`.

| Depth | Use case | Research | Plan | Implement | Review |
|-------|----------|----------|------|-----------|--------|
| `light` | Typo fix, 1-line bug, trivial feature | 3-section PRD, no web search | No DESIGN doc, just TASKS with 1-2 steps | Direct fix, 1 test | Quick scan, auto-merge |
| `standard` | Normal bug/feature | Full 7-section PRD | Full layered DESIGN | Full TDD via OpenCode | Full checklist |
| `deep` | Complex system change | Full PRD + spike + web research | Full DESIGN + dependency analysis | Multi-session OpenCode | Exhaustive review + perf check |

## Research Agent

```python
delegate_task(
    goal="Research the feature described in the issue and produce a PRD.",
    context=f"""
## Issue
#{issue_number}: {issue_title}
{issue_body}

## Labels
Current: {current_label}
Depth: {depth_level}

## Repository
~/workspace/perfect-dev-agent-workflow/

## Templates
- PRD: templates/PRD_TEMPLATE.md
- Tasks: templates/TASKS_TEMPLATE.md

## Depth-Scoped Instructions

### If depth = light
- Write a **3-section mini PRD** only: (1) Problem, (2) Solution, (3) Implementation notes
- **Obsidian wiki search: skip by default, but search if:**
  - Issue body has `[x]` checkbox for Obsidian search, OR
  - Issue body mentions "Obsidian", "wiki", or "知识库"
- If searching, load `obsidian-knowledge-search` skill and follow its REFERENCE cache rules
- Skip web research — just read the issue and write directly
- Skip tasks file — just write the PRD
- PR title: "Research: <title> (parent #{issue_number}) — light"

### If depth = standard (default)
- Full 7-section PRD following PRD_TEMPLATE.md
- **Search K's Obsidian wiki FIRST**: `search_files(pattern="<keyword>", path="~/workspace/Obsidian/Knowledge Ocean/wiki/")`
  Extract key topics from the Issue title/body and search each one. Read matching files.
- Web research only for gaps the wiki doesn't cover
- Create both PRD + TASKS
- All 7 sections must be filled
- Normal boundary conditions (≥3 edge cases)

### If depth = deep
- Full 7-section PRD + additional spike section
- **Obsidian wiki search** + extensive web research (≥3 sources)
- Create PRD + TASKS + spike findings
- Exhaustive boundary conditions (≥5 edge cases)
- Cite relevant wiki entries with file paths

## Rules
- NO Closes/Fixes/Resolves in PR body
- PR title format: "Research: <title> (parent #{issue_number})"
- Output: docs/PRD/{issue_number}-<slug>.md
"""
)
```

## Plan Agent

```python
delegate_task(
    goal="Design the architecture and write test cases based on the PRD.",
    context=f"""
## Issue
#{issue_number}: {issue_title}

## Labels
Depth: {depth_level}

## Input Documents
- docs/PRD/{issue_number}-*.md (the merged research PRD)
- docs/TASKS/{issue_number}-*.md (task breakdown — may not exist for light depth)
- Original issue body

## Templates
- Design: templates/DESIGN_TEMPLATE.md (9-section layered format)
- Tasks: templates/TASKS_TEMPLATE.md

## Depth-Scoped Instructions

### If depth = light
- **Skip full DESIGN doc.** Instead, write a minimal `docs/TASKS/{issue_number}-<slug>.md` with just:
  1. Exact file path to change
  2. What to change (1-2 sentences)
  3. How to verify (1 test or manual check)
- No architecture diagram, no layer breakdown
- 1 test case (normal path only)

### If depth = standard (default)
- Full 9-section DESIGN template (only affected layers)
- ≥3 test cases (normal path + ≥2 edge cases)
- Architecture overview with data flow ASCII
- Decision log table for key choices

### If depth = deep
- Full 9-section DESIGN template (all layers that could possibly be affected)
- ≥5 test cases (normal + ≥3 edge cases + failure paths)
- Full architecture with component interaction diagram
- Decision log with alternatives analysis
- Dependency impact analysis

## Output
Create docs/DESIGN/{issue_number}-<slug>.md (only for standard/deep; skip for light)
Generate test code under tests/
Open a plan PR with branch plan/{issue_number}-<slug>

## Rules
- Tests must be REAL runnable code, not comments
- Do NOT implement the feature — only design + tests
- Tests will initially fail (implement phase makes them pass)
"""
)
```

## Implement Agent

```python
delegate_task(
    goal="Implement the feature by delegating to OpenCode Serve via REST API.",
    context=f"""
## Pre-Spawn Validation Results
- Issue #{issue_number}: OPEN, correct label
- Research PR: verified merged
- Plan PR: verified merged
- OpenCode health: reachable at http://127.0.0.1:18765 (verified)
- Design doc: docs/DESIGN/{issue_number}-*.md exists
- PRD: docs/PRD/{issue_number}-*.md exists
- Tasks: docs/TASKS/{issue_number}-*.md (may not exist — optional, DESIGN + PRD are sufficient)
- Prior uncommitted changes: stashed before branching
- Default branch: master (NOT main)

## Issue
#{issue_number}: {issue_title}

## Labels
Depth: {depth_level}

## Input Documents
- docs/PRD/{issue_number}-*.md (PRD with acceptance criteria)
- docs/DESIGN/{issue_number}-*.md (design doc — may not exist for light)
- docs/TASKS/{issue_number}-*.md (task breakdown — may not exist)
- tests/*.test.* (pre-written test cases — may be minimal for light)

## Depth-Scoped Instructions

### If depth = light
- Direct fix mode: send OpenCode a compact prompt with just:
  - The file to change
  - The exact change to make
  - "Run the relevant tests to verify"
- Skip DESIGN doc reading (it likely doesn't exist)
- 1 verification step (run specific test or manual check)
- PR body: minimal — "Closes #{issue_number}"

### If depth = standard (default)
- Full layer-by-layer implementation as per implement-agent skill
- OpenCode prompt includes all affected layers from DESIGN
- Full TDD: make tests pass

### If depth = deep
- Full TDD with multi-session OpenCode if needed
- OpenCode prompt includes full DESIGN + PRD context
- After implementation, run full test suite AND manual smoke test
- PR body: detailed changes per layer

## OpenCode Model
providerID: "opencode"
modelID: "deepseek-v4-flash-free"  (NOT mimo-v2.5-free — discontinued)

## OpenCode Endpoint
http://127.0.0.1:18765

## Safety
- For every change: update related tests AND docs
- Run tests before committing
- Self-correct: send errors back to same OpenCode session
"""
)
```

## Review Agent

```python
delegate_task(
    goal="Review the implementation code against DESIGN and quality standards.",
    context=f"""
## Issue
#{issue_number}: {issue_title}

## Labels
Depth: {depth_level}

## Input
- git diff origin/main...HEAD (changes on the implement branch)
- docs/DESIGN/{issue_number}-*.md (design to check against — may not exist for light)
- docs/PRD/{issue_number}-*.md (acceptance criteria)

## Depth-Scoped Instructions

### If depth = light
- Quick scan (30-second review):
  1. Does the fix match the issue description?
  2. Any obvious bugs or debug code left?
  3. At least 1 test added/updated?
- Auto-merge if no issues found (comment "✅ Light review passed")
- If issues found → one-shot fix request, do NOT cycle

### If depth = standard (default)
- Full checklist (Logic, Tests, Docs, Scope, Quality)
- Block on missing tests or outdated docs
- Structured fix request with file:line + expected fix

### If depth = deep
- Exhaustive review:
  1. Full standard checklist
  2. Performance impact check (any O(n²) loops?)
  3. Error handling audit (what happens on edge cases?)
  4. State consistency check
  5. Cross-layer dependency audit

## Golden Rule
Every code change MUST update related tests AND docs. Enforce this regardless of depth.

## Output
- Pass: signal dispatcher "review passed, auto-merge"
- Fail: structured fix request with file:line descriptions
  → Return to dispatcher, who forwards to OpenCode session
"""
)
```

## Scale Reference

| Phase | light | standard | deep |
|-------|-------|----------|------|
| Research | 3-section mini PRD | 7-section full PRD | Full PRD + spike + web research |
| Plan | TASKS only (1-2 steps) | 9-section layered DESIGN, ≥3 tests | Full DESIGN, ≥5 tests, dependency analysis |
| Implement | Direct fix, compact prompt | Full TDD via OpenCode | Multi-session, full suite + smoke test |
| Review | Quick scan, auto-merge | Full checklist, block on gaps | Exhaustive: perf, errors, state, cross-layer |

---

## Operator Agent (Cron Poller Spawn)

Spawned by the `workflow-pending-poller` cron job when `~/.hermes/workflow-pending.json` has pending events. This is the top-level orchestrator that runs the full workflow for each issue.

```python
delegate_task(
    goal="Process issue #N in the dev workflow on repo devvi/perfect-dev-agent-workflow.",
    context=f"""
## Context

A new issue is pending in the workflow pipeline.

**Issue #{issue_number}**: {issue_title}
- Body: {issue_body_excerpt}
- Depth: auto-detected from issue body
- Labels: {current_labels}
- Repo: devvi/perfect-dev-agent-workflow
- Default branch: master (NOT main)

## What to do

You are the OPERATOR AGENT. Follow the workflow rules from AGENTS.md.

### Step 1: Initialize
- Remove `workflow/available` label
- Add `workflow/research` label
- Comment on issue: "🔄 Research phase started (depth: {depth})"

### Step 2: Research phase ({depth} depth = auto-merge)
- Create branch from master: `research/{issue_number}-<slug>`
- Write docs/PRD/{issue_number}-<slug>.md
- Create PR with body "Parent: #{issue_number}"
- Auto-merge after PR creation (gh pr merge --auto --squash --delete-branch)
- After merge verified, advance issue label: workflow/plan

### Step 3: Plan phase ({depth} depth = auto-merge)
- Create branch from master: `plan/{issue_number}-<slug>`
- Write docs/DESIGN/{issue_number}-<slug>.md
- Write/update tests
- Create PR with body "Parent: #{issue_number}"
- Auto-merge
- After merge verified, advance issue label: workflow/implement

### Step 4: Implement phase ({depth} depth = auto-merge after CI)
- Create branch from master: `impl/{issue_number}-<slug>`
- Use OpenCode Serve at http://127.0.0.1:18765 for code changes
- DO NOT run npm test locally (RPi OOM risk — CI handles testing)
- Create PR with body "Closes #{issue_number}" and "Parent: #{issue_number}"
- Wait for CI to pass (gh run list --workflow opencode-review)
- Auto-merge after CI passes

### Important Rules
- Branch from master ONLY (never from another issue's branch)
- PR body MUST have "Parent: #{issue_number}" — workflow-chain.yml regex is (?:Closes|parent)\\s*#(\\d+)
- No Closes/Fixes/Resolves in research PR body
- Cannot add workflow labels to PRs (token lacks read:org) — advance issue labels manually after each merge
- **PR operations (edit, merge) also fail without read:org.** Use `gh api` instead:
  ```bash
  gh api repos/devvi/perfect-dev-agent-workflow/pulls/<N> -X PATCH -f body="Parent: #N"
  gh api repos/devvi/perfect-dev-agent-workflow/pulls/<N>/merge -X PUT -f merge_method=squash
  ```
  `gh issue edit` works fine for issue operations — use it for label management.
- Vercel deploy: skipped when PR lacks workflow/implement label (known limitation)
- After implement PR merges, check issue comments for "🚀 Vercel:" from deploy.yml
""",
    role="orchestrator"
)
```

## Cron Poller Instructions (Self-Guide)

When the cron poller agent (this session) finds events, it should:

1. **Read** `~/.hermes/workflow-pending.json`

2. **Pre-spawn validation** — For each event, validate against actual GitHub state before spawning an agent:
   - **For ALL events**: Fetch current GitHub state (`gh issue view <N> --json state,labels`). Payload labels are stale.
   - **For `issues.labeled`**: Verify the referenced label still exists on the issue. If not, mark stale.
   - **For `pull_request.*`**: Check if PR is already merged (`gh pr view <N> --json state,mergedAt`). If merged, mark stale.
   - **For implement phase checks**: Verify research and plan PRs are merged by grepping PR body for the issue number. Check OpenCode health at `http://127.0.0.1:18765`. Verify DESIGN and PRD docs exist under `docs/DESIGN/`, `docs/PRD/`. (TASKS docs are optional — don't block on them.)

3. **Spawn** phase agent via delegate_task with full issue context (use templates above). Include pre-spawn validation results in the context.

4. **Clear pending file**: `{"events": [], "processed_at": "<now-iso>"}`

5. **Report** via one-line emoji format: `📋 #N → phase (depth)`

If all events in a batch are stale, clear the file and output `[SILENT]` — do NOT spawn an agent for zero active work.

If no events and no deploy URLs, output nothing (or `[SILENT]` in cron mode).

### Vercel Deploy URL Check

After dispatching, check recently closed issues for a `🚀 Vercel:` comment from the deploy.yml GitHub Action:
```bash
gh issue view <N> --json comments --jq '.comments[] | select(.body | startswith("🚀 Vercel:")) | .body'
```

## Self-Correct Flow (CI Failure Handling)

Not a delegate_task — the operator calls OpenCode API directly to fix CI failures:

```python
# 1st failure: send error to existing OpenCode session
curl -X POST "http://127.0.0.1:18765/session/$SESSION_ID/message" \
  -d '{
    "model": {"providerID": "opencode", "modelID": "deepseek-v4-flash-free"},
    "parts": [{"type": "text", "text": "CI failed: <error>. Fix in current branch and push."}]
  }'

# 2nd failure: upgrade model
  "model": {"providerID": "opencode", "modelID": "deepseek-v4-flash"}

# 3rd failure: mark status/blocked
gh issue edit $ISSUE --add-label "status/blocked" --remove-label "workflow/self-correct"
gh issue comment $ISSUE --body "⚠️ 3 consecutive self-correct failures. Needs human intervention."
```

The operator agent handles self-correct, not the cron poller. The SKILL.md main body has the self-correct loop flow described under "Event: check_run.completed".
