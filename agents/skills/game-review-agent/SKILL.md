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

**⚠️ Operator race condition (2026-07-23):** The operator agent may merge implement PRs before the check_run webhook triggers this review agent. If you are spawned but the PR is already merged, report "PR already merged, review skipped" and exit. The root fix is in the operator's merge logic (depth-check), not in this agent. See `references/review-agent-race-condition.md`.

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

### 2. Run Tests Locally
```bash
# Godot projects (grep for results — Godot headless mode emits cleanup
# warnings like RID/Resource leaks AFTER the test summary, so `tail`
# alone catches noise instead of results):
godot --headless --script tests/run_tests.gd 2>&1 | grep -E '(PASS|FAIL|passed|failed|Test|Summary)' | tail -20

# JS/Node projects:
npx vitest run 2>&1 | tail -5
```
- All tests must pass
- If tests fail: check if failures reproduce on the default branch (`git checkout default-branch && run tests && git checkout -`). If they do → pre-existing, document in PR comment, do NOT merge.

### 3. Verify Test Files Updated
```bash
gh pr diff <N> --name-only | grep -i test
```
- At least one test file should be in the diff — **except for bugfix/compile-fix PRs**
- **Bugfix/compile-fix PRs** (e.g. title says "Fix N compile-blocking errors", "fix typos", "fix API migration"): no test changes is acceptable. The fix IS making the project compile so existing tests can run. Run the existing tests instead as verification — if they all pass, the fix is validated.
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
- Issues found → REQUEST_CHANGES with specific items, do NOT merge

### 6. Merge Decision

| Condition | Action |
|-----------|--------|
| All checks pass | Merge via `gh pr merge <N> --squash --delete-branch` |
| Pre-existing failures only (reproduce on default branch) | Add PR comment documenting findings. Do NOT merge. Escalate. |
| CI failure (shouldn't happen — review is only called on success) | Do NOT merge. Report to user. |
| PR merge conflicts | Report. Skip. |

### Merge Pitfall: Stash First

```bash
# gh pr merge tries to check out the target branch locally.
# If there are uncommitted changes, it fails.
git stash
gh pr merge <N> --squash --delete-branch
git stash pop 2>/dev/null
```

## Post-Merge: GDD Update

After the PR merges, update the Game Design Document (GDD) in `docs/GAME_DESIGN/`. The review agent is the ONLY agent that updates the GDD — it happens AFTER merge, not before.

### Which GDD Files to Update

Read the DESIGN doc (`docs/DESIGN/<N>-*.md`) for the specific feature. It mentions which GDD files need updating. Common targets:

| GDD File | Covers | Check When |
|----------|--------|------------|
| `01-OVERVIEW.md` | Game overview, elevator pitch | Any major feature |
| `02-MOVEMENT.md` | Movement, collision (not in Godot project) | Movement changes |
| `03-COMBAT.md` | Combat (not in Godot project) | Combat changes |
| `04-RENDERING.md` | Visual rendering (not in Godot project) | Visual changes |
| `05-DIALOGUE.md` | Dialogue engine, NPC framework | Dialogue, NPC features |
| `06-NARRATIVE.md` | Narrative architecture, scene flow | Story scenes, NPC interactions |
| `07-AUDIO.md` | Audio system (not in Godot project) | Audio changes |
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

### INDEX.md Pipe-Formatting Pitfall

When adding a row to INDEX.md's markdown table, use `write_file` to rewrite the entire INDEX.md rather than `patch` to insert a single row. The patch tool's fuzzy matching can produce `|||` (triple pipes) instead of `||` (double pipes), breaking the table. This is safest because INDEX.md is small (~25 lines) and `write_file` guarantees clean formatting.

## Notification

After merging and GDD update, POST a Feishu notification:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"msg_type":"text","content":{"text":"✅ #N → <feature name> merged → 🚀"}}' \
  https://open.feishu.cn/open-apis/bot/v2/hook/76101281-b359-49ab-ae2f-fc486bf65958
```

Format: One line, emoji prefix, no explanations.

## Known Pitfalls

### PR Type Classification (Feature vs Bugfix)

Not all `impl/*` PRs are feature PRs. **Bugfix/compile-fix PRs** (e.g. "Fix N compile-blocking errors", "Fix Godot 3→4 API migration") have different expectations:
- Test files in diff: not required — the existing tests are the verification
- Design doc / GDD updates: not required — the design hasn't changed
- GDD update post-merge: skip — compile fixes don't change design

**How to identify a bugfix PR**: Check the PR title, branch name, and the DESIGN doc. Keywords like "Fix", "compile", "migration", "error", "broken" in the title or branch suggest it's a bugfix. The DESIGN doc for a bugfix typically lists errors and their fixes, not new features.

If you're uncertain, check the parent issue's labels for `bug` label.

See `references/compile-fix-pr-example.md` for a concrete walkthrough of a compile-fix PR review (PR #133, Issue #130).

### Pre-Existing CI Failures

If CI was configured with `continue-on-error: true`, plan-phase tests may have bugs that never ran. The review agent's test run may reveal these. They are NOT the implement PR's fault. Document and escalate — do NOT merge around them.

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
