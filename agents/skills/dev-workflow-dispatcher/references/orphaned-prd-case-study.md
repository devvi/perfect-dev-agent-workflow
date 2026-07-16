# Orphaned Phase Output — Case Study (Issue #163, 2026-07-14)

## Scenario

Issue #163 (`[Bug] 撞普通墙后生成的食物位置有误`) had label `workflow/research` but no research PR existed. The stalled phase scan found no PRs referencing this issue at all. However, a complete PRD file existed on disk at `docs/PRD/163-wall-bounce-food-position.md` (185 lines) — untracked (`git status` showed `??`).

The research agent had been spawned, completed its work (wrote a thorough PRD), but crashed or was killed *before* committing and creating a PR.

## Discovery Path

1. **Label scan**: Issue #163 has `workflow/research` but no `research/163-*` branch or PR
2. **File scan**: `ls docs/PRD/163-*.md` returned the file
3. **Git status**: `git status --short docs/PRD/163-wall-bounce-food-position.md` → `??` (untracked)
4. **Conclusion**: Research agent's output exists but was never committed → commit + PR it instead of regenerating

## State at Detection

| Check | Result |
|-------|--------|
| Issue #163 | OPEN, labels: `bug`, `depth/light`, `workflow/research` |
| Research branch | None |
| Research PR | None |
| PRD on disk | `docs/PRD/163-wall-bounce-food-position.md` — 185 lines, untracked |
| Content quality | Complete PRD with: root cause analysis, solution with code diff, edge cases, implementation plan |
| Pre-existing research | None in git history; PRD was pure output of the previous research agent run |

## Root Cause

The research agent was spawned (either by a previous cron cycle or manually), wrote the PRD file to disk, but was killed or hit its turn limit before:
1. Running `git add docs/PRD/163-wall-bounce-food-position.md`
2. Creating a `research/163-...` branch
3. Creating a PR
4. Merging the PR
5. Advancing the label

The evidence (the PRD) was left on disk as an untracked file, invisible to GitHub and the normal PR-based stalled scan.

## Resolution

Instead of spawning a fresh research agent (which would redo the same analysis and produce a near-identical PRD), the correct approach is:

```python
# 1. Stash any unrelated changes
git stash push -m "cron-stash-before-orphan-163"

# 2. Create a research branch from master
git checkout master && git pull origin master
git checkout -b research/163-墙撞食物位置修正

# 3. Add the orphaned file
git add docs/PRD/163-wall-bounce-food-position.md

# 4. Commit and push
git commit -m "docs: PRD for wall bounce food position fix (Issue #163)"
git push origin research/163-墙撞食物位置修正

# 5. Create PR
gh pr create \
  --title "Research: 撞普通墙后生成的食物位置有误 (parent #163)" \
  --body "Parent #163" \
  --base master

# 6. Merge (research PRs auto-merge at light depth)
gh pr merge <N> --squash --delete-branch

# 7. Advance label
gh issue edit 163 --remove-label workflow/research --add-label workflow/plan
```

## Preventative: Add Pre-Spawn File Check

The stalled phase detection should check for orphaned files *before* spawning a new agent. Patch added to the skill at section "Proactive Stalled Phase Start Detection", step 2a.

## Related Patterns

| Pattern | Case Study | Signature |
|---------|-----------|-----------|
| Zero-diff branch stub | Issue #154 | `git branch -a` shows `impl/N-slug` but git diff = 0 changes |
| Orphaned output file | Issue #163 | `ls docs/PRD/N-*.md` returns a file, `git status --short` shows `??` |
| Neither (truly stalled) | Issue #162 | No PR, no branch, no files — needs fresh agent spawn |

## Key lesson

`git status --short` on output directories is a **zero-cost check** that catches the orphaned-files case before spending agent tokens on regeneration. Always run it before spawning a phase agent for a stalled phase.
