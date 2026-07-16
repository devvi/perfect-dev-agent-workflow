---
name: game-implement-agent
description: "Implementation agent that delegates coding to OpenCode Serve via REST API. Generates test code from DESIGN doc test descriptions. Single session per issue, self-correcting."
---

# Game Implement Agent

> **Role:** TDD implementation via OpenCode Serve API.
> **Prefer OpenCode; fall back to direct edits when models error out.**

## Trigger

Spawned by dispatcher after plan PR is merged. Issue has label `workflow/implement`.

## Depth Awareness

The issue's `depth/` label controls implementation scope. Check `{depth_level}` from the spawned context.

- **`depth/light`** → Direct fix mode. Send OpenCode a compact prompt with:
  - The file + exact change
  - "Run relevant tests to verify"
  - No DESIGN doc reading needed
  - 1 verification step
- **`depth/standard`** (default) → Full TDD via OpenCode, all layers
- **`depth/deep`** → Multi-session if needed. Full suite + smoke test. Detailed PR body. **Direct edits only** — OpenCode consistently errors on complex multi-step prompts. Plan for 8+ files, 500+ lines, 35+ turns minimum. Pre-estimate layers and expect a second session for the remaining ~15 turns (tests, docs, PR cycle).

## Prerequisites

- OpenCode Serve running at `http://127.0.0.1:18765`
- Model: `deepseek-v4-flash-free` is the only reliably tested model
- Working directory: `/home/pi/workspace/.pda/perfect-dev-agent-workflow/` (use absolute path)

## Model Reliability (RPi arm64, OpenCode 1.17.13)

Not all models work. Verified on this system:

| Model | Simple query | Complex multi-step prompt |
|-------|-------------|--------------------------|
| `deepseek-v4-flash-free` | ✅ Works | ❌ "Unexpected server error" |
| `big-pickle` | ❌ "Unexpected server error" | ❌ |
| `north-mini-code-free` | ❌ "Unexpected server error" | ❌ |
| `nemotron-3-ultra-free` | ❌ (likely; not tested) | ❌ |

**Rule:** Try `deepseek-v4-flash-free` once. If it fails → fallback to direct implementation. Do NOT cycle through models — all alternatives error identically.

### OpenCode Skip Heuristic

OpenCode is worth the round-trip when the implementation is non-trivial (3+ production logic changes across 2+ files). Skip it in two directions:

**Too complex (errors on multi-step):** DESIGN doc "Files Changed" lists **5+ files** or estimated new code exceeds **500 lines** — skip OpenCode entirely.

**Too trivial (wasteful overhead):** Estimated production code changes are **< 5 lines** or affect only **1 file** — skip OpenCode and go straight to Direct Fallback. Routing a 2-line bug fix through OpenCode's REST API + model inference adds latency and a failure point for zero benefit.

```bash
# Count files changed in DESIGN section on Files Changed
grep -c "^- \`public/" docs/DESIGN/${ISSUE_N}-*.md 2>/dev/null
# Count estimated new lines of production code (not test)
grep -oP '\+[0-9]+' docs/DESIGN/${ISSUE_N}-*.md | tail -1
```

Skip OpenCode when:
- `depth/deep` label
- File count ≥ 5
- Estimated production lines > 500
- **Estimated production lines < 5** (trivial fix — go direct)
- **File count === 1 and change is a rename/substitution, not new logic**

When in doubt, check the TASKS file for the estimated effort — if it says "16-20 hours" or spans 10+ subtasks, that's a depth/deep signal.

## Execution Memory (Progress Log)

> **This skill uses `docs/PROGRESS/<issue-num>-<slug>.md` as lightweight execution memory.** Inspired by Beads' `bd prime` and Claude Code Tasks' `activeForm` — plain files, zero infrastructure.

The Progress Log tracks **where your implementation currently stands**, not what the final design looks like (that's the DESIGN doc's job). It answers the question "what was I doing when I last stopped?" — the same gap Beads' `bd prime` fills.

### Format

```markdown
# Issue #N: <title>

## Current State
<one-line activeForm — present tense, very specific>

## Checkpoints
- [x] <completed unit of work>
- [ ] <next unit of work>
- [ ] <future unit of work>

## Last Active
<what you were doing when you checkpointed>

## Notes
<any gotchas, partial findings, or context a future session needs>
```

### Lifecycle

1. **Create** — immediately after reading input docs, write an initial `docs/PROGRESS/<N>-<slug>.md` with checkpoints extracted from the DESIGN layer breakdown
2. **Update** — after each logical unit (layer, bug fix, test batch), update the Progress Log: move checkpoints, update activeForm, commit with the layer's code commit
3. **Read on resume** — if a Progress Log exists when you start, read it BEFORE the DESIGN doc. It tells you where you left off faster than re-reading the full DESIGN
4. **Archive on merge** — review agent cleans up; GDD extracts relevant state

### activeForm Convention

The `Current State` line should read like a present-tense answer to "what are you doing?":

| Status | Example activeForm |
|--------|-------------------|
| Starting | "Reading DESIGN doc and planning layer breakdown" |
| Mid-engine layer | "Implementing engine-layer bossAI state machine with patrol mode" |
| Testing | "Running regression tests — 3 pre-existing failures confirmed, verifying no new regressions" |
| Blocked | "Stuck on OpenCode error for entity layer — falling back to direct edit" |
| Finalizing | "All layers committed, creating PR" |

This is the implementation of Claude Tasks' `activeForm` concept — a continuation anchor for the next session.

## Input

