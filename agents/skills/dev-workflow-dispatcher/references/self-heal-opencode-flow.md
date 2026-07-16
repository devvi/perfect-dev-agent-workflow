# Self-Heal via OpenCode (CI Failure Recovery)

> When CI fails on an `impl/*` branch, the self-heal flow sends the error to the
> existing OpenCode session instead of spawning a new agent.

## Flow

```
CI failure → check_run.completed webhook
  → route script (writes to pending with branch + conclusion)
  → cron reads pending
  → finds check_run event with conclusion="failure"
  → sends error to OpenCode session via REST API:
    POST /session/<session-id>/message
    {"parts":[{"type":"text","text":"CI failed: <error>. Fix and push."}]}
  → OpenCode fixes → git push → CI re-runs
```

## Key Points

- **Use existing OpenCode session** — the implement agent created one. If no session exists, spawn a self-correct agent as fallback.
- **Max 3 attempts** — after 3 failures, mark `status/blocked`.
- **Branch targeting** — only process `check_run` events on `impl/*` branches. Ignore `research/`, `plan/`, and `master` branches.
- **Route script** captures `head_branch` and `conclusion` from the check_run payload.
- **E2E play test failures** are also caught here — `play-test.mjs` exits non-zero on errors → CI fails → self-heal fires.
