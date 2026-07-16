# Old OpenClaw Interference

## Problem

The old OpenClaw setup leaves behind scripts that silently overwrite the GitHub webhook configuration.

## Symptoms

- GitHub webhook deliveries return 404
- Webhook URL shows `/hooks/pda` instead of `/webhooks/github-dev-workflow`
- HMAC secret is null/empty
- Webhook `active: true` but all deliveries fail

## Root Cause

Two scripts in `~/.openclaw/workspace/scripts/`:

### `start-ngrok-with-hook.sh`
```bash
# Starts ngrok on port 18789 (old OpenClaw port)
nohup ngrok http 18789 ... > "$NGROK_LOG" 2>&1 &
# After ngrok starts, calls:
bash "$UPDATE_SCRIPT"
```

### `update-github-webhook.sh`
```bash
# Reads ngrok URL from localhost:4040
# Sets GitHub webhook to {ngrok_url}/hooks/pda
# Does NOT include a secret field → clears any existing HMAC secret
```

## Fix

1. Kill all old OpenClaw processes:
```bash
ps aux | grep openclaw | grep -v grep
# Kill the startup script and ngrok
kill <pid-of-start-ngrok-with-hook.sh> <pid-of-old-ngrok>
```

2. Delete both scripts:
```bash
rm -f ~/.openclaw/workspace/scripts/start-ngrok-with-hook.sh
rm -f ~/.openclaw/workspace/scripts/update-github-webhook.sh
```

3. Restore the webhook (with correct HMAC secret):
```bash
gh api repos/<owner>/<repo>/hooks/<hook-id> -X PATCH --input - \
  '{"config": {"url": ".../webhooks/github-dev-workflow", "content_type": "json", "secret": "<secret>"}, "events": ["issues", "pull_request", "check_run"], "active": true}'
```

## Detection

Always check this if:
- A new issue was created but the workflow didn't start
- Webhook deliveries show 404 or "Invalid HTTP Response"
- You suspect the webhook URL was changed without explanation

Run:
```bash
gh api repos/<owner>/<repo>/hooks/<hook-id> --jq '{url: .config.url, secret: .config.secret}'
```

If the URL is `/hooks/pda` or the secret is `null`, the old system has interfered again.