- `docs/DESIGN/${ISSUE_N}-*.md` — layered design doc (Section 7: Test Layer has test case descriptions; implement generates `tests/*.test.*` from these)
- `docs/PRD/${ISSUE_N}-*.md` — PRD (acceptance criteria, boundary conditions from section 5, plus optional **Continuation Context** section containing research agent's activeForm-style summary)
- `docs/TASKS/${ISSUE_N}-*.md` — task breakdown
- `docs/PROGRESS/${ISSUE_N}-*.md` — **execution checkpoint** (if resuming; read this FIRST before DESIGN doc)
- Original issue

### Context from Cron Poller (when spawned proactively)

When the cron poller detects a stalled phase start and spawns this agent, the `delegate_task` context will include a `## Pre-Validation Results` section with:

- **Issue state**: OPEN, correct label verified against GitHub
- **Prior PRs**: Research and Plan PR numbers + merge status
- **OpenCode health**: Verified reachable at spawn time
- **Design doc sizes**: Lines in PRD/DESIGN/TASKS files
- **Test count**: Total tests pass/fail/todo from a live `npm run test` run
- **Pre-Existing Test Failures**: Exact names and count of failures on master (before your changes)

**Use this data to skip redundant validation.** Do NOT re-run `npm run test` just to check the baseline — the cron poller already ran it. Use the pre-existing failure list to:
1. Know which tests are expected to fail before your changes (from previous issues' plan agents or unimplemented features)
2. Know which Issue #46/#70 tests will need assertion updates (snake length changes after wall collision)
3. NOT panic about baseline failures that aren't your responsibility

However, you MUST still read the design docs and original issue — the cron context is a summary, not a replacement.

## Important: OpenCode Working Directory

OpenCode sessions default to `/home/pi/workspace/` regardless of the `directory` parameter. The `directory` field sets a display hint only.

**Workaround:** Tell OpenCode to `cd` explicitly in every prompt, or use absolute paths. Example:
```
cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/ && <command>
```

## Workflow

### Step 0: Pre-Flight Check — Existing Work Detection

Before writing any code or creating any session, check if an implementation branch or PR already exists for this issue:

```bash
# Check for existing impl branch (local or remote)
git branch -a | grep "impl/${ISSUE_N}-"
# Check for existing PR
gh pr list --state all --json number,headRefName,state --search "impl/${ISSUE_N} in:headRefName"
```

**If a branch AND PR already exist:**

1. Verify the existing fix correctness: read the diff, compare against PRD/DESIGN docs.
2. Run the full test suite to confirm no regressions.
3. Check CI status with `gh pr checks <PR-N>`.
4. Run the stage gate: `python3 ~/.hermes/scripts/stage-gate.py --pr <PR-N>`.
5. Report findings. Do NOT re-implement or create a duplicate PR.

**If a branch exists but no PR (branch pushed, no PR created yet):**

1. Verify the existing fix.
2. Run tests, push any fixes needed.
3. Create PR from the existing branch (don't create a new branch).
4. Run stage gate.

**If no branch exists:** proceed to Step 1 (normal implementation flow).

**Why this check exists:** Multiple cron invocations can spawn overlapping implement agents for the same issue. A previous agent run, a developer, or the plan phase may have already committed the fix. Creating a duplicate branch/PR wastes CI resources and confuses the workflow chain.

### Step 1: Read Input Documents

**First, check if the `delegate_task` context already contains summaries** (from cron poller pre-validation). If the context has `## Design Summary` or `## Pre-Validation Results`, read the full files anyway for precision, but you can skip the redundant extraction step — the cron summaries are accurate.

```bash
cat docs/PRD/${ISSUE_N}-*.md
cat docs/DESIGN/${ISSUE_N}-*.md
cat docs/TASKS/${ISSUE_N}-*.md
gh issue view $ISSUE_N --json title,body
```

Extract key context for the OpenCode prompt:
- **Engine Layer changes** from DESIGN section 2
- **Entity Layer changes** from DESIGN section 3
- **Data Layer changes** from DESIGN section 4
- **Render Layer changes** from DESIGN section 5
- **Acceptance criteria** from PRD section 5
- **Boundary conditions** from PRD section 5
- **Test case descriptions** from DESIGN section 7 (Test Layer) — these are prose descriptions, implement will generate runnable test code from them

> ⚠️ **Test Generation Note:** Plan agent no longer writes runnable test files. Test case descriptions (prose + tables) live in DESIGN doc Section 7 (Test Layer). You must read these descriptions and write the actual `tests/*.test.js` files during implementation. Include the test descriptions in your OpenCode prompt so it generates matching test code.

### Step 2: Setup Branch

```bash
# Stash any uncommitted changes first to avoid "local changes would be overwritten"
git stash
git checkout master && git pull origin master
git checkout -b impl/${ISSUE_N}-<slug>
git stash pop 2>/dev/null
```

### Step 3: Create OpenCode Session

```bash
# Use absolute path — the directory parameter is a hint only
SESSION=$(curl -s -X POST http://127.0.0.1:18765/session \
  -H "Content-Type: application/json" \
  -d '{"title":"impl-#N-<slug>","directory":"/home/pi/workspace/.pda/perfect-dev-agent-workflow/"}')
SESSION_ID=$(echo $SESSION | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

### Step 4: Send Implementation Prompt

Include the full design context in the prompt so OpenCode has all layers visible without switching context:

```bash
RESP=$(curl -s --max-time 300 -X POST "http://127.0.0.1:18765/session/$SESSION_ID/message" \
  -H "Content-Type: application/json" \
  -d '{
    "model": {"providerID": "opencode", "modelID": "deepseek-v4-flash-free"},
    "parts": [{"type": "text", "text": "...structured prompt..."}]
  }')
```

**Structured prompt to OpenCode:**

```
## Task
Implement the feature described below. The project is at /home/pi/workspace/.pda/perfect-dev-agent-workflow/
cd there first: `cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/`

## Layer-by-Layer Design Context

### Engine Layer Changes
<extract from DESIGN section 2 — game loop, AI, collision, combat>
```
<function signatures, new state fields, data flow>
```

### Entity Layer Changes
<extract from DESIGN section 3 — new entity types, factories>
```
<entity data structures, creation functions>
```

### Data Layer Changes
<extract from DESIGN section 4 — constants, palette, save>
```
<new constants, palette entries, config objects>
```

### Render Layer Changes
<extract from DESIGN section 5 — visual elements, HUD>

### Acceptance Criteria
<extract from PRD — what must be true for the feature to be complete>

### Boundary Conditions
<extract from PRD section 5 — edge cases to handle>

### Test Case Descriptions (from DESIGN doc Section 7)
<extract the test case description table from DESIGN doc Section 7 — convert each prose row into a concrete test spec>
**You must generate actual test code** (`tests/<feature>.test.js`) implementing these descriptions. Each table row becomes one or more test assertions.

## Available Files
- DESIGN doc: docs/DESIGN/${ISSUE_N}-*.md
- PRD: docs/PRD/${ISSUE_N}-*.md
- DESIGN doc Section 7 (Test Layer): test case descriptions defining what to test
- Templates: templates/DESIGN_TEMPLATE.md (reference for expected structure)

## Rules (Golden Rule: every code change must update tests + docs)
1. First: `cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/`
2. **Read the Research PRD (`docs/PRD/${ISSUE_N}-*.md`) first.** The PRD contains the solution decisions (naming, approach, architecture). Your implementation MUST match these decisions — do NOT make up your own solution when the PRD specifies one.
3. Read DESIGN.md to understand the full picture — test case descriptions in Section 7 define what tests to write
4. **Generate test code from the DESIGN doc's Test Layer descriptions** — after implementing production code, read Section 7 and write corresponding test files under `tests/`. Each test case description becomes one or more test assertions.
5. Implement all layers (Engine → Entity → Data → Render) in order
6. **For every change: update related tests.** New feature → new test. Changed behavior → update test. Do NOT break existing tests.
7. **For every change: keep docs current.** If the DESIGN doc describes something that changed during implementation, update the DESIGN doc to match reality.
8. **Known pre-existing failures:** Some tests may fail BEFORE your changes. These are NOT your regression. The DESIGN doc lists which test assertions need updating (e.g., Issue #46 wall collision test: `toBe(state.snake.length)` → `toBe(state.snake.length - 1)`). Fix these as part of your implementation, but do NOT panic about baseline failures that aren't related to your changes.
9. **Test locally when the system requests it** — run `vitest run` (NOT `vitest --watch` or just `vitest`) with a 120s timeout. Report results honestly. CI handles full regression.
## Self-Correction
- If tests fail: analyze the error, `cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/`, `pkill -f vitest 2>/dev/null`, fix, re-run
- If stuck after 3 attempts: report the specific error
- If working directory is wrong: `pwd` then `cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/`
```

## Direct Fallback (when OpenCode models error)

If `POST /session/:id/message` returns `"Unexpected server error"` on `deepseek-v4-flash-free`, fall back to direct implementation. Do NOT retry different models.

```bash
# 1. Setup branch
git checkout master && git pull origin master
git checkout -b impl/${ISSUE_N}-<slug>

# 2. Edit files directly (use patch tool, not sed)
# patch --mode replace --path <file> --old_string '<old>' --new_string '<new>'

# 3. Run tests to verify
npx vitest run 2>&1 | tail -15
# If tests fail, fix and repeat

# 4. Stage specific files only (NOT git add -A)
git add <specific files>
git commit -m "feat(#${ISSUE_N}): <description>"
git push origin impl/${ISSUE_N}-<slug>

# 5. Create PR
PR_URL=$(gh pr create --base master --head impl/${ISSUE_N}-<slug> \
  --title "Implement: <title> (parent #${ISSUE_N})" \
  --body "Parent #${ISSUE_N}
Closes #${ISSUE_N}

<details>" \
  --label "workflow/implement")

# Extract PR number (gh returns URL like .../pull/211, not #211)
PR_NUM=$(echo "$PR_URL" | grep -oP '\\d+$')

# ⚠️ STAGE GATE: Run code-based validator (auto-fixes labels, checks branch name)
python3 ~/.hermes/scripts/stage-gate.py --pr "$PR_NUM"
if [ $? -ne 0 ]; then
  echo "🚫 Stage gate blocked — fix before proceeding"
  exit 1
fi

# 6. Stage gate passed — PR created. CI will determine next step.
echo "⏳ Verifying stage gate (PR #$PR_NUM)..."
python3 ~/.hermes/scripts/stage-gate.py --issue "$ISSUE_N" --stage implement --pr "$PR_NUM"
if [ $? -eq 0 ]; then
  echo "✅ Stage gate passed — PR #$PR_NUM created"
  echo "   CI runs → cron determines next step (review or self-correct)"
else
  echo "⚠️ Stage gate didn't pass — check PR manually"
fi

# 7. Done — do NOT merge. Your job ends here.
echo "✅ Implementation complete. PR #$PR_NUM is in CI."
echo "   Push fix commits to the same branch if needed."
```

### Step 5: Monitor Output

Parse the response for:
- Tool calls made (bash, file edits)
- Test results
- Completion signal ("✅ Tests pass")

If response indicates incomplete work, send follow-up with explicit context:
```bash
curl -s -X POST "http://127.0.0.1:18765/session/$SESSION_ID/message" \
  -H "Content-Type: application/json" \
  -d '{
    "model": {"providerID": "opencode", "modelID": "deepseek-v4-flash-free"},
    "parts": [{"type": "text", "text": "Still failing on <test X>. The error: <error>. First: cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/. The DESIGN says: <relevant DESIGN section>. Please fix."}]
  }'
```

### Step 6: Verify Locally

```bash
cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/
# Run focused tests first, full suite if system requested verification
npx vitest run tests/invisible-wall.test.js 2>&1 | tail -10
git diff --stat

# Check no debug code left behind
grep -n "console.log\\|debugger\\|FIXME\\|TODO" public/src/engine/*.js 2>/dev/null | grep -v "//.*TODO" || true
```

### Step 7: Commit and Push

```bash
cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/
git add -A
git commit -m "Implement: <title> (closes #${ISSUE_N})"
git push origin impl/${ISSUE_N}-<slug>
```

### Step 8: Create PR (stage-gate verified)

**Before creating the PR, verify any 'pre-existing failure' claims by running the net-change check.** Do NOT state failures as "pre-existing" in the PR body without verifying:
```bash
CURRENT_BRANCH=$(git branch --show-current)
npx vitest run 2>&1 | grep "Tests" | tee /tmp/branch-failures.txt
git checkout master
npx vitest run 2>&1 | grep "Tests" | tee /tmp/master-failures.txt
git checkout "$CURRENT_BRANCH"
echo "Master: $(cat /tmp/master-failures.txt)"
echo "Branch: $(cat /tmp/branch-failures.txt)"
```
- Failure on both master AND branch → truly pre-existing (mention in PR body)
- Failure on branch ONLY → regression (fix or note honestly)
- **2026-07-14 trace:** PR #170 claimed "6 pre-existing failures" but only 1 (Bug #154 TC5) reproduced on master. The other 4 were regressions from the PR's tail-pop implementation. Always verify before stating claims.

```bash
cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/
PR_URL=$(gh pr create \
  --title "Implement: <title> (closes #${ISSUE_N})" \
  --body "## Implementation for #${ISSUE_N}

Closes #${ISSUE_N}
Parent #${ISSUE_N}
Closes #<plan-issue>

## Changes by Layer
- Engine: <summary>
- Entity: <summary>
- Data: <summary>
- Render: <summary>
- Test: <summary>

## Testing
- All existing tests pass: <N> passed
- <additional testing notes>" \
  --base master \
  --label "workflow/implement")

# Extract PR number
ZERO_LEFTCONFIRMED

# ⚠️ STAGE GATE: Run code-based validator (auto-fixes labels, checks branch name, body refs)
python3 ~/.hermes/scripts/stage-gate.py --pr "$PR_NUM"
if [ $? -ne 0 ]; then
  echo "🚫 Stage gate BLOCKED — fix the issue before proceeding"
  exit 1
fi
```

### Step 9: Cleanup

```bash
curl -s -X DELETE "http://127.0.0.1:18765/session/$SESSION_ID"
```

## Self-Correct Flow (for subsequent CI failures)

When CI fails on the implement PR:

### Step 0: Distinguish Pre-Existing vs Regression

**Before retrying anything, determine whether the failures are pre-existing or regressions.**

#### Quick Net-Change Check

Compare the full failure count on master vs your branch for a fast confidence signal:

```bash
# Save current branch, run full suite
CURRENT_BRANCH=$(git branch --show-current)
npx vitest run 2>&1 | grep "Tests" | tee /tmp/branch-failures.txt

# Run full suite on master
git checkout master
npx vitest run 2>&1 | grep "Tests" | tee /tmp/master-failures.txt

# Return to PR branch
git checkout "$CURRENT_BRANCH"

# Compare
echo "Master:   $(cat /tmp/master-failures.txt)"
echo "Branch:   $(cat /tmp/branch-failures.txt)"
```

**Interpretation:**
- **Fewer failures on branch than master** — your fix is working. The gap is the Bug #N tests that failed on master (code didn't exist) but now pass. The remaining failures on both sides are pre-existing.
- **Same count, different names** — your fix resolved some tests but revealed pre-existing ones. Diff the name lists.
- **More failures on branch** — regression. Enter normal self-correct loop.
- **Same count, same names** — all pre-existing, no regression. Do NOT merge or bypass — the failures are tracked separately.

**When count decreased:** verify the newly-passing tests are YOUR Bug #N tests:

```bash
npm test 2>&1 | grep -E "✓.*Bug #163" | head -10
# All should show ✓ — your fix works on the target tests
```

#### Detailed Failure Comparison

If the net-change check needs deeper investigation:
→ Check the **annotations** from the CI run to see exactly which tests fail and at which lines:

```bash
# Get check run ID from the PR's latest CI run
gh pr checks <PR-N> --json name,description
# Get detailed annotations (path, line, assertion error)
gh api repos/devvi/perfect-dev-agent-workflow/check-runs/<ID>/annotations \
  --jq '.[] | {path, line, message}'
```

Then determine whether the failures are **related** or **unrelated** to your PR:

| Criteria | Related Pre-Existing | Unrelated Pre-Existing |
|----------|---------------------|-----------------------|
| Failing test file | Same file(s) your PR touched | Completely different test file/area |
| Failing feature area | Same feature as your PR (e.g., both are boss stability) | Different feature (e.g., your PR is boss stability, failure is wall damage food drop) |
| Fix in scope | Your PR could fix it with < 10 lines | Fix requires changes to code you didn't touch and shouldn't touch |
| Tracked separately | NOT in a different issue | Already tracked in its own GitHub issue |
| Triage command | `git show HEAD -- <failing-test-file> \| head -50` — if diff touches the test, it's related | `git show HEAD -- <failing-test-file> \| wc -l` — if 0 lines, your PR didn't touch it |

**→ RELATED pre-existing failures** — Fix them in the same PR (see Step 1 below). These are real bugs. Every pre-existing failure has a root cause — trace it and fix at the source level. Fixing them in the same PR prevents the same failures from blocking future PRs. Do NOT submit to the OpenCode self-correct cycle — retrying the same code produces the same test output.

**→ UNRELATED pre-existing failures** — The failure is in a different feature area, different test file, and your PR's diff doesn't touch it. **Do NOT fix it in this PR.** Fixing an unrelated bug pollutes the PR scope, risks introducing new regressions. Instead:
1. **Report the finding on the PR** — document that CI failure is pre-existing from Issue #X, the PR's diff doesn't touch the failing test, and all N of the PR's own tests pass. Include an evidence table.
2. **Update labels on the PR:**
   - Add `workflow/self-correct` — documents that self-correct cycle completed
   - Remove `workflow/implement` — prevents re-dispatch loops

   **⚠️ Token scope workaround:** `gh pr edit --add-label/--remove-label` requires the `read:org` scope on your GitHub token. Many tokens only have `repo, project, workflow` scopes. Use the REST API directly as a reliable fallback:
   ```bash
   # Add label
   gh api repos/<owner>/<repo>/issues/<PR-N>/labels \
     -X POST --input - <<<'{"labels":["workflow/self-correct"]}'

   # Remove label
   gh api repos/<owner>/<repo>/issues/<PR-N>/labels/workflow/implement \
     -X DELETE

   # Verify
   gh api repos/<owner>/<repo>/issues/<PR-N>/labels --jq '.[].name'
   ```
3. **Do NOT merge.** The cron/operator determines the next step based on CI results.
4. **Do NOT push any code change** — the PR's code is correct and needs no modification for the CI failure.

> **Reference:** `references/pre-existing-ci-triage.md` has a worked example with the exact commands used in a real self-correct session (PR #161 / Issue #158).

**Some failures are new (different count, different names, different errors):**
→ The new failures are YOUR regressions. Enter the normal self-correct loop.

### Step 1: Fix (Related) Pre-Existing Failures / Report (Unrelated) Pre-Existing Failures

**Is this pre-existing failure fixable by your PR?** Run the triage from Step 0 first.

- **RELATED** — the failing test is in the same feature area, same test file touched by your diff. Fix it:
  1. **Identify root cause** — read the failing test and trace the data flow. Common patterns: void-return functions (use `world` not return value), tile-size mismatches (boss rooms 80×80 vs ROOM_SIZE=20), missing door passages in boss room tile generation.
  2. **Fix both the code bug and the test** — the failing test correctly asserts expected behavior; update the production code to make it pass, not the other way around. Only adjust test assertions when they test the wrong API (e.g. assuming a return value from a void function).
  3. **Push the fix** — the same branch, same PR. Include both the original fix AND the pre-existing bug fix.
  4. **Update the PR body** to note: "Also fixes N pre-existing test failures (root cause: <summary>)."
  5. **Wait for CI re-run.** If CI now passes → ready. If CI still fails → repeat diagnosis.

- **UNRELATED** — the failing test is in a completely different feature area, different test file, and your PR's diff doesn't touch it. **Do NOT fix it.**
  1. **Report the finding** — document that CI failure is pre-existing from Issue #X, the PR's diff doesn't touch the failing test, and the PR's own tests (N of M) pass.
  2. **Update labels** — add `workflow/self-correct`, remove `workflow/implement` (use REST API fallback if `gh pr edit` fails due to `read:org` scope).
  3. **No code push needed** — the PR's code is correct. Push nothing.
  4. **Do NOT merge.** Wait for cron to process CI results (self-correct or escalate).

### Step 2: Normal Self-Correct (Regressions Only)

Once you've confirmed the failures are YOUR regressions (not pre-existing):

1. Tell OpenCode (same session if available, else new one):
   "CI failed on <error>. Fix it in the current branch. cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/ first."
2. OpenCode fixes → push
3. Wait for CI → check status
4. 1st failure: retry with same model
5. 2nd failure: upgrade model (if available: north-mini-code-free or deepseek-v4-flash)
6. 3rd failure: mark `status/blocked`, notify human

### Step 3: When to Block (Strategic Escalation)

Block the PR with `status/blocked` when:
- Pre-existing failures require changes to a different agent's code (research or plan phase)
- The root cause is a design decision that needs user input (e.g. "should boss rooms have standard door passages in addition to BOSS_DOOR?")
- 3 retry cycles have failed (regressions only — pre-existing fixes don't count toward the retry limit)

When blocking, create a brief issue comment summarizing what's blocking and why.

## Error Handling

| Error | Action |
|-------|--------|
| OpenCode session creation fails | Retry after 5s, max 3 tries |
| OpenCode "Unexpected server error" | Try `deepseek-v4-flash-free` once. Fail → **verify file state first** (`git diff --name-only` or `git diff --stat`), then fallback to direct implementation (see Direct Fallback section) |
| OpenCode message timeout (>300s) | Check session messages, determine if still running |
| Tests failing (local) | Fix directly (since OpenCode unreliable for multi-step). If OpenCode available, send error with DESIGN context |
| Tests failing (CI) | Fix directly on the same branch: patch, test, push |
| 3 consecutive failures | Mark `status/blocked`, do NOT retry |
| OpenCode reports "file not found" | It likely ran from wrong working dir. Re-send with explicit `cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/` prepended |

## Safety

- **Branch from `master` only** — never branch from another issue's branch
- Only modify files in scope (check DESIGN section 8: Files Changed)
- **DO update tests for every change** — new function = new test, changed behavior = update test (this is the Golden Rule, enforced by review agent)
- **Read PRD section 2 (Solution) FIRST** — the solution decision (name, approach, architecture) was made in Research. Your implementation MUST match it. If you need to change the decision, create a comment on the issue and block the PR.
- **PR body MUST include `Parent #N` (NO colon)** — required for `workflow-chain.yml` regex `(?:Closes|parent)\\s*#(\\d+)`. Use `Parent #122` not `Parent: #122`. The colon breaks the regex match and labels won't advance.
- **Do NOT independently run tests during implementation** — let GitHub CI handle full regression. However, when the system prompt explicitly requests `npm run test` (post-edit verification), comply: run the full suite once, report results honestly, and note pre-existing failures vs new ones. Do not blindly re-run unrequested.
- Verify no `console.log`/`debugger` left in committed files
- One OpenCode session per issue (clean state)

## ⚠️ Design Principle: Fix the Source, Not the Symptom

When a prompt causes bad agent behavior, **remove the instruction entirely** — never add shell wrappers, branch protection, or contradictory "Do NOT" instructions. The right fix: don't tell the agent about X at all. This skill contains zero merge references.

```bash
git checkout master && git pull origin master
git checkout -b impl/${ISSUE_N}-<slug>
git stash pop 2>/dev/null || true
```

Then verify:
```bash
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "master" ]; then
  echo "FATAL: Still on master branch - aborting. Create a feature branch first."
  exit 1
fi
echo "Working on branch: $CURRENT_BRANCH"
```

**Never commit directly to master.** Every commit must be on an `impl/` branch. If `git branch --show-current` returns `master` at any point, stop and create a branch.

This rule exists because: the implement agent committed 5 layers of code to master directly, bypassing CI entirely. The code went to production without any automated testing.

## Layered Implementation Pattern (CRITICAL)

**For complex features (3+ files changed from DESIGN): break into layers, implement one layer per OpenCode call + commit.**

Standard layers (in order):
1. Engine layer - `generator.js`, `core.js`, `constants.js`
2. Entity layer - `entities.js`, `bossAI.js`, `combat.js`
3. Data/Collision layer - `collision.js`, data flow
4. Render layer - `overlays.js`, UI changes
5. Test layer - update or add test files

Flow per layer:
```
OpenCode API (layer N) → verify git diff → git add + commit → next layer
```

Each OpenCode call handles 2-3 related files. This means:
- 5 layers × (1 OpenCode + 1 git commit) = ~10 turns total
- Far under the 50-turn limit
- If a layer fails, only that layer is lost
- PR includes clean per-layer commits for reviewer

**Only use `patch` directly for trivial single-line changes** (typo fix, one-line constant change).

**Why not one big OpenCode call?** A single 9-file change can still exceed subtask limits inside OpenCode. Layered keeps each batch small and independent.

## Recovery / Resume Pattern

If you hit the max tool-call limit mid-implementation before completing all layers:

1. **Do NOT undo anything** — committed code is safe on the branch. Uncommitted edits may have been made in the final turn; run `git diff --stat` to check.
2. **Commit remaining uncommitted changes**: `git add -A && git commit -m "feat(#N): WIP partial implementation"`
3. **Push the branch**: `git push origin impl/${ISSUE_N}-<slug>` (commits from earlier layers are already on the branch).
4. **Log what was done and what remains** — summarize completed layers and remaining layers so the next session can pick up.
5. **Next session starts** by checking out the branch, reading the commit log to see where it left off, then implementing the remaining layers.

This is not a failure — depth/deep features with 8+ files naturally exceed a single session's budget. The commits and push ensure zero work is lost.

If you're at turn 35 and haven't created a PR yet:
1. **STOP editing** — commit whatever layers are done
2. Create the branch and PR with partial implementation
3. Comment: "⚠️ Implementation partially complete — remaining layers deferred"

## E2E Regression Tests (Teleport Pattern)

**Every feature/bug fix involving game mechanics must include a teleport-based E2E regression scenario in `tests/play-test.mjs`.**

The teleport pattern uses `window.__GAME_API__` to inject game state directly, bypassing navigation:

```javascript
// 1. Start the game
await page.keyboard.press('Space');
await page.waitForTimeout(500);

// 2. Teleport + test via page.evaluate
const result = await page.evaluate(() => {
  const api = window.__GAME_API__;
  const boss = api.getBossRoom();       // find target
  api.teleport(boss.x, boss.y);         // inject state
  api.simulateKey('Space');             // interact
  api.tick(10);                         // run game loop
  return api.getState().gameState;      // verify
});
```

### ⚠️ Critical: Walk Through the Door — Don't Teleport Into the Room

**`enterBossRoom()` is a simulation — it skips the real room transition.** The real gameplay path goes through `checkRoomTransition` → `checkDoorPassable` → `newRoom.type === BOSS` → `bossIntro`. `enterBossRoom()` just sets `gameState='bossIntro'` directly, bypassing ALL of that.

**Correct pattern — place the snake in the neighboring room and walk through the door:**

```javascript
// 1. Find the entrance to the boss room
const entrance = api.findBossEntrance();
if (!entrance) return;
// entrance = { neighbor: {roomX, roomY}, dir: 'right', boss: {x,y} }

// 2. Teleport to the NEIGHBORING room (not the boss room)
api.teleport(entrance.neighbor.roomX, entrance.neighbor.roomY);

// 3. Place snake head at the door of the neighbor room, facing the boss room
const nx = entrance.neighbor.roomX;
const ny = entrance.neighbor.roomY;
const doorCol = Math.floor(20 / 2);  // mid = 10
// Place head one cell before the door (so next tick steps into the door)
// Direction: determined by which side the boss room is on
//    The edge placement MUST be direction-aware — see Pitfalls below.
let hx, hy;
if (entrance.dir === 'right')  { hx = nx * 20 + 19; hy = ny * 20 + doorCol; }
else if (entrance.dir === 'left') { hx = nx * 20;     hy = ny * 20 + doorCol; }
else if (entrance.dir === 'down') { hx = nx * 20 + doorCol; hy = ny * 20 + 19; }
else if (entrance.dir === 'up')   { hx = nx * 20 + doorCol; hy = ny * 20; }
api.placeSnakeHead(hx, hy);
api.setDirection(entrance.dir);

// 4. Tick once → head moves toward door
api.tick(1);
// 5. Tick again → head crosses into boss room → REAL room transition fires
const gs = api.tick(1);
assert(gs === 'bossIntro');

**⚠️ Direction-specific placement is critical.** Placing the head at x=19 (right edge) when the direction is 'down' means the head moves down from x=19, staying in the same room for many ticks. The room transition never fires. Always place at the edge that matches the movement direction.
```

**Advantages over simulated `enterBossRoom()`:**
- Exercises `checkRoomTransition()` — the actual function that detects room changes
- Exercises `checkDoorPassable()` — door lock/size-gate logic is triggered
- The exact same code path a real player walking through the door takes
- Catches edge cases: what if the door is locked? What if the transition is blocked?

**When to use each API:**

| API | Use When | Caveat |
|-----|----------|--------|
| `teleport(x, y)` | Setting up test state quickly | Skips room transition |
| `enterBossRoom()` | Quick bossIntro state for UI testing | Skips transition, doesn't test entry path |
| `findBossEntrance()` + `placeSnakeHead()` + walk-in | Testing REAL room entry | Requires 2-3 ticks, tests full path |

### ⚠️ Critical: Do Not Overwrite Another Agent's Fix

When you check out a branch that already has commits on it:

1. **Read the full log first**: `git log --oneline <branch>`
2. **Read each commit's diff**: `git show <sha>`
3. **If a previous commit changed the SAME file/line you are about to change:**
   - Ask WHY the previous agent did it this way
   - What specific failure told them this approach was necessary?
   - Do NOT revert their fix unless you can PROVE it is wrong
   - Proof = a failing E2E test, a precise tick-by-tick trace, or user bug report
4. **Additive fixes are safer than replacements** — if your fix doesn't undo the previous agent's work, merge both

**This rule exists because:** a correct fix (commit 1: `gameState='playing'` + `nextDirection={0,0}`) was reverted by a subsequent agent (commit 2: `changeDirection(state, {x:0,y:1})`) during the same workflow run. Commit 2 was broken and the fix regressed.

### ⚠️ Critical: Verify Fix After Deployment

After your fix PR is merged and deploy completes:

```bash
# 1. Verify the fix code is on production
curl -s "https://perfect-dev-agent-workflow.vercel.app/gameboy.html" | grep -c "your_fix_string"

# 2. Run E2E tests against the deployed URL
cd ~/workspace/.pda/perfect-dev-agent-workflow/
node tests/play-test.mjs 2>&1 | tail -10

# 3. If E2E test fails → the fix is not working → rollback + retry with different approach
```

### Test Assertions: Be Specific

Always assert the EXACT expected state, not an "either/or":

```javascript
// ❌ Weak: accepts either state
status: state.gameState === 'bossIntro' || state.currentRoom ? 'OK' : 'FAIL'

// ✅ Strong: asserts exact expected state
status: state.gameState === 'bossIntro' ? 'OK' : 'FAIL'
```

Loose assertions let bugs slip through. A teleport that skips `bossIntro` would still pass the weak check because `currentRoom` is set.

### ⚠️ E2E Blind Spot: `api.tick(n)` Bypasses Game Loop Scheduling

The `__GAME_API__.tick(n)` helper calls `tick(state)` directly in a for-loop — it NEVER exercises `scheduleNextTick()` or `runTick()`. This means:

- Game loop lifecycle bugs are **completely invisible** to `api.tick(n)` tests
- A test that calls `simulateKey('Space')` → `api.tick(30)` will PASS even if the real game loop is permanently dead after bossIntro
- The test only proves `tick()` doesn't crash, NOT that the game keeps running after a state transition

**Always pair `api.tick(n)` tests with at least one Playwright keyboard-driven integration scenario** (`page.keyboard.press('Space')`) that exercises the real event handler including `runTick()`.

### E2E Assertion Checklist

For EVERY E2E regression scenario, verify at minimum:

- [ ] **gameState** is the expected value
- [ ] **Snake head position** is on the correct cell type (FLOOR, not WALL/DOOR)
- [ ] **Direction/nextDirection** are reset to `{0,0}` after any non-'playing' state dismisses
- [ ] **Snake can actually move** after the test setup: simulate a direction key + tick, check head moved
- [ ] **Game loop is alive** — check a timeout is scheduled

### ⚠️ Stability Tick Count Must Account for Active Enemies

When testing how long a stationary snake survives after entering a challenged room (e.g. boss room):
- **10 ticks** is safe for verifying the game doesn't crash immediately
- **30 ticks** is too long — the boss enemy attacks and kills a stationary 3-segment snake, causing `gameover`
- For longer-duration stability tests, either: (a) set invulnerability, (b) move the snake after dismissal, or (c) keep tick count ≤ 15

This was discovered in PR #153: the walk-through-door E2E test passed the dismiss and entry checks, but failed at 30 ticks because the boss killed the stationary snake.

Example of a strong assertion block:
```javascript
const s = api.getState();
const head = s.snake[0];
const headTile = api.getCellAt(head.x, head.y);  // hypothetical API
assert(s.gameState === 'playing');
assert(headTile === 'floor', `head on ${headTile} not floor`);  // was it repositioned correctly?
assert(s.direction.x === 0 && s.direction.y === 0);  // direction reset?
// Simulate player movement
api.simulateKey('ArrowDown');
api.tick(1);
const moved = api.getState().snake[0];
assert(moved.y > head.y, `snake didn't move after direction key`);  // can it actually move?
```

### When to add

| Change Type | Must Add Scenario | Use Pattern |
|-------------|------------------|-------------|
| New room type | Teleport to room, verify entry state transition | `teleport → tick → check gameState` |
| New enemy/boss | Test boss intro dismissal via Space and arrow keys | `teleport → enterBossRoom → simulateKey('Space') → tick(10)` |
| New input handling | Simulate key, verify state change | `simulateKey → getState()` |
| New collision logic | Set up collision, verify no crash | `teleport → tick(10) → check still alive` |
| Bug fix | Teleport to reproduction state, verify fix works | `teleport → simulate reproduction → check fix` + `runTick` check |

**How:** append a new scenario block in the REGRESSION SCENARIOS section of play-test.mjs.

## Pitfalls

- **50-turn budget is tight for complex features (standard/deep)** — The implement agent has a 50-turn budget per session. Complex features requiring direct edits across 8+ files with 500+ lines will exceed this before reaching PR creation. **Pre-estimate before starting:** count the layers from the DESIGN doc and multiply by ~3-5 turns per layer (reading + patch + commit). If the estimate exceeds 35, assume you'll need a second session and plan accordingly. **Workaround:**
  1. Commit early: after each logical layer (engine → entity → data → render), run `git add <files> && git commit -m "feat(#N): <layer>"`. Commits are free turns.
  2. Push and create PR once ALL layers are committed, even WIP: `git push origin <branch> && gh pr create ...`.
  3. NEVER spend turns on skill library curation (`skill_view`, `skill_manage`, `skills_list`) during implementation — that is post-PR work.
  4. If at 40 turns and not pushed: STOP editing, commit-all, push, create PR. Remaining 10 turns are for CI verification.
  **Failing to follow this = code written but never merged** (actual bug: #122).

- **Branch prefix is `impl/` not `implement/`** — the convention is `impl/${ISSUE_N}-<slug>`. Using `implement/` breaks the workflow pipeline.

- **World-bounds check preempts `getCellAt()` in collision tests** — `collision.js` line 45 has `if (world && (head.x >= maxX || head.y >= maxY)) return ['damage']` which returns before `getCellAt()` is ever called. When testing null-room behavior via `checkSnakeCollision()`, the test coordinate MUST be within world bounds (`head.x < world.cols * ROOM_SIZE`) but map to a null room slot. Use a multi-column world with a null room entry: create a 2×2 grid where one room slot is `null`.

- **`minimalState().currentRoom` vs actual snake position room mismatch** — `minimalState()` defaults `currentRoom` to `{x: 1, y: 1}`, but snake positions are in **world coordinates**. World position `(1, 10)` maps to room `(0, 0)` via `Math.floor(x / ROOM_SIZE)` and `Math.floor(y / ROOM_SIZE)`. The collision detection in `tick()` computes the room from the snake's actual world position (`worldToRoomCoords(newHead.x, newHead.y)`), NOT from `state.currentRoom`. This means:
  1. **Walls must be set on the room where the collision will actually occur**, not on `currentRoom`. If the snake head at world `(1,10)` moves left to `(0,10)`, the wall is at room `(0,0)` column 0 — room `(1,1)` (`currentRoom`) is irrelevant.
  2. **Bounce food or other side effects** land in the collision room (derived from newHead), not in `currentRoom`. Always check `getRoomAt(world, rx, ry)` with the correct room coordinates for food/enemy assertions.
  3. **Most test rooms have border WALLs by default** (generator places them along room edges). A snake moving toward `x=0` or `x=19` in a room at column 0 will hit a default border WALL — no explicit wall placement needed. But the wall is in room `(0, y)`, not in `currentRoom`.
  
  **Diagnostic pattern when length-checks pass but food-drop checks fail:**
  ```js
  // ❌ Wrong: assumes food was added to currentRoom
  const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
  expect(room.entities.food.length).toBe(expected);  // fails — food is elsewhere
  
  // ✅ Correct: check the collision room where newHead lands
  const { rx, ry } = worldToRoomCoords(newHead.x, newHead.y);
  const collisionRoom = getRoomAt(world, rx, ry);
  expect(collisionRoom.entities.food.find(f => f.x === newHead.x && f.y === newHead.y)).toBeDefined();
  ```

- **`this` reference breaks in `page.evaluate()` for object methods** — When adding new methods to `window.__GAME_API__`, avoid `this.someMethod()` inside the method body. The `this` binding is lost when the browser's `page.evaluate()` serializes the function. Instead, reference the `state` closure variable directly or inline the lookup logic. Pattern:
  ```javascript
  // ❌ Breaks: this.getBossRoom() — "this" is undefined
  findBossEntrance: () => {
    const boss = this.getBossRoom();
  }
  // ✅ Works: inline the state lookup
  findBossEntrance: () => {
    if (!state || !state.world) return null;
    for (let y = 0; y < state.world.rows; y++)
      for (let x = 0; x < state.world.cols; x++)
        if (state.world.rooms[y][x].type === 'boss' || state.world.rooms[y][x].bossRoom)
          return { x, y };
    return null;
  }
  ```
  This was discovered when `findBossEntrance` using `this.getBossRoom()` crashed with "Cannot read properties of undefined" during E2E test execution.

- **New game state needs input handler** — When adding a new `gameState` value (e.g. `'bossIntro'`), check that `public/gameboy.html`'s `keydown` listener has a corresponding handler to transition it to `'playing'`. Adding a state that freezes waiting for input with no handler is a game-breaking bug. Pattern: add the handler in the same PR as the state change, not a follow-up.

- **Paused game states stop the game loop — must restart on exit** — When `gameState` enters any non-'playing' state (e.g. `'bossIntro'`, `'paused'`), `scheduleNextTick()` checks `state.gameState !== 'playing'` and refuses to schedule the next timeout. The game loop dies. When the keyboard handler transitions back to `'playing'`, it MUST call `runTick()` to restart the loop. Without this, the game appears to render correctly (one final render fires) but no ticks execute — the snake is visible but immobile, and direction keys silently update `nextDirection` with no effect.

  **Pattern — every keyboard-driven state exit must restart the loop:**
  ```javascript
  if (state.gameState === 'bossIntro') {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      state = changeDirection(state, { x: 0, y: 1 });
      render(ctx, state);
      if (state.gameState === 'playing') {
        runTick();  // ← ALWAYS restart the loop here
      }
      return;
    }
  }
  ```

  **This is the #1 missed step** — three separate fix attempts (#142, #145, and multiple self-heal cycles) all failed because they fixed the head position but never restarted the loop. A tick-by-tick trace shows `direction` changing correctly after key press but `tick()` never being called.

- **BossIntro dismissal: reposition head AND reset direction/nextDirection to {0,0}** — When `changeDirection()` handles `gameState === 'bossIntro'`, it must do **three things**: (1) reposition the head to a FLOOR cell via `tiles[1][10]`, (2) set `gameState = 'playing'`, and (3) **reset `direction` and `nextDirection` to `{x:0, y:0}`**. The `dir` parameter to `changeDirection()` is **ignored** in the bossIntro branch — only the gameState/snake checks run. Without resetting direction, the snake retains its entry direction and moves back into the wall/door on the next tick, causing a freeze. **This is the single most common bug pattern in boss room fixes** — seen in issues #142, #145, and multiple self-heal cycles.

  Trace of the freeze with direction NOT reset:
  ```
  1. Snake enters boss room from below (moving UP, direction = {0, -1})
  2. gameState = 'bossIntro', snake head at door cell tiles[0][10]
  3. Player presses Space → changeDirection(state, {x:0, y:1})
  4. Head repositioned to tiles[1][10] = FLOOR ✅
  5. gameState = 'playing' ✅
  6. direction still {0, -1} ❌ — NOT reset!
  7. Next tick: newHead = tiles[1][10] + {0,-1} = tiles[0][10]
  8a. If tiles[0][10] = WALL → ['damage'] → stuck+reverse (5 tick freeze)
  8b. If tiles[0][10] = DOOR → room transition → boss_door blocked → perma-freeze
  ```

  **Correct fix** (core.js `changeDirection` bossIntro branch):
  ```javascript
  return {
    ...state,
    gameState: 'playing',
    snake: [head, ...state.snake.slice(1)],
    direction: { x: 0, y: 0 },
    nextDirection: { x: 0, y: 0 },
  };
  ```

  This ensures the snake stays still on its FLOOR cell until the player presses a direction key. Same fix needed in the non-BOSS-room fallback branch and in `simulateKey()` in gameboy.html.

- **Boss room door passages use ROOM_SIZE mid (10), not BOSS_ROOM_SIZE mid (40)** — `generateBossRoomTiles()` places standard door passages at `tiles[0][8..12]` (centered on `ROOM_SIZE/2 = 10`) to align with the 20×20 world grid, AND a BOSS_DOOR at `tiles[0][40]` (centered on `BOSS_ROOM_SIZE/2 = 40`). The snake enters through the standard door passage (tiles[0][10]), NOT the BOSS door. This means `getCellAt()` reads `tiles[0][10]` which is either CELL.DOOR (if an 'up' door exists) or CELL.WALL (no 'up' door). The BOSS_DOOR at tiles[0][40] is decorative/exit-only and is never encountered during entry.

- **Tick-by-tick tracing for freeze bugs** — When a game freezes or crashes after a fix, trace each tick individually to find the exact frame where things go wrong. Pattern:
  ```javascript
  const trace = [];
  for (let i = 0; i < 30; i++) {
    api.tick(1);
    const s = api.getState();
    const head = s.snake[0];
    trace.push({
      tick: i, gs: s.gameState,
      head: `${head.x},${head.y}`,
      room: `${Math.floor(head.x/20)},${Math.floor(head.y/20)}`,
      dir: JSON.stringify(s.direction)
    });
    if (s.gameState !== 'playing') break;
  }
  console.table(trace);
  ```
  The output reveals exactly where the freeze begins. In the boss room bug: tick 9 showed head stuck at `x=79` (the right border of the 20×20 world cell) while the room type was `boss`. This pinpoints a coordinate-system mismatch, not a game-logic issue.

- **`Closes #N` vs `Parent #N`** — both are required in the implement PR body. `Closes #N` is a GitHub keyword that auto-closes the issue on merge. `Parent #N` is a custom convention that `workflow-chain.yml` uses to track the parent. **IMPORTANT:** The regex is `(?:Closes|parent)\\\s*#(\\d+)` — `\\s*` matches whitespace ONLY, NOT colons. `Parent #N` works, `Parent: #N` does NOT.

- **Post-fix `describe.todo` placeholders must be enabled** — The DESIGN doc's test case descriptions may specify post-fix scenarios marked as "TODO" (not yet testable). When the fix is implemented, convert these into active `describe()` blocks that assert the corrected behavior.

- **Plan PR may have merged source code into master too** — Occasionally the plan PR merges a trivial source code change (along with the DESIGN doc) into master. When you branch `impl/N-slug` from master after such a merge, `git diff master --stat` returns empty — no diff between the branch and master. `gh pr create` then fails with *"No commits between master and impl/N-slug"*.

  **Two root causes for zero-diff:**
  1. **Plan PR includes source code** — The plan phase includes a trivial source change (1-line string replacement) as a side-effect of verifying the design works.
  2. **Source code from an earlier issue** — The code already exists in master from a prior issue (e.g. pixel-art rendering was added in Issue #150).

  In both cases the detection and solution are the same — check `git diff master --stat` after branching from master, and if empty, branch from a pre-plan commit instead.

  **Detection:** After the standard branch-from-master step, check for zero diff:
  ```bash
  git diff master --stat
  # If empty → plan PR already includes source change
  ```

  **Solution — branch from the pre-plan commit instead:**
  1. Find the merge-base before plan/research merges landed:
     ```bash
     # Option A: the merge base (parent of both plan/research merges)
     # Find the most recent commit that doesn't mention this issue
     PARENT=$(git log --oneline master | grep -v "plan(#180)\|Research:" | head -1 | awk '{print $1}')
     
     # Option B: check the parent of the research PR merge (more reliable)
     # The merge base before the plan PR is the research merge's base
     ```
  2. Recreate the branch from that commit:
     ```bash
     git checkout master
     git branch -D impl/$ISSUE_N-<slug> 2>/dev/null
     git checkout -b impl/$ISSUE_N-<slug> $PARENT
     ```
  3. Apply the source code change and tests (if tests aren't already present at that commit), commit, push:
     ```bash
     # git diff master --stat will now show a real diff
     git add <files>
     git commit -m "feat(#$ISSUE_N): <description>"
     # Remote may have a stale branch from the zero-diff push — delete first
     git push origin impl/$ISSUE_N-<slug> 2>&1 | grep -q "rejected" && \
       git push origin --delete impl/$ISSUE_N-<slug>
     git push origin impl/$ISSUE_N-<slug>
     ```
  4. `gh pr create` will now succeed since there are real commits between the base and the branch.

  **Why this happens:** The plan phase sometimes includes a trivial source code change (a 1-line string replacement) in its PR as a side-effect of verifying the design against the codebase. This is accepted because the change is trivially correct and the implement phase re-applies the same change as its own commit with a proper diff from master.

- **DESIGN doc test case descriptions may misalign with implementation** — The PLAN phase writes prose test descriptions that approximate expected behavior. When you implement the real functions, the actual behavior may differ from the description (e.g. HP decrement counts, damage curves). **Diagnosis pattern:**
  1. Trace the test's expected values step-by-step against actual function execution (count each call's side effects).
  2. Inline-helper logic and the real function may diverge on boundary conditions (e.g. empty-column-hit = 1 HP vs no-op). The implementation is the source of truth — fix the test assertion, not the implementation.
  3. After adjusting a test assertion, run `npx vitest run tests/<file>.test.js --reporter=verbose` to confirm, then the full suite.
  **Prevention:** Before writing implementation logic, trace the test's inline-helpers manually to verify the expected values are correct under all code paths. Flag likely errors to the user before implementing.

- **Backward-compat gating prevents existing test regressions** — When adding new conditions to critical game-loop logic (e.g. gating GOAL room victory on `bossDefeated`), existing tests that don't set up the new state fields will break. **Pattern:**
  ```js
  // Check if the new feature exists in this world first
  const hasFeature = hasRoomOfType(world, ROOM_TYPE.BOSS);
  if (!hasFeature || state.bossDefeated) {
    // original behavior
  }
  ```
  Add a `hasRoomOfType()` helper (checks world.rooms for a type) as a private function in the core module. This ensures a world generated without the new room type (e.g. 3×3 test worlds) still follows the original flow.

## Known Behaviors (from testing)

- **Model required**: Every `POST /session/:id/message` MUST include `"model": {"providerID": "opencode", "modelID": "deepseek-v4-flash-free"}` or it returns a server error
- **`/tmp` is read-only**: OpenCode auto-fallbacks to the current working directory when /tmp write fails
- **Working directory**: Session `directory` parameter is a DISPLAY HINT only. Always prepend `cd /home/pi/workspace/.pda/perfect-dev-agent-workflow/` to commands
- **Timeout**: Larger prompts may need `--max-time 300` (5 min); chunk or use background mode for complex tasks
- **Response parsing**: The response `parts` array contains `type: "text"` (assistant reply), `type: "reasoning"` (model internal monologue), `type: "tool-use"` (tool calls made), `type: "tool-result"` (tool outputs). Extract the final text from the last `text` part after the last `tool-result`
- **Error masking**: Even when `POST /session/:id/message` returns `{"name":"UnknownError","data":{"message":"Unexpected server error"}}`, OpenCode may have already executed tool calls (file edits, `git add`, `bash`) BEFORE erroring. Always verify file state after an error before declaring the session a failure.
- **Session cleanup**: Always `DELETE /session/:id` after completion to free resources
- **Model selection**: Available models include `deepseek-v4-flash-free`, `north-mini-code-free`, `nemotron-3-ultra-free`. Do NOT use `mimo-v2.5-free` (discontinued)

## Linked References

- `references/direct-implement-from-tests.md` — Staged approach for direct implementation: import inventory, constants-first, entity factories, business logic, test assertion verification.
- `references/greenfield-test-generation.md` — Converting DESIGN doc prose test descriptions to runnable test code, including inline helpers, enum pitfalls, mutation patterns.
- `references/boss-room-freeze-diagnosis.md` — Complete diagnostic reference for all three root causes of boss room freeze (coordinate conversion, direction not reset, game loop not restarted), plus E2E test blind spots and boss room geometry.
- `references/net-change-check-example.md` — Worked example of the net-change check technique (Bug #163): comparing full failure counts on master vs branch to confirm a fix is working and remaining failures are pre-existing.
- `references/custom-provider-setup.md` — Configuring custom OpenAI-compatible API providers for Hermes + OpenCode (base_url, key_env, connection testing, pitfalls).
