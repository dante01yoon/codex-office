const MCPIcons = {
  // Known MCP services with their display properties
  services: {
    notion:           { label: 'Notion',    color: '#000000', bg: '#ffffff', icon: 'N' },
    github:           { label: 'GitHub',    color: '#ffffff', bg: '#24292e', icon: 'GH' },
    sentry:           { label: 'Sentry',    color: '#ffffff', bg: '#362d59', icon: 'S' },
    slack:            { label: 'Slack',     color: '#ffffff', bg: '#4a154b', icon: 'SL' },
    'chrome-devtools':{ label: 'Chrome',    color: '#000000', bg: '#fdd835', icon: 'CD' },
    pencil:           { label: 'Pencil',    color: '#ffffff', bg: '#e91e63', icon: 'P' },
    telegram:         { label: 'Telegram',  color: '#ffffff', bg: '#0088cc', icon: 'TG' },
    codex_apps:       { label: 'Apps',      color: '#ffffff', bg: '#10a37f', icon: 'CA' },
    figma:            { label: 'Figma',     color: '#ffffff', bg: '#f24e1e', icon: 'FG' },
    vercel:           { label: 'Vercel',    color: '#ffffff', bg: '#000000', icon: 'V' },
    supabase:         { label: 'Supabase',  color: '#ffffff', bg: '#3ecf8e', icon: 'SB' },
    context7:         { label: 'Context7',  color: '#ffffff', bg: '#6366f1', icon: 'C7' },
    playwright:       { label: 'Playwright',color: '#ffffff', bg: '#2ead33', icon: 'PW' },
    'server-memory':  { label: 'Memory',    color: '#ffffff', bg: '#8b949e', icon: 'M' },
  },

  getService(name) {
    return this.services[name] || { label: name, color: '#ffffff', bg: '#484f58', icon: name.slice(0,2).toUpperCase() };
  },

  // Draw an MCP icon badge on a Phaser scene at position (x, y) above the character
  createBadge(scene, x, y, serviceName) {
    // Returns a container with: rounded rect bg + icon text
    // Small badge: ~24x14px
    const svc = this.getService(serviceName);

    const container = scene.add.container(x, y);
    container.setDepth(250); // above bubbles

    // Background pill
    const bg = scene.add.graphics();
    const pillW = 28, pillH = 14;
    bg.fillStyle(parseInt(svc.bg.replace('#',''), 16), 0.9);
    bg.fillRoundedRect(-pillW/2, -pillH/2, pillW, pillH, 4);
    bg.lineStyle(1, 0x30363d, 0.5);
    bg.strokeRoundedRect(-pillW/2, -pillH/2, pillW, pillH, 4);
    container.add(bg);

    // Icon text
    const text = scene.add.text(0, 0, svc.icon, {
      fontSize: '7px',
      fontFamily: 'monospace',
      color: svc.color,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);
    container.add(text);

    // Pop-in animation
    container.setScale(0);
    scene.tweens.add({
      targets: container,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    return container;
  },

  // Fade out and destroy a badge
  removeBadge(scene, container) {
    if (!container) return;
    scene.tweens.add({
      targets: container,
      alpha: 0,
      scale: 0.5,
      duration: 300,
      onComplete: () => container.destroy(),
    });
  },
};
