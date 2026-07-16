# Webhook Route Secret — Debugging Guide

## Symptom

After RPi restart, all webhook deliveries return `"Invalid HTTP Response: 401"` even though:
- Ngrok is running and forwarding correctly
- The webhook URL is updated in GitHub
- The global secret in `config.yaml` (`platforms.webhook.extra.secret`) is correct

## Root Cause

Each webhook route can have its **own secret** stored in `~/.hermes/webhook_subscriptions.json`. This route-level secret **overrides** the global config secret:

```json
{
  "github-dev-workflow": {
    "secret": "Pbomehjf-Y-4iLtaZVH8DOAFWP2zRi22CRZG6OAN3CI"
  }
}
```

When you update the GitHub webhook via `gh api .../hooks/<id> -X PATCH`, you must use this route-specific secret — NOT the global config.yaml secret.

## Fix

```bash
# 1. Read the route-specific secret from webhook_subscriptions.json
ROUTE_SECRET=$(python3 -c "import json;print(json.load(open('/home/pi/.hermes/webhook_subscriptions.json'))['github-dev-workflow']['secret'])")

# 2. Update GitHub webhook with the correct secret
gh api repos/devvi/perfect-dev-agent-workflow/hooks/650489649 -X PATCH --input - <<ENDJSON
{
  "config": {
    "url": "$NGROK_URL/webhooks/github-dev-workflow",
    "content_type": "json",
    "insecure_ssl": "0",
    "secret": "$ROUTE_SECRET"
  },
  "active": true,
  "events": ["check_run", "issues", "pull_request"]
}
ENDJSON
```

## Verification

Send a test payload with the correct HMAC:

```bash
python3 -c "
import hmac, hashlib, json, urllib.request
SECRET = open('/home/pi/.hermes/webhook_subscriptions.json','rb')
SECRET = json.load(SECRET)['github-dev-workflow']['secret'].encode()
payload = json.dumps({'action':'labeled'}, separators=(',',':'))
sig = 'sha256=' + hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
req = urllib.request.Request('http://localhost:8644/webhooks/github-dev-workflow',
  data=payload.encode(),
  headers={'Content-Type':'application/json','X-Hub-Signature-256':sig,'X-GitHub-Event':'issues'})
try:
  urllib.request.urlopen(req, timeout=5)
  print('✅ Webhook working')
except Exception as e:
  print(f'❌ {e}')
"
```
