# Workflow Self-Containment Principle

> **"If the workflow is correct, you don't need branch protection. If it's wrong, branch protection just masks the bug."**

## The Principle

The agent workflow must be **self-contained** — every safety-critical decision (merge, label advance, CI failure handling) must be enforced by the agent chain itself, not by external GitHub settings.

| Approach | Problem |
|----------|---------|
| ❌ "Branch protection will block bad merges" | Hides bugs in agent logic. Workflow appears to work but only because GitHub silently caught it. When the repo is moved or settings change, the workflow silently breaks. |
| ✅ "The agent chain handles all outcomes explicitly" | Every path is coded: CI passes → review → merge; CI fails → self-correct; review fails → block. No path is left to an external safety net. |

## History

This principle was established 2026-07-12 when K rejected branch protection with:
> "GitHub 层加上 branch protection，我不打算这么做，因为这样会让你觉得有退路"

The rejection was not about the config effort — it was about **defect hiding**. Branch protection makes a broken workflow look correct by masking its failures. The correct fix was to fix the workflow.

## The Three Fixes That Replaced Branch Protection

| Problem | Old Thinking | Self-Contained Fix |
|---------|-------------|-------------------|
| CI failed but PR merged | "Add branch protection to block merges on CI failure" | Remove auto-merge from implement agent. Cron spawns review on CI success, self-correct on CI failure. |
| Review skipped entirely | "Add a required review status check in GitHub settings" | Review is now a pre-merge gate in the cron -> review-agent chain. No external policy needed. |
| Self-correct never triggered | "GitHub should have blocked the merge" | Fix the race: implement agent creates PR and stops. CI completes before merge is even attempted. |

## Enforcement

When evaluating any workflow fix, prefer the self-contained approach:

1. **Can the agent chain enforce this without GitHub settings?** If yes, do that. No external safety nets.
2. **Is there an unhandled path?** Every event type + conclusion combination must have an explicit action. No "do nothing" paths. No "GitHub will catch it" assumptions.
3. **Does the fix address the root cause in the agent logic?** Or does it add a guardrail that masks a deeper bug? If the latter, fix the root cause first.
4. **Branch protection is informational only.** It can be set as a visual indicator, but the workflow must work correctly without it.
