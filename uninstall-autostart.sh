#!/bin/bash
# Codex Office - Remove auto-start

launchctl unload ~/Library/LaunchAgents/com.codex-office.server.plist 2>/dev/null
launchctl unload ~/Library/LaunchAgents/com.codex-office.watcher.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.codex-office.server.plist
rm -f ~/Library/LaunchAgents/com.codex-office.watcher.plist
pkill -f "python3.*codex-office" 2>/dev/null

echo "Codex Office auto-start removed."
