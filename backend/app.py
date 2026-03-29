"""Codex Office Backend - Flask server for agent state management."""

import json
import os
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


if __name__ == "__main__":
    # Initialize empty agents file
    if not os.path.exists(AGENTS_FILE):
        save_agents([])
    app.run(host="0.0.0.0", port=19000, debug=False)
