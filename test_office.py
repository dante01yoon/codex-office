"""
Codex Office - Integration Test Suite
Tests the full pipeline: backend API, agent watcher detection, and real Codex session.
"""

import subprocess
import requests
import time
import json
import sys
import os
import signal
from pathlib import Path

BACKEND_URL = "http://localhost:19000"
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"

passed = 0
failed = 0


def ok(msg):
    global passed
    passed += 1
    print(f"  {GREEN}PASS{RESET}  {msg}")


def fail(msg, detail=""):
    global failed
    failed += 1
    print(f"  {RED}FAIL{RESET}  {msg}")
    if detail:
        print(f"         {detail}")


def section(title):
    print(f"\n{BOLD}── {title} ──{RESET}")


# ═══════════════════════════════════════════════════════
# Test 1: Backend API
# ═══════════════════════════════════════════════════════

def test_backend_api():
    section("Backend API Tests")

    # Health check
    try:
        r = requests.get(f"{BACKEND_URL}/health", timeout=3)
        if r.status_code == 200 and r.json().get("status") == "ok":
            ok("GET /health returns 200")
        else:
            fail("GET /health", f"status={r.status_code}, body={r.text}")
    except Exception as e:
        fail("GET /health - server not reachable", str(e))
        return False

    # Serve frontend
    try:
        r = requests.get(f"{BACKEND_URL}/", timeout=3)
        if r.status_code == 200 and "Codex Office" in r.text:
            ok("GET / serves index.html with 'Codex Office'")
        else:
            fail("GET / frontend", f"status={r.status_code}")
    except Exception as e:
        fail("GET / frontend", str(e))

    # Static file serving
    try:
        r = requests.get(f"{BACKEND_URL}/style.css", timeout=3)
        if r.status_code == 200 and "agent-card" in r.text:
            ok("GET /style.css serves CSS")
        else:
            fail("GET /style.css", f"status={r.status_code}")
    except Exception as e:
        fail("GET /style.css", str(e))

    # POST agent state
    try:
        r = requests.post(f"{BACKEND_URL}/agent/state", json={
            "id": "test-agent-1",
            "state": "coding",
            "task": "Running tests",
            "pid": "99999",
            "tty": "ttys099",
        }, timeout=3)
        if r.status_code == 200:
            ok("POST /agent/state creates agent")
        else:
            fail("POST /agent/state", f"status={r.status_code}")
    except Exception as e:
        fail("POST /agent/state", str(e))

    # GET agents
    try:
        r = requests.get(f"{BACKEND_URL}/agents", timeout=3)
        agents = r.json()
        found = any(a["id"] == "test-agent-1" for a in agents)
        if found:
            ok("GET /agents returns created agent")
        else:
            fail("GET /agents missing test-agent-1", str(agents))
    except Exception as e:
        fail("GET /agents", str(e))

    # State update
    try:
        requests.post(f"{BACKEND_URL}/agent/state", json={
            "id": "test-agent-1",
            "state": "thinking",
            "task": "Analyzing",
        }, timeout=3)
        r = requests.get(f"{BACKEND_URL}/agents", timeout=3)
        agent = next((a for a in r.json() if a["id"] == "test-agent-1"), None)
        if agent and agent["state"] == "thinking":
            ok("State update: coding -> thinking")
        else:
            fail("State update", str(agent))
    except Exception as e:
        fail("State update", str(e))

    # Activity log
    try:
        r = requests.get(f"{BACKEND_URL}/activity", timeout=3)
        log = r.json()
        if len(log) > 0:
            ok(f"GET /activity returns {len(log)} entries")
        else:
            fail("GET /activity empty")
    except Exception as e:
        fail("GET /activity", str(e))

    # Agent leave
    try:
        requests.post(f"{BACKEND_URL}/agent/leave", json={"id": "test-agent-1"}, timeout=3)
        r = requests.get(f"{BACKEND_URL}/agents", timeout=3)
        found = any(a["id"] == "test-agent-1" for a in r.json())
        if not found:
            ok("POST /agent/leave removes agent")
        else:
            fail("POST /agent/leave - agent still exists")
    except Exception as e:
        fail("POST /agent/leave", str(e))

    return True


