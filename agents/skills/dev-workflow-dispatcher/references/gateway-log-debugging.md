# Gateway Log Debugging for Dev Workflow

> Quick-reference for interpreting Common Gateway log messages related to the webhook workflow pipeline.

## "script ignored event=issues" (MOST COMMON)

**Log line:**
```
[webhook] script ignored event=issues route=github-dev-workflow
```

**Meaning:** The route script ran, wrote the event to `~/.hermes/workflow-pending.json`, and printed `[SILENT]` — the expected thin-script behavior. The gateway did NOT spawn an agent session (saving LLM tokens).

**Verdict: ✅ Normal — no action needed.**

**Verify the script wrote the event:**
```bash
cat ~/.hermes/workflow-pending.json
```

**How the gateway decides:** `run_route_script` in `gateway/platforms/webhook_filters.py` shells out the script via `subprocess.run(argv, input=json.dumps(payload), capture_output=True, text=True, ...)`. If stdout is empty or exactly `"[SILENT]"`, `keep=False` is returned and the gateway logs "script ignored" — see `gateway/platforms/webhook.py` lines 610-622.

## "script ignored webhook" (ACTUAL ERROR)

**Log line:**
```
[webhook] script ignored webhook: bash not found
```
or
```
[webhook] script ignored webhook path=... code=1 stderr=...
```

**Meaning:** The script failed to run (bash missing) or exited with non-zero return code. The event was NOT written to the pending file.

**Verdict: ❌ Bug — check the script.**

**Debug:**
```bash
# Test the script directly
echo '{"action":"opened","issue":{"number":999}}' | python3 ~/.hermes/scripts/workflow-dispatcher.py
# Check return code and stdout
```

## "script execution failed" / "script timed out"

**Log line:**
```
[webhook] script execution failed: [Errno 2] No such file or directory: '...'
```

**Meaning:** The script path configured in the webhook subscription points to a file that doesn't exist, or the interpreter is missing.

**Verdict: ❌ Configuration error.**

**Fix:**
```bash
hermes webhook subscriptions list
# Check --script path resolves correctly
ls -la ~/.hermes/scripts/workflow-dispatcher.py
```

## No log entry at all — webhook delivery succeeded but no event

**Symptom:** GitHub webhook delivery shows `200 OK` but `workflow-pending.json` has no new event.

**Possible causes:**
1. **Deduplication hit** — same `event_type#issue_number` key already exists in pending file. The script silently skips duplicates. Clear the file and test again.
2. **Event filter on subscription** — the subscription may not subscribe to the event type that fired. Check `hermes webhook subscriptions list`.
3. **Gateway not accepting webhooks** — check `~/.hermes/gateway_state.json` for `webhook.state: "connected"`.

## "script ignored event=check_run"

**Log line:**
```
[webhook] script ignored event=check_run route=github-dev-workflow
```

**Meaning:** Same as the `issues` variant — the script ran and wrote the `check_run` event to `workflow-pending.json`.

**Verdict: ✅ Normal.** The cron poller or operator agent will handle check_run events (CI completion triggers self-correct loop).

## No webhook received at all

**Symptom:** GitHub webhook delivery history shows `502`, `connection refused`, or nothing.

**Possible causes:**
1. **ngrok URL changed** (usually after gateway restart). Check:
   ```bash
   # Find ngrok admin API (may be on :4040 or :4041)
   curl -s http://localhost:4041/api/tunnels 2>/dev/null | python3 -c \
     "import sys,json; d=json.load(sys.stdin); [print(t['public_url']) for t in d.get('tunnels',[])]" \
   || curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c \
     "import sys,json; d=json.load(sys.stdin); [print(t['public_url']) for t in d.get('tunnels',[])]"
   # Update GitHub webhook URL
   ```
2. **Gateway crashed.** Check `ps aux | grep gateway`.
3. **GitHub webhook misconfigured.** Check `gh api repos/<owner>/<repo>/hooks/<id>`.

## Quick Health Check

Run this to verify the full pipeline end-to-end:

```bash
# 1. Gateway running?
ps aux | grep -c "hermes.*gateway"

# 2. Webhook platform connected?
cat ~/.hermes/gateway_state.json | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('platforms',{}).get('webhook',{}))"

# 3. Pending file readable and non-corrupted?
cat ~/.hermes/workflow-pending.json

# 4. Cron job registered?
hermes cron list 2>/dev/null | grep workflow-pending

# 5. Test: inject a fake webhook event
echo '{"action":"opened","issue":{"number":999},"repository":{"full_name":"devvi/perfect-dev-agent-workflow"}}' \
  | python3 ~/.hermes/scripts/workflow-dispatcher.py
cat ~/.hermes/workflow-pending.json
# Should show events[0]._key in {"issues.opened#999", ...}
# Clean up: write {"events": []} to ~/.hermes/workflow-pending.json
```
