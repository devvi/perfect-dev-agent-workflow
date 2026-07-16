# Self-Correct Dedup (2026-07-15)

## Problem

Multiple `check_run.completed` events for the same PR can spawn duplicate self-correct agents. Observed at 2026-07-15 ~01:36: two self-correct agents ran concurrently for PR #211 (issue #200), one reading the correct implement skill, the other cross-contaminating by trying to open test files from a different issue's branch.

## Root Cause

The event-processor deduplicates by `_key` (`check_run.completed#<N>:<conclusion>`). If a CI re-run produces a new check_run with the same key, the route script skips it. BUT: the dedup happens BEFORE the check_run's action is complete — the route script stores `check_run.created#211:` (conclusion=null), then `check_run.completed#211:failure` (different key). Both go through.

The event-processor then outputs `SPAWN: self-correct,issue=200,...` for the completed event. The LLM spawns a self-correct agent. Meanwhile, the CI re-runs trigger another `check_run.completed#211:failure` event — same key, dedup blocks it. So only one new SPAWN per CI run. That's correct.

**But the issue was:** OLD events still in pending from BEFORE the event-processor was updated to map parent issues. The cron tick processed the fixed SPAWN AND the LLM spawned a new self-correct, but a previous tick had already spawned one from the old SPAWN format. Two self-correct agents for the same issue.

## Fix

1. Event-processor now clears processed events from the pending file after outputting SPAWN
2. Script uses atomic write (`tempfile + rename`) to prevent race conditions
3. Self-correct agent context now includes `issue` (parent) and `pr` (PR) fields so the agent can verify it's working on the right issue

## Detection

```bash
grep "self.correct|self-correct" ~/.hermes/logs/agent.log | tail -5
# If two consecutive self-correct agents spawned for the same issue within
# the same minute, the dedup is broken.
```

## Prevention

- Always clear processed events from pending after SPAWN generation
- The LLM should check if a self-correct agent is already running before spawning another (hard to enforce without a process registry)