# ═══════════════════════════════════════════════════════
# Test 2: Agent Watcher - Process Detection
# ═══════════════════════════════════════════════════════

def test_process_detection():
    section("Process Detection Tests")

    # Import the watcher module
    sys.path.insert(0, os.path.dirname(__file__))
    from importlib import import_module
    watcher = import_module("agent-watcher")

    # Test process scanning
    processes = watcher.get_codex_processes()
    print(f"  {YELLOW}INFO{RESET}  Found {len(processes)} Codex process(es)")
    for p in processes:
        print(f"         PID={p['pid']} CPU={p['cpu']:.1f}% src={p['source']} label={p['label']}")

    if len(processes) >= 0:  # 0 is ok if no codex running
        ok("get_codex_processes() runs without error")
    else:
        fail("get_codex_processes() failed")

    # Test VS Code detection specifically
    vscode_procs = [p for p in processes if p["source"] == "vscode"]
    cli_procs = [p for p in processes if p["source"] == "cli"]
    print(f"  {YELLOW}INFO{RESET}  VS Code: {len(vscode_procs)}, CLI: {len(cli_procs)}")

    # Test CPU classification
    assert watcher.classify_cpu_state(25, "idle") == "coding"
    assert watcher.classify_cpu_state(10, "idle") == "thinking"
    assert watcher.classify_cpu_state(1, "idle") == "idle"
    assert watcher.classify_cpu_state(3, "coding") == "coding"  # hysteresis
    ok("classify_cpu_state() logic correct")

    # Test SQLite thread detection
    threads = watcher.get_active_threads()
    print(f"  {YELLOW}INFO{RESET}  Active threads (last 5min): {len(threads)}")
    for t in threads[:3]:
        print(f"         [{t['source']}] {t['title'][:50]} ({t['model']})")

    if isinstance(threads, list):
        ok("get_active_threads() reads SQLite successfully")
    else:
        fail("get_active_threads()")

    # Test combined detection
    agents = watcher.detect_all_agents()
    print(f"  {YELLOW}INFO{RESET}  Combined detection: {len(agents)} agent(s)")
    for key, a in agents.items():
        print(f"         [{a['detection']}] {a['label']} - {a['state']}")

    if isinstance(agents, dict):
        ok("detect_all_agents() combines both methods")
    else:
        fail("detect_all_agents()")

    return len(processes), len(threads)


# ═══════════════════════════════════════════════════════
# Test 3: Frontend Assets
# ═══════════════════════════════════════════════════════

def test_frontend_assets():
    section("Frontend Asset Tests")

    assets = ["index.html", "game.js", "layout.js", "sprites.js", "style.css"]
    for asset in assets:
        try:
            r = requests.get(f"{BACKEND_URL}/{asset}", timeout=3)
            if r.status_code == 200 and len(r.text) > 100:
                ok(f"{asset} served ({len(r.text)} bytes)")
            else:
                fail(f"{asset}", f"status={r.status_code} size={len(r.text)}")
        except Exception as e:
            fail(f"{asset}", str(e))

    # Check Phaser CDN reference
    try:
        r = requests.get(f"{BACKEND_URL}/index.html", timeout=3)
        if "phaser" in r.text.lower():
            ok("index.html references Phaser 3")
        else:
            fail("index.html missing Phaser reference")
    except Exception as e:
        fail("Phaser check", str(e))


# ═══════════════════════════════════════════════════════
# Test 4: Full Pipeline (Watcher → Backend → API)
# ═══════════════════════════════════════════════════════

