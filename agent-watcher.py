"""
Codex Office - Agent Watcher (Real Codex Detection)

Detects actual Codex CLI/VS Code sessions using three methods:
1. Process scanning: finds 'node' processes running codex binary + native codex app-server
2. SQLite polling: reads ~/.codex/state_5.sqlite for thread metadata (title, model, cwd)
3. Log analysis: reads ~/.codex/logs_1.sqlite for recent activity to classify state

State classification:
  - Recent log activity (< 5s) with high CPU -> coding
  - Recent log activity (< 10s) with moderate CPU -> thinking
  - Some activity (< 30s) -> searching
  - No recent activity -> idle

Sub-agent detection:
  - Parses JSON source column in threads for subagent spawn info
  - Queries thread_spawn_edges table for parent/child relationships
  - Sub-agents get their own entries with depth and role metadata
"""

import subprocess
import sqlite3
import time
import json
import sys
import os
from pathlib import Path

try:
    import requests
except ImportError:
    print("Installing requests...")
    subprocess.run([sys.executable, "-m", "pip", "install", "--break-system-packages", "-q", "requests"])
    import requests

BACKEND_URL = "http://localhost:19000"
POLL_INTERVAL = 2  # seconds
DEBOUNCE_COUNT = 2  # consecutive readings before state change

CODEX_HOME = Path.home() / ".codex"
STATE_DB = CODEX_HOME / "state_5.sqlite"
LOGS_DB = CODEX_HOME / "logs_1.sqlite"

# CPU thresholds
CPU_CODING = 15     # >15% = coding
CPU_THINKING = 5    # 5-15% = thinking
CPU_IDLE = 2        # <2% = idle

# Track state
agent_states = {}   # key -> { state, pending, count, name, source, ... }
agent_counter = 0
thread_cache = {}   # thread_id -> { title, model, cwd, ... }


# --- Process Detection -------------------------------------------------------

def get_codex_processes():
    """
    Find running Codex processes by scanning full args.

    Codex runs as TWO processes:
      1. Node launcher: node /path/to/codex exec ...  (TTY=??, low CPU - just a shim)
      2. Native binary: /path/to/codex-darwin-arm64/.../codex exec ...  (TTY=??, actual work)
    We detect the NATIVE binary (the real worker) and skip the node shim.

    VS Code extension runs as: codex app-server (background, TTY=??)
    """
    try:
        result = subprocess.run(
            ["ps", "-eo", "pid,pcpu,tty,args"],
            capture_output=True, text=True, timeout=5
        )
        processes = []
        seen_pids = set()
        seen_vscode_groups = set()
        seen_cli_sessions = set()  # group node shim + native binary

        for line in result.stdout.strip().split("\n")[1:]:
            parts = line.split(None, 3)
            if len(parts) < 4:
                continue

            pid = parts[0]
            try:
                cpu = float(parts[1])
            except ValueError:
                continue
            tty = parts[2]
            args = parts[3]

            if pid in seen_pids:
                continue

            args_lower = args.lower()

            # Skip non-codex processes
            if "codex" not in args_lower:
                continue

            # Skip MCP bridge and chatgpt extension internals
            if "codex-mcp-bridge" in args or "chatgpt" in args_lower:
                continue

            # -- Method 1: Codex Native Binary (the real worker) --
            # Path pattern: .../codex-darwin-arm64/vendor/.../codex exec ...
            # This is the process doing actual work (high CPU)
            if ("vendor" in args and "codex" in args
                    and "app-server" not in args):
                source = "cli"
                label = _extract_codex_label(args)
                session_key = _extract_session_key(args)
                if session_key not in seen_cli_sessions:
                    seen_cli_sessions.add(session_key)
                    processes.append({
                        "pid": pid,
                        "cpu": cpu,
                        "tty": tty if tty not in ("??", "-") else "cli",
                        "args": args,
                        "source": source,
                        "label": label,
                        "_group_key": f"cli_{session_key}",
                    })
                else:
                    # Update CPU if higher
                    for p in processes:
                        if p.get("_group_key") == f"cli_{session_key}":
                            p["cpu"] = max(p["cpu"], cpu)
                            break
                seen_pids.add(pid)
                continue

            # -- Method 2: Codex CLI Node Launcher (shim) --
            # Pattern: node /path/to/bin/codex exec ...
            # Only use this if no native binary was found for this session
            if ("node" in args_lower and "/codex" in args
                    and "app-server" not in args):
                source = "cli"
                label = _extract_codex_label(args)
                session_key = _extract_session_key(args)
                if session_key not in seen_cli_sessions:
                    seen_cli_sessions.add(session_key)
                    processes.append({
                        "pid": pid,
                        "cpu": cpu,
                        "tty": tty if tty not in ("??", "-") else "cli",
                        "args": args,
                        "source": source,
                        "label": label,
                        "_group_key": f"cli_{session_key}",
                    })
                seen_pids.add(pid)
                continue

            # -- Method 3: Codex VS Code Extension --
            # Native binary: codex app-server (may have multiple instances)
            if "app-server" in args:
                source = "vscode"
                ext_version = _extract_vscode_ext_version(args)
                group_key = f"vscode_{ext_version}"
                if group_key not in seen_vscode_groups:
                    seen_vscode_groups.add(group_key)
                    processes.append({
                        "pid": pid,
                        "cpu": cpu,
                        "tty": tty if tty not in ("??", "-") else "vscode",
                        "args": args,
                        "source": source,
                        "label": "VS Code Codex",
                        "_group_key": group_key,
                    })
                else:
                    for p in processes:
                        if p.get("_group_key") == group_key:
                            p["cpu"] = max(p["cpu"], cpu)
                            break
                seen_pids.add(pid)
                continue

        return processes

    except Exception as e:
        print(f"  [!] Process scan error: {e}", file=sys.stderr)
        return []


