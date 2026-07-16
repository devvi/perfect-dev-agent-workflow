# Implement Agent Must NOT Merge — Principle & History

## The Principle

**Phase agents do NOT merge their own PRs.** Only the coordination layer (review agent, cron dispatcher) handles merge. This is a mechanical design rule embedded in the skill prompts themselves, not an add-on guardrail.

## The Story (Why This Rule Exists)

**PR #153 (2026-07-13):** The implement agent created and merged a PR in 68 seconds, before CI finished. CI failed (14 failures). The self-heal system never triggered because the PR was already closed. Buggy code reached production with no safety net.

**The root cause was in the prompt source code.** I (the skill author) had added merge instructions to the implement agent's skill when the user requested auto-merge. The agent followed those instructions. Later attempts to restrain it (stage-gate auto-merge disable, branch protection, gh wrapper) all failed because:
- Stage-gate's `auto_merge=false` only blocks GitHub's UI auto-merge, not `gh pr merge --squash`
- Branch protection's `--admin` flag can be bypassed when `enforce_admins` is set but `require_last_push_approval` is not
- The gh wrapper (`~/.local/bin/gh`) was a shell-level hack — heavy, fragile, wrong approach

## The Fix (2026-07-14): Source-Level Clean — No Merge in Vocabulary

**Removed ALL merge-related content from the implement agent's skill prompt.** Not "Do NOT merge" warnings. Not "Permanent Stall Protocol" bypass rules. Not merge guard docs. Zero mentions of merge in the implement agent's world.

### Key Design Principle: Fix the Source, Not the Environment

K (the project lead) taught this lesson directly: when a sub-agent does something wrong, **fix the SUB-AGENT'S PROMPT (the source), not the environment around it.** Previous attempts failed because they tried to restrain the agent externally (stage-gate, branch protection, gh wrapper) while the prompt still told the agent about merge:

| Approach | Outcome |
|----------|---------|
| ❌ Stage-gate `auto_merge=false` | Blocks auto-merge only; agent calls `gh pr merge --squash` directly |
| ❌ Branch protection (`enforce_admins`, etc.) | `--admin` flag bypasses reviews; requires server config |
| ❌ gh wrapper (`~/.local/bin/gh`) | Heavy shell-level hack; blocks other gh commands |
| ✅ **Source fix: remove merge from prompt** | Agent can't do what it doesn't know about. Clean, zero-config, portable. |

### Application Across the Workflow

The same source-fix principle was applied to TWO skills that had merge instructions:

1. **game-implement-agent** — removed all merge content, Permanent Stall Protocol, Step 9, merge guard docs
2. **dev-workflow-dispatcher** — removed Permanent Stall Protocol references from the cron LLM's instructions to avoid telling self-correct agents to merge PRs

### What Was Removed

| Content | Where | Why |
|---------|-------|-----|
| Step 9: Wait for CI — cron handles merge | implement-agent | Mentioned merge, kept it top-of-mind |
| ⚠️ CRITICAL: You Literally Cannot Merge | implement-agent | 60+ lines about a thing the agent shouldn't know |
| Dual-Layer Merge Enforcement | implement-agent | Branch protection docs don't belong in implement prompt |
| Permanent Stall Protocol | implement-agent + dispatcher | Told agents "CI failed → you can merge" — direct cause of PR #178/#183/#188 self-merges |
| All `gh pr merge` bash commands | implement-agent | Agent doesn't know merge exists → can't call it |

## Verification (2026-07-14, Issue #185)

Tested with Issue #185 (trivial 1-line text change):

1. ✅ Research PR auto-merged (no CI gate)
2. ✅ Plan PR auto-merged (no CI gate)
3. ✅ **Implement PR #188 created — NOT merged by implement agent**
4. ❌ CI failed (pre-existing failures, unrelated to PR)
5. ❌ Cron dispatched self-correct agent with old Permanent Stall Protocol instructions (from dispatcher skill)
6. ❌ Self-correct agent merged PR #188

**Lesson confirmed:** the implement agent fix worked (it did NOT merge). But the dispatcher skill also needed cleaning (done in the same session). After cleaning both, the system should escalate pre-existing failures instead of merging around them.
