# Concurrent Issue Processing

## Current Limits

| Resource | Limit | Source |
|----------|-------|--------|
| delegate_task sub-agents | 3 | `_DEFAULT_MAX_ASYNC_CHILDREN = 3` |
| RPi RAM | ~5 concurrent sessions | 2.5GB free, ~500MB/session |
| OpenCode Serve | 1 (serial codegen) | Single instance on :18765 |
| Pending file | N issues × N events | Locked with fcntl.flock |
| Cron LLM context | ~3-5 events/session | Prompt + event list < 2KB |
| GitHub API | 5000 req/h | Currently ~72/h used |

Hard limit: **3** (delegate_task max_async_children).

## Bottlenecks (in priority order)

### 1. delegate_task Pool (3 slots)

Each phase agent (research, plan, implement) occupies one delegate_task slot. Three issues in parallel = all 3 slots used. No agent can start until one finishes.

**Workaround:** If 3 concurrent implement agents are all doing OpenCode calls (which are slow), a simple research/plan agent won't be able to start. Consider raising `max_concurrent_children` in `~/.hermes/config.yaml` when deploying to high-end hardware.

### 2. OpenCode Serve (serial codegen)

OpenCode processes one code generation request at a time. Two concurrent implement agents both try to POST to the same session or create separate sessions — OpenCode serializes internally. Not a bottleneck for 2-3 issues, but at 5+ issues the implement phase becomes blocking.

### 3. Pending File Lock (fcntl.flock)

Lock serializes write access but the read-modify-write cycle is fast (< 50ms). Not a bottleneck at any realistic webhook rate.

## Timing Model

| Phase | Typical Duration | Concurrent Scalability |
|-------|-----------------|----------------------|
| Research | 30s - 5min (spawn → PR merge) | High (mostly LLM reasoning) |
| Plan | 10s - 2min (spawn → PR merge) | High (mostly doc writing) |
| Implement | 2min - 15min (code + CI + review) | Low (CI is per-PR, parallel) |

3 issues in parallel: ~15-20 min total (vs ~30 min serial).

## Config for Production (high-end)

```yaml
# ~/.hermes/config.yaml
delegation:
  max_concurrent_children: 6    # Allow more parallel agents
  max_spawn_depth: 2
  orchestrator_enabled: true
```

Also ensure:
- GitHub branch protection is enabled (prevents CI-failed merges in parallel)
- Optional: GitHub Merge Queue for automatic conflict resolution
