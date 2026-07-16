# False Dispatch Record — 2026-07-14 Trace

## Scenario

The cron poller's stalled scan detected PR #170 (Issue #163) had a CI failure
that was never handled (lost `check_run.completed` event). When reading the
pending file (`~/.hermes/workflow-pending.json`), it contained:

```json
{
  "events": [],
  "stalled_scan": "dispatched self-correct for PR #170 (Issue #163)",
  "checked_at": "2026-07-14T08:35:18Z"
}
```

This indicated a **previous cron cycle had claimed to dispatch a self-correct
agent**, but:

1. PR #170 still had CI failures (5 regressions from bounce food tail-pop)
2. No fix commits existed on the PR branch
3. No self-correct comments on the PR
4. The CI failure was still present and unaddressed

## Root Cause

The previous cron cycle wrote `"stalled_scan": "dispatched self-correct for PR #170"`
to the pending file but **never actually called `delegate_task`**. Two possible causes:

1. **LLM recorded intent but skipped action:** The cron prompt says to write the
   record AND spawn the agent. The LLM performed the first step (writing) but not
   the second (delegate_task). This is a prompt-level attention failure.

2. **Crash between write and spawn:** The cron process crashed or was terminated
   between the `write_file` and `delegate_task` calls. Since the pending file record
   was written before the agent was spawned, the record survives but the spawn
   didn't.

## Lesson

**Never trust a self-correct dispatch record in the pending file.** Always verify
by checking for actual evidence of self-correct work:

- Fix commits on the PR branch (`git log --oneline origin/<impl/*> -5`)
- Self-correct comments on the PR (`gh pr view <N> --comments`)
- CI re-run evidence (newer check runs with different conclusions)

Only skip re-dispatching if you find concrete evidence of self-correct activity.
A record in the pending file is NOT sufficient evidence.

## Resolution

The cron cycle correctly identified the false record, verified by checking PR
state and CI status, and re-dispatched the self-correct agent via `delegate_task`.
The Feishu notification was re-sent.
