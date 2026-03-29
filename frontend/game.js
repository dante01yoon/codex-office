/**
 * Codex Office - Main Phaser 3 Game Scene
 * Renders the pixel art office, manages characters, polls backend.
 */

class OfficeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OfficeScene' });
    this.agents = {};       // agentId -> sprite data
    this.agentIndex = 0;    // for color assignment
    this.deskSlots = {};    // agentId -> slot index
    this.usedSlots = new Set();
    this.boss = null;
    this.cat = null;
    this.pollTimer = null;
    this.clockText = null;
    this.serverLeds = [];
    this.ambientObjects = [];
  }

  create() {
    // Generate all textures
    SpriteFactory.generateAll(this);

    // Draw the office
    this.drawOffice();

    // Create boss character
    this.createBoss();

    // Create duck mascot
    this.createCat();

    // Create clock
    this.createClock();

    // Start ambient animations
    this.startAmbientAnimations();

    // Start polling backend
    this.pollTimer = this.time.addEvent({
      delay: 500,
      callback: this.pollAgents,
      callbackScope: this,
      loop: true,
    });

    // Initial poll
    this.pollAgents();
  }

  update(time) {
    // Update boss wandering
    this.updateBossWander(time);

    // Update duck idle animation
    this.updateCat(time);

    // Update agent animations
    Object.values(this.agents).forEach(agent => {
      this.updateAgentAnimation(agent, time);
    });

    // Update clock
    this.updateClock();
  }

  // ========================================
  // Office Drawing
  // ========================================

  drawOffice() {
    const g = this.add.graphics();
    g.setDepth(DEPTH.floor);

    // Floor - warm wood tone
    g.fillStyle(0x1e1e2e);
    g.fillRect(0, 360, CANVAS.width, 360);

    // Floor wood plank pattern
    for (let y = 360; y < CANVAS.height; y += 24) {
      for (let x = 0; x < CANVAS.width; x += 80) {
        const offset = (Math.floor(y / 24) % 2) * 40;
        const shade = (x + y) % 160 < 80 ? 0x252535 : 0x22222f;
        g.fillStyle(shade);
        g.fillRect(x + offset, y, 78, 22);
        // Plank gap
        g.fillStyle(0x1a1a28);
        g.fillRect(x + offset + 78, y, 2, 22);
        g.fillRect(x + offset, y + 22, 80, 2);
      }
    }

    // Carpet area under desks (subtle)
    g.fillStyle(0x1a2332);
    g.fillRect(100, 390, 680, 220);
    // Carpet border
    g.lineStyle(1, 0x2a3342);
    g.strokeRect(100, 390, 680, 220);

    // Break room rug
    g.fillStyle(0x1e2a22);
    g.fillRect(870, 410, 250, 200);
    g.lineStyle(1, 0x2e3a32);
    g.strokeRect(870, 410, 250, 200);

    // Wall - gradient feel
    g.fillStyle(0x0d1117);
    g.fillRect(0, 0, CANVAS.width, 200);
    g.fillStyle(0x131820);
    g.fillRect(0, 200, CANVAS.width, 160);

    // Wall trim / baseboard
    g.fillStyle(0x30363d);
    g.fillRect(0, 196, CANVAS.width, 4);
    g.fillStyle(0x3d444d);
    g.fillRect(0, 356, CANVAS.width, 4);
    g.fillStyle(0x30363d);
    g.fillRect(0, 360, CANVAS.width, 2);

    // Wall texture (subtle brick/panel lines)
    g.lineStyle(1, 0x161b22, 0.3);
    for (let y = 20; y < 200; y += 40) {
      g.lineBetween(0, y, CANVAS.width, y);
    }

    // Draw furniture
    this.drawWindow(g);
    this.drawWhiteboard(g);
    this.drawServerRack(g);
    this.drawDesks(g);
    this.drawCouch(g);
    this.drawCoffeeMachine(g);
    this.drawPlants(g);
    this.drawDoor(g);
    this.drawPosters(g);
    this.drawZoneLabels();
  }

  drawWindow(g) {
    const w = FURNITURE.window;
    const wg = this.add.graphics();
    wg.setDepth(DEPTH.furnitureBg);

    // Window frame
    wg.fillStyle(COLORS.windowFrame);
    wg.fillRect(w.x - 4, w.y - 4, w.w + 8, w.h + 8);

    // Window glass (dark sky)
    wg.fillStyle(COLORS.window);
    wg.fillRect(w.x, w.y, w.w, w.h);

    // Stars
    wg.fillStyle(0xffffff);
    const stars = [
      [0.1, 0.2], [0.3, 0.4], [0.5, 0.15], [0.7, 0.3],
      [0.85, 0.2], [0.2, 0.7], [0.6, 0.6], [0.9, 0.5],
      [0.15, 0.5], [0.45, 0.8], [0.75, 0.7],
    ];
    stars.forEach(([sx, sy]) => {
      wg.fillRect(w.x + sx * w.w, w.y + sy * w.h, 2, 2);
    });

    // Moon
    wg.fillStyle(0xe6edf3);
    wg.fillCircle(w.x + w.w * 0.8, w.y + w.h * 0.25, 12);
    wg.fillStyle(COLORS.window);
    wg.fillCircle(w.x + w.w * 0.8 + 4, w.y + w.h * 0.25 - 3, 10);

    // City silhouette
    wg.fillStyle(0x161b22);
    const buildings = [
      { x: 0, h: 40, w: 30 },
      { x: 25, h: 55, w: 20 },
      { x: 40, h: 35, w: 25 },
      { x: 60, h: 60, w: 15 },
      { x: 72, h: 45, w: 30 },
      { x: 95, h: 50, w: 20 },
      { x: 110, h: 30, w: 25 },
      { x: 130, h: 65, w: 18 },
      { x: 145, h: 42, w: 30 },
      { x: 170, h: 55, w: 25 },
      { x: 190, h: 38, w: 20 },
      { x: 205, h: 48, w: 25 },
      { x: 225, h: 58, w: 15 },
    ];
    buildings.forEach(b => {
      wg.fillRect(w.x + b.x, w.y + w.h - b.h, b.w, b.h);
    });

    // Building windows (tiny yellow dots)
    wg.fillStyle(0xd29922);
    buildings.forEach(b => {
      for (let bx = 4; bx < b.w - 4; bx += 6) {
        for (let by = 5; by < b.h - 5; by += 8) {
          if (Math.random() > 0.4) {
            wg.fillRect(w.x + b.x + bx, w.y + w.h - b.h + by, 2, 3);
          }
        }
      }
    });

    // Window dividers
    wg.fillStyle(COLORS.windowFrame);
    wg.fillRect(w.x + w.w / 2 - 1, w.y, 2, w.h);
    wg.fillRect(w.x, w.y + w.h / 2 - 1, w.w, 2);
  }

  drawWhiteboard(g) {
    const wb = FURNITURE.whiteboard;
    const wg = this.add.graphics();
    wg.setDepth(DEPTH.furnitureBg);

    // Frame
    wg.fillStyle(COLORS.whiteboardFrame);
    wg.fillRect(wb.x - 3, wb.y - 3, wb.w + 6, wb.h + 6);

    // Board surface
    wg.fillStyle(COLORS.whiteboard);
    wg.fillRect(wb.x, wb.y, wb.w, wb.h);

    // Some "writing" on the board
    wg.fillStyle(0x10a37f);
    wg.fillRect(wb.x + 15, wb.y + 12, 60, 3);
    wg.fillRect(wb.x + 15, wb.y + 22, 80, 3);
    wg.fillRect(wb.x + 15, wb.y + 32, 45, 3);

    wg.fillStyle(0xf85149);
    wg.fillRect(wb.x + 110, wb.y + 12, 40, 3);
    wg.fillRect(wb.x + 110, wb.y + 22, 55, 3);

    wg.fillStyle(0x1f6feb);
    wg.fillRect(wb.x + 15, wb.y + 48, 70, 3);
    wg.fillRect(wb.x + 15, wb.y + 58, 50, 3);

    // "CODEX" title
    const title = this.add.text(wb.x + wb.w / 2, wb.y + 6, 'SPRINT', {
      fontSize: '8px',
      fontFamily: 'monospace',
      color: '#484f58',
    }).setOrigin(0.5, 0).setDepth(DEPTH.furnitureBg + 1);
  }

  drawServerRack(g) {
    const sr = FURNITURE.serverRack;
    const sg = this.add.graphics();
    sg.setDepth(DEPTH.furnitureBg);

    // Rack body
    sg.fillStyle(COLORS.serverRack);
    sg.fillRect(sr.x, sr.y, sr.w, sr.h);

    // Rack border
    sg.lineStyle(2, COLORS.trim);
    sg.strokeRect(sr.x, sr.y, sr.w, sr.h);

    // Server units
    for (let i = 0; i < 4; i++) {
      const uy = sr.y + 8 + i * 22;
      sg.fillStyle(0x30363d);
      sg.fillRect(sr.x + 8, uy, sr.w - 16, 18);

      // Ventilation lines
      sg.fillStyle(0x21262d);
      for (let lx = 0; lx < 6; lx++) {
        sg.fillRect(sr.x + 40 + lx * 12, uy + 4, 8, 2);
        sg.fillRect(sr.x + 40 + lx * 12, uy + 8, 8, 2);
        sg.fillRect(sr.x + 40 + lx * 12, uy + 12, 8, 2);
      }
    }

    // LED indicators (will be animated)
    for (let i = 0; i < 4; i++) {
      const uy = sr.y + 8 + i * 22;
      for (let j = 0; j < 3; j++) {
        const led = this.add.graphics();
        led.setDepth(DEPTH.furnitureBg + 1);
        const ledX = sr.x + 14 + j * 8;
        const ledY = uy + 7;
        led.fillStyle(COLORS.serverLed);
        led.fillCircle(ledX, ledY, 3);
        this.serverLeds.push({ graphic: led, x: ledX, y: ledY, phase: Math.random() * Math.PI * 2 });
      }
    }

    // "SERVER ROOM" label
    this.add.text(sr.x + sr.w / 2, sr.y - 10, 'SERVER ROOM', {
      fontSize: '8px',
      fontFamily: 'monospace',
      color: '#484f58',
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.furnitureBg);
  }

  drawDesks(g) {
    const dg = this.add.graphics();
    dg.setDepth(DEPTH.furniture);

    FURNITURE.desks.forEach((desk, i) => {
      // Desk legs
      dg.fillStyle(COLORS.desk);
      dg.fillRect(desk.x - 45, desk.y + 20, 4, 20);
      dg.fillRect(desk.x + 41, desk.y + 20, 4, 20);

      // Desk surface
      dg.fillStyle(COLORS.deskTop);
      dg.fillRect(desk.x - 48, desk.y + 14, 96, 8);

      // Desk front panel
      dg.fillStyle(COLORS.desk);
      dg.fillRect(desk.x - 48, desk.y + 22, 96, 4);

      if (desk.hasMonitor) {
        // Monitor stand
        dg.fillStyle(0x484f58);
        dg.fillRect(desk.x - 2, desk.y + 6, 4, 8);

        // Monitor
        dg.fillStyle(COLORS.monitor);
        dg.fillRect(desk.x - 18, desk.y - 14, 36, 22);

        // Screen (will be turned on when agent sits)
        dg.fillStyle(COLORS.monitorScreenOff);
        dg.fillRect(desk.x - 16, desk.y - 12, 32, 18);
      }

      // Chair
      dg.fillStyle(COLORS.chair);
      dg.fillRect(desk.x - 12, desk.y + 30, 24, 6);
      dg.fillStyle(COLORS.chairSeat);
      dg.fillRect(desk.x - 10, desk.y + 36, 20, 14);
      // Chair legs
      dg.fillStyle(0x30363d);
      dg.fillRect(desk.x - 8, desk.y + 50, 3, 6);
      dg.fillRect(desk.x + 5, desk.y + 50, 3, 6);
    });
  }

  drawCouch(g) {
    const c = FURNITURE.couch;
    const cg = this.add.graphics();
    cg.setDepth(DEPTH.furniture);

    // Couch back
    cg.fillStyle(COLORS.couch);
    cg.fillRect(c.x, c.y - 20, c.w, 20);

    // Couch seat
    cg.fillStyle(COLORS.couchCushion);
    cg.fillRect(c.x, c.y, c.w, c.h);

    // Cushion dividers
    cg.fillStyle(COLORS.couch);
    cg.fillRect(c.x + c.w / 3, c.y + 4, 2, c.h - 8);
    cg.fillRect(c.x + c.w * 2 / 3, c.y + 4, 2, c.h - 8);

    // Armrests
    cg.fillStyle(COLORS.couch);
    cg.fillRect(c.x - 8, c.y - 10, 8, c.h + 10);
    cg.fillRect(c.x + c.w, c.y - 10, 8, c.h + 10);

    // Legs
    cg.fillStyle(0x30363d);
    cg.fillRect(c.x + 4, c.y + c.h, 4, 6);
    cg.fillRect(c.x + c.w - 8, c.y + c.h, 4, 6);
  }

  drawCoffeeMachine(g) {
    const cm = FURNITURE.coffeeMachine;
    const cg = this.add.graphics();
    cg.setDepth(DEPTH.furniture);

    // Table
    cg.fillStyle(COLORS.desk);
    cg.fillRect(cm.x - 20, cm.y + 30, 40, 6);
    cg.fillRect(cm.x - 4, cm.y + 36, 8, 20);

    // Machine body
    cg.fillStyle(COLORS.coffeeMachine);
    cg.fillRect(cm.x - 14, cm.y, 28, 30);

    // Machine top
    cg.fillStyle(0x6e7681);
    cg.fillRect(cm.x - 14, cm.y - 4, 28, 4);

    // Display
    cg.fillStyle(COLORS.codexGreen);
    cg.fillRect(cm.x - 8, cm.y + 6, 16, 8);

    // Cup area
    cg.fillStyle(0x21262d);
    cg.fillRect(cm.x - 8, cm.y + 18, 16, 10);

    // Coffee cup
    cg.fillStyle(0xe6edf3);
    cg.fillRect(cm.x - 4, cm.y + 20, 8, 8);
    cg.fillStyle(COLORS.coffeeAccent);
    cg.fillRect(cm.x - 3, cm.y + 21, 6, 4);

    // Steam (will animate)
    this.coffeeSteam = [];
    for (let i = 0; i < 3; i++) {
      const steam = this.add.graphics();
      steam.setDepth(DEPTH.furniture + 1);
      this.coffeeSteam.push({
        graphic: steam,
        x: cm.x - 2 + i * 3,
        y: cm.y + 16,
        phase: i * 1.2,
      });
    }
  }

  drawPlants(g) {
    const pg = this.add.graphics();
    pg.setDepth(DEPTH.furniture);

    FURNITURE.plants.forEach(plant => {
      // Pot
      pg.fillStyle(COLORS.plantPot);
      pg.fillRect(plant.x - 10, plant.y + 10, 20, 16);
      pg.fillRect(plant.x - 12, plant.y + 8, 24, 4);

      // Plant leaves
      pg.fillStyle(COLORS.plant);
      pg.fillCircle(plant.x, plant.y, 12);
      pg.fillCircle(plant.x - 8, plant.y - 4, 8);
      pg.fillCircle(plant.x + 8, plant.y - 4, 8);
      pg.fillCircle(plant.x, plant.y - 10, 8);

      // Darker leaves
      pg.fillStyle(COLORS.plantDark);
      pg.fillCircle(plant.x - 4, plant.y + 2, 5);
      pg.fillCircle(plant.x + 6, plant.y - 2, 4);
    });
  }

  drawDoor(g) {
    const d = FURNITURE.door;
    const dg = this.add.graphics();
    dg.setDepth(DEPTH.furnitureBg);

    // Door frame
    dg.fillStyle(COLORS.trim);
    dg.fillRect(d.x - 24, d.y - 80, 4, 80);
    dg.fillRect(d.x + 20, d.y - 80, 4, 80);
    dg.fillRect(d.x - 24, d.y - 84, 48, 4);

    // Door
    dg.fillStyle(0x3d2b1f);
    dg.fillRect(d.x - 20, d.y - 80, 40, 80);

    // Door handle
    dg.fillStyle(COLORS.coffeeAccent);
    dg.fillRect(d.x + 10, d.y - 44, 4, 8);

    // "EXIT" sign
    this.add.text(d.x, d.y - 92, 'EXIT', {
      fontSize: '7px',
      fontFamily: 'monospace',
      color: '#f85149',
      backgroundColor: '#21262d',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.furnitureBg + 1);
  }

  drawPosters() {
    const pg = this.add.graphics();
    pg.setDepth(DEPTH.furnitureBg);

    // Poster 1: "SHIP IT" motivational
    pg.fillStyle(0x21262d);
    pg.fillRect(700, 80, 60, 80);
    pg.fillStyle(0x10a37f);
    pg.fillRect(702, 82, 56, 76);
    this.add.text(730, 105, 'SHIP\n  IT', {
      fontSize: '12px', fontFamily: 'monospace',
      color: '#0d1117', fontStyle: 'bold', lineSpacing: 2,
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.furnitureBg + 1);

    // Poster 2: Codex logo area
    pg.fillStyle(0x21262d);
    pg.fillRect(380, 210, 50, 50);
    pg.fillStyle(0x0d1117);
    pg.fillRect(382, 212, 46, 46);
    // Simple "C" shape
    pg.fillStyle(0x10a37f);
    pg.fillRect(395, 222, 20, 3);
    pg.fillRect(392, 225, 3, 16);
    pg.fillRect(395, 238, 20, 3);

    // Poster 3: Abstract art
    pg.fillStyle(0x21262d);
    pg.fillRect(870, 210, 40, 55);
    pg.fillStyle(0x1f6feb);
    pg.fillCircle(890, 230, 10);
    pg.fillStyle(0xd29922);
    pg.fillRect(878, 240, 16, 16);
    pg.fillStyle(0xf47067);
    pg.fillTriangle(890, 248, 882, 260, 898, 260);

    // Motivational sticky notes near whiteboard
    const notes = [
      { x: 670, y: 115, c: 0xd29922, t: 'TODO' },
      { x: 670, y: 140, c: 0x10a37f, t: 'DONE' },
      { x: 670, y: 165, c: 0xf85149, t: 'BUG!' },
    ];
    notes.forEach(n => {
      pg.fillStyle(n.c);
      pg.fillRect(n.x, n.y, 30, 20);
      this.add.text(n.x + 15, n.y + 10, n.t, {
        fontSize: '6px', fontFamily: 'monospace', color: '#0d1117',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH.furnitureBg + 1);
    });
  }

  drawZoneLabels() {
    // Workspace label
    this.add.text(420, 375, 'WORKSPACE', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#30363d',
      letterSpacing: 2,
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.floor + 1);

    // Think Tank label
    this.add.text(380, 170, 'THINK TANK', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#30363d',
      letterSpacing: 2,
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.floor + 1);

    // Break Room label
    this.add.text(1000, 395, 'BREAK ROOM', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#30363d',
      letterSpacing: 2,
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.floor + 1);

    // Coffee table label
    this.add.text(FURNITURE.coffeeTable.x + 30, FURNITURE.coffeeTable.y + 50, 'COFFEE', {
      fontSize: '7px',
      fontFamily: 'monospace',
      color: '#30363d',
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.floor + 1);

    // Zone divider line (dashed)
    const divider = this.add.graphics();
    divider.setDepth(DEPTH.floor + 1);
    divider.lineStyle(1, 0x30363d, 0.3);
    for (let y = 370; y < 700; y += 8) {
      divider.lineBetween(820, y, 820, y + 4);
    }
    for (let x = 40; x < 800; x += 8) {
      divider.lineBetween(x, 360, x + 4, 360);
    }
  }

  // ========================================
  // Characters
  // ========================================

  createBoss() {
    const sprite = this.add.sprite(BOSS.startPos.x, BOSS.startPos.y, 'boss', 0);
    sprite.setDepth(DEPTH.characters);
    sprite.setScale(0.7);

    const nameTag = this.add.text(BOSS.startPos.x, BOSS.startPos.y - 48, 'Codex Boss', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#10a37f',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(DEPTH.bubbles);

    this.boss = {
      sprite,
      nameTag,
      targetX: BOSS.startPos.x,
      targetY: BOSS.startPos.y,
      waypointIndex: 0,
      moveTimer: 0,
      isMoving: false,
    };
  }

  createCat() {
    const pos = { x: 1150, y: 580 };
    const sprite = this.add.sprite(pos.x, pos.y, 'cat', 0);
    sprite.setDepth(DEPTH.characters);
    sprite.setScale(0.9);

    const nameTag = this.add.text(pos.x, pos.y - 26, 'Neko', {
      fontSize: '7px',
      fontFamily: 'monospace',
      color: '#8b949e',
    }).setOrigin(0.5, 1).setDepth(DEPTH.bubbles);

    this.cat = { sprite, nameTag, timer: 0, wanderTimer: 0 };
  }

  createAgent(agentData) {
    const colorIndex = this.agentIndex++;
    const textureKey = SpriteFactory.getTextureKey(colorIndex);
    const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length];

    // Start at door
    const startX = FURNITURE.door.x;
    const startY = FURNITURE.door.y - 20;

    const sprite = this.add.sprite(startX, startY, textureKey, 0);
    sprite.setDepth(DEPTH.characters);
    sprite.setScale(0.6);
    sprite.setAlpha(0);

    const nameTag = this.add.text(startX, startY - 40, agentData.id, {
      fontSize: '8px',
      fontFamily: 'monospace',
      color: '#' + color.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
    }).setOrigin(0.5, 1).setDepth(DEPTH.bubbles);
    nameTag.setAlpha(0);

    // Entrance animation
    this.tweens.add({
      targets: [sprite, nameTag],
      alpha: 1,
      duration: 300,
    });

    const agent = {
      id: agentData.id,
      sprite,
      nameTag,
      bubble: null,
      bubbleTimer: 0,
      state: agentData.state || 'idle',
      task: agentData.task || '',
      colorIndex,
      color,
      textureKey,
      thinkWaypointIndex: 0,
      isMoving: false,
      walkFrame: 0,
      walkTimer: 0,
      idleBobPhase: Math.random() * Math.PI * 2,
      parentId: agentData.parent_id || null,
      isSubagent: agentData.is_subagent || false,
      nickname: agentData.nickname || '',
      agentRole: agentData.agent_role || '',
    };

    if (agent.isSubagent) {
      sprite.setScale(0.4);
      nameTag.setStyle({ fontSize: '7px' });
    }

    this.agents[agentData.id] = agent;

    // Move to initial position
    this.moveAgentToState(agent, agentData.state || 'idle');

    // Show join bubble
    this.showBubble(agent, BUBBLES.join[Math.floor(Math.random() * BUBBLES.join.length)]);

    return agent;
  }

  removeAgent(agentId) {
    const agent = this.agents[agentId];
    if (!agent) return;

    // Show leave bubble
    this.showBubble(agent, BUBBLES.leave[Math.floor(Math.random() * BUBBLES.leave.length)]);

    // Free desk slot
    if (this.deskSlots[agentId] !== undefined) {
      this.usedSlots.delete(this.deskSlots[agentId]);
      delete this.deskSlots[agentId];
    }

    // Animate out (walk to door then fade)
    this.tweens.add({
      targets: agent.sprite,
      x: FURNITURE.door.x,
      y: FURNITURE.door.y - 20,
      duration: 800,
      ease: 'Power1',
      onComplete: () => {
        this.tweens.add({
          targets: [agent.sprite, agent.nameTag],
          alpha: 0,
          duration: 300,
          onComplete: () => {
            agent.sprite.destroy();
            agent.nameTag.destroy();
            if (agent.bubble) {
              agent.bubble.bg.destroy();
              agent.bubble.text.destroy();
            }
            delete this.agents[agentId];
          },
        });
      },
    });
  }

  // ========================================
  // Agent Movement & State
  // ========================================

  moveAgentToState(agent, state) {
    let targetX, targetY;

    switch (state) {
      case 'coding':
      case 'searching': {
        if (agent.isSubagent && agent.parentId && this.agents[agent.parentId]) {
          const parent = this.agents[agent.parentId];
          targetX = parent.sprite.x + 30;
          targetY = parent.sprite.y + 10;
        } else {
          const slotIndex = this.assignDeskSlot(agent.id);
          const slot = ZONES.desk.slots[slotIndex];
          targetX = slot.x;
          targetY = slot.y;
        }
        break;
      }
      case 'thinking': {
        const wp = ZONES.thinking.waypoints[0];
        targetX = wp.x + (Math.random() - 0.5) * 40;
        targetY = wp.y + (Math.random() - 0.5) * 20;
        break;
      }
      case 'error': {
        targetX = ZONES.error.position.x + (Math.random() - 0.5) * 60;
        targetY = ZONES.error.position.y + (Math.random() - 0.5) * 30;
        break;
      }
      case 'idle':
      default: {
        const wp = ZONES.breakroom.waypoints[Math.floor(Math.random() * ZONES.breakroom.waypoints.length)];
        targetX = wp.x;
        targetY = wp.y;
        break;
      }
    }

    this.moveAgentTo(agent, targetX, targetY, () => {
      // Set working frame when at desk
      if (state === 'coding' || state === 'searching') {
        agent.sprite.setFrame(5); // working/typing frame
      }
    });
  }

  moveAgentTo(agent, x, y, onComplete) {
    agent.isMoving = true;

    // Flip sprite based on direction
    if (x < agent.sprite.x) {
      agent.sprite.setFlipX(true);
    } else if (x > agent.sprite.x) {
      agent.sprite.setFlipX(false);
    }

    const distance = Phaser.Math.Distance.Between(agent.sprite.x, agent.sprite.y, x, y);
    const duration = Math.max(400, distance * 3);

    this.tweens.add({
      targets: agent.sprite,
      x,
      y,
      duration,
      ease: 'Power1',
      onUpdate: () => {
        // Update name tag position
        agent.nameTag.setPosition(agent.sprite.x, agent.sprite.y - 40);
        // Update bubble position
        if (agent.bubble) {
          agent.bubble.bg.setPosition(agent.sprite.x, agent.sprite.y - 56);
          agent.bubble.text.setPosition(agent.sprite.x, agent.sprite.y - 56);
        }
        // Update depth based on Y
        agent.sprite.setDepth(DEPTH.characters + agent.sprite.y * 0.1);
      },
      onComplete: () => {
        agent.isMoving = false;
        if (onComplete) onComplete();
      },
    });
  }

  assignDeskSlot(agentId) {
    if (this.deskSlots[agentId] !== undefined) {
      return this.deskSlots[agentId];
    }
    for (let i = 0; i < ZONES.desk.slots.length; i++) {
      if (!this.usedSlots.has(i)) {
        this.usedSlots.add(i);
        this.deskSlots[agentId] = i;
        return i;
      }
    }
    // All slots full, reuse
    const slot = Object.keys(this.agents).length % ZONES.desk.slots.length;
    this.deskSlots[agentId] = slot;
    return slot;
  }

  // ========================================
  // Animation Updates
  // ========================================

  updateAgentAnimation(agent, time) {
    if (agent.isMoving) {
      // Walking animation: cycle through frames 2, 3, 4
      agent.walkTimer += 1;
      if (agent.walkTimer > 8) {
        agent.walkTimer = 0;
        const walkFrames = [2, 3, 4];
        agent.walkFrame = (agent.walkFrame + 1) % walkFrames.length;
        agent.sprite.setFrame(walkFrames[agent.walkFrame]);
      }
    } else if (agent.state === 'thinking') {
      // Thinking: wander between waypoints
      agent.walkTimer += 1;
      if (agent.walkTimer > 200) {
        agent.walkTimer = 0;
        agent.thinkWaypointIndex = (agent.thinkWaypointIndex + 1) % ZONES.thinking.waypoints.length;
        const wp = ZONES.thinking.waypoints[agent.thinkWaypointIndex];
        this.moveAgentTo(agent, wp.x + (Math.random() - 0.5) * 30, wp.y + (Math.random() - 0.5) * 20);
      }
      // Idle bobbing while thinking
      agent.idleBobPhase += 0.03;
      agent.sprite.y += Math.sin(agent.idleBobPhase) * 0.2;
    } else if (agent.state === 'idle') {
      // Idle: slow drift in breakroom
      agent.walkTimer += 1;
      if (agent.walkTimer > 300) {
        agent.walkTimer = 0;
        const wp = ZONES.breakroom.waypoints[Math.floor(Math.random() * ZONES.breakroom.waypoints.length)];
        this.moveAgentTo(agent, wp.x + (Math.random() - 0.5) * 20, wp.y + (Math.random() - 0.5) * 20);
      }
      agent.idleBobPhase += 0.02;
      agent.sprite.y += Math.sin(agent.idleBobPhase) * 0.15;
    } else if (agent.state === 'coding' || agent.state === 'searching') {
      // Working: alternate between frame 5 (typing) with subtle bob
      agent.idleBobPhase += 0.05;
      agent.sprite.y += Math.sin(agent.idleBobPhase) * 0.1;
      // Occasional idle frame swap to simulate typing
      agent.walkTimer += 1;
      if (agent.walkTimer > 30) {
        agent.walkTimer = 0;
        agent.sprite.setFrame(agent.sprite.frame.name === 5 ? 0 : 5);
      }
    }

    // Periodic random bubbles
    agent.bubbleTimer += 1;
    if (agent.bubbleTimer > 600 + Math.random() * 400) {
      agent.bubbleTimer = 0;
      const pool = BUBBLES[agent.state] || BUBBLES.idle;
      if (pool && Math.random() > 0.5) {
        this.showBubble(agent, pool[Math.floor(Math.random() * pool.length)]);
      }
    }
  }

  updateBossWander(time) {
    if (!this.boss) return;

    this.boss.moveTimer += 1;
    if (this.boss.moveTimer > 300 && !this.boss.isMoving) {
      this.boss.moveTimer = 0;
      this.boss.waypointIndex = (this.boss.waypointIndex + 1) % BOSS.waypoints.length;
      const wp = BOSS.waypoints[this.boss.waypointIndex];
      this.boss.isMoving = true;

      if (wp.x < this.boss.sprite.x) {
        this.boss.sprite.setFlipX(true);
      } else {
        this.boss.sprite.setFlipX(false);
      }

      // Walking animation for boss (frames 2,3,4)
      let bossWalkIdx = 0;
      const walkAnim = this.time.addEvent({
        delay: 120,
        callback: () => {
          const walkFrames = [2, 3, 4];
          bossWalkIdx = (bossWalkIdx + 1) % walkFrames.length;
          this.boss.sprite.setFrame(walkFrames[bossWalkIdx]);
        },
        loop: true,
      });

      this.tweens.add({
        targets: this.boss.sprite,
        x: wp.x,
        y: wp.y,
        duration: 1500 + Math.random() * 1000,
        ease: 'Power1',
        onUpdate: () => {
          this.boss.nameTag.setPosition(this.boss.sprite.x, this.boss.sprite.y - 48);
          this.boss.sprite.setDepth(DEPTH.characters + this.boss.sprite.y * 0.1);
        },
        onComplete: () => {
          this.boss.isMoving = false;
          this.boss.sprite.setFrame(0);
          walkAnim.remove();
        },
      });
    }
  }

  updateCat(time) {
    if (!this.cat) return;
    this.cat.timer += 1;
    if (this.cat.timer > 30) {
      this.cat.timer = 0;
      const f = this.cat.sprite.frame.name;
      this.cat.sprite.setFrame((f + 1) % 4);
    }
    // Occasional wander
    this.cat.wanderTimer += 1;
    if (this.cat.wanderTimer > 500) {
      this.cat.wanderTimer = 0;
      const tx = 1100 + (Math.random() - 0.5) * 100;
      const ty = 560 + (Math.random() - 0.5) * 40;
      this.tweens.add({
        targets: this.cat.sprite,
        x: tx, y: ty,
        duration: 2000,
        ease: 'Power1',
        onUpdate: () => {
          this.cat.nameTag.setPosition(this.cat.sprite.x, this.cat.sprite.y - 26);
        },
      });
    }
  }

  // ========================================
  // Ambient Animations
  // ========================================

  startAmbientAnimations() {
    // Server LED blinking
    this.time.addEvent({
      delay: 100,
      callback: () => {
        this.serverLeds.forEach(led => {
          led.phase += 0.15;
          const brightness = Math.sin(led.phase) * 0.5 + 0.5;
          led.graphic.clear();
          const color = brightness > 0.5 ? COLORS.serverLed : (brightness > 0.2 ? COLORS.serverLedWarn : COLORS.serverLedError);
          led.graphic.fillStyle(color, 0.6 + brightness * 0.4);
          led.graphic.fillCircle(led.x, led.y, 3);
        });
      },
      loop: true,
    });

    // Coffee steam animation
    this.time.addEvent({
      delay: 80,
      callback: () => {
        if (!this.coffeeSteam) return;
        this.coffeeSteam.forEach(steam => {
          steam.phase += 0.08;
          steam.graphic.clear();
          steam.graphic.fillStyle(0xe6edf3, 0.2 + Math.sin(steam.phase) * 0.15);
          const sy = steam.y - 5 - Math.abs(Math.sin(steam.phase)) * 8;
          steam.graphic.fillCircle(steam.x + Math.sin(steam.phase * 1.5) * 2, sy, 2);
        });
      },
      loop: true,
    });
  }

  // ========================================
  // Speech Bubbles
  // ========================================

  showBubble(agent, text) {
    // Remove existing bubble
    if (agent.bubble) {
      agent.bubble.bg.destroy();
      agent.bubble.text.destroy();
      if (agent.bubble.timer) agent.bubble.timer.remove();
    }

    const bx = agent.sprite.x;
    const by = agent.sprite.y - 56;

    const bubbleText = this.add.text(bx, by, text, {
      fontSize: '8px',
      fontFamily: 'monospace',
      color: '#e6edf3',
      backgroundColor: '#30363d',
      padding: { x: 6, y: 3 },
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(DEPTH.bubbles);

    // Background (using the text background)
    const bg = this.add.graphics();
    bg.setDepth(DEPTH.bubbles - 1);

    agent.bubble = {
      bg,
      text: bubbleText,
      timer: this.time.addEvent({
        delay: 3000,
        callback: () => {
          this.tweens.add({
            targets: [bg, bubbleText],
            alpha: 0,
            duration: 300,
            onComplete: () => {
              bg.destroy();
              bubbleText.destroy();
              if (agent.bubble && agent.bubble.text === bubbleText) {
                agent.bubble = null;
              }
            },
          });
        },
      }),
    };

    // Fade in
    bubbleText.setAlpha(0);
    this.tweens.add({ targets: bubbleText, alpha: 1, duration: 200 });
  }

  // ========================================
  // Clock
  // ========================================

  createClock() {
    const cx = FURNITURE.clock.x;
    const cy = FURNITURE.clock.y;

    // Clock face
    const cg = this.add.graphics();
    cg.setDepth(DEPTH.furnitureBg);
    cg.fillStyle(0xe6edf3);
    cg.fillCircle(cx, cy, 18);
    cg.lineStyle(2, COLORS.trim);
    cg.strokeCircle(cx, cy, 18);

    // Clock text
    this.clockText = this.add.text(cx, cy, '', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#0d1117',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(DEPTH.furnitureBg + 1);
  }

  updateClock() {
    if (!this.clockText) return;
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    this.clockText.setText(`${h}:${m}`);
  }

  // ========================================
  // Backend Polling & UI
  // ========================================

  async pollAgents() {
    try {
      const res = await fetch('http://localhost:19000/agents');
      if (!res.ok) return;
      const data = await res.json();
      this.syncAgents(data);
      this.updateUI(data);
    } catch (e) {
      // Server not running, silently ignore
    }

    // Also poll activity log
    try {
      const res = await fetch('http://localhost:19000/activity');
      if (!res.ok) return;
      const log = await res.json();
      this.updateActivityLog(log);
    } catch (e) {
      // ignore
    }
  }

  syncAgents(serverAgents) {
    const serverIds = new Set(serverAgents.map(a => a.id));

    // Remove agents that left
    Object.keys(this.agents).forEach(id => {
      if (!serverIds.has(id)) {
        this.removeAgent(id);
      }
    });

    // Sort so non-subagents (parents) are created first
    serverAgents.sort((a, b) => (a.is_subagent ? 1 : 0) - (b.is_subagent ? 1 : 0));

    // Add or update agents
    serverAgents.forEach(agentData => {
      const existing = this.agents[agentData.id];
      if (!existing) {
        this.createAgent(agentData);
      } else {
        // Update state if changed
        if (existing.state !== agentData.state) {
          const oldState = existing.state;
          existing.state = agentData.state;
          existing.task = agentData.task || '';

          // Free desk slot if leaving desk
          if ((oldState === 'coding' || oldState === 'searching') &&
              agentData.state !== 'coding' && agentData.state !== 'searching') {
            if (this.deskSlots[agentData.id] !== undefined) {
              this.usedSlots.delete(this.deskSlots[agentData.id]);
              delete this.deskSlots[agentData.id];
            }
          }

          this.moveAgentToState(existing, agentData.state);

          // Show state change bubble
          const pool = BUBBLES[agentData.state];
          if (pool) {
            this.showBubble(existing, pool[Math.floor(Math.random() * pool.length)]);
          }
        }
        existing.task = agentData.task || '';
      }
    });

    // Update stats
    this.updateStats(serverAgents);
  }

  updateStats(agents) {
    const total = agents.length;
    const coding = agents.filter(a => a.state === 'coding').length;
    const thinking = agents.filter(a => a.state === 'thinking').length;
    const idle = agents.filter(a => a.state === 'idle').length;

    const el = document.getElementById;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const subs = agents.filter(a => a.is_subagent).length;

    setVal('stat-total', total);
    setVal('stat-coding', coding);
    setVal('stat-thinking', thinking);
    setVal('stat-idle', idle);
    setVal('stat-subagents', subs);
  }

  updateUI(agents) {
    const list = document.getElementById('agent-list');
    if (!list) return;

    if (agents.length === 0) {
      list.innerHTML = '<div class="empty-state">No agents online.<br>Start a Codex process to see it here!</div>';
      return;
    }

    const parents = agents.filter(a => !a.is_subagent);
    const subagents = agents.filter(a => a.is_subagent);

    const renderCard = (a, isSub) => {
      const color = this.agents[a.id]
        ? '#' + this.agents[a.id].color.toString(16).padStart(6, '0')
        : '#10a37f';
      const cardClass = isSub ? 'agent-card sub-agent' : 'agent-card';
      const displayName = isSub ? (a.nickname || a.id) : a.id;
      const roleTag = isSub && a.agent_role ? `<span class="agent-role">${a.agent_role}</span>` : '';
      return `
        <div class="${cardClass}" ondblclick="focusAgent('${a.id}')">
          <div class="avatar" style="background:${color}">${a.id.slice(-2).toUpperCase()}</div>
          <div class="info">
            <div class="name">${displayName}${roleTag}</div>
            <div class="task">${a.task || 'No active task'}</div>
          </div>
          <span class="state-badge state-${a.state}">${a.state}</span>
        </div>
      `;
    };

    let html = '';
    parents.forEach(p => {
      html += renderCard(p, false);
      subagents.filter(s => s.parent_id === p.id).forEach(s => {
        html += renderCard(s, true);
      });
    });
    // Render orphan sub-agents (no matching parent)
    subagents.filter(s => !parents.some(p => p.id === s.parent_id)).forEach(s => {
      html += renderCard(s, true);
    });

    list.innerHTML = html;
  }

  updateActivityLog(log) {
    const el = document.getElementById('activity-log');
    if (!el) return;

    if (log.length === 0) {
      el.innerHTML = '<div class="empty-state">No activity yet.</div>';
      return;
    }

    el.innerHTML = log.slice(0, 50).map(entry => `
      <div class="log-entry">
        <span class="log-time">${entry.time}</span>
        <span class="log-agent">${entry.agent_id}</span>
        <span class="log-state state-badge state-${entry.state}">${entry.state}</span>
        <span class="log-task">${entry.task || ''}</span>
      </div>
    `).join('');
  }
}

// ========================================
// Focus Agent Terminal (macOS)
// ========================================

async function focusAgent(agentId) {
  try {
    await fetch('http://localhost:19000/agent/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agentId }),
    });
  } catch (e) {
    console.log('Could not focus agent terminal');
  }
}

// ========================================
// Initialize Phaser
// ========================================

const config = {
  type: Phaser.AUTO,
  width: CANVAS.width,
  height: CANVAS.height,
  parent: 'game-container',
  backgroundColor: '#0d1117',
  pixelArt: true,
  scene: OfficeScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: {
    target: 30,
    forceSetTimeOut: true,
  },
};

const game = new Phaser.Game(config);
