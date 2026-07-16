# Workflow Observability Dashboard

## When to Use

Build this when the user asks for:
- "看板设计" / "dashboard" / "workflow查看器" / "pipeline状态"
- A standalone page showing workflow state (running agents, cron status, gateway health)
- NOT the Hermes control panel — a lightweight custom view

**Key decision: standalone page vs Hermes plugin.** If the user references their own design / asks for a "简单的workflow查看器", build standalone. If they ask about the Kanban board specifically, modify the plugin. When in doubt, check the project directory for existing HTML files first.

## Architecture

```
┌─────────────┐     ┌──────────────────┐
│ Browser     │────→│ Python Server    │
│ dashboard   │     │ (:8080)          │
│ .html       │     │                  │
│             │     │  Layer 1: state.db   ──→ Active sub-agent sessions
│             │     │  Layer 2: kanban.db   ──→ Running/blocked tasks
│             │     │  Layer 3: CLI/API      ──→ Cron, GitHub issues, process check
│             │     └──────────────────┘
└─────────────┘
```

**Key rule: Prefer reading local SQLite DBs over proxying the Hermes API.**
The Hermes dashboard plugin routes (`/api/plugins/kanban/*`, `/api/cron`) require auth.
Only `GET /api/status` is open (for gateway platform info).

```
┌─────────────┐     ┌──────────────────┐
│ Browser     │────→│ Python Server    │
│ dashboard   │     │ (:8080)          │
│ .html       │     │                  │
│             │     │  Layer 1: state.db   ──→ Active sub-agent sessions
│             │     │  Layer 2: kanban.db   ──→ Running/blocked tasks
│             │     │  Layer 3: CLI tools    ──→ Cron, GitHub issues, process check
│             │     └──────────────────┘
└─────────────┘
```

**Key rule: Prefer reading local SQLite DBs over proxying the Hermes API.**
The Hermes dashboard plugin routes (`/api/plugins/kanban/*`, `/api/cron`) require auth.
Only `GET /api/status` is open (for gateway platform info).

### 1. The Server (`server.py`)

A lightweight Python HTTP server with these data sources:

#### Layer 1: Active Sub-Agent Sessions (`~/.hermes/state.db`)

This is the **primary source for live running agents**. The Hermes sessions table
tracks every `delegate_task` child as `source='subagent'`:

```python
import sqlite3, time

STATE_DB = os.path.expanduser("~/.hermes/state.db")

def get_active_agents():
    """Read currently running sub-agents from local sessions database."""
    conn = sqlite3.connect(STATE_DB)
    conn.row_factory = sqlite3.Row
    now = time.time()

    rows = conn.execute("""
        SELECT s.id, s.parent_session_id, s.title, s.model,
               s.started_at, s.message_count, s.tool_call_count,
               parent.title AS parent_title
        FROM sessions s
        LEFT JOIN sessions parent ON parent.id = s.parent_session_id
        WHERE s.ended_at IS NULL
          AND s.started_at > ?             -- avoid orphaned stale sessions
          AND s.message_count > 0          -- ignore zero-message orphans
          AND (s.source = 'subagent'
               OR s.source LIKE 'agent:main:%')
        ORDER BY s.started_at DESC
    """, (now - 600,)).fetchall()  # last 10 minutes only

    agents = []
    for r in rows:
        title = (r["title"] or "").lower()
        phase = "research" if "research" in title else \
                "plan" if "plan" in title else \
                "implement" if "implement" in title else \
                "review" if "review" in title else \
                "self-correct" if "self-correct" in title else "agent"
        agents.append({
            "id": r["id"],
            "phase": phase,
            "duration_seconds": int(now - r["started_at"]),
            "message_count": r["message_count"],
            "tool_call_count": r["tool_call_count"],
            "model": r["model"],
            "title": r["title"] or "(unnamed)",
            "parent": {"title": r["parent_title"] or ""},
        })
    return agents
```

