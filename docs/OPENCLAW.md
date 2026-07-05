# OpenClaw Integration

The Perfect Dev Agent Workflow can be enhanced with an OpenClaw-based monitoring layer.

## Monitoring Cron Job

Add a cron job that polls GitHub Issues and reports to Feishu:

```yaml
# OpenClaw cron job config
name: workflow-monitor
schedule: { kind: "every", everyMs: 300000 }  # every 5 minutes
payload:
  kind: agentTurn
  message: |
    Check GitHub Issues for the perfect-dev-agent-workflow project:
    1. List issues with label "status/blocked" — report to K via Feishu
    2. List issues by stage — provide a progress summary
    3. Alert on any issue stuck in one stage for >1 hour
  timeoutSeconds: 120
```

## Knowledge Base Integration (future)

Connect research phase to Obsidian Knowledge Ocean:

```
Research triggered
    ↓
OpenClaw searches Knowledge Ocean for related notes
    ↓
Relevant context appended to research prompt
    ↓
Richer research output
```

## Notification Flow

```
Stage complete → OpenClaw detects label change → Feishu DM to K
Stage blocked   → OpenClaw detects status/blocked → Urgent Feishu DM
Issue stuck     → OpenClaw detects time threshold → Escalation DM
```
