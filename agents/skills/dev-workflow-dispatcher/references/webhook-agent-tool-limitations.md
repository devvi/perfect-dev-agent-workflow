# Webhook Agent Tool Limitations

**Critical constraint discovered in production:** The Hermes webhook platform spawns agent sessions with a RESTRICTED toolset. The webhook agent CANNOT use `terminal`, `delegate_task`, or `process`.

## What Works in a Webhook Agent Session

- `web_search` — search the web
- `web_extract` — extract content from URLs
- `clarify` — ask the user a question

## What Does NOT Work

- `terminal` — cannot run shell commands (gh, git, npm, curl)
- `delegate_task` — cannot spawn sub-agents
- `process` — cannot manage background processes
- `execute_code` — cannot run Python scripts

## Why This Matters

The initial `dev-workflow-dispatcher` design assumed the webhook agent would:
1. Run `gh` commands to add labels/comments
2. Spawn research/plan/implement/review agents via `delegate_task`
3. Manage git branches and PRs

**None of these work from a webhook agent session.**

## The Solution: Route Scripts

Use `--script` on `hermes webhook subscribe` instead. The route script:

1. Runs as a LOCAL process (bash/Python) with FULL system access
2. Receives the webhook payload on stdin
3. Can use `gh`, `git`, `curl`, `npm`, any CLI tool
4. Outputs JSON to stdout → replaces the payload for the agent
5. The agent can then use its tools (web_search, web_extract) for LLM analysis

```bash
hermes webhook subscribe <name> \
  --events "issues,pull_request,check_run" \
  --script "workflow-dispatcher.py" \
  --deliver log
```

## Recovery Pattern

If a webhook agent runs and reports "I don't have terminal or delegate_task tools":

1. Don't try to work around it — the tools really aren't there
2. Switch to route script approach
3. The route script handles all system operations
4. (Optional) Keep the skills loaded for post-script agent analysis

## Tested With

- Hermes Gateway webhook platform (route script confirmed working: adds labels, comments, creates git branches, opens PRs, calls OpenCode API)
