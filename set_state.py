"""
Codex Office - Manual State Control
Usage: python3 set_state.py <agent_id> <state> [task]

States: coding, thinking, searching, idle, error
"""

import sys
import requests

BACKEND_URL = "http://localhost:19000"

VALID_STATES = {"coding", "thinking", "searching", "idle", "error"}


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 set_state.py <agent_id> <state> [task]")
        print(f"Valid states: {', '.join(sorted(VALID_STATES))}")
        sys.exit(1)

    agent_id = sys.argv[1]
    state = sys.argv[2]
    task = sys.argv[3] if len(sys.argv) > 3 else ""

    if state not in VALID_STATES:
        print(f"Invalid state: {state}")
        print(f"Valid states: {', '.join(sorted(VALID_STATES))}")
        sys.exit(1)

    try:
        res = requests.post(
            f"{BACKEND_URL}/agent/state",
            json={"id": agent_id, "state": state, "task": task},
            timeout=5,
        )
        print(f"Set {agent_id} -> {state}" + (f" ({task})" if task else ""))
    except requests.RequestException as e:
        print(f"Error: Could not reach backend at {BACKEND_URL}")
        print(f"Is the server running? Start with: python3 backend/app.py")
        sys.exit(1)


if __name__ == "__main__":
    main()
