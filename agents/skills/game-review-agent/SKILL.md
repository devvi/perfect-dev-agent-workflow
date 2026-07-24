---
name: game-review-agent
description: "Review implement PRs, make merge decisions, and update GDD post-merge. Triggered by check_run.completed (conclusion=success) on impl/* branches as the final gate before merge."
tags: ["workflow", "code-review", "gdd", "merge-gate"]
---

# Game Review Agent

> The **final quality gate** before an implement PR merges. Triggered by `check_run.completed` (conclusion=success) on an `impl/*` branch. Runs code quality review, verifies tests and docs, then either merges or escalates.

## Critical Prerequisite: Gateway Rate Limit

**The review agent cannot be triggered if the gateway is rate-limiting `check_run` events.**

The gateway defaults to **30 requests/minute** per webhook route. When CI completes on multiple PRs simultaneously, `check_run.completed` events are dropped with HTTP 429 → review agent never spawns.

**Before investigating any review agent failure, always check:**
```bash
HOOK_ID=$(gh api repos/<owner>/<repo>/hooks --jq '.[0].id')
gh api repos/<owner>/<repo>/hooks/$HOOK_ID/deliveries?per_page=5 \
  --jq '.[] | "\(.event): HTTP \(.status_code)"'
```

If `check_run` events show HTTP 429:
```bash
hermes config set platforms.webhook.extra.rate_limit 120
hermes gateway restart
```

## How It's Triggered

The review agent is NOT label-driven — it has no workflow label. It is triggered by:

1. **`SPAWN: review`** — From `event-processor.py` script output, which processes `check_run.completed#N:success` events
2. **Stalled PR detection** — When a stalled scan finds an `impl/*` PR with CI success but no review agent activity
3. **`delegate_task`** — Spawned by the cron poller with full context

**⚠️ Operator race condition (2026-07-23):** The operator agent may merge implement PRs before the check_run webhook triggers this review agent. Two manifestations:

**A. PR is merged** (state=MERGED): Detectable via `gh pr view <N> --json state --jq '.state'`.
1. Report "PR already merged, review skipped" in the session log
2. **Skip the review and pre-merge checklist** — the merge already happened, these are moot
3. **Do NOT skip post-merge tasks** — GDD update, Feishu notification, and project board sync are about keeping project state consistent regardless of who merged. Run them as usual

**B. Content on main, but PR still shows OPEN with CONFLICTING merge status**: The operator force-merged the squashed commit directly, bypassing `gh pr merge`. The impl branch (local + remote) and PR all still exist, but `gh pr merge` fails with "Base branch was modified" or "Pull Request has merge conflicts".

Detect this:
```bash
# Pick a file from the PR and check if its commit is on main
gh pr diff <N> --name-only | head -1 | xargs -I{} git log --oneline --all -- "{}" | head -1 | grep -q main
```

If yes (the design doc, e.g., docs/DESIGN/154-*.md, appears in `git log --oneline main`), the content was already force-merged. Handle it:
1. Run tests still (they verify the merged content). If they fail, this is pre-existing — document and skip.
2. **Skip the merge attempt** — `gh pr merge` will fail on conflicts.
3. **Close the PR** with a comment documenting the operator pre-merge:
   ```bash
   gh pr close <N> --comment "PR already merged to main by operator. Content verified: tests pass. Closing."
   ```
4. **Do NOT skip post-merge tasks** (GDD update, Feishu notification, project board sync).
5. **Delete the impl branch** to keep the repo clean:
   ```bash
   git branch -D impl/<branch-name> 2>/dev/null
   git push origin --delete impl/<branch-name> 2>/dev/null || true
   ```

The root fix is in the operator's merge logic (depth-check), not in this agent. See `references/review-agent-race-condition.md`.

## Pre-Merge Checklist (ALL blocking)

Verify these before merging. Any failure = document in PR comment, do NOT merge.

### 1. Verify PR State
```bash
gh pr view <N> --json state,headRefName,baseRefName,mergeable,body,reviews
```
- PR must be OPEN
- Branch must start with `impl/`
- Must reference parent issue: body contains `Parent #N` or `Closes #N`
- Base branch must match the project's default branch (check `game-env/manifest.yaml` for override)
- mergeable must not be CONFLICTING