def _extract_codex_label(args):
    """Extract a readable label from codex command args.
    Note: ps output strips shell quotes, so multi-word prompts appear as separate args.
    """
    import re

    # Find everything after the last '/codex ' in args
    m = re.search(r'/codex\s+(.+)', args)
    if not m:
        m = re.search(r'codex\s+(.+)', args)
    if not m:
        return "Codex CLI"

    remainder = m.group(1).strip()

    # Remove known flags
    clean = re.sub(r'--\S+', '', remainder).strip()

    # Parse subcommand
    if remainder.startswith(("exec ", "e ")):
        # After 'exec', everything else is the prompt/command
        prompt_part = re.sub(r'^(exec|e)\s+', '', clean).strip()
        if prompt_part:
            return f"Exec: {prompt_part[:35]}"
        return "Codex Exec"
    if remainder.startswith("review"):
        return "Codex Review"
    if remainder.startswith("resume"):
        return "Codex Resume"
    if remainder.startswith("mcp"):
        return "Codex MCP"

    # Interactive session with prompt
    if clean and not clean.startswith("-"):
        return f"Codex: {clean[:30]}"

    return "Codex CLI"


def _extract_session_key(args):
    """Extract a unique key for grouping CLI processes of the same session.
    The node launcher and native binary share the same args after 'codex'.
    """
    # Find 'codex' in args and use everything after as the key
    lower = args.lower()
    idx = lower.rfind("/codex ")
    if idx >= 0:
        return args[idx + 7:].strip()[:80]
    idx = lower.rfind("codex ")
    if idx >= 0:
        return args[idx + 6:].strip()[:80]
    return args[-80:]


def _extract_vscode_ext_version(args):
    """Extract VS Code extension version from app-server path for grouping."""
    # Path like: .vscode/extensions/openai.chatgpt-26.325.31654-darwin-arm64/bin/...
    import re
    m = re.search(r'openai\.chatgpt-([0-9.]+)', args)
    if m:
        return m.group(1)
    return "default"


# --- SQLite Session Detection -------------------------------------------------

