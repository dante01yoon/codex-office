/**
 * Codex Office - Interactive Whiteboard System
 * Renders 4 switchable data-visualization modes on the office whiteboard.
 *
 * Modes:
 *   0 - Timeline    Agent activity bars over time
 *   1 - Tools       Bar chart of message-type counts
 *   2 - Org         Tree diagram (boss -> agents -> sub-agents)
 *   3 - News        Auto-scrolling recent-activity ticker
 */

const WhiteboardManager = {
  // -- state --
  currentMode: 0,
  modes: ['timeline', 'tools', 'org', 'news'],
  modeLabels: ['TIMELINE', 'TOOLS', 'ORG CHART', 'NEWS'],
  scene: null,
  gfx: null,          // Phaser.Graphics for shapes
  textObjects: [],     // Phaser.Text objects for the current mode
  modeLabel: null,     // "1/4 Timeline" indicator below board
  lastData: null,      // most recently received /whiteboard payload
  newsScrollOffset: 0, // vertical pixel offset for news ticker
  newsScrollTimer: null,

  // -- public API --

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
      wb.y + wb.h + 8,
      '1/4 Timeline',
      {
        fontSize: '9px',
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
      const name = this.modeLabels[mode];
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

    // Mode indicator at bottom-right corner
    const wb = FURNITURE.whiteboard;
    this._addText(wb.x + wb.w - 6, wb.y + wb.h - 6, `${mode + 1}/4`, '#6e7681', '7px', 1, 1);
  },

  // -- Mode 0: Timeline --

  _renderTimeline(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 14;
    const titleH = 16;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad + titleH;
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2 - titleH;

    // Title
    this._addText(wb.x + wb.w / 2, wb.y + 8, 'TIMELINE', '#6e7681', '9px');

    const agents = data.agents || [];
    if (agents.length === 0) {
      this._addText(wb.x + wb.w / 2, wb.y + wb.h / 2, 'No agents', '#484f58', '9px');
      return;
    }

    const barH = Math.min(14, Math.floor((innerH - 8) / agents.length) - 3);
    const labelW = 50; // room for full agent names

    agents.forEach((agent, i) => {
      const y = innerY + 4 + i * (barH + 3);
      const colorIdx = i % AGENT_COLORS.length;
      const color = AGENT_COLORS[colorIdx];

      // Agent name label (full name, up to 8 chars)
      const label = (agent.name || agent.id || '?').substring(0, 8);
      this._addText(innerX, y + barH / 2, label, '#8b949e', '8px', 0, 0.5);

      // Draw activity segments
      const segments = agent.segments || [];
      const barX = innerX + labelW;
      const barW = innerW - labelW;
      if (segments.length === 0) {
        const frac = Math.min(1, Math.random() * 0.5 + 0.3);
        this.gfx.fillStyle(color, 0.6);
        this.gfx.fillRect(barX, y, barW * frac, barH);
      } else {
        segments.forEach(seg => {
          const startFrac = Math.max(0, Math.min(1, seg.start || 0));
          const endFrac   = Math.max(startFrac, Math.min(1, seg.end || 1));
          const sx = barX + barW * startFrac;
          const sw = barW * (endFrac - startFrac);
          this.gfx.fillStyle(color, 0.7);
          this.gfx.fillRect(sx, y, Math.max(sw, 3), barH);
        });
      }
    });

    // Time axis line at bottom
    const axisY = innerY + innerH;
    this.gfx.lineStyle(1, 0x6e7681, 0.5);
    this.gfx.lineBetween(innerX + labelW, axisY, innerX + innerW, axisY);

    // Time labels along axis
    const barX = innerX + labelW;
    const barW = innerW - labelW;
    const timeLabels = ['0m', '5m', '10m', '15m'];
    timeLabels.forEach((tl, i) => {
      const tx = barX + (i / (timeLabels.length - 1)) * barW;
      this._addText(tx, axisY + 2, tl, '#6e7681', '7px', 0.5, 0);
    });
  },

  // -- Mode 1: Tool Usage (bar chart) --

  _renderTools(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 14;
    const titleH = 16;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad + titleH;
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2 - titleH - 12; // extra room for labels

    // Title
    this._addText(wb.x + wb.w / 2, wb.y + 8, 'TOOLS', '#6e7681', '9px');

    const counts = data.tool_counts || { tool: 0, user: 0, response: 0, error: 0 };
    const keys = ['tool', 'user', 'response', 'error'];
    const colors = {
      tool:     0xd29922,
      user:     0x58a6ff,
      response: 0x3fb950,
      error:    0xf85149,
    };
    const colorHexMap = {
      tool:     '#d29922',
      user:     '#58a6ff',
      response: '#3fb950',
      error:    '#f85149',
    };

    const maxVal = Math.max(1, ...keys.map(k => counts[k] || 0));
    const barW = Math.floor((innerW - (keys.length - 1) * 8) / keys.length);
    const baseline = innerY + innerH;

    keys.forEach((key, i) => {
      const val = counts[key] || 0;
      const bh = Math.max(3, (val / maxVal) * (innerH - 14));
      const bx = innerX + i * (barW + 8);
      const by = baseline - bh;

      this.gfx.fillStyle(colors[key], 0.8);
      this.gfx.fillRect(bx, by, barW, bh);

      // Value above bar
      if (val > 0) {
        this._addText(bx + barW / 2, by - 4, String(val), colorHexMap[key], '8px', 0.5, 1);
      }

      // Label below bar
      this._addText(bx + barW / 2, baseline + 4, key, '#8b949e', '8px', 0.5, 0);
    });

    // Baseline
    this.gfx.lineStyle(1, 0x6e7681, 0.4);
    this.gfx.lineBetween(innerX, baseline, innerX + innerW, baseline);

    // Gridlines
    for (let g = 1; g <= 3; g++) {
      const gy = baseline - (g / 4) * (innerH - 14);
      this.gfx.lineStyle(1, 0x6e7681, 0.15);
      this.gfx.lineBetween(innerX, gy, innerX + innerW, gy);
    }
  },

  // -- Mode 2: Org Chart --

  _renderOrg(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 12;
    const titleH = 16;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad + titleH;
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2 - titleH;

    // Title
    this._addText(wb.x + wb.w / 2, wb.y + 8, 'ORG CHART', '#6e7681', '9px');

    const agents = data.agents || [];
    const mainAgents  = agents.filter(a => !a.is_subagent);
    const subAgents   = agents.filter(a =>  a.is_subagent);

    // State -> color mapping
    const stateColors = {
      coding:    0x10a37f,
      thinking:  0xd29922,
      searching: 0x1f6feb,
      idle:      0x8b949e,
      error:     0xf85149,
    };

    // Boss node at top-centre
    const bossW = 50;
    const bossH = 16;
    const bossCx = innerX + innerW / 2;
    const bossY = innerY;
    this.gfx.fillStyle(0x10a37f, 0.9);
    this.gfx.fillRect(bossCx - bossW / 2, bossY, bossW, bossH);
    this.gfx.lineStyle(1, 0x3fb950, 0.6);
    this.gfx.strokeRect(bossCx - bossW / 2, bossY, bossW, bossH);
    this._addText(bossCx, bossY + bossH / 2, 'Codex', '#0d1117', '8px', 0.5, 0.5);

    if (mainAgents.length === 0) {
      this._addText(bossCx, bossY + bossH + 20, 'No agents', '#484f58', '9px', 0.5, 0);
      return;
    }

    // Main-agent row
    const rowY = bossY + bossH + 24;
    const nodeW = Math.min(48, Math.floor((innerW - (mainAgents.length - 1) * 8) / mainAgents.length));
    const nodeH = 16;
    const totalRowW = mainAgents.length * nodeW + (mainAgents.length - 1) * 8;
    const startX = innerX + (innerW - totalRowW) / 2;

    mainAgents.forEach((agent, i) => {
      const cx = startX + i * (nodeW + 8) + nodeW / 2;
      const nx = cx - nodeW / 2;
      const color = stateColors[agent.state] || 0x8b949e;

      // Line from boss to agent
      this.gfx.lineStyle(1, 0x6e7681, 0.6);
      this.gfx.lineBetween(bossCx, bossY + bossH, cx, rowY);

      // Agent rectangle
      this.gfx.fillStyle(color, 0.85);
      this.gfx.fillRect(nx, rowY, nodeW, nodeH);
      this.gfx.lineStyle(1, 0x6e7681, 0.4);
      this.gfx.strokeRect(nx, rowY, nodeW, nodeH);

      // Agent label (full name up to 6 chars)
      const label = (agent.name || agent.id || '?').substring(0, 6);
      this._addText(cx, rowY + nodeH / 2, label, '#0d1117', '7px', 0.5, 0.5);

      // Sub-agents for this parent
      const children = subAgents.filter(s => s.parent_id === agent.id);
      if (children.length > 0) {
        const subRowY = rowY + nodeH + 18;
        const subW = Math.min(32, nodeW);
        const subH = 12;
        const subTotalW = children.length * subW + (children.length - 1) * 4;
        const subStartX = cx - subTotalW / 2;

        children.forEach((sub, si) => {
          const scx = subStartX + si * (subW + 4) + subW / 2;
          const snx = scx - subW / 2;
          const sc = stateColors[sub.state] || 0x8b949e;

          // Connector
          this.gfx.lineStyle(1, 0x6e7681, 0.4);
          this.gfx.lineBetween(cx, rowY + nodeH, scx, subRowY);

          // Sub-agent rect
          this.gfx.fillStyle(sc, 0.7);
          this.gfx.fillRect(snx, subRowY, subW, subH);

          // Sub-agent label
          const subLabel = (sub.name || sub.id || '?').substring(0, 4);
          this._addText(scx, subRowY + subH / 2, subLabel, '#0d1117', '6px', 0.5, 0.5);
        });
      }
    });
  },

  // -- Mode 3: News Ticker --

  _renderNews(data) {
    const wb = FURNITURE.whiteboard;
    const pad = 12;
    const titleH = 16;
    const innerX = wb.x + pad;
    const innerY = wb.y + pad + titleH;
    const innerW = wb.w - pad * 2;
    const innerH = wb.h - pad * 2 - titleH;

    // Title
    this._addText(wb.x + wb.w / 2, wb.y + 8, 'NEWS', '#6e7681', '9px');

    const events = data.events || [];
    if (events.length === 0) {
      this._addText(wb.x + wb.w / 2, wb.y + wb.h / 2, 'No events', '#484f58', '9px');
      return;
    }

    // Create a crop mask so text doesn't bleed outside the board
    const mask = this.scene.add.graphics();
    mask.fillStyle(0xffffff);
    mask.fillRect(innerX, innerY, innerW, innerH);
    const geoMask = mask.createGeometryMask();
    this.textObjects.push(mask); // track for cleanup

    // Render visible event lines with scroll offset
    const lineH = 14;
    const maxVisible = Math.floor(innerH / lineH) + 2;
    const startIdx = Math.max(0, events.length - maxVisible - Math.floor(this.newsScrollOffset / lineH));

    for (let i = startIdx; i < events.length; i++) {
      const ev = events[i];
      const relIdx = i - startIdx;
      const ty = innerY + relIdx * lineH - (this.newsScrollOffset % lineH);

      if (ty < innerY - lineH || ty > innerY + innerH) continue;

      const time = ev.time || '';
      const name = (ev.agent || '').substring(0, 10);
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
        fontSize: '8px',
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

  // -- helpers --

  /**
   * Create a small Phaser text, track it for cleanup, and return it.
   */
  _addText(x, y, content, color, size, originX, originY) {
    if (!this.scene) return null;
    originX = originX !== undefined ? originX : 0.5;
    originY = originY !== undefined ? originY : 0;
    const txt = this.scene.add.text(x, y, content, {
      fontSize: size || '8px',
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


// ========================================
// Whiteboard Panel (Expanded Sidebar)
// ========================================

const WhiteboardPanel = {
  canvas: null,
  ctx: null,
  visible: false,
  currentMode: 0,
  lastData: null,
  modes: ['timeline', 'tools', 'org', 'news'],
  modeLabels: ['TIMELINE', 'TOOLS', 'ORG CHART', 'NEWS'],
  newsScrollOffset: 0,
  newsScrollTimer: null,

  init() {
    this.canvas = document.getElementById('wb-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.render(this.currentMode, null);
  },

  setMode(mode) {
    if (mode < 0 || mode >= this.modes.length) return;
    this.currentMode = mode;
    this.newsScrollOffset = 0;
    if (this.newsScrollTimer) {
      clearInterval(this.newsScrollTimer);
      this.newsScrollTimer = null;
    }
    this._updateTabs();
    this.render(this.currentMode, this.lastData);
  },

  render(mode, data) {
    if (!this.ctx) return;
    this.lastData = data || this.lastData;
    this.currentMode = mode;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Clear
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, H);

    const d = this.lastData || {};

    switch (mode) {
      case 0: this._renderTimeline(ctx, W, H, d); break;
      case 1: this._renderTools(ctx, W, H, d);    break;
      case 2: this._renderOrg(ctx, W, H, d);      break;
      case 3: this._renderNews(ctx, W, H, d);     break;
    }

    // Mode indicator bottom-right
    ctx.fillStyle = '#6e7681';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${mode + 1}/4`, W - 10, H - 8);
  },

  // -- Panel Mode 0: Timeline --
  _renderTimeline(ctx, W, H, data) {
    const pad = 20;
    const titleH = 30;
    ctx.fillStyle = '#8b949e';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TIMELINE', W / 2, 12);

    const agents = data.agents || [];
    if (agents.length === 0) {
      ctx.fillStyle = '#484f58';
      ctx.font = '12px monospace';
      ctx.fillText('No agents', W / 2, H / 2);
      return;
    }

    const innerX = pad;
    const innerY = pad + titleH;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2 - titleH - 30;
    const labelW = 80;
    const barH = Math.min(22, Math.floor((innerH - 8) / agents.length) - 4);

    const agentColors = ['#10a37f', '#1f6feb', '#d29922', '#a371f7', '#f47067', '#3fb950', '#db6d28', '#79c0ff', '#d2a8ff', '#ff7b72'];

    agents.forEach((agent, i) => {
      const y = innerY + i * (barH + 4);
      const color = agentColors[i % agentColors.length];

      // Agent name
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText((agent.name || agent.id || '?').substring(0, 12), innerX, y + barH / 2);

      // Activity segments
      const barX = innerX + labelW;
      const barW = innerW - labelW;
      const segments = agent.segments || [];
      if (segments.length === 0) {
        const frac = Math.min(1, Math.random() * 0.5 + 0.3);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(barX, y, barW * frac, barH);
        ctx.globalAlpha = 1;
      } else {
        segments.forEach(seg => {
          const startFrac = Math.max(0, Math.min(1, seg.start || 0));
          const endFrac   = Math.max(startFrac, Math.min(1, seg.end || 1));
          const sx = barX + barW * startFrac;
          const sw = barW * (endFrac - startFrac);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.75;
          ctx.fillRect(sx, y, Math.max(sw, 3), barH);
          ctx.globalAlpha = 1;
        });
      }
    });

    // Time axis
    const axisY = innerY + innerH;
    ctx.strokeStyle = '#6e7681';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(innerX + labelW, axisY);
    ctx.lineTo(innerX + innerW, axisY);
    ctx.stroke();

    // Time labels
    ctx.fillStyle = '#6e7681';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const barX = innerX + labelW;
    const barW = innerW - labelW;
    const timeLabels = ['0m', '5m', '10m', '15m', '20m'];
    timeLabels.forEach((tl, i) => {
      const tx = barX + (i / (timeLabels.length - 1)) * barW;
      ctx.fillText(tl, tx, axisY + 4);
      // Tick mark
      ctx.beginPath();
      ctx.moveTo(tx, axisY);
      ctx.lineTo(tx, axisY + 3);
      ctx.stroke();
    });

    // Legend
    const legendY = H - 24;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    agents.slice(0, 5).forEach((agent, i) => {
      const lx = pad + i * 70;
      ctx.fillStyle = agentColors[i % agentColors.length];
      ctx.fillRect(lx, legendY, 8, 8);
      ctx.fillStyle = '#8b949e';
      ctx.fillText((agent.name || '?').substring(0, 6), lx + 12, legendY + 8);
    });
  },

  // -- Panel Mode 1: Tool Usage --
  _renderTools(ctx, W, H, data) {
    const pad = 20;
    const titleH = 30;
    ctx.fillStyle = '#8b949e';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TOOL USAGE', W / 2, 12);

    const counts = data.tool_counts || { tool: 0, user: 0, response: 0, error: 0 };
    const keys = ['tool', 'user', 'response', 'error'];
    const colors = { tool: '#d29922', user: '#58a6ff', response: '#3fb950', error: '#f85149' };

    const innerX = pad;
    const innerY = pad + titleH;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2 - titleH - 40;
    const maxVal = Math.max(1, ...keys.map(k => counts[k] || 0));
    const barW = Math.floor((innerW - (keys.length - 1) * 16) / keys.length);
    const baseline = innerY + innerH;

    // Gridlines
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    for (let g = 1; g <= 4; g++) {
      const gy = baseline - (g / 4) * innerH;
      ctx.beginPath();
      ctx.moveTo(innerX, gy);
      ctx.lineTo(innerX + innerW, gy);
      ctx.stroke();
      // Grid value label
      ctx.fillStyle = '#484f58';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(maxVal * g / 4)), innerX - 4, gy);
    }

    keys.forEach((key, i) => {
      const val = counts[key] || 0;
      const bh = Math.max(4, (val / maxVal) * innerH);
      const bx = innerX + i * (barW + 16);
      const by = baseline - bh;

      ctx.fillStyle = colors[key];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(bx, by, barW, bh);
      ctx.globalAlpha = 1;

      // Value above bar
      if (val > 0) {
        ctx.fillStyle = colors[key];
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(val), bx + barW / 2, by - 4);

        // Percentage
        const total = keys.reduce((s, k) => s + (counts[k] || 0), 0);
        if (total > 0) {
          const pct = Math.round((val / total) * 100);
          ctx.fillStyle = '#6e7681';
          ctx.font = '9px monospace';
          ctx.fillText(`${pct}%`, bx + barW / 2, by - 16);
        }
      }

      // Label below bar
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(key, bx + barW / 2, baseline + 6);
    });

    // Baseline
    ctx.strokeStyle = '#6e7681';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(innerX, baseline);
    ctx.lineTo(innerX + innerW, baseline);
    ctx.stroke();
  },

  // -- Panel Mode 2: Org Chart --
  _renderOrg(ctx, W, H, data) {
    const pad = 20;
    const titleH = 30;
    ctx.fillStyle = '#8b949e';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('ORG CHART', W / 2, 12);

    const agents = data.agents || [];
    const mainAgents = agents.filter(a => !a.is_subagent);
    const subAgents  = agents.filter(a =>  a.is_subagent);

    const stateColors = {
      coding:    '#10a37f',
      thinking:  '#d29922',
      searching: '#1f6feb',
      idle:      '#8b949e',
      error:     '#f85149',
    };
    const stateLabels = {
      coding:    'CODING',
      thinking:  'THINK',
      searching: 'SEARCH',
      idle:      'IDLE',
      error:     'ERROR',
    };

    const innerX = pad;
    const innerY = pad + titleH;
    const innerW = W - pad * 2;

    // Boss node
    const bossW = 80;
    const bossH = 28;
    const bossCx = innerX + innerW / 2;
    const bossY = innerY;

    ctx.fillStyle = '#10a37f';
    ctx.fillRect(bossCx - bossW / 2, bossY, bossW, bossH);
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = 1;
    ctx.strokeRect(bossCx - bossW / 2, bossY, bossW, bossH);
    ctx.fillStyle = '#0d1117';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Codex', bossCx, bossY + bossH / 2);

    if (mainAgents.length === 0) {
      ctx.fillStyle = '#484f58';
      ctx.font = '12px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText('No agents', bossCx, bossY + bossH + 30);
      return;
    }

    // Main agent row
    const rowY = bossY + bossH + 40;
    const nodeW = Math.min(70, Math.floor((innerW - (mainAgents.length - 1) * 12) / mainAgents.length));
    const nodeH = 36;
    const totalRowW = mainAgents.length * nodeW + (mainAgents.length - 1) * 12;
    const startX = innerX + (innerW - totalRowW) / 2;

    mainAgents.forEach((agent, i) => {
      const cx = startX + i * (nodeW + 12) + nodeW / 2;
      const nx = cx - nodeW / 2;
      const color = stateColors[agent.state] || '#8b949e';

      // Connector line
      ctx.strokeStyle = '#6e7681';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bossCx, bossY + bossH);
      ctx.lineTo(bossCx, bossY + bossH + 20);
      ctx.lineTo(cx, bossY + bossH + 20);
      ctx.lineTo(cx, rowY);
      ctx.stroke();

      // Agent box
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(nx, rowY, nodeW, nodeH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#6e7681';
      ctx.strokeRect(nx, rowY, nodeW, nodeH);

      // Agent name
      ctx.fillStyle = '#0d1117';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText((agent.name || agent.id || '?').substring(0, 8), cx, rowY + 4);

      // State label
      ctx.font = '8px monospace';
      ctx.fillText(stateLabels[agent.state] || 'IDLE', cx, rowY + 18);

      // Role
      if (agent.role) {
        ctx.fillStyle = '#6e7681';
        ctx.font = '8px monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(agent.role.substring(0, 8), cx, rowY + nodeH + 2);
      }

      // Sub-agents
      const children = subAgents.filter(s => s.parent_id === agent.id);
      if (children.length > 0) {
        const subRowY = rowY + nodeH + 30;
        const subW = Math.min(50, nodeW);
        const subH = 24;
        const subTotalW = children.length * subW + (children.length - 1) * 6;
        const subStartX = cx - subTotalW / 2;

        children.forEach((sub, si) => {
          const scx = subStartX + si * (subW + 6) + subW / 2;
          const snx = scx - subW / 2;
          const sc = stateColors[sub.state] || '#8b949e';

          // Connector
          ctx.strokeStyle = '#484f58';
          ctx.beginPath();
          ctx.moveTo(cx, rowY + nodeH);
          ctx.lineTo(cx, subRowY - 10);
          ctx.lineTo(scx, subRowY - 10);
          ctx.lineTo(scx, subRowY);
          ctx.stroke();

          // Sub-agent box
          ctx.fillStyle = sc;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(snx, subRowY, subW, subH);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#484f58';
          ctx.strokeRect(snx, subRowY, subW, subH);

          // Sub-agent name
          ctx.fillStyle = '#0d1117';
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((sub.name || sub.id || '?').substring(0, 6), scx, subRowY + subH / 2);
        });
      }
    });

    // Legend at bottom
    const legendY = H - 28;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = pad;
    Object.keys(stateColors).forEach(state => {
      ctx.fillStyle = stateColors[state];
      ctx.fillRect(lx, legendY - 4, 8, 8);
      ctx.fillStyle = '#8b949e';
      ctx.fillText(stateLabels[state], lx + 12, legendY);
      lx += 60;
    });
  },

  // -- Panel Mode 3: News --
  _renderNews(ctx, W, H, data) {
    const pad = 20;
    const titleH = 30;
    ctx.fillStyle = '#8b949e';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('NEWS FEED', W / 2, 12);

    const events = data.events || [];
    if (events.length === 0) {
      ctx.fillStyle = '#484f58';
      ctx.font = '12px monospace';
      ctx.fillText('No events', W / 2, H / 2);
      return;
    }

    const innerX = pad;
    const innerY = pad + titleH;
    const innerW = W - pad * 2;
    const innerH = H - pad * 2 - titleH;
    const lineH = 28;

    const stateColorMap = {
      coding:    '#10a37f',
      thinking:  '#d29922',
      searching: '#1f6feb',
      idle:      '#8b949e',
      error:     '#f85149',
    };

    // Clip region
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();

    const maxVisible = Math.floor(innerH / lineH) + 2;
    const startIdx = Math.max(0, events.length - maxVisible - Math.floor(this.newsScrollOffset / lineH));

    for (let i = startIdx; i < events.length; i++) {
      const ev = events[i];
      const relIdx = i - startIdx;
      const ty = innerY + relIdx * lineH - (this.newsScrollOffset % lineH);

      if (ty < innerY - lineH || ty > innerY + innerH) continue;

      const time = ev.time || '';
      const name = ev.agent || '';
      const state = ev.state || '';
      const col = stateColorMap[state] || '#8b949e';

      // Time
      ctx.fillStyle = '#484f58';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(time, innerX, ty + 2);

      // Agent name
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '11px monospace';
      ctx.fillText(name.substring(0, 14), innerX + 50, ty + 2);

      // State badge
      const badgeX = innerX + 160;
      const badgeText = state.toUpperCase();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(badgeX, ty + 1, 60, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, badgeX + 30, ty + 4);
      ctx.textAlign = 'left';

      // Separator line
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(innerX, ty + lineH - 2);
      ctx.lineTo(innerX + innerW, ty + lineH - 2);
      ctx.stroke();
    }

    ctx.restore();

    // Start auto-scroll if not already running
    if (events.length * lineH > innerH && !this.newsScrollTimer) {
      this.newsScrollTimer = setInterval(() => {
        const totalScroll = events.length * lineH - innerH;
        this.newsScrollOffset += 1;
        if (this.newsScrollOffset > totalScroll + lineH) {
          this.newsScrollOffset = 0;
        }
        this.render(3, this.lastData);
      }, 600);
    }
  },

  _updateTabs() {
    const tabs = document.querySelectorAll('.wb-tab');
    tabs.forEach((tab, i) => {
      if (i === this.currentMode) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  },
};

// ========================================
// Global functions for whiteboard panel
// ========================================

let whiteboardPanelVisible = false;

function toggleWhiteboardPanel() {
  whiteboardPanelVisible = !whiteboardPanelVisible;
  const panel = document.getElementById('whiteboard-panel');
  const btn = document.getElementById('wb-toggle');

  if (panel) {
    panel.style.display = whiteboardPanelVisible ? 'flex' : 'none';
  }
  if (btn) {
    btn.classList.toggle('active', whiteboardPanelVisible);
  }

  if (whiteboardPanelVisible) {
    if (!WhiteboardPanel.ctx) {
      WhiteboardPanel.init();
    }
    WhiteboardPanel._updateTabs();
    WhiteboardPanel.render(WhiteboardPanel.currentMode, WhiteboardPanel.lastData);
  } else {
    // Stop news scroll when hidden
    if (WhiteboardPanel.newsScrollTimer) {
      clearInterval(WhiteboardPanel.newsScrollTimer);
      WhiteboardPanel.newsScrollTimer = null;
    }
  }
}

function setWbPanelMode(n) {
  WhiteboardPanel.setMode(n);
}
