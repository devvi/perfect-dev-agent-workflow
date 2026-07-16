# Webhook Prompt Template Pitfalls

> Lessons learned from live testing of the workflow-dispatcher webhook on 2026-07-10.

## 1. Use `{__raw__}` NOT `{payload}` for Full Payload Dump

The template renderer resolves `{key}` by looking up `key` as a top-level field in
the payload dict. `{payload}` does NOT dump the entire event — it looks for a key
named `"payload"` in the webhook JSON, which doesn't exist in GitHub events.
The result: the agent sees literal `{payload}` text and no event data.

```yaml
# ❌ BAD: {payload} resolves as payload.get("payload") → undefined → literal "{payload}"
prompt: |
  ```json
  {payload}
  ```

# ✅ GOOD: {__raw__} is special-cased to dump the entire payload as JSON
prompt: |
  ```json
  {__raw__}
  ```
```

GitHub webhook event top-level fields include: `action`, `issue`, `pull_request`,
`repository`, `sender`, `hook`, `hook_id`, `installation`, `check_run`, etc.
These CAN be used directly: `{action}`, `{repository.full_name}`, `{hook_id}`.

## 2. (Legacy) Template Variables Are Event-Type-Specific — DO NOT Hard-Code

**Note:** If you use `{__raw__}` (section 1), this section doesn't apply — the agent parses the JSON itself. This section is historical reference for the old approach.

```yaml
# ❌ BAD: These variables only resolve for one event type
prompt: "Issue #{issue.number}: {issue.title}\nPR: #{pull_request.number}"
```
When a `check_run` event arrives, `{issue.number}` and `{pull_request.number}` are
`undefined` — the agent sees `Issue #: ` with no number and can't identify the issue.

```yaml
# ✅ GOOD: Use {__raw__} + tell the agent to parse it
prompt: |
  ```json
  {__raw__}
  ```
  Parse the JSON to determine event type and extract relevant data:<br>
  - issues events → `payload.issue.number`, `payload.issue.labels`<br>
  - pull_request events → `payload.pull_request.number`, `payload.pull_request.merged`<br>
  - check_run events → `payload.check_run.name`, `payload.check_run.conclusion`
```

## 2. `deliver: origin` Does NOT Work on the Webhook Platform

The webhook platform has no "source chat" to deliver responses to. Setting
`--deliver origin` (or `"deliver": "origin"`) causes every agent run to fail with:
```
Unknown deliver type: origin
```

The agent executes its tools but the response can't be delivered, and the agent's
actions (label edits, comments, spawns) are silently lost.

**Fix:** Use `"deliver": "log"` so the response is recorded but not dispatched:
```json
{
  "github-dev-workflow": {
    "deliver": "log"
  }
}
```

The webhook HTTP response is returned directly (200/202) regardless of deliver setting.
The agent's work (gh commands, delegate_task calls) happens during the run, not during
delivery — so `log` is safe.

## 3. HMAC Secret: Subscription-Level vs Gateway-Level

The Hermes gateway has a global secret (`platforms.webhook.extra.secret`) AND each
webhook subscription can have its own auto-generated secret. GitHub must use the
**subscription-level** secret, not the gateway-level one.

```bash
# Get the subscription's actual secret:
cat ~/.hermes/webhook_subscriptions.json | python3 -c "import sys,json; print(json.load(sys.stdin)['github-dev-workflow']['secret'])"

# Set this in GitHub webhook config:
gh api repos/<owner>/<repo>/hooks/<id> -X PATCH \
  -f config:secret="<subscription-secret>"
```

If the secrets don't match, GitHub gets `401 Invalid HTTP Response`.

## 4. Two ngrok Instances Collide on :4040

When both an old ngrok (from OpenClaw) and a new ngrok (from Hermes gateway) are
running, only the first one binds to the admin API port `:4040`. The second ngrok
auto-selects `:4041`.

```bash
# Check which ngrok is the active one:
ps aux | grep ngrok | grep -v grep
# PID 460894: /bin/bash ... start-ngrok-with-hook.sh  (OpenClaw — kill this)
# PID 469873: ngrok http http://localhost:8644            (Hermes — keep this)

# Kill stale ngrok:
kill 460894  # old OpenClaw ngrok PID

# Find the Hermes ngrok's admin port:
curl -s http://localhost:4041/api/tunnels | python3 -c "import sys,json; [print(f'{t[\"public_url\"]} → {t[\"config\"][\"addr\"]}') for t in json.load(sys.stdin)['tunnels']]"
```

## 5. Gateway Service Manages ngrok Automatically

The Hermes gateway spawns ngrok as a child process on startup. The command is
recorded in `~/.hermes/processes.json`. When you restart the gateway, the old
ngrok is killed and a new one spawns:

```bash
systemctl --user restart hermes-gateway
```

After restart, get the new ngrok URL (admin may be on :4040 or :4041) and update
GitHub webhook URL.

## 6. Webhook Agents Don't Have System Tools (Critical)

**This is the most important pitfall.** Hermes webhook agent sessions run with a
restricted toolset. The agent will explicitly state: "I don't have terminal or
delegate_task tools available" — this is NOT a hallucination, it's the truth.

| Tool | Available in webhook? | Available in chat/cron? |
|------|----------------------|------------------------|
| `terminal` | ❌ | ✅ |
| `delegate_task` | ❌ | ✅ |
| `process` | ❌ | ✅ |
| `execute_code` | ❌ | ✅ |
| `web_search` | ✅ | ✅ |
| `web_extract` | ✅ | ✅ |
| `clarify` | ✅ | ✅ |

**Fix:** Use route scripts (`--script`) for any task requiring system access.
The route script runs locally with full access; the Hermes agent is optional and
only has web_search/web_extract for LLM analysis.

```bash
# ✅ Correct: route script handles system operations
hermes webhook subscribe <name> \
  --events "issues,pull_request,check_run" \
  --script "workflow-dispatcher.py" \
  --deliver log

# ❌ Wrong: agent can't execute gh/terminal commands
hermes webhook subscribe <name> \
  --events "issues" \
  --prompt "Run gh issue edit to add labels..." \
  --skills "dev-workflow-dispatcher"
```

## Symptoms → Root Cause Quick Reference

| Symptom | Root Cause | Fix |
|---------|-----------|------|
| Agent sees `{payload}` literally, no event data | `{payload}` in template resolves as `payload.get("payload")` which is undefined | Use `{__raw__}` to dump the full payload |
| GitHub webhook delivery shows 401 | HMAC secret mismatch (subscription secret ≠ GitHub config) | Update GitHub secret to match subscription |
| GitHub webhook delivery shows 502/connection refused | ngrok tunnel dead or wrong port | Check `curl http://localhost:4041/api/tunnels`, restart gateway |
| GitHub webhook delivery shows 200 but no action taken | `deliver: origin` failure (response never completed) | Set `deliver: log` |
| Agent sees `{issue.number}` literally in prompt | Template variable doesn't exist for this event type | Use `{__raw__}` raw JSON instead |
| OpenCode can't find project files | Working directory is `~/workspace/` not the project dir | Prepend `cd /home/pi/workspace/<project>/` to all commands |
| Gateway overloaded with 10+ webhook sessions | Each webhook event spawns a session; crash recovery auto-resumes all without payload | Fix `{payload}` → `{__raw__}` so agents see data and complete quickly |
