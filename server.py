#!/usr/bin/env python3
"""Workflow Dashboard — supports both framework and agent-game-test, LAN access."""

import http.server
import json
import os
import sqlite3
import subprocess
import time
import urllib.request

# ── Config ──────────────────────────────────────────────────────────
PORT = int(os.environ.get("DASHBOARD_PORT", "8080"))
FRAMEWORK_DIR = os.path.expanduser("~/workspace")
GAME_DIR = os.path.expanduser("~/workspace/agent-game-test")
STATE_DB = os.path.expanduser("~/.hermes/state.db")
HERMES_GATEWAY_URL = os.environ.get("HERMES_GATEWAY_URL", "http://127.0.0.1:8644")
GITHUB_REPO = "devvi/agent-game-test"

RAW_DIR = os.path.join(GAME_DIR, "docs", "RAW")


# ── Data helpers ────────────────────────────────────────────────────

def get_active_agents():
    """Read currently running sub-agents from state.db."""
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
            msg_row = conn.execute(
                "SELECT substr(content,1,120) as msg FROM messages "
                "WHERE session_id = ? ORDER BY id LIMIT 1",
                (r["id"],)
            ).fetchone()
            title = (msg_row["msg"].strip()[:80] if msg_row and msg_row["msg"] else "(unnamed)")
        title_lower = title.lower()
        phase = "agent"
        for kw, p in [("research","research"),("plan","plan"),
                       ("implement","implement"),("review","review"),
                       ("self-correct","self-correct")]:
            if kw in title_lower:
                phase = p
                break
        agents.append({
            "id": r["id"], "phase": phase,
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
    """GitHub Issues from agent-game-test with workflow labels."""
    try:
        result = subprocess.run(
            ["gh", "issue", "list", "--repo", GITHUB_REPO, "--state", "open",
             "--json", "number,title,labels,createdAt",
             "--limit", "20"],
            capture_output=True, text=True, timeout=15,
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
    """Read gateway status."""
    try:
        resp = urllib.request.urlopen(f"{HERMES_GATEWAY_URL}/api/status", timeout=3)
        status = json.loads(resp.read())
        return {"running": True, "platforms": status.get("gateway_platforms", {})}
    except Exception:
        pass
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
    """Parse hermes cron list output."""
    try:
        result = subprocess.run(["hermes", "cron", "list"],
                                capture_output=True, text=True, timeout=10)
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
    except Exception:
        return []


def get_opencode_status():
    try:
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
        return "opencode" in result.stdout and "serve" in result.stdout
    except Exception:
        return False


def get_plan_list():
    """List game-to-issues plan files in RAW_DIR."""
    if not os.path.exists(RAW_DIR):
        return []
    plans = []
    for f in os.listdir(RAW_DIR):
        if f.endswith(".json") and f.startswith("game-to-issues-"):
            path = os.path.join(RAW_DIR, f)
            try:
                with open(path) as fh:
                    data = json.load(fh)
                meta = data.get("meta", {})
                plans.append({
                    "file": f,
                    "title": meta.get("title", f),
                    "status": meta.get("status", "unknown"),
                    "total_issues": meta.get("total_issues", 0),
                    "engine": meta.get("engine", "?"),
                    "platform": meta.get("platform", "?"),
                })
            except Exception:
                plans.append({"file": f, "title": f, "status": "error"})
    return plans


# ── HTTP Handler ────────────────────────────────────────────────────

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]

        # API: dashboard data
        if path == "/api/dashboard":
            data = {
                "now": int(time.time()),
                "active_agents": get_active_agents(),
                "issues": get_pipeline_issues(),
                "cron_jobs": get_cron(),
                "gateway": get_gateway_status(),
                "opencode": get_opencode_status(),
                "plans": get_plan_list(),
                "repo": GITHUB_REPO,
            }
            self._json(data)

        # Serve dashboard HTML
        elif path in ("/", "/dashboard.html"):
            self._serve_static(os.path.join(FRAMEWORK_DIR, "dashboard.html"))

        # Serve raw files (game-to-issues viewer + plans)
        elif path.startswith("/raw/"):
            rel_path = path[5:]  # strip "/raw/"
            if not rel_path or ".." in rel_path:
                self._error(400, "Bad request")
                return
            file_path = os.path.normpath(os.path.join(RAW_DIR, rel_path))
            if not file_path.startswith(os.path.normpath(RAW_DIR)):
                self._error(403, "Forbidden")
                return
            self._serve_static(file_path)

        else:
            self._error(404, "Not found")

    def _json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _serve_static(self, path):
        if not os.path.exists(path) or not os.path.isfile(path):
            self._error(404, "Not found")
            return
        ext = os.path.splitext(path)[1]
        ct = MIME_TYPES.get(ext, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with open(path, "rb") as f:
            self.wfile.write(f.read())

    def _error(self, code, msg):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(msg.encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    s = http.server.HTTPServer(("0.0.0.0", PORT), DashboardHandler)
    print(f"Dashboard: http://0.0.0.0:{PORT}/")
    print(f"  Issues from: {GITHUB_REPO}")
    print(f"  Plans at:    http://0.0.0.0:{PORT}/raw/viewer.html")
    print(f"  LAN access:  http://<your-lan-ip>:{PORT}/")
    s.serve_forever()
