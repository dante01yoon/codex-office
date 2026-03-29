"""Codex Office Backend - Flask server for agent state management."""

import json
import os
import re
import sqlite3
import subprocess
import time
from pathlib import Path

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


CODEX_HOME = Path.home() / ".codex"
STATE_DB = CODEX_HOME / "state_5.sqlite"
LOGS_DB = CODEX_HOME / "logs_1.sqlite"


def _parse_log_body(body, level):
    """Parse a feedback_log_body string into a typed conversation entry.

    Returns a dict with keys (type, content) or None if the entry should
    be skipped (internal noise).
    """
    if not body:
        return None

    # Extract the human-readable part after the last span closure ": "
    # Format: "span{key=val}:span{...}: <message>"
    msg = body
    colon_idx = body.rfind("}: ")
    if colon_idx >= 0:
        msg = body[colon_idx + 3:].strip()

    if not msg:
        return None

    # Classify the message into a conversation event type
    # ToolCall events
    tool_match = re.match(r"ToolCall:\s*(\S+)\s*(.*)", msg, re.DOTALL)
    if tool_match:
        tool_name = tool_match.group(1)
        tool_args = tool_match.group(2).strip()
        # Try to pretty-print JSON args
        if tool_args.startswith("{"):
            try:
                parsed = json.loads(tool_args.split(" thread_id=")[0])
                tool_args = json.dumps(parsed, indent=2)
            except (json.JSONDecodeError, IndexError):
                pass
        content = f"{tool_name}: {tool_args}" if tool_args else tool_name
        return {"type": "tool", "content": content}

    # Shutdown / lifecycle events
    if "Shutting down" in msg:
        return {"type": "info", "content": msg}

    # User input operations
    if "codex.op=\"user_input\"" in body or "op.dispatch.user_input" in body:
        # Only surface if the message itself is meaningful
        if msg and "cache" not in msg.lower():
            return {"type": "user", "content": msg}

    # Error / warning level entries
    if level in ("WARN", "ERROR"):
        return {"type": "error", "content": msg}

    # Model / API events
    if "models cache" in msg or "cache hit" in msg or "cache entry" in msg:
        return None  # skip noise

    # Generic info from stream_events_utils (responses, completions)
    if any(kw in msg for kw in ("TextDelta", "response", "completion", "output")):
        return {"type": "response", "content": msg}

    # Fallback: include as info if the message is substantial
    if len(msg) > 10:
        return {"type": "info", "content": msg}

    return None


@app.route("/conversation", methods=["GET"])
def get_conversation():
    """Return parsed conversation events from Codex logs.

    Query params:
      thread_id  - specific thread to query (optional; defaults to most recent)
    """
    thread_id = request.args.get("thread_id")

    # Resolve thread_id from state DB if not provided
    if not thread_id:
        if STATE_DB.exists():
            try:
                conn = sqlite3.connect(
                    f"file:{STATE_DB}?mode=ro", uri=True, timeout=3
                )
                row = conn.execute(
                    "SELECT id FROM threads WHERE archived = 0 "
                    "ORDER BY updated_at DESC LIMIT 1"
                ).fetchone()
                conn.close()
                if row:
                    thread_id = row[0]
            except (sqlite3.Error, OSError):
                pass

    if not thread_id:
        return jsonify([])

    # Query logs for this thread
    if not LOGS_DB.exists():
        return jsonify([])

    try:
        conn = sqlite3.connect(
            f"file:{LOGS_DB}?mode=ro", uri=True, timeout=3
        )
        rows = conn.execute(
            "SELECT ts, level, target, feedback_log_body "
            "FROM logs "
            "WHERE thread_id = ? AND feedback_log_body IS NOT NULL "
            "ORDER BY ts DESC, id DESC "
            "LIMIT 200",
            (thread_id,),
        ).fetchall()
        conn.close()
    except (sqlite3.Error, OSError) as exc:
        return jsonify({"error": str(exc)}), 500

    entries = []
    for ts, level, target, body in rows:
        parsed = _parse_log_body(body, level)
        if parsed is None:
            continue
        entries.append(
            {
                "time": time.strftime("%H:%M:%S", time.localtime(ts)),
                "type": parsed["type"],
                "content": parsed["content"],
                "level": level,
            }
        )
        if len(entries) >= 50:
            break

    return jsonify(entries)


if __name__ == "__main__":
    # Initialize empty agents file
    if not os.path.exists(AGENTS_FILE):
        save_agents([])
    app.run(host="0.0.0.0", port=19000, debug=False)