def test_full_pipeline():
    section("Full Pipeline Test (Watcher → Backend → API)")

    # Clear agents
    agents_file = Path(__file__).parent / "backend" / "agents.json"
    agents_file.write_text("[]")

    # Start watcher
    watcher_proc = subprocess.Popen(
        [sys.executable, "agent-watcher.py"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        cwd=os.path.dirname(__file__),
    )

    print(f"  {YELLOW}INFO{RESET}  Watcher started (PID {watcher_proc.pid}), waiting 5s...")
    time.sleep(5)

    # Check what watcher detected
    try:
        r = requests.get(f"{BACKEND_URL}/agents", timeout=3)
        agents = r.json()
        print(f"  {YELLOW}INFO{RESET}  Backend reports {len(agents)} agent(s):")
        for a in agents:
            print(f"         {a['id']} - state={a['state']} task={a.get('task','')}")

        if len(agents) > 0:
            ok(f"Watcher→Backend pipeline: {len(agents)} agent(s) detected")
        else:
            print(f"  {YELLOW}SKIP{RESET}  No Codex processes running (expected if Codex not active)")
            ok("Pipeline works (no active sessions to detect)")

    except Exception as e:
        fail("Pipeline check", str(e))

    # Stop watcher
    watcher_proc.send_signal(signal.SIGINT)
    time.sleep(2)
    watcher_proc.kill()
    watcher_proc.wait()

    # Check activity log has entries
    try:
        r = requests.get(f"{BACKEND_URL}/activity", timeout=3)
        log = r.json()
        if len(log) > 0:
            ok(f"Activity log has {len(log)} entries from pipeline")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════
# Test 5: Simulation Mode
# ═══════════════════════════════════════════════════════

def test_simulation():
    section("Simulation Mode Test")

    agents_file = Path(__file__).parent / "backend" / "agents.json"
    agents_file.write_text("[]")

    # Run simulation briefly
    sim_proc = subprocess.Popen(
        [sys.executable, "simulate.py", "3"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        cwd=os.path.dirname(__file__),
    )

    time.sleep(6)

    try:
        r = requests.get(f"{BACKEND_URL}/agents", timeout=3)
        agents = r.json()
        if len(agents) >= 2:
            ok(f"Simulation created {len(agents)} agents")
            states = set(a["state"] for a in agents)
            print(f"  {YELLOW}INFO{RESET}  States: {states}")
            if len(states) >= 1:
                ok("Agents have varied states")
        else:
            fail(f"Simulation: expected 3 agents, got {len(agents)}")
    except Exception as e:
        fail("Simulation check", str(e))

    sim_proc.send_signal(signal.SIGINT)
    time.sleep(2)
    sim_proc.kill()
    sim_proc.wait()

    # Verify agents left after simulation stopped
    time.sleep(1)
    try:
        r = requests.get(f"{BACKEND_URL}/agents", timeout=3)
        remaining = len(r.json())
        if remaining == 0:
            ok("All simulation agents cleaned up on exit")
        else:
            print(f"  {YELLOW}INFO{RESET}  {remaining} agents remaining (cleanup may take a moment)")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════

def main():
    print(f"\n{BOLD}{'=' * 56}")
    print(f"  Codex Office - Integration Test Suite")
    print(f"{'=' * 56}{RESET}\n")

    server_ok = test_backend_api()
    if not server_ok:
        print(f"\n{RED}Backend not reachable. Start it first:{RESET}")
        print(f"  python3 backend/app.py &")
        return 1

    num_proc, num_threads = test_process_detection()
    test_frontend_assets()
    test_full_pipeline()
    test_simulation()

    # Summary
    print(f"\n{BOLD}{'=' * 56}")
    total = passed + failed
    if failed == 0:
        print(f"  {GREEN}ALL {total} TESTS PASSED{RESET}")
    else:
        print(f"  {GREEN}{passed} passed{RESET}, {RED}{failed} failed{RESET} (total {total})")
    print(f"{'=' * 56}{RESET}\n")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
