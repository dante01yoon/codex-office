"""
Codex Office - Simulation Script
Simulates multiple agents with realistic state transitions for demo/testing.
"""

import time
import random
import requests
import sys

BACKEND_URL = "http://localhost:19000"

AGENTS = [
    {"id": "agent1", "personality": "worker"},    # mostly coding
    {"id": "agent2", "personality": "thinker"},    # lots of thinking
    {"id": "agent3", "personality": "searcher"},   # searches a lot
    {"id": "agent4", "personality": "balanced"},    # mix of everything
]

TASKS = {
    "coding": [
        "Implementing auth module",
        "Fixing CSS layout bug",
        "Writing API endpoint",
        "Refactoring database layer",
        "Building React component",
        "Adding unit tests",
        "Updating dependencies",
        "Optimizing queries",
    ],
    "thinking": [
        "Analyzing architecture",
        "Planning sprint tasks",
        "Reviewing PR #42",
        "Designing API schema",
        "Evaluating trade-offs",
    ],
    "searching": [
        "Searching for utils.ts",
        "Finding references to UserModel",
        "Scanning error logs",
        "Looking up documentation",
        "Checking git history",
    ],
    "idle": [
        "Waiting for input",
        "Coffee break",
        "Idle",
    ],
}

# State transition probabilities by personality
TRANSITIONS = {
    "worker": {
        "coding": {"coding": 0.7, "thinking": 0.15, "searching": 0.1, "idle": 0.05},
        "thinking": {"coding": 0.5, "thinking": 0.3, "searching": 0.15, "idle": 0.05},
        "searching": {"coding": 0.4, "thinking": 0.2, "searching": 0.3, "idle": 0.1},
        "idle": {"coding": 0.5, "thinking": 0.2, "searching": 0.1, "idle": 0.2},
    },
    "thinker": {
        "coding": {"coding": 0.3, "thinking": 0.5, "searching": 0.1, "idle": 0.1},
        "thinking": {"coding": 0.2, "thinking": 0.5, "searching": 0.2, "idle": 0.1},
        "searching": {"coding": 0.2, "thinking": 0.4, "searching": 0.3, "idle": 0.1},
        "idle": {"coding": 0.2, "thinking": 0.4, "searching": 0.1, "idle": 0.3},
    },
    "searcher": {
        "coding": {"coding": 0.3, "thinking": 0.1, "searching": 0.5, "idle": 0.1},
        "thinking": {"coding": 0.2, "thinking": 0.2, "searching": 0.5, "idle": 0.1},
        "searching": {"coding": 0.3, "thinking": 0.1, "searching": 0.4, "idle": 0.2},
        "idle": {"coding": 0.2, "thinking": 0.1, "searching": 0.4, "idle": 0.3},
    },
    "balanced": {
        "coding": {"coding": 0.4, "thinking": 0.25, "searching": 0.2, "idle": 0.15},
        "thinking": {"coding": 0.3, "thinking": 0.3, "searching": 0.25, "idle": 0.15},
        "searching": {"coding": 0.3, "thinking": 0.25, "searching": 0.3, "idle": 0.15},
        "idle": {"coding": 0.3, "thinking": 0.25, "searching": 0.2, "idle": 0.25},
    },
}


def weighted_choice(options):
    """Pick a random option based on weights."""
    r = random.random()
    cumulative = 0
    for state, prob in options.items():
        cumulative += prob
        if r <= cumulative:
            return state
    return list(options.keys())[-1]


def post_state(agent_id, state, task=""):
    try:
        requests.post(
            f"{BACKEND_URL}/agent/state",
            json={"id": agent_id, "state": state, "task": task},
            timeout=2,
        )
    except requests.RequestException:
        pass


def post_leave(agent_id):
    try:
        requests.post(
            f"{BACKEND_URL}/agent/leave",
            json={"id": agent_id},
            timeout=2,
        )
    except requests.RequestException:
        pass


def main():
    num_agents = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    agents_to_use = AGENTS[:num_agents]

    print("=" * 50)
    print("  Codex Office - Simulation Mode")
    print("=" * 50)
    print(f"Simulating {len(agents_to_use)} agents...")
    print("Press Ctrl+C to stop\n")

    # Initialize agents
    agent_current = {}
    for agent in agents_to_use:
        state = "idle"
        task = random.choice(TASKS[state])
        agent_current[agent["id"]] = state
        post_state(agent["id"], state, task)
        print(f"  [+] {agent['id']} joined ({agent['personality']})")
        time.sleep(0.5)

    # Stagger initial states
    time.sleep(1)
    for agent in agents_to_use:
        state = random.choice(["coding", "thinking", "idle"])
        task = random.choice(TASKS[state])
        agent_current[agent["id"]] = state
        post_state(agent["id"], state, task)
        print(f"  [~] {agent['id']} -> {state}: {task}")

    print("\nSimulation running...\n")

    # Occasionally add/remove agents for dynamic feel
    active_agents = set(a["id"] for a in agents_to_use)
    cycle = 0

    try:
        while True:
            cycle += 1
            time.sleep(random.uniform(3, 8))

            # Pick a random active agent to update
            if not active_agents:
                continue

            agent_id = random.choice(list(active_agents))
            agent = next(a for a in agents_to_use if a["id"] == agent_id)
            current_state = agent_current.get(agent_id, "idle")

            # Get next state based on personality
            transitions = TRANSITIONS[agent["personality"]]
            next_state = weighted_choice(transitions[current_state])
            task = random.choice(TASKS[next_state])

            if next_state != current_state:
                agent_current[agent_id] = next_state
                post_state(agent_id, next_state, task)
                print(f"  [~] {agent_id}: {current_state} -> {next_state}: {task}")

            # Occasionally add/remove agents (every ~20 cycles)
            if cycle % 20 == 0 and len(agents_to_use) > 2:
                if len(active_agents) > 2 and random.random() < 0.3:
                    leaving = random.choice(list(active_agents))
                    active_agents.discard(leaving)
                    post_leave(leaving)
                    print(f"  [-] {leaving} departed")
                elif len(active_agents) < len(agents_to_use) and random.random() < 0.5:
                    rejoining = random.choice([a["id"] for a in agents_to_use if a["id"] not in active_agents])
                    active_agents.add(rejoining)
                    state = "idle"
                    task = random.choice(TASKS[state])
                    agent_current[rejoining] = state
                    post_state(rejoining, state, task)
                    print(f"  [+] {rejoining} rejoined")

    except KeyboardInterrupt:
        print("\n\nStopping simulation...")
        for agent_id in list(active_agents):
            post_leave(agent_id)
            print(f"  [-] {agent_id} departed")
        print("Done!")


if __name__ == "__main__":
    main()