**⚠️ Pitfall: Orphaned sessions with `ended_at IS NULL`.**
Delegate_task children don't always get their `ended_at` set (crash, gateway restart,
workflow completion). The `started_at > now - 600` AND `message_count > 0` filters
are essential — without them you'll get hundreds of stale unnamed sessions going
back days.

**⚠️ Phase detection is heuristic.**
The phase is detected from the session title string. Workflow dispatcher
sessions (source='agent:main:...') may have descriptive titles like
"Research: game naming" → phase='research'. Plain numbered sub-agents
get phase='agent'.

#### Layer 2: Workflow Tasks (`~/.hermes/kanban.db`)

For kanban-level running/blocked tasks (complementary to active agents):

```python
def get_kanban_tasks():
    conn = sqlite3.connect(os.path.expanduser("~/.hermes/kanban.db"))
    conn.row_factory = sqlite3.Row
    for status in ("running", "blocked"):
        rows = conn.execute(
            "SELECT id, title, status, assignee, started_at, session_id, "
            "worker_pid, current_step_key, last_heartbeat_at "
            "FROM tasks WHERE status = ? ORDER BY started_at DESC",
            (status,),
        ).fetchall()
        # Returns: list of dicts with duration_seconds, stale flag
```

#### Layer 3: CLI Tools

For cross-referencing pipeline and infrastructure status:

```python
def get_pipeline_issues():
    """GitHub Issues with workflow labels."""
    result = subprocess.run(
        ["gh", "issue", "list", "--state", "open",
         "--json", "number,title,labels,createdAt,assignees",
         "--limit", "20"],
        capture_output=True, text=True, timeout=15, cwd=WORKDIR,
    )
    issues = json.loads(result.stdout)
    # Map workflow/* labels to stage icons: 📥available 🔍research 📐plan ⚙️implement

def get_gateway_status():
    """Only open endpoint — proxies to Hermes for platform list."""
    resp = urllib.request.urlopen("http://127.0.0.1:9119/api/status", timeout=5)
    status = json.loads(resp.read())
    return {"gateway_running": gw_running, "platforms": status.get("gateway_platforms", {})}

def get_cron():
    """Parse `hermes cron list` text output (no --json flag)."""
    result = subprocess.run(["hermes", "cron", "list"], capture_output=True, text=True)
    # Use regex to extract blocks: ID [status], Name:, Schedule:, Last run:
    import re
    m = re.match(r'^([a-f0-9]+)\s+\[(\w+)\]', line)
    m2 = re.match(r'Name:\s+(.+)', line)

def get_opencode_status():
    """Local process check."""
    ps = subprocess.run(["ps", "aux"], capture_output=True, text=True)
    return "opencode" in line and "serve" in line
```

### 2. Aggregated API Endpoint

All data sources are combined into a single `/api/dashboard` response:

```python
class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/dashboard":
            data = {
                "now": int(time.time()),
                "active_agents": get_active_agents(),
                "active_agent_count": len(agents),
                "kanban_running": get_kanban_tasks()["running"],
                "kanban_blocked": get_kanban_tasks()["blocked"],
                "issues": get_pipeline_issues(),
                "cron_jobs": get_cron()["jobs"],
                "gateway_running": gw["gateway_running"],
                "platforms": gw["platforms"],
                "opencode": get_opencode_status(),
            }
            self._json_response(data)
```

### 3. The HTML Page

Material Design, mobile-responsive, two-column layout:

```html
<div class="layout-main">
  <!-- Left Column: Pipeline + Running Agents -->
  <div>
    <div class="card" id="pipelineCard">...</div>
    <div class="card" id="agentCard">...</div>
  </div>
  <!-- Right Column: Tech Stack + Cron -->
  <div>
    <div class="card" id="techStackCard">...</div>
    <div class="card" id="cronCard">...</div>
  </div>
  <!-- Full Width: GDD -->
  <div class="full-width"><div class="card" id="gddCard">...</div></div>
</div>

<script>
async function refreshAll() {
  const dashRes = await fetch('/api/dashboard').then(r => r.json());
  renderAgents(dashRes.active_agents, dashRes.kanban_running, dashRes.kanban_blocked, now);
  renderPipeline(dashRes.issues);
  renderTechStack(dashRes.gateway_running, dashRes.platforms);
  renderCron(dashRes.cron_jobs);
}
refreshAll();
setInterval(refreshAll, 30000);
</script>
```

