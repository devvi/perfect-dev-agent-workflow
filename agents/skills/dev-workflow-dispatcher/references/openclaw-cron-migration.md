# OpenClaw → Hermes Cron Migration

Pattern for migrating scheduled tasks from OpenClaw cron to Hermes cron.

## Source

OpenClaw job definitions live at `~/.openclaw/cron/jobs.json.migrated` (or `.bak`).

Each job has:
- `name` / `description`
- `schedule.expr` — cron expression
- `payload.message` — the prompt the OpenClaw agent ran
- `delivery.channel` / `delivery.to` — how results were sent
- `model` / `fallbacks` — model overrides

## Hermes Cron Equivalent

```bash
cronjob(
  action='create',
  schedule='<cron-expr>',
  name='<name>',
  prompt='...',
  deliver='origin|local|platform:chat_id:thread_id',
  model={'model': '...', 'provider': '...'},
)
```

## Pattern Adaptations

| OpenClaw Pattern | Hermes Equivalent |
|---|---|
| `message action=send` for Feishu | Set `deliver` on the cronjob; the agent's final response is auto-delivered |
| `sessions_list` | `session_search()` (browse mode with no query returns recent sessions) |
| `session_status` | Not directly available — use `session_search` to check activity |
| `cron action=get jobId=X` to read another job's output | `context_from=[job_id]` on the dependent job |
| `feishu_bitable_*` tools | Write data via script + terminal tool, or use `web_extract`/`web_search` for API |
| OpenClaw memory (`memory/YYYY-MM-DD.md`, `MEMORY.md`) | Hermes `memory` tool, `session_search` |
| `delivery.mode: none` (silent jobs) | `deliver='local'` (saves output, no delivery) |
| `delivery.to: ou_f38...` (Feishu user DM) | `deliver='origin'` (auto-routes to the Feishu DM this session connects from) |
| `delivery.to: chat:oc_...` (Feishu group) | `deliver='feishu:oc_...'` |
| `lightContext: true` | Omit — Hermes cron sessions are lightweight by default |

## Model Selection for Cron Jobs

Cron jobs should use fast/cheap models by default — they run automated, unattended, and often need minimal reasoning:

```python
model={'model': 'deepseek/deepseek-v4-flash', 'provider': 'deepseek'}
```

**Guidelines:**
- **Flash/fast models** for routine jobs (summaries, monitors, checks, silent processors)
- **Omit model override** for the workflow dispatcher cron (the main session model handles operator/phase agents via delegate_task, which uses its own config)
- Pinning a specific `provider` avoids model-resolution issues when multiple providers serve the same model name

## Chaining Dependent Jobs

If job B should read job A's output:

1. Create job A first, note its `job_id`
2. Create job B with `context_from=['job_id_of_A']`
3. Job B's agent receives job A's last completed output as injected context

This replaces OpenClaw's `cron action=get jobId=X` pattern.

**Important:** Create job A's cron job FIRST, then use its returned job_id when creating job B. You cannot set `context_from` to a job that doesn't exist yet.

## Delivery Targeting

```python
deliver='origin'                → comes back to the current chat/thread
deliver='local'                 → saved only, no delivery (silent)
deliver='feishu:oc_...'         → send to a Feishu group chat by chat_id
deliver='feishu:ou_...'         → Feishu DM by user ID (use 'origin' instead when in DM)
deliver='all'                   → fan out to all connected home channels
deliver='origin,feishu:oc_...'  → both origin AND a group (comma-separated)
```

**Note:** `deliver='origin'` auto-detects the chat from which the cron job was created. For a Feishu DM, it routes to the DM. For silent background jobs, always use `deliver='local'`.

## Real Migration Examples

### Example 1: Daily Summary (Silent → Origin)

```python
# OpenClaw → Hermes
# Time: 5 23 * * * (daily at 23:05)
# Prompt: "生成每日活动摘要并推送到飞书。用 sessions_list..."
# Delivery: feishu DM to ou_f38...
# Adaptations:
#   sessions_list → session_search() (browse mode)
#   message action=send → deliver='origin' (auto-routes to current Feishu DM)
cronjob(
    action='create', schedule='5 23 * * *',
    name='daily-summary',
    deliver='origin',
    model={'model': 'deepseek/deepseek-v4-flash', 'provider': 'deepseek'},
)
```

### Example 2: Background File Processor (Silent)

```python
# OpenClaw → Hermes
# Time: 0 7 * * * (daily at 07:00)
# Prompt: "处理 Obsidian 知识库 raw/ 目录中的新文件..."
# Delivery: mode=none (completely silent)
# Adaptations:
#   delivery.mode: none  →  deliver='local'
#   No Feishu notifications → agent stays silent or outputs [SILENT]
cronjob(
    action='create', schedule='0 7 * * *',
    name='obsidian-raw-processor',
    deliver='local',   # ← silent: saves output, no delivery
)
```

### Example 3: Chained Report (Reads Processor Output)

```python
# OpenClaw → Hermes (dependent on Example 2)
# Time: 30 10 * * * (daily at 10:30)
# OpenClaw used: cron action=get jobId=... to read processor's output
# Hermes uses: context_from to auto-inject processor's output
cronjob(
    action='create', schedule='30 10 * * *',
    name='obsidian-daily-report',
    context_from=['<job_id_of_processor>'],  # ← receives processor output as context
    deliver='feishu:oc_...',
)
```

### Example 4: Group Chat Report (Script-Based)

```python
# OpenClaw → Hermes
# Time: 30 10 * * * (daily at 10:30)
# Runs: cd ~/.openclaw/workspace/indie-monitor && python3 monitor.py
# Delivery: Feishu group chat oc_d565a...
# Adaptations:
#   feishu_bitable_app_table_record → agent reads script output and delivers via final response
#   Delivery target: feishu:oc_d565a...
cronjob(
    action='create', schedule='30 10 * * *',
    name='indie-monitor-morning',
    deliver='feishu:oc_d565a16406d10f02ff21fe534fabeca0',
)
```

## Post-Migration Cleanup

After migrating all OpenClaw cron jobs, disable the old OpenClaw system:

```bash
# 1. Disable OpenClaw gateway service (prevents auto-start on reboot)
systemctl --user disable openclaw-gateway

# 2. Verify it won't auto-start again
systemctl --user is-enabled openclaw-gateway  # should say 'disabled'

# 3. Stop any currently running OpenClaw process
systemctl --user stop openclaw-gateway

# 4. Check for other OpenClaw services
systemctl --user list-unit-files | grep openclaw

# 5. Remove OpenClaw cron jobs from system crontab (if any)
crontab -l | grep -v openclaw | crontab -
```

**Warning:** If OpenClaw services remain enabled, they will auto-start on every reboot and compete with Hermes for resources (CPU, memory, Feishu bot connections). The OpenClaw Feishu bot will also receive and potentially respond to messages meant for Hermes.

## Steps

1. Read `~/.openclaw/cron/jobs.json.migrated` for all job definitions
2. Identify which jobs to migrate (skip OpenClaw-specific ones like `openclaw update`)
3. For each job, adapt the prompt: replace OpenClaw-specific tool calls with Hermes equivalents
4. Create Hermes cron jobs, set proper delivery targets
5. Create chained jobs second (need context_from pointing to first job's ID)
6. Verify by listing: `cronjob(action='list')`
