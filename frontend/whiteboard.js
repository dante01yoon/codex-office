/**
 * Codex Office - Interactive Whiteboard System
 * Renders 4 switchable data-visualization modes on the office whiteboard.
 *
 * Modes:
 *   0 - Timeline    Agent activity bars over time
 *   1 - Tools       Bar chart of message-type counts
 *   2 - Org         Tree diagram (boss → agents → sub-agents)
 *   3 - News        Auto-scrolling recent-activity ticker
 */

const WhiteboardManager = {
  // ── state ──────────────────────────────────────────────
  currentMode: 0,
  modes: ['timeline', 'tools', 'org', 'news'],
  scene: null,
  gfx: null,          // Phaser.Graphics for shapes
  textObjects: [],     // Phaser.Text objects for the current mode
  modeLabel: null,     // "1/4 Timeline" indicator below board
  lastData: null,      // most recently received /whiteboard payload
  newsScrollOffset: 0, // vertical pixel offset for news ticker
  newsScrollTimer: null,

  // ── public API ─────────────────────────────────────────

  /**
   * Called once from drawWhiteboard(). Stores the scene ref and creates
   * the persistent Graphics object at the correct depth.
   */
  init(scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(DEPTH.furnitureBg + 2); // above the board surface

    // Mode label just below the whiteboard
    const wb = FURNITURE.whiteboard;
    this.modeLabel = scene.add.text(
      wb.x + wb.w / 2,
      wb.y + wb.h + 6,
      '1/4 Timeline',
      {
        fontSize: '8px',
        fontFamily: 'monospace',
        color: '#8b949e',
      }
    ).setOrigin(0.5, 0).setDepth(DEPTH.furnitureBg + 2);

    // Render an empty board immediately
    this.render(this.currentMode, null);
  },

  /**
   * Cycle to the next mode and re-render.
   */
  nextMode() {
    this.currentMode = (this.currentMode + 1) % this.modes.length;
    this.newsScrollOffset = 0;
    this.render(this.currentMode, this.lastData);
  },

  /**
   * Jump to a specific mode (0-3) and re-render.
   */
  setMode(index) {
    if (index < 0 || index >= this.modes.length) return;
    this.currentMode = index;
    this.newsScrollOffset = 0;
    this.render(this.currentMode, this.lastData);
  },

  /**
   * Clear the board and draw the active mode using the supplied data.
   */
  render(mode, data) {
    if (!this.gfx) return;

    this.lastData = data || this.lastData;
    this.currentMode = mode;

    // Tear down previous text objects
    this._clearTexts();
    this.gfx.clear();

    // Update mode indicator
    if (this.modeLabel) {
      const name = this.modes[mode].charAt(0).toUpperCase() + this.modes[mode].slice(1);
      this.modeLabel.setText(`${mode + 1}/4 ${name}`);
    }

    // Cancel any running news-scroll timer
    if (this.newsScrollTimer) {
      this.newsScrollTimer.remove(false);
      this.newsScrollTimer = null;
    }

    const d = this.lastData || {};

    switch (mode) {
      case 0: this._renderTimeline(d); break;
      case 1: this._renderTools(d);    break;
      case 2: this._renderOrg(d);      break;
      case 3: this._renderNews(d);     break;
    }
  },

  // ── Mode 0: Timeline ──────────────────────────────────

  _renderTimeline(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 10;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad;
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2;

    // Title
    this._addText(wb.x + wb.w / 2, wb.y + 4, 'ACTIVITY', '#6e7681', '7px');

    const agents = data.agents || [];
    if (agents.length === 0) {
      this._addText(wb.x + wb.w / 2, wb.y + wb.h / 2, 'No agents', '#484f58', '8px');
      return;
    }

    const barH = Math.min(8, Math.floor((innerH - 4) / agents.length) - 2);
    const now = Date.now();

    agents.forEach((agent, i) => {
      const y = innerY + 4 + i * (barH + 2);
      const colorIdx = i % AGENT_COLORS.length;
      const color = AGENT_COLORS[colorIdx];

      // Agent name label (truncate to 3 chars)
      const label = (agent.name || agent.id || '?').substring(0, 3);
      this._addText(innerX - 2, y + barH / 2, label, '#8b949e', '6px', 1, 0.5);

      // Draw activity segments
      const segments = agent.segments || [];
      if (segments.length === 0) {
        // Fall back: draw one bar at current fraction
        const frac = Math.min(1, Math.random() * 0.5 + 0.3); // graceful fallback
        this.gfx.fillStyle(color, 0.6);
        this.gfx.fillRect(innerX + 12, y, innerW * frac - 12, barH);
      } else {
        segments.forEach(seg => {
          const startFrac = Math.max(0, Math.min(1, seg.start || 0));
          const endFrac   = Math.max(startFrac, Math.min(1, seg.end || 1));
          const sx = innerX + 12 + (innerW - 12) * startFrac;
          const sw = (innerW - 12) * (endFrac - startFrac);
          this.gfx.fillStyle(color, 0.7);
          this.gfx.fillRect(sx, y, Math.max(sw, 2), barH);
        });
      }
    });

    // Time axis line at bottom
    const axisY = innerY + innerH;
    this.gfx.lineStyle(1, 0x6e7681, 0.5);
    this.gfx.lineBetween(innerX + 12, axisY, innerX + innerW, axisY);
  },

  // ── Mode 1: Tool Usage (bar chart) ────────────────────

  _renderTools(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 10;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad + 8; // extra room for title
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2 - 12;

    this._addText(wb.x + wb.w / 2, wb.y + 4, 'TOOL USAGE', '#6e7681', '7px');

    const counts = data.tool_counts || { tool: 0, user: 0, response: 0, error: 0 };
    const keys = ['tool', 'user', 'response', 'error'];
    const colors = {
      tool:     0xd29922, // amber
      user:     0x58a6ff, // cyan
      response: 0x3fb950, // green
      error:    0xf85149, // red
    };
    const colorHexMap = {
      tool:     '#d29922',
      user:     '#58a6ff',
      response: '#3fb950',
      error:    '#f85149',
    };

    const maxVal = Math.max(1, ...keys.map(k => counts[k] || 0));
    const barW = Math.floor((innerW - (keys.length - 1) * 4) / keys.length);
    const baseline = innerY + innerH;

    keys.forEach((key, i) => {
      const val = counts[key] || 0;
      const bh = Math.max(2, (val / maxVal) * (innerH - 10));
      const bx = innerX + i * (barW + 4);
      const by = baseline - bh;

      this.gfx.fillStyle(colors[key], 0.8);
      this.gfx.fillRect(bx, by, barW, bh);

      // Value above bar
      if (val > 0) {
        this._addText(bx + barW / 2, by - 2, String(val), colorHexMap[key], '6px', 0.5, 1);
      }

      // Label below bar
      this._addText(bx + barW / 2, baseline + 2, key.substring(0, 4), '#8b949e', '6px', 0.5, 0);
    });

    // Baseline
    this.gfx.lineStyle(1, 0x6e7681, 0.4);
    this.gfx.lineBetween(innerX, baseline, innerX + innerW, baseline);
  },

  // ── Mode 2: Org Chart ─────────────────────────────────

  _renderOrg(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 8;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad + 6;
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2 - 6;

    this._addText(wb.x + wb.w / 2, wb.y + 4, 'ORG CHART', '#6e7681', '7px');

    const agents = data.agents || [];
    const mainAgents  = agents.filter(a => !a.is_subagent);
    const subAgents   = agents.filter(a =>  a.is_subagent);

    // State → color mapping
    const stateColors = {
      coding:    0x10a37f,
      thinking:  0xd29922,
      searching: 0x1f6feb,
      idle:      0x8b949e,
      error:     0xf85149,
    };

    // Boss node at top-centre
    const bossW = 30;
    const bossH = 10;
    const bossCx = innerX + innerW / 2;
    const bossY = innerY;
    this.gfx.fillStyle(0x10a37f, 0.9);
    this.gfx.fillRect(bossCx - bossW / 2, bossY, bossW, bossH);
    this._addText(bossCx, bossY + bossH / 2, 'Boss', '#0d1117', '6px', 0.5, 0.5);

    if (mainAgents.length === 0) {
      this._addText(bossCx, bossY + bossH + 14, 'No agents', '#484f58', '7px', 0.5, 0);
      return;
    }

    // Main-agent row
    const rowY = bossY + bossH + 14;
    const nodeW = Math.min(28, Math.floor((innerW - (mainAgents.length - 1) * 4) / mainAgents.length));
    const nodeH = 10;
    const totalRowW = mainAgents.length * nodeW + (mainAgents.length - 1) * 4;
    const startX = innerX + (innerW - totalRowW) / 2;

    mainAgents.forEach((agent, i) => {
      const cx = startX + i * (nodeW + 4) + nodeW / 2;
      const nx = cx - nodeW / 2;
      const color = stateColors[agent.state] || 0x8b949e;

      // Line from boss to agent
      this.gfx.lineStyle(1, 0x6e7681, 0.6);
      this.gfx.lineBetween(bossCx, bossY + bossH, cx, rowY);

      // Agent rectangle
      this.gfx.fillStyle(color, 0.85);
      this.gfx.fillRect(nx, rowY, nodeW, nodeH);

      // Agent label
      const label = (agent.name || agent.id || '?').substring(0, 3);
      this._addText(cx, rowY + nodeH / 2, label, '#0d1117', '5px', 0.5, 0.5);

      // Sub-agents for this parent
      const children = subAgents.filter(s => s.parent_id === agent.id);
      if (children.length > 0) {
        const subRowY = rowY + nodeH + 10;
        const subW = Math.min(16, nodeW);
        const subH = 7;
        const subTotalW = children.length * subW + (children.length - 1) * 2;
        const subStartX = cx - subTotalW / 2;

        children.forEach((sub, si) => {
          const scx = subStartX + si * (subW + 2) + subW / 2;
          const snx = scx - subW / 2;
          const sc = stateColors[sub.state] || 0x8b949e;

          // Connector
          this.gfx.lineStyle(1, 0x6e7681, 0.4);
          this.gfx.lineBetween(cx, rowY + nodeH, scx, subRowY);

          // Sub-agent rect
          this.gfx.fillStyle(sc, 0.7);
          this.gfx.fillRect(snx, subRowY, subW, subH);
        });
      }
    });
  },

  // ── Mode 3: News Ticker ────────────────────────────────

  _renderNews(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 8;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad + 6;
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2 - 6;

    this._addText(wb.x + wb.w / 2, wb.y + 4, 'LIVE FEED', '#6e7681', '7px');

    const events = data.events || [];
    if (events.length === 0) {
      this._addText(wb.x + wb.w / 2, wb.y + wb.h / 2, 'No events', '#484f58', '8px');
      return;
    }

    // Create a crop mask so text doesn't bleed outside the board
    const mask = this.scene.add.graphics();
    mask.fillStyle(0xffffff);
    mask.fillRect(innerX, innerY, innerW, innerH);
    const geoMask = mask.createGeometryMask();
    this.textObjects.push(mask); // track for cleanup

    // Render visible event lines with scroll offset
    const lineH = 10;
    const maxVisible = Math.floor(innerH / lineH) + 2;
    const startIdx = Math.max(0, events.length - maxVisible - Math.floor(this.newsScrollOffset / lineH));

    for (let i = startIdx; i < events.length; i++) {
      const ev = events[i];
      const relIdx = i - startIdx;
      const ty = innerY + relIdx * lineH - (this.newsScrollOffset % lineH);

      if (ty < innerY - lineH || ty > innerY + innerH) continue;

      const time = ev.time || '';
      const name = (ev.agent || '').substring(0, 6);
      const arrow = '\u2192';
      const state = ev.state || '';
      const line = `${time} ${name} ${arrow} ${state}`;

      const stateColorMap = {
        coding:    '#10a37f',
        thinking:  '#d29922',
        searching: '#1f6feb',
        idle:      '#8b949e',
        error:     '#f85149',
      };
      const col = stateColorMap[state] || '#8b949e';

      const txt = this.scene.add.text(innerX, ty, line, {
        fontSize: '6px',
        fontFamily: 'monospace',
        color: col,
      }).setDepth(DEPTH.furnitureBg + 3);
      txt.setMask(geoMask);
      this.textObjects.push(txt);
    }

    // Auto-scroll: advance every 600 ms
    if (events.length * lineH > innerH) {
      const totalScroll = events.length * lineH - innerH;
      this.newsScrollTimer = this.scene.time.addEvent({
        delay: 600,
        loop: true,
        callback: () => {
          this.newsScrollOffset += 1;
          if (this.newsScrollOffset > totalScroll + lineH) {
            this.newsScrollOffset = 0;
          }
          this.render(3, this.lastData);
        },
      });
    }
  },

  // ── helpers ────────────────────────────────────────────

  /**
   * Create a small Phaser text, track it for cleanup, and return it.
   */
  _addText(x, y, content, color, size, originX, originY) {
    if (!this.scene) return null;
    originX = originX !== undefined ? originX : 0.5;
    originY = originY !== undefined ? originY : 0;
    const txt = this.scene.add.text(x, y, content, {
      fontSize: size || '7px',
      fontFamily: 'monospace',
      color: color || '#8b949e',
    }).setOrigin(originX, originY).setDepth(DEPTH.furnitureBg + 3);
    this.textObjects.push(txt);
    return txt;
  },

  /**
   * Destroy all tracked text / mask objects from the previous render.
   */
  _clearTexts() {
    this.textObjects.forEach(t => {
      if (t && t.destroy) t.destroy();
    });
    this.textObjects = [];
  },
};
