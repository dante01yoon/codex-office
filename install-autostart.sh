#!/bin/bash
# Codex Office - Install as macOS LaunchAgent (auto-start on login)

OFFICE_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="$(which python3)"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_SERVER="$PLIST_DIR/com.codex-office.server.plist"
PLIST_WATCHER="$PLIST_DIR/com.codex-office.watcher.plist"

echo "=================================="
echo "  Codex Office - Auto-Start Setup"
echo "=================================="
echo ""
echo "Office dir: $OFFICE_DIR"
echo "Python:     $PYTHON_BIN"
echo ""

# Unload existing if present
launchctl unload "$PLIST_SERVER" 2>/dev/null
launchctl unload "$PLIST_WATCHER" 2>/dev/null

# Create server plist
cat > "$PLIST_SERVER" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.codex-office.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>${PYTHON_BIN}</string>
        <string>${OFFICE_DIR}/backend/app.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${OFFICE_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${OFFICE_DIR}/logs/server.log</string>
    <key>StandardErrorPath</key>
    <string>${OFFICE_DIR}/logs/server.err</string>
</dict>
</plist>
PLIST

# Create watcher plist
cat > "$PLIST_WATCHER" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.codex-office.watcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>${PYTHON_BIN}</string>
        <string>${OFFICE_DIR}/agent-watcher.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${OFFICE_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${OFFICE_DIR}/logs/watcher.log</string>
    <key>StandardErrorPath</key>
    <string>${OFFICE_DIR}/logs/watcher.err</string>
</dict>
</plist>
PLIST

# Create logs directory
mkdir -p "$OFFICE_DIR/logs"

# Load agents
launchctl load "$PLIST_SERVER"
launchctl load "$PLIST_WATCHER"

echo "Installed LaunchAgents:"
echo "  $PLIST_SERVER"
echo "  $PLIST_WATCHER"
echo ""

# Verify
sleep 2
if curl -s http://localhost:19000/health > /dev/null 2>&1; then
    echo "Server: running"
else
    echo "Server: starting..."
fi

echo ""
echo "Done! Codex Office will auto-start on login."
echo ""
echo "  Open:       open http://localhost:19000"
echo "  Stop:       launchctl unload ~/Library/LaunchAgents/com.codex-office.*.plist"
echo "  Logs:       tail -f $OFFICE_DIR/logs/server.log"
echo "  Uninstall:  bash $OFFICE_DIR/uninstall-autostart.sh"
