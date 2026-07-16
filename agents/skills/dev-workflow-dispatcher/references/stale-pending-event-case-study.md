# Case Study: Stale `pull_request.synchronize` Event (#117)

> Date: 2026-07-10 | Issue: #113 (Invisible Wall Death Bug) | PR: #117

## What Happened

1. Implement agent pushed code to `impl/113-invisible-wall` branch
2. GitHub sent `pull_request.synchronize` webhook
3. Route script wrote event to `workflow-pending.json`
4. Implement agent (with terminal access) verified tests, merged PR #117, and closed issue #113 — all within ~60 seconds
5. Cron poller picked up the pending event — PR was already merged, issue already closed

## Diagnosis

The event was stale. The 1-minute polling interval is longer than the implement agent's "verify → merge → close" cycle.

## Trace

```
Pending event:                          pull_request.synchronize#117 (at ~15:57:09)
Implement agent merges PR #117:         15:58:04 (confirmed via gh pr view)
Issue #113 closed:                      15:58:31 (confirmed via gh issue view)
Cron poller runs:                       16:00:00 (60s after webhook)
```

## What the Cron Job Did Right

1. Read the pending file and found the event
2. Checked actual GitHub state first (PR was already MERGED)
3. Did NOT spawn an operator agent for an already-complete task
4. Cleared the pending file after confirming staleness
5. Reported `[SILENT]` (nothing new to do)

## What the Skill Was Missing (Before This Patch)

The original skill had no guidance on `pull_request.synchronize` event handling,
and no pitfall about stale events. The event flow section only covered:
`issues.opened`, `issues.labeled`, `pull_request.closed`, `check_run.completed`.

This left the cron job with no documented procedure for the most common
event type that arrives on open PRs.

## Lesson

**Every pending event must be validated against current GitHub state before action.**
The route script writes events instantaneously; the cron job reads them up to 60s
later. In that window, the implement agent — which has terminal access and can run
`gh pr merge` directly — may have already completed the work.
