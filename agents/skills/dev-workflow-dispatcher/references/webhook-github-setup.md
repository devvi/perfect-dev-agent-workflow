# Webhook + GitHub Setup Procedure

> **⚠️ IMPORTANT:** For the workflow-dispatcher, use a **route script** instead
> of an agent prompt. See step 4 below (`--script` approach). The old `--prompt`
> + `--skills` approach won't work because webhook agents lack terminal and
> delegate_task tools.

## One-time setup

### 1. Enable Hermes Webhook Platform

```bash
# Option A: Env vars in ~/.hermes/.env
echo 'WEBHOOK_ENABLED=true' >> ~/.hermes/.env
echo 'WEBHOOK_PORT=8644' >> ~/.hermes/.env
echo 'WEBHOOK_SECRET=<your-secret>' >> ~/.hermes/.env

# Option B: Config in ~/.hermes/config.yaml
platforms:
  webhook:
    enabled: true
    extra:
      host: "0.0.0.0"
      port: 8644
      secret: "<your-secret>"
```

### 2. Restart Gateway

```bash
systemctl --user restart hermes-gateway
```

### 3. Start ngrok Tunnel

```bash
ngrok http http://localhost:8644 --log=stdout
```

Get the public URL from `http://localhost:4040/api/tunnels`.

### 4. Create Hermes Webhook Subscription

**Preferred approach: route script (has full system access):**

```bash
hermes webhook subscribe <name> \
  --events "issues,pull_request,check_run" \
  --script "workflow-dispatcher.py" \
  --deliver log
```

This script runs locally with full gh/git/curl access. No prompt or skills needed.
See `references/route-script-reference.md` for the script architecture.

**Legacy approach: agent prompt (limited — agent lacks terminal):**

```bash
hermes webhook subscribe <name> \
  --events "issues,pull_request,check_run" \
  --prompt '...' \
  --skills "<dispatcher-skill-name>" \
  --deliver log
```

⚠️ The webhook agent has NO terminal or delegate_task tools. It can analyze events
   and search the web, but cannot execute gh commands or spawn sub-agents.
   See `references/webhook-prompt-pitfalls.md` section 6 for details.

```bash
hermes webhook subscribe <name> \
  --events "issues,pull_request,check_run" \
  --prompt "..." \
  --skills "<dispatcher-skill-name>" \
  --deliver log
```

**⚠️ CRITICAL: use `{__raw__}` NOT `{payload}` in the prompt template.**

The template renderer resolves `{key}` by looking up `key` as a top-level field in the webhook JSON.
`{payload}` looks for a key called `"payload"` in the event payload — which doesn't exist in GitHub
events. The result: the agent sees literal `{payload}` text and no event data.

```bash
# ✅ CORRECT: use {__raw__} to dump the entire payload
--prompt '```json\n{__raw__}\n```\nParse the payload and act.'

# ❌ BROKEN: {payload} renders as literal "{payload}"
--prompt '```json\n{payload}\n```'   # ← NEVER DO THIS
```

**Also:** Use `--deliver log` (NOT `origin`). The webhook platform has no "source chat" to deliver
responses to; `deliver: origin` causes every agent run to fail with "Unknown deliver type: origin".
The agent's work (gh commands, delegate_task calls) happens during the run itself, so `log` is safe.

Note: The `--skills` flag pre-loads the dispatcher skill when a webhook event fires.
Read `references/webhook-prompt-pitfalls.md` for all known template traps.

### 5. Configure GitHub Repo Webhook

```bash
# Get the ngrok URL
NGROK_URL=<from-step-3>/webhooks/<from-step-4-name>

# Get the subscription SECRET (use this, NOT the gateway config secret):
#   hermes webhook list  → copy the per-subscription secret
SECRET="<subscription-secret-from-step-4>"

# Via gh CLI
gh api repos/<owner>/<repo>/hooks \
  -X POST \
  -f config:url="$NGROK_URL" \
  -f config:content_type="json" \
  -f config:secret="$SECRET" \
  -f "events[]=issues" \
  -f "events[]=pull_request" \
  -f "events[]=check_run" \
  -f active=true

# Or update existing hook:
gh api repos/<owner>/<repo>/hooks/<hook-id> \
  -X PATCH \
  --input - <<'JSON'
{
  "config": {
    "url": "$NGROK_URL",
    "content_type": "json",
    "secret": "$SECRET"
  },
  "events": ["issues", "pull_request", "check_run"],
  "active": true
}
JSON
```

### 6. Verify

