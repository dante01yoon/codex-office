# Codex Office

A real-time pixel art office that visualizes running [OpenAI Codex CLI](https://github.com/openai/codex) agents. Each Codex session appears as a pixel character that moves between office zones based on its current activity.

![Codex Office Preview](screenshots/codex-office-preview.png)

## Features

- **Real-time Codex detection** - Automatically detects Codex CLI and VS Code Codex sessions
- **WebSocket real-time updates** - Instant UI updates via Socket.IO, polling fallback
- **Sub-agent visualization** - Sub-agents appear as smaller sprites near their parent with tree-structured sidebar
- **MCP tool icons** - Floating service badges (Notion, GitHub, Sentry, Slack, etc.) above characters during MCP tool calls
- **Interactive whiteboard** - 4 display modes (Timeline, Tool Usage, Org Chart, News Ticker) with expandable sidebar panel
- **Conversation history** - Toggleable chat panel showing parsed Codex log events
- **Context window meter** - Visual gauge showing token usage with color-coded fill
- **A* pathfinding** - Characters navigate around furniture naturally
- **Elevator animation** - Agents arrive/depart through animated elevator doors
- **Git status panel** - Branch, changed files, recent commits in sidebar
- **Pixel art office** - Programmatically generated characters with 8 hair styles, accessories, and 6 animation frames
- **Activity log** - Timestamped state transitions and task descriptions
- **Simulation mode** - Demo with 4 agents showing realistic behavior patterns

## How It Works

```
Codex processes  ←[scan 2s]→  agent-watcher.py  →[POST]→  Flask + SocketIO (port 19000)
                                                                   │
~/.codex/state_5.sqlite  ←[session + sub-agent metadata]───────────┤
~/.codex/logs_1.sqlite   ←[tool calls + MCP activity]──────────────┤
                                                                   │
Browser (Phaser 3)  ←───────────[WebSocket real-time]──────────────┘
```

### State Classification

| State | CPU Usage | Office Zone |
|-------|-----------|-------------|
| **coding** | > 15% | Workspace (desk) |
| **thinking** | 5-15% | Think Tank (pacing) |
| **searching** | 2-5% | Think Tank |
| **idle** | < 2% | Break Room (couch) |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-4` | Switch whiteboard mode |
| `W` | Toggle whiteboard panel |
| `Chat` button | Toggle conversation history |
| `Board` button | Toggle whiteboard panel |
| Double-click agent | Focus terminal window |

## Quick Start

### Auto-start (recommended)

```bash
# Install as macOS LaunchAgent - starts on login
bash install-autostart.sh

# Open in browser
open http://localhost:19000
```

### One-click

Double-click `start-office.command`

### Manual

```bash
# Install dependencies
pip install flask flask-cors flask-socketio requests

# Start the backend server
python3 backend/app.py &

# Start the agent watcher
python3 agent-watcher.py &

# Open in browser
open http://localhost:19000
```

### Demo Mode

```bash
# Simulate 4 agents with realistic behavior
python3 simulate.py 4
```

## Project Structure

```
codex-office/
├── backend/
│   └── app.py              # Flask + SocketIO server (port 19000)
├── frontend/
│   ├── assets/             # Drop-in PNG spritesheet folder
│   ├── index.html          # Phaser 3 + Socket.IO entry point
│   ├── game.js             # Office scene, characters, polling, WebSocket
│   ├── layout.js           # Zones, furniture, colors, constants
│   ├── sprites.js          # Component-based pixel art generation
│   ├── pathfinding.js      # A* pathfinding with obstacle avoidance
│   ├── whiteboard.js       # 4-mode whiteboard + expandable panel
│   ├── mcp-icons.js        # MCP service icon badges (14 services)
│   └── style.css           # Dark theme UI
├── agent-watcher.py        # Codex process detector (3-layer + sub-agents)
├── codex-notify-hook.py    # Optional Codex notify integration
├── simulate.py             # Demo agent simulator
├── set_state.py            # Manual state control CLI
├── test_office.py          # Integration tests (23 tests)
├── install-autostart.sh    # macOS LaunchAgent installer
├── uninstall-autostart.sh  # Remove auto-start
├── start-office.command    # macOS one-click launcher
└── requirements.txt
```

## Codex Detection

The watcher detects Codex in three ways:

1. **Native binary** - Scans `ps` for the Codex Rust binary (`codex-darwin-arm64/vendor/.../codex`)
2. **Node launcher** - Falls back to detecting `node /path/to/codex` processes
3. **VS Code extension** - Detects `codex app-server` processes, groups by extension version

Sub-agents are detected via `thread_spawn_edges` table and JSON `source` column in `~/.codex/state_5.sqlite`, with nickname and role extraction (e.g., "Boole", "explorer").

## MCP Tool Visualization

When agents call MCP tools, a colored service badge appears above their character:

| Service | Badge | Color |
|---------|-------|-------|
| Notion | `N` | White |
| GitHub | `GH` | Dark |
| Sentry | `S` | Purple |
| Slack | `SL` | Purple |
| Figma | `FG` | Orange |
| Vercel | `V` | Black |
| Chrome DevTools | `CD` | Yellow |
| + 7 more | ... | ... |

## Custom Assets

Drop PNG sprite sheets into `frontend/assets/` to replace programmatic sprites. See [`frontend/assets/README.md`](frontend/assets/README.md) for format specs.

## Tests

```bash
python3 backend/app.py &
python3 test_office.py
```

## Inspired By

- [amp-office](https://github.com/jojodecayz/amp-office) by JoJo Zhang
- [claude-office](https://github.com/paulrobello/claude-office) by Paul Robello

## License

MIT
