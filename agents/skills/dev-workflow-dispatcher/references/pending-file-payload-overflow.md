# Pending File Payload Overflow

> **🟢 FIXED 2026-07-12:** Route script no longer stores full payload. See "Permanent Fix" below.

**Context:** The route script previously stored the FULL GitHub webhook payload JSON (10KB+ per event) in
`~/.hermes/workflow-pending.json`. When the cron LLM read this file, the large JSON
blobs filled the context window, causing the LLM to fail processing events.

## Symptoms

- Events remain in pending file for multiple consecutive cron cycles (5+ minutes)
- Cron log shows normal operation (reads file, some API calls) but no delegate_task
- Pending file size >15KB for 1-2 events
- No agent spawned despite valid events

## Workaround

```bash
# 1. Clear the pending file's payloads
echo '{"events":[],"processed_at":"'"$(date -Iseconds)"'"}' > ~/.hermes/workflow-pending.json

# 2. Manually advance the issue label to trigger research
gh api repos/devvi/perfect-dev-agent-workflow/issues/<N>/labels -X POST \
  --input '{"labels":["workflow/research"]}'

# 3. Inject a minimal issues.labeled event
PAYLOAD='{"action":"labeled","issue":{"number":<N>,"title":"...","labels":[{"name":"workflow/research"}],"state":"open"},"label":{"name":"workflow/research"},"repository":{"full_name":"devvi/perfect-dev-agent-workflow"}}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | cut -d' ' -f2)
curl -s -X POST "http://localhost:8644/webhooks/github-dev-workflow" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -H "X-GitHub-Event: issues" \
  -d "$PAYLOAD"
```

## Root Cause

`~/.hermes/scripts/workflow-dispatcher.py` stores the entire `payload` string in each
pending event. The payload includes the full GitHub issue/PR/repository/sender objects.

## Permanent Fix

**✅ Applied 2026-07-12** — `~/.hermes/scripts/workflow-dispatcher.py` modified to NOT store the full payload. Only stores:
- `event_type`, `issue_number`, `repo`, `ts`
- `label` (if issues.labeled) — <100 chars
- `branch` + `conclusion` (if check_run) — <100 chars each
- No `payload` field

Each event dropped from 10-25KB to <0.3KB. Even 10 stacked events stay under 3KB — never blows cron context.

**Verification:**
```bash
cat ~/.hermes/workflow-pending.json
# No "payload" fields in events
```
