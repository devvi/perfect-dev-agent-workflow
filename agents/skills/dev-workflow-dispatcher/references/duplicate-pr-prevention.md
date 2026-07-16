# Duplicate PR Prevention

## Problem

The operator agent can spawn duplicate research/plan PRs for the same issue when:
- Two concurrent cron ticks spawn two operator agents
- An `issues.labeled` event arrives before the previous event's agent finishes
- The webhook delivers the same event twice (rare but possible)

This wastes CI resources and can cause the **worse PR to be merged** while the better one is closed (as happened with #122: the research PR with Obsidian search was closed in favor of a basic template).

## Detection

Before creating any branch or PR, check:

```bash
# Check if a branch with this prefix already exists
git ls-remote --heads origin research/<N>-* | wc -l
git ls-remote --heads origin plan/<N>-* | wc -l
git ls-remote --heads origin impl/<N>-* | wc -l

# Check if a PR for this issue already exists
gh pr list -S "<N> in:title or <N> in:body" --state open --json number --jq 'length'
```

## Prevention Rules

1. **Check first, create second** — always check for existing branch/PR before creating
2. **If branch exists but no PR** — push to existing branch, don't create a new one
3. **If both branch and PR exist** — skip entirely, the previous agent handled it
4. **If branch exists with a different approach** — compare quality (Obsidian content, size). If the existing one is worse AND still open, close it and create a new one. But this is risky — default to keeping the first one.
5. **Race window** — the 1-minute cron interval is the minimum gap. If an event creates a PR in under 60s, the next cron tick won't spawn a second agent for the same event (pending dedup handles this).
