"""
Codex Office - Notify Hook

This script receives Codex notification events and forwards them to the Office backend.
Add this to your ~/.codex/config.toml alongside any existing notify command:

    notify = ["python3", "/path/to/codex-office/codex-notify-hook.py"]

Or create a wrapper script that calls both this and your existing notifier.

Codex calls notify with: <script> <JSON_STRING>
The JSON contains: { "type": "agent-turn-complete", "last-assistant-message": "...", "input_messages": [...] }
"""

import json
import sys
import requests

BACKEND_URL = "http://localhost:19000"


def main():
    if len(sys.argv) != 2:
        return 0

    try:
        notification = json.loads(sys.argv[1])
    except (json.JSONDecodeError, IndexError):
        return 0

    event_type = notification.get("type", "")
    last_message = notification.get("last-assistant-message", "")

    if event_type == "agent-turn-complete":
        # Agent finished a turn - it's now waiting for input (idle)
        # The watcher will pick up the process state, but we can send
        # an immediate event for faster UI response
        try:
            requests.post(
                f"{BACKEND_URL}/agent/state",
                json={
                    "id": "codex-notify",
                    "state": "idle",
                    "task": _shorten(last_message, 60) or "Turn complete - waiting for input",
                },
                timeout=1,
            )
        except requests.RequestException:
            pass

    return 0


def _shorten(text, maxlen):
    if not text:
        return ""
    text = " ".join(text.split())
    if len(text) > maxlen:
        return text[:maxlen - 3] + "..."
    return text


if __name__ == "__main__":
    sys.exit(main())
