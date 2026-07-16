# Case Study: Event Pileup Recovery (#118 → Plan Phase)

> Date: 2026-07-11 | Issue: #118 (Enemy Attack Iteration) | PR: #119 (Research)

## What Happened

The cron poller was either not running or not processing events for ~7.5 hours.
When it finally fired (this session), the pending file contained **6 events**
covering 3 different PR/issue states:

| Event | Actual State at Poll Time | Stale? |
|-------|--------------------------|--------|
| `pull_request.opened#119` | PR #119 was MERGED | ✅ Stale |
| `pull_request.labeled#119` | PR #119 was MERGED | ✅ Stale |
| `pull_request.edited#119` | PR #119 was MERGED | ✅ Stale |
| `pull_request.closed#119` | PR #119 was MERGED (the close event lags creation) | ✅ Stale |
| `issues.labeled#118` (workflow/plan added) | Issue #118 has `workflow/plan` — still accurate | ❌ Active |
| `issues.unlabeled#118` (workflow/research removed) | Confirms removal — informational only | ⚠️ Redundant |

## Timeline

```
2026-07-10 16:52    Issue #118 created, labeled workflow/research
2026-07-10 16:54    Research agent creates PR #119
2026-07-10 16:55:05 PR #119 opened (webhook → pending file event #1)
2026-07-10 16:55:06 PR #119 labeled (webhook → pending file event #2)
2026-07-10 16:55:33 PR #119 body edited (webhook → pending file event #3)
2026-07-10 16:55:43 PR #119 MERGED (research agent auto-merges ~38s after creation)
2026-07-10 16:55:45 workflow-chain.yml runs on merge, advances issue #118 to workflow/plan
                     → issues.labeled + issues.unlabeled webhooks (pending events #5, #6)
                     ─── ALL 6 EVENTS NOW IN PENDING FILE ───
2026-07-10 16:55    ─→ Cron job should fire within ~60s but does NOT
... ~7.5 hours ...
2026-07-11 00:31    Last recorded processed_at timestamp (some other session?)
2026-07-11 ??       Cron fires (this session), finds 6 events
```

## Handling Pattern

1. **Read all events** — don't stop at the first stale one
2. **Validate each against actual GitHub state** — use `gh pr view` and `gh issue view`
3. **Classify** stale vs active — note that `issues.unlabeled` is redundant if the
   `issues.labeled` for the same phase already confirms the current state
4. **Handle active events** — in this case, spawn an operator agent for the plan phase
5. **Batch-clear** all events after handling (including stale ones)
6. **Report one line** per meaningful action — `📋 #118 → plan`

## Key Insight: labels.labeled Arrives AFTER PR Merge

The `workflow-chain.yml` GitHub Action runs on `pull_request.closed`, not on the
PR merge itself. So the typical sequence is:

```
PR merged → workflow-chain.yml fires → adds next label to ISSUE → issues.labeled webhook
                                                                  → pending file
                                                                  → cron poller spawns next agent
```

This means the `issues.labeled` event is always the LAST event in the sequence
and the one that actually advances the workflow. All prior `pull_request.*` events
for the same PR will be stale by the time `issues.labeled` arrives.

## Operational Lesson

If the cron poller is not running (e.g., `hermes cron list` shows no active jobs),
the entire workflow pipeline stalls. The first event that should tip you off:
an issue with `workflow/research` label but no PR created after 2+ minutes, or
an issue with `workflow/plan` label and the `workflow-chain.yml` action log
showing the label was applied but no agent spawned.

**Recovery:** When the cron fires after a long gap, expect a batch of events.
The vast majority (>80%) will be stale. Focus on the most recent `issues.labeled`
event for each unique issue number — that's almost certainly the active one.