**⚠️ Pitfall: mergeable returns UNKNOWN on first call.** GitHub may not have computed mergeability yet. `mergeable: UNKNOWN` is GitHub's placeholder, not a real state. Confirm with a second call:
```bash
gh pr view <N> --json mergeable --jq '.mergeable'
```
If it returns `MERGEABLE` or `CONFLICTING`, that's authoritative. If still `UNKNOWN`, wait 2s and retry.

### 2. Run Tests Locally (Unit + Smoke)

Run both the unit test suite and the E2E playthrough smoke test:

```bash
# Unit tests — capture results, avoid pipe deadlock with > redirect
godot --headless --script tests/run_tests.gd > /tmp/godot_unit_output.txt 2>&1
echo "Unit exit: $?"
grep -E '(===|✅|❌|Passed:|Failed:|All tests|Results)' /tmp/godot_unit_output.txt | tail -80

# Smoke test — verifies full playthrough integrity
godot --headless --script tests/smoke_test.gd > /tmp/godot_smoke_output.txt 2>&1
echo "Smoke exit: $?"
grep -E '(❌|Passed:|Failed)' /tmp/godot_smoke_output.txt

# JS/Node projects:
npx vitest run 2>&1 | tail -5
```

**⚠️ Pitfall: `godot` binary not on PATH.** On macOS, Godot installs as an `.app` bundle. If `godot` is not on PATH, use the full path:
```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --script tests/run_tests.gd
```
Consider adding a symlink for convenience: `sudo ln -s /Applications/Godot.app/Contents/MacOS/Godot /usr/local/bin/godot`

**⚠️ Pitfall: grep pattern width.** The old pattern `(PASS|FAIL|passed|failed|Test|Summary)` misses section headers (`=== MVP Integration Test ===`), individual test markers (`✅`), and section delimiter lines. The wider pattern above captures everything between the test output and the leak warnings emitted at headless-mode exit. Pipe the full output to a file first if you need to search for unexpected errors.

**⚠️ Pitfall: test command timeout via pipe.** A long pipe chain (`godot | grep | tail`) can timeout the terminal call if the Godot process takes more than the default timeout. The pipe's `grep + tail` processing doesn't block indefinitely — the real issue is that the tool waits for the pipeline to produce output. When Godot starts and then outputs nothing matching the grep pattern for a while, the terminal may report timeout on the overall command even though Godot eventually finishes.

**More reliable approach — tee to file first:**
```bash
# Capture ALL output, then grep from file
/Applications/Godot.app/Contents/MacOS/Godot --headless --script tests/run_tests.gd 2>&1 \
  | tee /tmp/godot_test_output.txt \
  | grep -E '(===|✅|❌|Passed:|Failed:|All tests|Results)' \
  | tail -80
```
The `tee` keeps the pipeline flowing and saves the full output to `/tmp/godot_test_output.txt` for post-mortem debugging. If even this times out, separate the capture and grep:
```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --script tests/run_tests.gd > /tmp/godot_test_output.txt 2>&1
grep -E '(===|✅|❌|Passed:|Failed:|All tests|Results)' /tmp/godot_test_output.txt | tail -80
```
This guarantees no pipe-blocking delays regardless of Godot runtime.

**⚠️ Pitfall: full test suite hangs / exceeds timeout (>180s).** Even with the separated capture-and-grep approach above, the entire `run_tests.gd` suite may time out (>180s) in headless mode. This is a **pre-existing infrastructure issue** — the runner loads many 3D-heavy test suites sequentially, and some suites (integration tests with scene instantiation, 3D node creation) hang when no rendering context is available.

Do NOT spend tool time debugging the full-suite timeout — it predates the PR. Instead, run a **focused test** on only the test files changed by the PR:

```gdscript
# Write a temp verification script (e.g. tests/hermes-verify-<PR>.gd):
extends SceneTree
func _init() -> void:
    var t = load("res://tests/unit/<relevant-test>.gd").new()
    t.run()
    if t.failed > 0: quit(1)
    else: quit(0)
```

Run it:
```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --script tests/hermes-verify-<PR>.gd
```

This completes in seconds rather than minutes. If the focused tests pass and CI on the PR branch already passed, the full-suite timeout is not a merge blocker — note it in the review as pre-existing, but proceed.

After running, clean up the temp script:
```bash
rm tests/hermes-verify-<PR>.gd
```

- **Smoke test is mandatory.** `tests/smoke_test.gd` exists in the repo (96 checks, covers full playthrough). It runs in CI for every `impl/*` PR push and blocks merge on failure. Always run it locally during review.