def get_active_threads():
    """
    Query Codex's state DB for recently active threads.
    Returns sessions updated in the last 5 minutes.
    Also detects sub-agent threads via source JSON and thread_spawn_edges.
    """
    if not STATE_DB.exists():
        return []

    try:
        conn = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True, timeout=2)
        conn.row_factory = sqlite3.Row
        cutoff = int(time.time()) - 300  # last 5 minutes

        rows = conn.execute("""
            SELECT id, title, model, source, cwd, created_at, updated_at,
                   cli_version, first_user_message, agent_nickname, agent_role
            FROM threads
            WHERE archived = 0 AND updated_at > ?
            ORDER BY updated_at DESC
            LIMIT 20
        """, (cutoff,)).fetchall()

        # Query thread_spawn_edges for open sub-agent relationships
        spawn_edges = {}
        try:
            edge_rows = conn.execute("""
                SELECT child_thread_id, parent_thread_id
                FROM thread_spawn_edges
                WHERE status = 'open'
            """).fetchall()
            for edge in edge_rows:
                spawn_edges[edge["child_thread_id"]] = edge["parent_thread_id"]
        except sqlite3.OperationalError:
            # Table may not exist in older versions
            pass

        conn.close()

        threads = []
        for row in rows:
            raw_source = row["source"] or "cli"
            is_subagent = False
            parent_thread_id = None
            depth = 0
            agent_role = row["agent_role"] or ""

            # Parse source column: if it starts with '{', it's JSON with spawn info
            if raw_source.startswith("{"):
                try:
                    source_data = json.loads(raw_source)
                    # Extract subagent spawn info from JSON
                    spawn_info = source_data.get("subagent.thread_spawn") or source_data.get("subagent", {})
                    if spawn_info:
                        is_subagent = True
                        parent_thread_id = spawn_info.get("parent_thread_id", "")
                        depth = spawn_info.get("depth", 1)
                    # Normalize source to "cli" since the JSON is metadata, not a source type
                    raw_source = "cli"
                except (json.JSONDecodeError, AttributeError):
                    raw_source = "cli"

            # Fallback: check thread_spawn_edges for sub-agent detection
            if not is_subagent and row["id"] in spawn_edges:
                is_subagent = True
                parent_thread_id = spawn_edges[row["id"]]
                depth = 1

            thread = {
                "id": row["id"],
                "title": row["title"] or "Untitled",
                "model": row["model"] or "unknown",
                "source": raw_source,
                "cwd": row["cwd"] or "",
                "updated_at": row["updated_at"],
                "nickname": row["agent_nickname"] or "",
                "first_message": (row["first_user_message"] or "")[:80],
                "is_subagent": is_subagent,
                "parent_thread_id": parent_thread_id,
                "depth": depth,
                "agent_role": agent_role,
            }
            thread_cache[thread["id"]] = thread
            threads.append(thread)

        return threads

    except (sqlite3.Error, OSError) as e:
        return []


def get_recent_log_activity(thread_id=None, seconds=30):
    """
    Check recent log activity from Codex's logs DB.
    Returns the count of log entries in the last N seconds.
    """
    if not LOGS_DB.exists():
        return 0

    try:
        conn = sqlite3.connect(f"file:{LOGS_DB}?mode=ro", uri=True, timeout=2)
        cutoff = int(time.time()) - seconds

        if thread_id:
            row = conn.execute(
                "SELECT COUNT(*) FROM logs WHERE ts > ? AND thread_id = ?",
                (cutoff, thread_id)
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT COUNT(*) FROM logs WHERE ts > ?",
                (cutoff,)
            ).fetchone()

        conn.close()
        return row[0] if row else 0

    except (sqlite3.Error, OSError):
        return 0


def get_log_based_state(thread_id=None):
    """
    Determine agent state from log activity patterns.
    More recent/frequent logs = more active state.
    """
    recent_5s = get_recent_log_activity(thread_id, seconds=5)
    recent_15s = get_recent_log_activity(thread_id, seconds=15)
    recent_60s = get_recent_log_activity(thread_id, seconds=60)

    if recent_5s > 10:
        return "coding"    # heavy activity
    elif recent_15s > 5:
        return "thinking"  # moderate activity
    elif recent_60s > 2:
        return "searching" # some activity
    else:
        return "idle"


# --- Combined Detection -------------------------------------------------------

