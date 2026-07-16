# Notification Format

## User Preference (K)

Workflow status updates must be **extremely minimal** — the user explicitly requested "内容极简即可".

### Allowed Format (emoji + one line per event)

```
📋 #N → research (depth: light)
📋 #N → plan
📋 #N → implement
✅ #N → done → 🚀 <url>
❌ #N → error: <reason>
```

### Rules

1. **One line per action.** No explanations, no context, no justification.
2. **No status when idle.** If the cron job finds no pending events, output `[SILENT]` — do NOT say "No pending events" or any variant.
3. **No delivery on silent runs.** The cron job's prompt outputs `[SILENT]` when there's nothing to report; this suppresses the message entirely.
4. **Error notifications** — one line with the error reason. The user will ask for details if they want them.
5. **Never prefix with explanations** like "The workflow has detected that..." or "I found an event for...". Just the emoji + issue number + phase.
