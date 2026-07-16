# Workflow Pipeline Validation Procedure

Use this when setting up the workflow from scratch (new repo, after migration from another orchestrator, or before a fresh end-to-end test).

## Phase 1: Check Network Plumbing

### 1a. Gateway running?
```bash
systemctl --user status hermes-gateway
ss -tlnp | grep 8644
```

### 1b. Only ONE ngrok process — pointing to the right port?
```bash
ps aux | grep ngrok | grep -v grep
# Expect exactly 1 line (the gateway-managed ngrok)
# If 2+, the stale one must be killed first

# Check what port ngrok forwards to
curl -s http://localhost:4040/api/tunnels 2>/dev/null || curl -s http://localhost:4041/api/tunnels 2>/dev/null
# config.addr MUST contain :8644
```

### 1c. Kill stale ngrok (from old orchestrator like OpenClaw)
```bash
# Identify which PID is NOT the gateway-managed one
cat ~/.hermes/processes.json  # → the gateway's ngrok PID
# Kill the other one(s)
kill <stale-pid>
# Verify only one left
ps aux | grep ngrok | grep -v grep
```

## Phase 2: Check Webhook Subscription

```bash
hermes webhook list
# Expected: one subscription with events: issues, pull_request, check_run

# Get the subscription's HMAC secret (this is what GitHub needs)
cat ~/.hermes/webhook_subscriptions.json | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{k}: secret={v[\"secret\"]}') for k,v in d.items()]"
```

## Phase 3: Check GitHub Hook

```bash
# List hooks — get ID, URL, active status
gh api repos/<owner>/<repo>/hooks --jq '.[] | {id, url: .config.url, active, events}'

# If URL points to old ngrok domain or wrong port:
gh api repos/<owner>/<repo>/hooks/<id> -X PATCH --input - <<'JSON'
{
  "config": {
    "url": "https://<current-ngrok-domain>.ngrok-free.app/webhooks/<subscription-name>",
    "content_type": "json",
    "secret": "<subscription-secret>"   # ← NOT the gateway config secret
  },
  "events": ["issues", "pull_request", "check_run"],
  "active": true
}
JSON
```

## Phase 4: Send Ping

```bash
gh api repos/<owner>/<repo>/hooks/<id>/pings -X POST --silent
sleep 3
gh api repos/<owner>/<repo>/hooks/<id>/deliveries --jq 'limit(1; .[])' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"status\"]} / {d[\"status_code\"]}')"
# → Expect: "OK / 200"
```

If 401: HMAC secret mismatch → check Phase 2 secret vs what's in the GitHub hook config.
If 502: ngrok forwarding to wrong port → check Phase 1b.
If connection timeout: ngrok tunnel down → restart ngrok.

## Phase 5: Clean Local Repo State

Before creating a new test issue, ensure a clean slate:

```bash
cd ~/workspace/<project>/

# Discard uncommitted changes
git checkout -- .

# Drop stashes
git stash clear

# Delete merged feature branches (local only)
git branch --merged | grep -v "master\|main\|*" | xargs -r git branch -D

# Push cleanup (e.g. removed stale files from old orchestrator)
git add -A && git commit -m "cleanup: remove legacy files" && git push
```

## Phase 6: Create Test Issue

Create a new GitHub Issue with label `workflow/available`. The webhook fires and the pipeline begins.

Monitor the pipeline via Feishu notifications (delivered to `origin`), or:
```bash
# Watch issue label progression
gh issue view <N> --json labels
```
