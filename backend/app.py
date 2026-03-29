"""Codex Office Backend - Flask server for agent state management."""

import json
import os
import re
import sqlite3
import subprocess
import time
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=None)
CORS(app)

AGENTS_FILE = os.path.join(os.path.dirname(__file__), "agents.json")
STALE_TIMEOUT = 120  # seconds before auto-idle

activity_log = []
MAX_LOG_ENTRIES = 100


def load_agents():
    if os.path.exists(AGENTS_FILE):
        with open(AGENTS_FILE, "r") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []


def save_agents(agents):
    with open(AGENTS_FILE, "w") as f:
        json.dump(agents, f, indent=2)


def add_log(agent_id, state, task=""):
    entry = {
        "time": time.strftime("%H:%M:%S"),
        "timestamp": time.time(),
        "agent_id": agent_id,
        "state": state,
        "task": task,
    }
    activity_log.insert(0, entry)
    if len(activity_log) > MAX_LOG_ENTRIES:
        activity_log.pop()


def cleanup_stale_agents(agents):
    now = time.time()
    changed = False
    for agent in agents:
        if agent.get("state") in ("coding", "thinking", "searching"):
            last_update = agent.get("last_update", now)
            if now - last_update > STALE_TIMEOUT:
                agent["state"] = "idle"
                agent["task"] = ""
                add_log(agent["id"], "idle", "Auto-idled (stale)")
                changed = True
    return changed


# --- API Routes ---


@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("../frontend", path)


@app.route("/agents", methods=["GET"])
def get_agents():
    agents = load_agents()
    if cleanup_stale_agents(agents):
        save_agents(agents)
    return jsonify(agents)


@app.route("/agent/state", methods=["POST"])
def update_agent_state():
    data = request.json
    agent_id = data.get("id")
    state = data.get("state", "idle")
    task = data.get("task", "")
    pid = data.get("pid", "")
    tty = data.get("tty", "")
    parent_id = data.get("parent_id", "")
    is_subagent = data.get("is_subagent", False)
    nickname = data.get("nickname", "")
    agent_role = data.get("agent_role", "")

    agents = load_agents()
    found = False
    for agent in agents:
        if agent["id"] == agent_id:
            old_state = agent.get("state")
            agent["state"] = state
            agent["task"] = task
            agent["pid"] = pid
            agent["tty"] = tty
            agent["parent_id"] = parent_id
            agent["is_subagent"] = is_subagent
            agent["nickname"] = nickname
            agent["agent_role"] = agent_role
            agent["last_update"] = time.time()
            if old_state != state:
                add_log(agent_id, state, task)
            found = True
            break

    if not found:
        agent = {
            "id": agent_id,
            "state": state,
            "task": task,
            "pid": pid,
            "tty": tty,
            "parent_id": parent_id,
            "is_subagent": is_subagent,
            "nickname": nickname,
            "agent_role": agent_role,
            "last_update": time.time(),
            "joined": time.time(),
        }
        agents.append(agent)
        add_log(agent_id, "joined", f"New agent ({state})")

    save_agents(agents)
    return jsonify({"status": "ok"})


@app.route("/agent/leave", methods=["POST"])
def agent_leave():
    data = request.json
    agent_id = data.get("id")
    agents = load_agents()
    agents = [a for a in agents if a["id"] != agent_id]
    save_agents(agents)
    add_log(agent_id, "left", "Process exited")
    return jsonify({"status": "ok"})


@app.route("/activity", methods=["GET"])
def get_activity():
    return jsonify(activity_log)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/git-status", methods=["GET"])
def git_status():
    """Return current branch, changed files, and recent commits."""
    # Determine working directory: use cwd from first active agent, else codex-office dir
    cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        agents = load_agents()
        active = [a for a in agents if a.get("state") in ("coding", "thinking", "searching")]
        if active and active[0].get("cwd"):
            cwd = active[0]["cwd"]
    except Exception:
        pass

    def run_git(cmd):
        result = subprocess.run(
            cmd, capture_output=True, text=True, cwd=cwd, timeout=5
        )
        return result.stdout.strip()

    try:
        # Current branch
        branch = run_git(["git", "branch", "--show-current"])

        # Changed files via porcelain output
        porcelain = run_git(["git", "status", "--porcelain"])
        files = []
        if porcelain:
            for line in porcelain.splitlines():
                status_code = line[:2].strip()
                path = line[3:]
                status_map = {
                    "M": "modified",
                    "A": "added",
                    "D": "deleted",
                    "R": "renamed",
                    "C": "copied",
                    "??": "untracked",
                    "MM": "modified",
                    "AM": "modified",
                }
                status = status_map.get(status_code, "modified")
                files.append({"path": path, "status": status})

        # Recent commits
        log_output = run_git(["git", "log", "--oneline", "-5"])
        commits = []
        if log_output:
            for line in log_output.splitlines():
                parts = line.split(" ", 1)
                if len(parts) == 2:
                    commits.append({"hash": parts[0], "message": parts[1]})

        return jsonify({"branch": branch, "files": files, "commits": commits})

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Git command timed out"}), 504
    except FileNotFoundError:
        return jsonify({"error": "Git not found"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/context-usage", methods=["GET"])
def context_usage():
    """Return context window utilization for the most recent active thread."""
    home = os.path.expanduser("~")
    db_path = os.path.join(home, ".codex", "state_5.sqlite")
    config_path = os.path.join(home, ".codex", "config.toml")

    # Defaults
    context_window = 1000000
    compact_limit = 900000

    # Try to read context_window from config.toml
    try:
        with open(config_path, "r") as f:
            for line in f:
                m = re.match(r"^\s*model_context_window\s*=\s*(\d+)", line)
                if m:
                    context_window = int(m.group(1))
                m2 = re.match(r"^\s*model_auto_compact_token_limit\s*=\s*(\d+)", line)
                if m2:
                    compact_limit = int(m2.group(1))
    except Exception:
        pass

    # Read tokens_used from the most recent non-archived thread
    tokens_used = 0
    thread_title = ""
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(
            "SELECT tokens_used, title FROM threads "
            "WHERE archived = 0 OR archived IS NULL "
            "ORDER BY updated_at DESC LIMIT 1"
        )
        row = cursor.fetchone()
        if row:
            tokens_used = row["tokens_used"] or 0
            thread_title = row["title"] or ""
        conn.close()
    except Exception:
        pass

    percentage = round((tokens_used / context_window) * 100, 1) if context_window > 0 else 0

    return jsonify({
        "tokens_used": tokens_used,
        "context_window": context_window,
        "compact_limit": compact_limit,
        "percentage": percentage,
        "thread_title": thread_title,
    })


if __name__ == "__main__":
    # Initialize empty agents file
    if not os.path.exists(AGENTS_FILE):
        save_agents([])
    app.run(host="0.0.0.0", port=19000, debug=False)