```bash
# Local: test Hermes webhook (unsigned → 401 expected)
curl -s -X POST "http://localhost:8644/webhooks/<name>"

# GitHub: list hooks
gh api repos/<owner>/<repo>/hooks --jq '.[] | {url: .config.url, events: .events, active: .active}'

# CRITICAL: send a GitHub ping and check delivery status (200 = green path)
gh api repos/<owner>/<repo>/hooks/<hook-id>/pings -X POST --silent
sleep 3
gh api repos/<owner>/<repo>/hooks/<hook-id>/deliveries --jq 'limit(1; .[])' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Status: {d['status']} / {d['status_code']}\")"
# → Expect: "Status: OK / 200"

# Verify the prompt template actually resolves. Check subscription JSON:
cat ~/.hermes/webhook_subscriptions.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
for name, sub in d.items():
    p = sub.get('prompt', '')
    if '{payload}' in p and '{__raw__}' not in p:
        print(f'⚠️  {name}: uses {{payload}} — see webhook-prompt-pitfalls.md section 1')
    if '{__raw__}' in p:
        print(f'✅ {name}: uses {{__raw__}} (correct)')
    if sub.get('deliver') == 'origin':
        print(f'⚠️  {name}: deliver=origin is BROKEN for webhook platform — set to log')
"

# CRITICAL: verify ngrok tunnel target port aligns with Hermes gateway port
# ngrok is often managed by systemd as part of hermes-gateway service,
# so its target address may drift from what you expect.
curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
tunnels = json.load(sys.stdin)['tunnels']
for t in tunnels:
    addr = t['config']['addr']
    pub = t['public_url']
    if ':8644' not in addr and ':8644' not in pub:
        print(f'⚠️  WARNING: Tunnel {t[\"name\"]} forwards to {addr}, not port 8644')
        print(f'   Public URL: {pub}')
        print(f'   GitHub webhook will route to ngrok but events will NEVER reach Hermes.')
    else:
        print(f'✅ Tunnel {t[\"name\"]} → {addr} OK')
"
```

## Setup reminders

- `GITHUB_TOKEN` must be in `~/.hermes/.env` for spawned sub-agents to call GitHub API
- ngrok URL changes each restart unless you use a paid plan with fixed subdomain
- The webhook `--events` filter on Hermes subscription must match the GitHub events list
- Label creation script can be at `scripts/setup-labels.sh` in the target repo

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"error": "Invalid signature"}` | Missing/wrong HMAC secret | Verify secret matches between GitHub and Hermes subscription |
| Webhook never fires | Gateway not running | `systemctl --user status hermes-gateway` |
| ngrok not forwarding | Tunnel died | Restart ngrok, update GitHub webhook URL |
| CI events not triggering | Wrong events list | Check GitHub hook has `check_run` event |
| Sub-agent can't call GitHub | No GITHUB_TOKEN | Check `~/.hermes/.env` has `GITHUB_TOKEN=ghp_...` |
| Webhook hits ngrok but never reaches Hermes | ngrok tunnel forwards to wrong local port | 1. `curl http://localhost:4040/api/tunnels` → check `config.addr`<br>2. Compare against Hermes port (`ss -tlnp | grep hermes` shows the real port)<br>3. If misaligned, the ngrok tunnel is stale (old process survived a gateway restart)<br>4. Fix: `systemctl --user restart hermes-gateway` — the gateway unit respawns ngrok with the correct port |
| Stale ngrok from another service (e.g. OpenClaw) occupies port 4040, Hermes ngrok runs on 4041 instead | Two ngrok processes — old one owned by a different service | 1. `ps aux | grep ngrok` — look for multiple PIDs<br>2. Find the stale one: check which is NOT a child of the gateway (`pstree -p` or `cat ~/.hermes/processes.json` for the gateway-managed PID)<br>3. Kill the stale ngrok: `kill <pid>`<br>4. The Hermes ngrok (now the only one) responds on 4040 + the correct port<br>5. Update GitHub webhook URL to the new ngrok public URL |
| GitHub ping returns 401 | HMAC secret mismatch — GitHub uses the wrong secret | 1. `cat ~/.hermes/webhook_subscriptions.json` — the subscription's `secret` field is what GitHub must use<br>2. This is NOT the gateway's global `secret` from config.yaml<br>3. Update GitHub hook: `gh api repos/.../hooks/<id> -X PATCH -f config:secret="<subscription-secret>"` |
| `hermes webhook list` shows a route but gateway logs say "(none configured)" | Gateway started before the subscription was created, needs reload | A new POST to any route triggers a hot-reload; or restart the gateway |