def detect_all_agents():
    """
    Combine process detection + SQLite polling for comprehensive agent detection.

    Priority:
    1. Process-based detection (reliable for CPU state)
    2. SQLite thread detection (enriches with metadata)
    3. Sub-agent threads always get their own entry
    """
    agents = {}

    # Method 1: Process scanning
    processes = get_codex_processes()
    for proc in processes:
        # Use group key for VS Code (multiple PIDs -> one agent), PID for CLI
        if proc.get("_group_key"):
            key = proc["_group_key"]
        else:
            key = f"proc_{proc['pid']}"
        cpu_state = classify_cpu_state(proc["cpu"], agent_states.get(key, {}).get("state", "idle"))

        agents[key] = {
            "key": key,
            "pid": proc["pid"],
            "cpu": proc["cpu"],
            "tty": proc["tty"],
            "source": proc["source"],
            "label": proc["label"],
            "state": cpu_state,
            "detection": "process",
        }

    # Method 2: SQLite active threads
    threads = get_active_threads()
    for thread in threads:
        # Sub-agent threads always get their own entry
        if thread["is_subagent"]:
            key = f"sub_{thread['id'][:8]}"
            log_state = get_log_based_state(thread["id"])

            # Resolve parent label
            parent_label = ""
            if thread["parent_thread_id"]:
                # Check thread_cache first
                parent = thread_cache.get(thread["parent_thread_id"])
                if parent:
                    parent_label = _shorten(parent.get("title", ""), 30) or thread["parent_thread_id"][:8]
                else:
                    # Check existing agents for a matching thread_id
                    for ag in agents.values():
                        if ag.get("thread_id") == thread["parent_thread_id"]:
                            parent_label = ag.get("label", thread["parent_thread_id"][:8])
                            break
                    if not parent_label:
                        parent_label = thread["parent_thread_id"][:8]

            agents[key] = {
                "key": key,
                "pid": "",
                "cpu": 0,
                "tty": thread["source"],
                "source": thread["source"],
                "label": _shorten(thread["title"], 40),
                "state": log_state,
                "detection": "sqlite+subagent",
                "thread_id": thread["id"],
                "model": thread["model"],
                "cwd": thread["cwd"],
                "is_subagent": True,
                "parent_thread_id": thread["parent_thread_id"],
                "parent_label": parent_label,
                "nickname": thread["nickname"],
                "agent_role": thread["agent_role"],
                "depth": thread["depth"],
            }
            continue

        # Regular threads: check if already represented by a process
        already_found = False
        for agent in agents.values():
            if agent["source"] == thread["source"]:
                # Enrich with thread metadata
                agent["thread_id"] = thread["id"]
                agent["label"] = _shorten(thread["title"], 40) or agent["label"]
                agent["model"] = thread["model"]
                agent["cwd"] = thread["cwd"]
                already_found = True
                break

        if not already_found:
            # This is a thread with no detected process - may be VS Code background
            key = f"thread_{thread['id'][:8]}"
            log_state = get_log_based_state(thread["id"])

            # Only show if there was recent activity (within 2 min)
            if int(time.time()) - thread["updated_at"] < 120:
                agents[key] = {
                    "key": key,
                    "pid": "",
                    "cpu": 0,
                    "tty": thread["source"],
                    "source": thread["source"],
                    "label": _shorten(thread["title"], 40),
                    "state": log_state,
                    "detection": "sqlite",
                    "thread_id": thread["id"],
                    "model": thread["model"],
                    "cwd": thread["cwd"],
                }

    return agents


def classify_cpu_state(cpu, current_state):
    """Classify agent state from CPU usage."""
    if cpu > CPU_CODING:
        return "coding"
    elif cpu > CPU_THINKING:
        return "thinking"
    elif cpu > CPU_IDLE:
        if current_state in ("coding", "thinking"):
            return current_state  # hysteresis
        return "searching"
    else:
        return "idle"


def _shorten(text, maxlen):
    if not text:
        return ""
    text = text.replace("\n", " ").strip()
    if len(text) > maxlen:
        return text[:maxlen - 3] + "..."
    return text


# --- State Management ---------------------------------------------------------

def debounced_state(key, new_state, agent_info):
    """Apply debouncing to prevent state flapping."""
    global agent_counter

    if key not in agent_states:
        agent_counter += 1
        name = agent_info.get("label", f"agent{agent_counter}")
        agent_states[key] = {
            "state": new_state,
            "pending": new_state,
            "count": DEBOUNCE_COUNT,
            "name": name,
        }
        return new_state

    entry = agent_states[key]
    # Update name if we got better info
    if agent_info.get("label"):
        entry["name"] = agent_info["label"]

    if new_state == entry["state"]:
        entry["pending"] = new_state
        entry["count"] = 0
        return entry["state"]

    if new_state == entry["pending"]:
        entry["count"] += 1
    else:
        entry["pending"] = new_state
        entry["count"] = 1

    if entry["count"] >= DEBOUNCE_COUNT:
        entry["state"] = new_state
        entry["count"] = 0
        return new_state

    return entry["state"]


def post_state(agent_id, state, pid, tty, task="", **extra):
    try:
        payload = {"id": agent_id, "state": state, "pid": pid, "tty": tty, "task": task}
        payload.update(extra)
        requests.post(
            f"{BACKEND_URL}/agent/state",
            json=payload,
            timeout=1,
        )
    except requests.RequestException:
        pass


def post_leave(agent_id):
    try:
        requests.post(
            f"{BACKEND_URL}/agent/leave",
            json={"id": agent_id},
            timeout=1,
        )
    except requests.RequestException:
        pass