### Check If Failures Are Pre-Existing

If tests fail during local verification, check if the same failures reproduce on the default branch before escalating:

```bash
git stash
git checkout <default-branch>
# Run tests on default branch
godot --headless --script tests/run_tests.gd 2>&1 | grep -E '(❌|FAILED|Passed:|Failed:)' | tail -10
git checkout -
git stash pop 2>/dev/null || true
```

If the same failures appear: **pre-existing infrastructure issue**, not caused by the PR. Document in PR comment.

If failures are NEW (only appear on the PR branch): **blocking**. Document in PR comment, do NOT merge.

- All tests must pass (unit tests + smoke test — 96 checks across scene loading, dialogue integrity, state system, and ending logic)
- If tests fail: check if failures reproduce on the default branch (see above). If they do -> pre-existing. **For feature PRs**: do NOT merge. Document and escalate. **For scene-layout/asset-only PRs**: merge proceeds — the placement introduces no regressions (see merge decision table in Step 6).

### 3. Verify Test Files Updated
```bash
gh pr diff <N> --name-only | grep -i test
```
- At least one test file should be in the diff — **except for bugfix/compile-fix PRs and scene-layout/asset-only PRs**
- **Bugfix/compile-fix PRs** (e.g. title says "Fix N compile-blocking errors", "fix typos", "fix API migration"): no test changes is acceptable. The fix IS making the project compile so existing tests can run. Run the existing tests instead as verification — if they all pass, the fix is validated.
- **Scene layout / asset-only PRs** (diff only contains `.tscn`, `.tres`, `.png`, `.glb`, `.wav`, or other non-script files): no test changes is acceptable. The component scenes being placed were already tested in prior PRs. Verification is via existing test suite + DESIGN doc coordinate inspection. See "Known Pitfalls — PR Type Classification" for identification rules.
- **Feature PRs**: test changes are mandatory. If no test changes: add blocking comment on PR, do NOT merge.

### 4. Verify Design Docs Updated (if applicable)
```bash
gh pr diff <N> --name-only | grep -E 'docs/(PRD|DESIGN|GAME_DESIGN)'
```
- If the PR diff contains doc changes, review them for accuracy
- **If the diff has NO doc changes**, it may still be valid:

  **Scenario A — DESIGN doc was pre-created** (created in a separate plan-phase PR before the implement PR). Check if the parent issue's DESIGN doc already exists:
  ```bash
  ls docs/DESIGN/<N>-*.md 2>/dev/null
  ```
  If the DESIGN doc exists and accurately describes the feature being implemented, doc changes in the diff are NOT required. The design was already documented; the implement PR only executes it.

  **Scenario B — genuinely missing**. If neither the diff nor any existing DESIGN doc covers the feature's design, this is a blocking gap. Add a blocking comment, do NOT merge.

- **Feature PRs**: missing doc updates (Scenario B) = blocking comment, do NOT merge
- **Bugfix/compile-fix PRs**: no design doc changes are expected — the design hasn't changed, only the implementation was corrected. Skip this check, move to step 5.

### 5. Code Quality Spot-Check
- **GDScript: `get_node_or_null()` patterns** for graceful null handling when autoloads or siblings may not exist in headless tests
- **GDScript: signal lifecycle hygiene** — verify `connect()` in `_ready()` / `body_entered` has a corresponding `disconnect()` in `body_exited` / cleanup to prevent dangling signal connections
- **GDScript: `var` shadowing** — inside a function body, `var x = ...` creates a local variable that shadows the member `x`. It does NOT reset the member. Common in `reset()` functions, where `var target_spawn_point = Vector3.ZERO` silently does nothing while the real member stays unchanged. The correct pattern is `x = ...` (no `var`).
- **GDScript: `Node.get()` only accepts 1 argument.** Unlike `Dictionary.get(key, default)`, calling `gm.get("player_position", null)` on a Node causes a parse error: *"Too many arguments for get() call"*. Always scan for this pattern — it's a silent crash that causes all SceneBase inheritors to fail at load time. The fix: guard with `"key" in node` then access directly: `node.some_property`.
- **GDScript: verify physics completeness.** In `_physics_process(delta)`, check that `velocity.y -= gravity * delta` is present for CharacterBody3D scripts. Missing gravity causes the player to float above the ground — a behavioral omission that unit tests don't catch.
- **GDScript: camera/visual system changes — verify first-person mode is still usable.** If the PR changes camera system or adds a player visual, check that `camera_mode = "first_person"` still works. A third-person camera with a player capsule in front of the camera blocks all scene visibility — this is a silent experience regression.
- **GDScript: scene loading chain integrity.** Check that `change_scene_to_file()` isn't called in the same `_ready()` that just wired up signal connections — the scene replace destroys all connections made in that same `_ready()`. If the scene is a bootstrap (wires signals then loads a game scene), the signals should be wired in the game scene directly, not in the transient bootstrap scene.
- GDScript: class_name declarations, static typing, signal patterns, no hardcoded paths
- JS: no console.log, proper error handling, no dead code
- Check for any obvious anti-patterns or security issues

