#!/usr/bin/env python3
"""Workflow Observability Dashboard — standalone server, port 8080."""

import http.server
import json
import os
import sqlite3
import subprocess
import time
import urllib.request

WORKDIR = os.path.expanduser("~/workspace/.pda/perfect-dev-agent-workflow")
STATE_DB = os.path.expanduser("~/.hermes/state.db")
HERMES_GATEWAY_URL = "http://127.0.0.1:9119"


def get_active_agents():
    """Read currently running sub-agents from state.db.
    
    Title fallback: sessions table leaves `title` NULL (unique index constraint).
    Reads first message from messages table as display name.
    """
    if not os.path.exists(STATE_DB):
        return []

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
          AND s.started_at > ?
          AND s.message_count > 0
          AND s.source = 'subagent'
        ORDER BY s.started_at DESC
    """, (now - 600,)).fetchall()

    agents = []
    for r in rows:
        title = r["title"] or ""
        if not title:
            # Fallback: read first message as display name
            msg_row = conn.execute(
                "SELECT substr(content,1,120) as msg FROM messages "
                "WHERE session_id = ? ORDER BY id LIMIT 1",
                (r["id"],)
            ).fetchone()
            if msg_row and msg_row["msg"]:
                title = msg_row["msg"].strip()
            else:
                title = "(unnamed)"

        title_lower = title.lower()
        phase = "agent"
        for kw, p in [("research","research"),("plan","plan"),
                       ("implement","implement"),("review","review"),
                       ("self-correct","self-correct")]:
            if kw in title_lower:
                phase = p
                break

        agents.append({
            "id": r["id"],
            "phase": phase,
            "duration_seconds": int(now - r["started_at"]),
            "message_count": r["message_count"],
            "tool_call_count": r["tool_call_count"],
            "model": r["model"] or "unknown",
            "title": title,
            "parent_title": r["parent_title"] or "",
        })

    conn.close()
    return agents


def get_pipeline_issues():
    """GitHub Issues with workflow labels."""
    try:
        result = subprocess.run(
            ["gh", "issue", "list", "--state", "open",
             "--json", "number,title,labels,createdAt",
             "--limit", "20"],
            capture_output=True, text=True, timeout=15, cwd=WORKDIR,
        )
        issues = json.loads(result.stdout)
        stage_icons = {
            "workflow/backlog": "📥", "workflow/available": "📋",
            "workflow/research": "🔍", "workflow/plan": "📐",
            "workflow/implement": "⚙️", "workflow/self-correct": "🔄",
            "status/blocked": "🚫", "status/done": "✅",
        }
        for iss in issues:
            labels = [l["name"] for l in iss.get("labels", [])]
            iss["icon"] = "📋"
            for lbl, icon in stage_icons.items():
                if lbl in labels:
                    iss["icon"] = icon
                    break
        return issues
    except Exception:
        return []


def get_gateway_status():
    """Read gateway status, with fallback to state file."""
    try:
        resp = urllib.request.urlopen(f"{HERMES_GATEWAY_URL}/api/status", timeout=3)
        status = json.loads(resp.read())
        return {"running": True, "platforms": status.get("gateway_platforms", {})}
    except Exception:
        pass
    # Fallback: read gateway_state.json
    try:
        with open(os.path.expanduser("~/.hermes/gateway_state.json")) as f:
            data = json.load(f)
        return {
            "running": data.get("gateway_state") == "running",
            "platforms": data.get("platforms", {}),
        }
    except Exception:
        return {"running": False, "platforms": {}}


def get_cron():
    """Parse `hermes cron list` output."""
    try:
        result = subprocess.run(["hermes", "cron", "list"],
                                capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            print(f"[dashboard] cron error: rc={result.returncode} stderr={result.stderr!r}")
            return []
        lines = result.stdout.strip().split("\n")
        jobs = []
        current = {}
        for line in lines:
            if not line.strip():
                if current:
                    jobs.append(current)
                    current = {}
                continue
            if "Name:" in line:
                current["name"] = line.split("Name:")[-1].strip()
            elif "Schedule:" in line:
                current["schedule"] = line.split("Schedule:")[-1].strip()
            elif "Status:" in line:
                current["status"] = line.split("Status:")[-1].strip()
            elif "[" in line and "]" in line:
                s = line.strip().split()
                if s:
                    current["id"] = s[0]
                if "[" in line:
                    current["state"] = line.split("[")[-1].split("]")[0]
        if current:
            jobs.append(current)
        return jobs
    except FileNotFoundError:
        print("[dashboard] cron: hermes CLI not found")
        return []
    except subprocess.TimeoutExpired:
        print("[dashboard] cron: hermes timed out")
        return []
    except Exception as e:
        print(f"[dashboard] cron error: {e}")
        return []


def get_opencode_status():
    try:
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
        return "opencode" in result.stdout and "serve" in result.stdout
    except Exception:
        return False


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/dashboard":
            data = {
                "now": int(time.time()),
                "active_agents": get_active_agents(),
                "issues": get_pipeline_issues(),
                "cron_jobs": get_cron(),
                "gateway": get_gateway_status(),
                "opencode": get_opencode_status(),
            }
            self._json(data)
        elif self.path in ("/", "/dashboard.html"):
            self._serve("dashboard.html")
        else:
            self._serve(self.path.lstrip("/"))

    def _json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _serve(self, filename):
        path = os.path.join(WORKDIR, filename)
        if not os.path.exists(path):
            self.send_response(404)
            self.end_headers()
            return
        ext = os.path.splitext(filename)[1]
        ct = {".html": "text/html; charset=utf-8",
              ".js": "application/javascript",
              ".css": "text/css"}.get(ext, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.end_headers()
        with open(path, "rb") as f:
            self.wfile.write(f.read())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = 8080
    s = http.server.HTTPServer(("0.0.0.0", port), DashboardHandler)
    print(f"Dashboard: http://0.0.0.0:{port}/dashboard.html")
    s.serve_forever()