### 4. Running Agents Card (Two Subsections)

Active sub-agents and kanban tasks are rendered separately with different visual styles:

**Active Sub-Agents (from state.db):**
- Color-coded phase badge: 🔍RESEARCH (blue) / 📐PLAN (amber) / ⚙️IMPLEMENT (green)
- Duration, message count, tool call count, model name
- Parent session title (← from: workflow-pending-poller ...)

**Kanban Tasks (from kanban.db):**
- Task ID + Pulse dot
- Assignee profile, current step key, session ID, worker PID
- Heartbeat stale warning

```html
<!-- Active sub-agent card -->
<div class="agent-card">
  <div class="agent-head">
    <span class="pulse-dot" style="background:${phaseColor};animation:pulse 2s infinite"></span>
    {{title}}
    <span class="agent-status-tag" style="background:${phaseTag};color:${phaseColor}">RESEARCH</span>
  </div>
  <div class="agent-meta">
    <span>⏱ 3分25秒</span>
    <span>💬 12条</span>
    <span>🔧 8次</span>
    <span>🤖 deepseek-v4-flash</span>
  </div>
</div>
```

## Pitfalls

### 🚫 Don't Modify the Kanban Plugin

When the user asks about their "dashboard" design, they mean the standalone `dashboard.html` in the project directory. Do NOT modify `plugins/kanban/dashboard/dist/` files:
- `index.js` — the Hermes Kanban board plugin (IIFE format, mounts at `/kanban`)
- Those changes affect the Hermes control panel, not the standalone page

**How to check which they mean:**
```bash
ls /home/pi/workspace/.pda/perfect-dev-agent-workflow/dashboard.html 2>/dev/null
```
If it exists, that's the file to work with. If not, ask which page they mean.

### 🚫 Material Icons with Invalid Names

`<span class="material-symbols-rounded">discord</span>` does NOT render an icon. The Material Symbols font doesn't have a "discord" glyph — the browser displays the text "discord" as fallback at the element's font size. Use a valid icon name:
- `smart_toy` — bot/agent icon (Discord alternative)
- `forum` — chat platform (飞书/Feishu)
- `hub` — gateway
- `webhook` — webhook
- `code` — OpenCode

### CORS / Auth

The Hermes dashboard API at `:9119` requires auth for some endpoints:
- `GET /api/status` — NO auth needed
- `GET /api/cron` — AUTH required
- `GET /api/plugins/kanban/board` — AUTH required

**Solution:** Read kanban SQLite DB directly + parse CLI output + proxy only public endpoints.

### SQLite DB Location

The kanban database can be either:
- `~/.hermes/kanban.db` — primary (may be a symlink)
- `~/.hermes/kanban/kanban.db` — board-specific

Check with: `find ~/.hermes -name "kanban.db" -not -path "*/node_modules/*"`

### Cron Output Parsing

`hermes cron list` outputs a table with unicode box-drawing chars. No `--json` flag exists. Parse by:
1. Split on `\n\n` (blank lines between job blocks)
2. Each block has "ID [status]" on first line, then "Name:", "Schedule:", etc.
3. Extract by looking for `Key:` prefixes in each line

## Files Reference

| File | Purpose |
|------|---------|
| `dashboard.html` | Full Material Design dashboard page with 5 card sections |
| `server.py` | Python HTTP server: static files + aggregated `/api/dashboard` endpoint |
| `~/.hermes/kanban.db` | Source of running agent data |