### 5. Submit PR Review Comment

Before merging, leave a review comment summarizing findings:

```bash
gh pr review <N> --approve --body "## Review Summary

### Checks
- Tests: ✅ passed
- Test files: ✅ updated (or N/A for bugfix)
- Design docs: ✅ verified (or N/A for bugfix)
- Code quality: ✅ no issues

### Verdict
Approved. Merging.
```"
```

- All checks pass → APPROVE with summary, then merge

  **⚠️ Pitfall: cannot approve own PR.** When the agent's `GH_TOKEN` belongs to the same GitHub user who authored the PR (common in single-dev repos), `gh pr review --approve` fails with `GraphQL: Review Can not approve your own pull request`. This is a hard GitHub constraint, not a config issue. Do NOT silently skip — leave a `--comment` review with the full summary so the PR has a review trail:

  ```bash
  gh pr review <N> --comment --body "## Review Summary

  ### Checks
  - Tests: ✅ passed
  - Test files: ✅ updated
  - Design docs: ✅ verified
  - Code quality: ✅ no issues

  ### Verdict
  All checks pass. Merging."
  ```

Then proceed directly to the merge step. The review comment on the PR + the session log together serve as the review record.
- Issues found → REQUEST_CHANGES with specific items, do NOT merge

### 6. Merge Decision

| Condition | Action |
|-----------|--------|
| All checks pass | Merge via `gh pr merge <N> --squash --delete-branch` |
| Pre-existing failures on feature PR | Add PR comment documenting findings. Do NOT merge. Escalate. |
| Pre-existing failures on scene-layout/asset-only PR (CI passed) | Document in review. Merge proceeds — placement introduces no regressions. The existing test suite still passes the same count as on `main`. |
| CI failure (shouldn't happen — review is only called on success) | Do NOT merge. Report to user. |
| PR merge conflicts | Report. Skip. |

**⚠️ Pitfall: Stalled PR with prior review blocking on pre-existing failures.** When re-reviewing a stalled PR whose previous review recommended "Do NOT merge" due to pre-existing failures, re-evaluate against the PR's classification. Scene-layout/asset-only PRs qualify for the exception above. The prior review's block applied the general rule; the scene-layout exception was added later. Re-run the pre-existing-failure check on `main` to confirm they still reproduce, then proceed with the merge if this is a scene-layout PR. Document the override in the review comment with explicit rationale ("Scene-layout PR, pre-existing failures confirmed on `main`, no regressions from this PR"). See `references/stalled-pr-re-review-with-prior-block.md` for a full walkthrough (PR #193, Issue #151).

### ⚠️ Pitfall: Self-approval Constraint

See the pitfall under **Step 5: Submit PR Review Comment** above for the `--comment` workaround when `GH_TOKEN` matches the PR author.

### Merge Pitfall: Stash First

```bash
# gh pr merge tries to check out the target branch locally.
# If there are uncommitted changes, it fails.
git stash
gh pr merge <N> --squash --delete-branch
git stash pop 2>/dev/null
```

### ⚠️ Pitfall: Verify Merge Success

`gh pr merge` succeeds silently — it does not print a confirmation message. Always verify the merge actually happened before proceeding to the GDD update:

```bash
gh pr view <N> --json state --jq '.state'
```

Expected output: `MERGED`. If it returns `OPEN`, the merge silently failed (e.g. branch protection rules, CI still running).

### ⚠️ Pitfall: Stash Pop Can Restore Wrong Branch

The `git stash pop` after merge restores whatever branch you were on before `git stash`. If you were on an `impl/*` branch (which `gh pr merge --delete-branch` just deleted), `git stash pop` can restore a **different** branch's working tree — especially if the stash was created on top of an unrelated branch's modifications.

After the stash pop, ALWAYS verify which branch you're on before making GDD edits:

```bash
git branch --show-current
git pull origin $(git branch --show-current)
```

If you're on the wrong branch, `git checkout <default-branch>` and cherry-pick or re-apply the GDD changes.

### ⚠️ Pitfall: gh pr diff -- <file> syntax limitation

`gh pr diff <N> --name-only` lists changed files (single arg). But `gh pr diff <N> -- <filepath>` does NOT work — it errors with `accepts at most 1 arg(s)`. To inspect a specific file's diff, either:
- Pipe the full diff to `head` and scan for the file
- Use `git diff` on the fetched PR branch after checkout

## Post-Merge: GDD Update

After the PR merges, update the Game Design Document (GDD) in `docs/GAME_DESIGN/`. The review agent is the ONLY agent that updates the GDD — it happens AFTER merge, not before.

### Which GDD Files to Update

Read the DESIGN doc (`docs/DESIGN/<N>-*.md`) for the specific feature. It mentions which GDD files need updating. Common targets:

| GDD File | Covers | Check When |
|----------|--------|------------|
| `01-OVERVIEW.md` | Game overview, elevator pitch | Any major feature |
| `02-WORKFLOW.md` | Agent workflow — development pipeline | Workflow or pipeline changes |
| `03-GODOT-SETUP.md` | Godot engine config, scene management, code style | Engine config or project setup changes |
| `04-RENDERING.md` | Visual rendering — shaders, Label3D, pixel fonts | Visual changes |
| `05-DIALOGUE.md` | Dialogue engine — data model, branching, runtime | Dialogue, NPC features |
| `06-NARRATIVE.md` | Narrative architecture — scene sequence, echoes, endings | Story scenes, NPC interactions |
| `07-AUDIO.md` | Audio system — ambient loops, state modulation, transitions | Audio changes |
| `08-PLAYER-CONTROLLER.md` | Player controller — WASD, mouse look, E-key, persistence | Player movement or input changes |
| `09-TESTING.md` | Testing system — headless runner, integration test suite | Test infrastructure changes |
| `INDEX.md` | Table of contents | Any GDD file change |

**Decision: patch existing vs. create new**:
- **GDD file already exists** for this feature (e.g. `08-PLAYER-CONTROLLER.md` from a prior implement PR that built the base system): read the existing file, then use `patch` to add new sections describing what the current PR adds. Do NOT overwrite the whole file.
- **GDD file does not exist yet**: create a new numbered file (see below).

**New section needed?** If the feature doesn't cleanly fit any existing file above (e.g. a player controller, an inventory system, a map system), create a new numbered GDD file. Determine the next available number (read INDEX.md's table, find the highest `NN-` prefix, add 1). Name it `NN-FEATURE-NAME.md` in `SCREAMING-KEBAB-CASE` and add a row to INDEX.md's table. Match the existing table's pipe formatting exactly (`| [NN-NAME](NN-NAME.md) | description |`).

### GDD Writing Style

- **Narrative, not code-dump** — Describe the system at the design level, not the implementation level
- **Tables for parameters** — Constants, limits, ranges
- **Code blocks only for definitions** — Signal signatures, enum values, method signatures
- **Paragraphs for intent** — Explain WHY the system works this way
- **Human-readable, LLM-searchable** — Structure for both readers

### GDD Commit Convention

```bash
git add docs/GAME_DESIGN/
git commit -m "docs: update GDD for <feature name> (#N)"
git push origin <default-branch>
```

**⚠️ Pitfall: GDD update branches from master.** The GDD update commit is based on the default branch (which now includes the merged PR). This is safe because the review agent merges first, THEN commits the GDD update on top.

**⚠️ Pitfall: GDD-only commits can accidentally revert** the implement PR's code if the review agent does the merge within the same script session without updating the working tree. Fix:
```bash
# After merging, update the working tree to match origin
git checkout <default-branch>
git pull origin <default-branch>
# NOW make GDD changes
```

### ⚠️ GDD Pipe-Table Corruption with `patch`

The `patch` tool's fuzzy matching can produce `|||` (triple pipes) instead of `||` (double pipes) when editing GDD files that contain markdown pipe tables. This affects:

- **INDEX.md** — When adding a row to the table of contents, use `write_file` to rewrite the entire file. INDEX.md is small (~25 lines), so overwriting is safe. Do NOT use `patch` on INDEX.md.
- **Any GDD file with pipe tables** — When adding a new section that contains a pipe table (e.g. adding a parameter table to `08-PLAYER-CONTROLLER.md`), fuzzy matching can corrupt existing table rows by adding an extra `|`. After using `patch`, ALWAYS verify GDD tables by scanning for `|||` in the edited file:

```bash
grep -n '|||' docs/GAME_DESIGN/*.md
```

If triple-pipes appear, fix with a second `patch` that replaces `|||` with `||` for the affected rows.

## Post-Merge: PROJECT.md Update

After GDD update, also update `docs/PROJECT.md` — the living project overview document readable by both humans and agents. This is a **hierarchical project document** with four layers:

### L1: Project Status

Update the status table at the top:

```markdown
## 项目状态

| 指标 | 状态 |
|------|:----:|
| 编译 | ✅ 通过 |
| 可运行 | ✅ 能启动 |
| 可玩 | ⚠️ 有标题画面和移动控制 |
| 最近构建 | `{date}` |
| 开放 Issues | {N} |
```

### L2: Module Map

If the PR added a new module/script, add a row to the module map table:

```markdown
| 模块 | 文件 | 状态 | 设计文档 |
|------|------|:----:|:--------:|
| NewSystem | `gdscripts/new_system.gd` | ✅ | GDD |
```

### L3: Features

If the PR implemented a new feature, add a row to the features table:

```markdown
| # | 功能 | 状态 | 文档 |
|:-:|------|:----:|:----:|
| 12 | 新功能 | ✅ 已合并 | GDD |
```

### L4: Known Issues

If the PR fixed or introduced a known issue, update the known issues table.

### Commit Convention

```bash
git add docs/PROJECT.md
git commit -m "docs: update PROJECT.md for <feature name> (#N)"
git push origin <default-branch>
```

**⚠️ Pitfall:** Same as GDD — always `git pull origin <default-branch>` before editing PROJECT.md to avoid reverting content from parallel PRs.

## Notification

After merging and GDD update, POST a Feishu notification:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"msg_type":"text","content":{"text":"✅ #N → <feature name> merged → 🚀"}}' \
  https://open.feishu.cn/open-apis/bot/v2/hook/76101281-b359-49ab-ae2f-fc486bf65958
```

Format: One line, emoji prefix, no explanations.

## Project Board Sync

After merging and GDD update, sync the GitHub Project board to reflect the completed state:

### 1. Check if the Issue Exists on the Board

```bash
gh project item-list <project-number> --owner "@me" --format json \
  | python3 -c "import json,sys; data=json.load(sys.stdin); [print(f'Item: {i[\"id\"]}') for i in data['items'] if i.get('content',{}).get('number')==<N>]"
```
If no output, the issue is not on the board — add it first:

```bash
ISSUE_NODE=$(gh issue view <N> --json id --jq '.id')
gh api graphql -f query='
  mutation($project:ID!,$content:ID!) {
    addProjectV2ItemById(input:{projectId:$project,contentId:$content}) { item { id } }
  }' -f project="<project-id>" -f content="$ISSUE_NODE"
```

### 2. Set Stage to "Done"

```bash
# First, find the Stage field options:
gh project field-list <project-number> --owner "@me" --format json \
  | python3 -c "import json,sys; data=json.load(sys.stdin); field=next(f for f in data['fields'] if f['name']=='Stage'); [print(f'{o[\"name\"]}: {o[\"id\"]}') for o in field['options']]"

# Then set the Stage to "Done":
gh project item-edit --project-id "<project-id>" \
  --id "<item-id>" \
  --field Stage --single-select "Done"
```

**⚠️ Pitfall: `gh project item-edit --field Stage --single-select "Done"` may fail** if the project uses a GraphQL-based field ID. Fall back to raw GraphQL:
```bash
ITEM_NODE=$(gh project item-list <number> --owner "@me" --format json \
  | python3 -c "import json,sys; data=json.load(sys.stdin); items=[i for i in data['items'] if i.get('content',{}).get('number')==<N>]; print(items[0]['id'] if items else '')")
gh api graphql -f query='
  mutation($project:ID!,$item:ID!,$field:ID!,$value:String!) {
    updateProjectV2ItemFieldValue(input:{
      projectId:$project,itemId:$item,fieldId:$field,
      value:{singleSelectOptionId:$value}
    }) { projectV2Item { id } }
  }' \
  -f project="<project-id>" \
  -f item="$ITEM_NODE" \
  -f field="<stage-field-id>" \
  -f value="<done-option-id>"
```

### 3. Set Progress to 100% (if the Progress field exists)

Omit if the project board does not have a Progress or percentage field.

## Known Pitfalls

### PR Type Classification (Feature vs Bugfix vs Scene Layout / Asset-Only)

Not all `impl/*` PRs are feature PRs. Three categories with different expectations:

**Bugfix/compile-fix PRs** (e.g. "Fix N compile-blocking errors", "Fix Godot 3→4 API migration"):
- Test files in diff: not required — the existing tests are the verification
- Design doc / GDD updates: not required — the design hasn't changed
- GDD update post-merge: skip — compile fixes don't change design
- **How to identify**: PR title/branch/DESIGN doc keywords like "Fix", "compile", "migration", "error", "broken". Parent issue `bug` label.

**Scene layout / asset-only PRs** (e.g. "Add 4 component instances to street.tscn at authored coordinates") — PRs containing **only** `.tscn`, `.tres`, `.png`, `.glb`, `.wav`, or other non-script asset files, with zero GDScript/JS changes:
- Test files in diff: **not required** — the component scenes being placed were already tested in prior PRs (e.g. `test_text_component_library.gd` covers the component behavior). Coordinates and positions are verified by the editor / DESIGN doc inspection.
- The PR's test verification is the existing test suite — if all existing tests pass (or only pre-existing failures), the placement does not break anything.
- Design doc / DESIGN doc: **still required** — the DESIGN doc must pre-exist and list the exact coordinates/parameters being authored. The implement PR is a config-placement exercise, not a design decision.
- GDD update post-merge: depends on significance — adding instances of existing components to a scene usually does not warrant GDD changes. Only create GDD entries if the placement introduces a new gameplay-affecting system.
- **How to identify**: `gh pr diff <N> --name-only` returns only asset/scene files. No `.gd`, `.js`, `.ts`, `.py` files in the diff. The PR title often says "place", "add", "position", "layout", "arrange".

**Feature PRs** (anything not covered above):
- Test files in diff: mandatory — at least one test file must change
- Design doc / GDD updates: mandatory unless DESIGN doc was pre-created (Scenario A)
- GDD update post-merge: required after merge

See `references/compile-fix-pr-example.md` for a concrete walkthrough of a compile-fix PR review (PR #133, Issue #130).

### Pre-Existing CI Failures

If CI was configured with `continue-on-error: true`, plan-phase tests may have bugs that never ran. The review agent's test run may reveal these. They are NOT the implement PR's fault. Document and escalate — do NOT merge around them.

**⚠️ Pitfall: CI exit code captured from pipe, not Godot.** A common bug in GitHub Actions workflows:

```yaml
- name: Run GDScript tests
  run: |
    godot --headless --script tests/run_tests.gd 2>&1 | tee test-output.log
    echo "exit_code=$?" >> $GITHUB_OUTPUT   # ❌ Captures tee's exit, not godot's!
```

`$?` after a pipe captures the **last** command (`tee`), which always exits 0. Use `${PIPESTATUS[0]}` instead to capture the first command in the pipeline:

```yaml
- name: Run GDScript tests
  run: |
    godot --headless --script tests/run_tests.gd 2>&1 | tee test-output.log
    echo "exit_code=${PIPESTATUS[0]}" >> $GITHUB_OUTPUT   # ✅ Correct
```

This is a silent-failure mode: test failures are logged but never block the workflow. Always check the CI workflow file for this pattern when CI shows success but local tests fail. See `references/ci-exit-code-capture-bug.md`.

### GDD Update Race with Other PRs

When two implement PRs merge close together, their GDD updates can conflict. Each review agent should read the current GDD before writing, not the version at the time their PR was created. Use `git pull origin <default-branch>` before editing GDD files.

### Post-Merge Working Tree

After `gh pr merge --squash --delete-branch`, the local git state has:
- Default branch checked out
- But the working tree still shows the old content until `git pull`

Always do `git pull origin <default-branch>` before editing GDD files.

## Environment

- `GITHUB_TOKEN` — GitHub PAT with repo scope (in `~/.hermes/.env`)
- `GH_TOKEN` — same token (gh CLI fallback)
- Default branch: check `game-env/manifest.yaml` for override (common: `main`, `master`)
