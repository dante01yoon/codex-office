#!/bin/bash
# Codex Office - One-Click Launcher
# Double-click this file on macOS to start the office

cd "$(dirname "$0")"

echo "=================================="
echo "  Starting Codex Office..."
echo "=================================="
echo ""

# Kill any existing instances
echo "[1/4] Cleaning up old processes..."
pkill -f "python3 backend/app.py" 2>/dev/null
pkill -f "python3 agent-watcher.py" 2>/dev/null
sleep 1

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Please install Python 3."
    read -p "Press Enter to exit..."
    exit 1
fi

# Install dependencies
echo "[2/4] Installing dependencies..."
pip3 install -q flask flask-cors requests 2>/dev/null

# Start Flask server
echo "[3/4] Starting backend server..."
python3 backend/app.py &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID"

# Wait for server to be ready
echo "  Waiting for server..."
for i in {1..10}; do
    if curl -s http://localhost:19000/health >/dev/null 2>&1; then
        echo "  Server is ready!"
        break
    fi
    sleep 1
done

# Start agent watcher
echo "[4/4] Starting agent watcher..."
python3 agent-watcher.py &
WATCHER_PID=$!
echo "  Watcher PID: $WATCHER_PID"

echo ""
echo "=================================="
echo "  Codex Office is running!"
echo "=================================="
echo ""
echo "  Web UI:  http://localhost:19000"
echo "  Server:  PID $SERVER_PID"
echo "  Watcher: PID $WATCHER_PID"
echo ""
echo "  To simulate agents: python3 simulate.py"
echo "  To set state:       python3 set_state.py agent1 coding"
echo ""
echo "  Press Ctrl+C to stop all processes."
echo ""

# Open browser
if command -v open &>/dev/null; then
    open http://localhost:19000
elif command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:19000
fi

# Wait and cleanup on exit
trap "echo ''; echo 'Stopping...'; kill $SERVER_PID $WATCHER_PID 2>/dev/null; echo 'Done!'; exit 0" INT TERM

wait
