# Webhook Sync (`webhook-sync.py`)

A cron job (`every 15m`, no-agent mode) that syncs the GitHub webhook URL and secret after RPi restart.

## Problem

On RPi restart: ngrok gets a new public URL; the GitHub webhook still points to the old URL. The webhook subscription file (`webhook_subscriptions.json`) stores the correct HMAC secret, but the GitHub webhook config also needs it. Without this sync, all webhook deliveries fail with `401 Invalid signature`.

## Behavior

1. Reads current ngrok public URL from `http://127.0.0.1:4040/api/tunnels`
2. Reads webhook secret from `~/.hermes/webhook_subscriptions.json`
3. Compares against current GitHub webhook config
4. If URL or secret differ → PATCH the GitHub webhook
5. If nothing changed → silent (no output in no-agent mode)

## Files

- `~/.hermes/scripts/webhook-sync.py` — the sync script
- `~/.hermes/webhook_subscriptions.json` — route-specific HMAC secrets

## Created

2026-07-14, after RPi restart broke webhook deliveries for ~2 hours.
