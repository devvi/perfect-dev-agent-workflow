# Stalled Phase Start — Case Study (Issue #154, 2026-07-13)

## Scenario

Issue #154 (`[Bug] 蛇撞到墙后，血量没有正常减扣`) had its research and plan PRs merged successfully. The label had auto-advanced to `workflow/implement` via `workflow-chain.yml`. But no implement PR was ever created — the phase never started.

## Discovery Path

The cron poller (running `every 1m`) found:

1. **Pending file:** Empty (`{"events": []}`) — no webhook events to process
2. **Proactive label advancement scan:** No stalled labels found (label was correct for the merged PRs)
3. **Proactive stalled PR scan:** No open PRs at all — nothing stalled
4. **Proactive phase start scan (the new check):** Found Issue #154 with `workflow/implement` label but no implement PR

## State at Detection

| Check | Result |
|-------|--------|
| Issue #154 | OPEN, labels: `bug`, `workflow/implement` |
| Research PR #155 | MERGED at 15:45 UTC (body: `parent #154`) |
| Plan PR #156 | MERGED at 15:49 UTC (body: `Parent #154`) |
| Implement PR | **None** — no open or merged PR with `impl/154` in headRefName |
| Local branch | `impl/154-wall-damage-health-loss` existed but **zero diff** from master (commit 606ab2b, same as master HEAD) |
| OpenCode | HTTP 200 (reachable) |
| Design docs | PRD, DESIGN, TASKS all present |
| Test count | 358 total (335 pass, 8 fail, 15 todo) |
| Pre-existing failures | 8 failures on master — 2 are Bug #154 bug-documenting tests (expected), 6 are from Issue #46/#70 |

## Root Cause Analysis

The implement phase stalled because:

1. **The label advanced correctly** — `workflow-chain.yml` ran after plan PR #156 merged and advanced the label to `workflow/implement`
2. **No operator agent handled the label advancement** — the `issues.labeled` event was either lost (webhook delivery failure) or the operator agent crashed before spawning the implement agent
3. **A stale branch stub was created** — something (a crashed operator agent, or a partial run) created the local branch `impl/154-wall-damage-health-loss` from master, but never committed any code. The branch was a bare pointer to the same commit as master with zero changes.

## Cleanup Before Spawn

Before spawning the implement agent, the cron poller needed to:

```bash
# 1. Stash any uncommitted workspace changes
git stash push -m "cron-stash-before-impl-154"

# 2. Switch to master and pull latest
git checkout master && git pull origin master

# 3. Delete stale zero-diff branch
git branch -D impl/154-wall-damage-health-loss
```

Without this cleanup, the implement agent's `git checkout -b impl/154-...` would either fail (branch already exists) or produce a mixed state.

## What Could Go Wrong During Spawn

| Risk | Mitigation |
|------|-----------|
| Implement agent double-created if webhook event arrives late | Pre-spawn check for existing PR is required |
| Stale branch still exists causing branch-creation failure | Delete stale branch before spawning |
| Uncommitted workspace changes contaminate branch | Stash before branching |
| Pre-existing test failures confuse implement agent | Include pre-existing failure breakdown in context |
| OpenCode down on spawn | Check OpenCode health before spawning |

## Feishu Notification Format

For auto-detected phases (not webhook-triggered), append a descriptive parenthetical:

```
📋 #154 → implement (auto-detected stalled phase)
```

This lets the receiver distinguish between normal webhook-triggered flow and proactive recovery. Do NOT use this format for webhook-triggered phases — those use the simple `📋 #N → phase` format.

## Success Criteria After Spawn

The implement agent should:
1. Create a clean branch from master
2. Implement the DESIGN doc changes (core.js import + wall-damage block)
3. Update test assertions (Issue #46, Issue #70 tests)
4. Run `npm run test` to verify
5. Push branch and create PR with body `Parent #154\nCloses #154`
6. NOT merge — CI review handles that