def build_task_description(agent_info, state):
    """Build a meaningful task description from agent info."""
    label = agent_info.get("label", "")
    model = agent_info.get("model", "")
    cwd = agent_info.get("cwd", "")
    source = agent_info.get("source", "")

    parts = []

    # Prepend [role] for sub-agents with a role
    if agent_info.get("is_subagent") and agent_info.get("agent_role"):
        parts.append(f"[{agent_info['agent_role']}]")

    if state == "coding":
        parts.append("Working")
    elif state == "thinking":
        parts.append("Thinking")
    elif state == "searching":
        parts.append("Searching")
    else:
        parts.append("Idle")

    if model:
        parts.append(f"({model})")

    if cwd:
        project = os.path.basename(cwd)
        if project:
            parts.append(f"in {project}")

    if source == "vscode":
        parts.append("[VS Code]")

    return " ".join(parts)


# --- Main Loop ----------------------------------------------------------------

def main():
    print("=" * 56)
    print("   Codex Office - Agent Watcher (Real Detection)")
    print("=" * 56)
    print(f"  Backend:   {BACKEND_URL}")
    print(f"  Codex DB:  {STATE_DB}")
    print(f"  Logs DB:   {LOGS_DB}")
    print(f"  Interval:  {POLL_INTERVAL}s")
    print()

    # Check for Codex installation
    if not CODEX_HOME.exists():
        print("  [!] ~/.codex not found. Is Codex CLI installed?")
        print("  [!] Falling back to process-only detection.")
    else:
        print(f"  [ok] Codex home found: {CODEX_HOME}")
        if STATE_DB.exists():
            print(f"  [ok] State DB found ({STATE_DB.stat().st_size // 1024 // 1024}MB)")
        if LOGS_DB.exists():
            print(f"  [ok] Logs DB found ({LOGS_DB.stat().st_size // 1024 // 1024}MB)")

    print()
    print("  Watching for Codex sessions...")
    print("  (Start a Codex session to see it appear)")
    print()

    known_keys = set()

    while True:
        try:
            detected = detect_all_agents()
            current_keys = set(detected.keys())

            # Departed agents
            departed = known_keys - current_keys
            for key in departed:
                if key in agent_states:
                    name = agent_states[key]["name"]
                    post_leave(name)
                    print(f"  [-] {name} departed")
                    del agent_states[key]

            known_keys = current_keys

            # Update/add agents
            for key, agent_info in detected.items():
                raw_state = agent_info["state"]
                final_state = debounced_state(key, raw_state, agent_info)
                name = agent_states[key]["name"]
                task = build_task_description(agent_info, final_state)

                prev = agent_states[key].get("last_posted")
                is_new = prev is None

                # Build extra kwargs for sub-agents
                extra = {}
                if agent_info.get("is_subagent"):
                    extra["is_subagent"] = True
                    extra["nickname"] = agent_info.get("nickname", "")
                    extra["agent_role"] = agent_info.get("agent_role", "")
                    extra["parent_id"] = agent_info.get("parent_label", "")

                if is_new or prev != final_state:
                    post_state(name, final_state, agent_info.get("pid", ""),
                              agent_info.get("tty", ""), task, **extra)
                    agent_states[key]["last_posted"] = final_state

                    if is_new:
                        src = agent_info.get("detection", "?")
                        if agent_info.get("is_subagent"):
                            role = agent_info.get("agent_role", "")
                            parent = agent_info.get("parent_label", "?")
                            depth = agent_info.get("depth", 1)
                            nick = agent_info.get("nickname", "")
                            role_str = f" role={role}" if role else ""
                            nick_str = f" ({nick})" if nick else ""
                            print(f"  [+] {name}{nick_str} joined ({src}) - sub-agent of {parent} depth={depth}{role_str} - {final_state}")
                        else:
                            print(f"  [+] {name} joined ({src}) - {final_state}")
                    elif prev and prev != final_state:
                        cpu = agent_info.get("cpu", 0)
                        print(f"  [~] {name}: {prev} -> {final_state} (CPU: {cpu:.1f}%)")

            time.sleep(POLL_INTERVAL)

        except KeyboardInterrupt:
            print("\n  Watcher stopped.")
            # Clean up all agents
            for key in list(agent_states.keys()):
                name = agent_states[key]["name"]
                post_leave(name)
            break
        except Exception as e:
            print(f"  [!] Error: {e}", file=sys.stderr)
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
