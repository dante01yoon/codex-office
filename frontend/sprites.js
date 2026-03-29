/**
 * Codex Office - Sprite Factory v2
 *
 * Component-based pixel art generation system.
 * Characters are drawn using layered body parts with proper shading.
 * Supports PNG spritesheet override: drop files into assets/ to replace.
 *
 * Frame layout per character (6 frames):
 *   0: idle1  1: idle2  2: walk1  3: walk2  4: walk3  5: working
 */

const PX = 3; // pixel scale factor

// ── Hair style definitions (top-down pixel rows) ──
// Each style is an array of rows, drawn above the head
const HAIR_STYLES = {
  short: [
    '..HHHH..',
    '.HHHHHH.',
    '.HH..HH.',
  ],
  spiky: [
    '.H.HH.H.',
    '.HHHHHH.',
    '.HHHHHH.',
    '.HH..HH.',
  ],
  long: [
    '..HHHH..',
    '.HHHHHH.',
    'HHHHHHHH',
    'HH....HH',
  ],
  curly: [
    '.HHHHHH.',
    'HH.HH.HH',
    'HHHHHHHH',
    'HH....HH',
  ],
  mohawk: [
    '...HH...',
    '..HHHH..',
    '.HHHHHH.',
    '.HH..HH.',
  ],
  bun: [
    '...HH...',
    '..HHHH..',
    '.HHHHHH.',
    '.HHHHHH.',
    '.HH..HH.',
  ],
  cap: [
    '.CCCCCC.',
    'CCCCCCCC',
    'CC....CC',
  ],
  beanie: [
    '..BBBB..',
    '.BBBBBB.',
    'BBBWBBBB',
    'BB....BB',
  ],
};

// ── Accessory definitions ──
const ACCESSORIES = {
  none: [],
  glasses: [{ x: 1, y: 0, w: 2, h: 1, c: 'G' }, { x: 5, y: 0, w: 2, h: 1, c: 'G' }, { x: 3, y: 0, w: 2, h: 1, c: 'g' }],
  headphones: [{ x: 0, y: -1, w: 1, h: 3, c: 'G' }, { x: 7, y: -1, w: 1, h: 3, c: 'G' }, { x: 1, y: -2, w: 6, h: 1, c: 'G' }],
};

const SpriteFactory = {
  _assetCache: {},

  /**
   * Generate all textures. Checks for PNG overrides in assets/ first.
   */
  generateAll(scene) {
    const charConfigs = [
      { key: 'char_green',    body: 0x10a37f, hair: 'short',   acc: 'none' },
      { key: 'char_blue',     body: 0x1f6feb, hair: 'spiky',   acc: 'glasses' },
      { key: 'char_amber',    body: 0xd29922, hair: 'long',    acc: 'none' },
      { key: 'char_purple',   body: 0xa371f7, hair: 'curly',   acc: 'none' },
      { key: 'char_coral',    body: 0xf47067, hair: 'mohawk',  acc: 'headphones' },
      { key: 'char_lime',     body: 0x3fb950, hair: 'bun',     acc: 'none' },
      { key: 'char_orange',   body: 0xdb6d28, hair: 'cap',     acc: 'none' },
      { key: 'char_sky',      body: 0x79c0ff, hair: 'beanie',  acc: 'glasses' },
      { key: 'char_lavender', body: 0xd2a8ff, hair: 'long',    acc: 'none' },
      { key: 'char_salmon',   body: 0xff7b72, hair: 'short',   acc: 'headphones' },
    ];

    charConfigs.forEach(cfg => {
      this._generateCharacter(scene, cfg.key, cfg.body, cfg.hair, cfg.acc);
    });

    this._generateBoss(scene);
    this._generateCat(scene);
  },

  // ════════════════════════════════════════════
  // Character Generation
  // ════════════════════════════════════════════

  _generateCharacter(scene, key, bodyColor, hairStyle, accessory) {
    const fw = 20;  // frame width in pixels
    const fh = 28;  // frame height
    const frames = 6;
    const canvas = document.createElement('canvas');
    canvas.width = fw * frames * PX;
    canvas.height = fh * PX;
    const ctx = canvas.getContext('2d');

    const pal = this._palette(bodyColor);

    // Generate each frame
    const frameFns = [
      (c, p) => this._drawCharIdle1(c, p, fw, fh, hairStyle, accessory),
      (c, p) => this._drawCharIdle2(c, p, fw, fh, hairStyle, accessory),
      (c, p) => this._drawCharWalk1(c, p, fw, fh, hairStyle, accessory),
      (c, p) => this._drawCharWalk2(c, p, fw, fh, hairStyle, accessory),
      (c, p) => this._drawCharWalk3(c, p, fw, fh, hairStyle, accessory),
      (c, p) => this._drawCharWork(c, p, fw, fh, hairStyle, accessory),
    ];

    frameFns.forEach((fn, i) => {
      ctx.save();
      ctx.translate(i * fw * PX, 0);
      fn(ctx, pal);
      ctx.restore();
    });

    const texture = scene.textures.addCanvas(key, canvas);
    for (let i = 0; i < frames; i++) {
      texture.add(i, 0, i * fw * PX, 0, fw * PX, fh * PX);
    }
  },

  // ── Drawing helpers ──

  _px(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * PX, y * PX, PX, PX);
  },

  _rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * PX, y * PX, w * PX, h * PX);
  },

  _drawHead(ctx, pal, cx, y) {
    // Head shape (round)
    this._rect(ctx, cx - 3, y, 6, 1, pal.skin);      // top
    this._rect(ctx, cx - 4, y + 1, 8, 5, pal.skin);   // face
    this._rect(ctx, cx - 3, y + 6, 6, 1, pal.skin);   // chin

    // Eyes
    this._px(ctx, cx - 2, y + 3, pal.eye);
    this._px(ctx, cx + 1, y + 3, pal.eye);

    // Eye highlights
    this._px(ctx, cx - 2, y + 2, pal.eyeHighlight);
    this._px(ctx, cx + 1, y + 2, pal.eyeHighlight);

    // Mouth
    this._px(ctx, cx - 1, y + 5, pal.mouth);
    this._px(ctx, cx, y + 5, pal.mouth);

    // Ear shadow
    this._px(ctx, cx - 4, y + 3, pal.skinShadow);
    this._px(ctx, cx + 3, y + 3, pal.skinShadow);

    // Cheek blush
    this._px(ctx, cx - 3, y + 4, pal.blush);
    this._px(ctx, cx + 2, y + 4, pal.blush);
  },

  _drawHair(ctx, pal, cx, y, style) {
    const hairData = HAIR_STYLES[style] || HAIR_STYLES.short;
    const startY = y - hairData.length;

    hairData.forEach((row, ry) => {
      const rowStart = cx - Math.floor(row.length / 2);
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        let color = pal.hair;
        if (ch === 'C') color = pal.body;        // cap color
        if (ch === 'B') color = pal.bodyDark;     // beanie
        if (ch === 'W') color = '#e6edf3';        // white stripe
        if (ch === 'h') color = pal.hairHighlight; // highlight
        this._px(ctx, rowStart + i, startY + ry, color);
      }
    });
  },

  _drawAccessory(ctx, pal, cx, eyeY, acc) {
    const accData = ACCESSORIES[acc];
    if (!accData || accData.length === 0) return;

    accData.forEach(part => {
      const color = part.c === 'G' ? '#484f58' : '#30363d';
      this._rect(ctx, cx - 3 + part.x, eyeY + part.y, part.w, part.h, color);
    });
  },

  _drawBody(ctx, pal, cx, y, armAngle) {
    // Neck
    this._rect(ctx, cx - 1, y, 2, 1, pal.skin);

    // Torso
    this._rect(ctx, cx - 3, y + 1, 6, 1, pal.body);    // shoulders
    this._rect(ctx, cx - 4, y + 2, 8, 4, pal.body);     // body
    this._rect(ctx, cx - 3, y + 6, 6, 1, pal.body);     // bottom

    // Body shading (left side darker)
    this._rect(ctx, cx - 4, y + 2, 2, 4, pal.bodyDark);

    // Collar/neckline detail
    this._px(ctx, cx - 1, y + 1, pal.bodyLight);
    this._px(ctx, cx, y + 1, pal.bodyLight);

    // Logo dot on chest (Codex brand)
    this._px(ctx, cx, y + 3, pal.bodyLight);

    // Arms
    if (armAngle === 'down') {
      // Left arm
      this._rect(ctx, cx - 5, y + 2, 1, 5, pal.body);
      this._px(ctx, cx - 5, y + 7, pal.skin);
      // Right arm
      this._rect(ctx, cx + 4, y + 2, 1, 5, pal.body);
      this._px(ctx, cx + 4, y + 7, pal.skin);
    } else if (armAngle === 'swing1') {
      this._rect(ctx, cx - 5, y + 1, 1, 5, pal.body);
      this._px(ctx, cx - 5, y + 6, pal.skin);
      this._rect(ctx, cx + 4, y + 3, 1, 5, pal.body);
      this._px(ctx, cx + 4, y + 8, pal.skin);
    } else if (armAngle === 'swing2') {
      this._rect(ctx, cx - 5, y + 3, 1, 5, pal.body);
      this._px(ctx, cx - 5, y + 8, pal.skin);
      this._rect(ctx, cx + 4, y + 1, 1, 5, pal.body);
      this._px(ctx, cx + 4, y + 6, pal.skin);
    } else if (armAngle === 'typing') {
      // Arms stretched forward for typing
      this._rect(ctx, cx - 5, y + 2, 1, 3, pal.body);
      this._rect(ctx, cx - 6, y + 5, 2, 1, pal.body);
      this._px(ctx, cx - 6, y + 6, pal.skin);
      this._rect(ctx, cx + 4, y + 2, 1, 3, pal.body);
      this._rect(ctx, cx + 4, y + 5, 2, 1, pal.body);
      this._px(ctx, cx + 5, y + 6, pal.skin);
    }
  },

  _drawLegs(ctx, pal, cx, y, pose) {
    if (pose === 'stand') {
      this._rect(ctx, cx - 2, y, 2, 5, pal.pants);
      this._rect(ctx, cx, y, 2, 5, pal.pants);
      this._rect(ctx, cx - 3, y + 5, 3, 2, pal.shoes);
      this._rect(ctx, cx, y + 5, 3, 2, pal.shoes);
      // Shoe highlight
      this._px(ctx, cx - 3, y + 5, pal.shoeHighlight);
      this._px(ctx, cx, y + 5, pal.shoeHighlight);
    } else if (pose === 'walk1') {
      // Left forward
      this._rect(ctx, cx - 3, y, 2, 5, pal.pants);
      this._rect(ctx, cx + 1, y + 1, 2, 4, pal.pants);
      this._rect(ctx, cx - 4, y + 5, 3, 2, pal.shoes);
      this._rect(ctx, cx + 1, y + 5, 3, 2, pal.shoes);
    } else if (pose === 'walk2') {
      // Right forward
      this._rect(ctx, cx - 2, y + 1, 2, 4, pal.pants);
      this._rect(ctx, cx + 1, y, 2, 5, pal.pants);
      this._rect(ctx, cx - 2, y + 5, 3, 2, pal.shoes);
      this._rect(ctx, cx + 1, y + 5, 3, 2, pal.shoes);
    } else if (pose === 'walk3') {
      // Passing (legs together)
      this._rect(ctx, cx - 2, y, 2, 4, pal.pants);
      this._rect(ctx, cx, y, 2, 4, pal.pants);
      this._rect(ctx, cx - 2, y + 4, 2, 2, pal.shoes);
      this._rect(ctx, cx, y + 4, 2, 2, pal.shoes);
    } else if (pose === 'sit') {
      // Seated
      this._rect(ctx, cx - 3, y, 6, 2, pal.pants);
      this._rect(ctx, cx - 4, y + 2, 3, 3, pal.pants);
      this._rect(ctx, cx + 1, y + 2, 3, 3, pal.pants);
      this._rect(ctx, cx - 4, y + 5, 3, 1, pal.shoes);
      this._rect(ctx, cx + 1, y + 5, 3, 1, pal.shoes);
    }
  },

  // ── Frame drawing functions ──

  _drawCharIdle1(ctx, pal, fw, fh, hair, acc) {
    const cx = Math.floor(fw / 2);
    this._drawHair(ctx, pal, cx, 5, hair);
    this._drawHead(ctx, pal, cx, 5);
    this._drawAccessory(ctx, pal, cx, 7, acc);
    this._drawBody(ctx, pal, cx, 12, 'down');
    this._drawLegs(ctx, pal, cx, 20, 'stand');
  },

  _drawCharIdle2(ctx, pal, fw, fh, hair, acc) {
    const cx = Math.floor(fw / 2);
    // Slight bob (1px up)
    this._drawHair(ctx, pal, cx, 4, hair);
    this._drawHead(ctx, pal, cx, 4);
    this._drawAccessory(ctx, pal, cx, 6, acc);
    this._drawBody(ctx, pal, cx, 11, 'down');
    this._drawLegs(ctx, pal, cx, 19, 'stand');
  },

  _drawCharWalk1(ctx, pal, fw, fh, hair, acc) {
    const cx = Math.floor(fw / 2);
    this._drawHair(ctx, pal, cx, 5, hair);
    this._drawHead(ctx, pal, cx, 5);
    this._drawAccessory(ctx, pal, cx, 7, acc);
    this._drawBody(ctx, pal, cx, 12, 'swing1');
    this._drawLegs(ctx, pal, cx, 20, 'walk1');
  },

  _drawCharWalk2(ctx, pal, fw, fh, hair, acc) {
    const cx = Math.floor(fw / 2);
    // Bob up on passing frame
    this._drawHair(ctx, pal, cx, 4, hair);
    this._drawHead(ctx, pal, cx, 4);
    this._drawAccessory(ctx, pal, cx, 6, acc);
    this._drawBody(ctx, pal, cx, 11, 'down');
    this._drawLegs(ctx, pal, cx, 19, 'walk3');
  },

  _drawCharWalk3(ctx, pal, fw, fh, hair, acc) {
    const cx = Math.floor(fw / 2);
    this._drawHair(ctx, pal, cx, 5, hair);
    this._drawHead(ctx, pal, cx, 5);
    this._drawAccessory(ctx, pal, cx, 7, acc);
    this._drawBody(ctx, pal, cx, 12, 'swing2');
    this._drawLegs(ctx, pal, cx, 20, 'walk2');
  },

  _drawCharWork(ctx, pal, fw, fh, hair, acc) {
    const cx = Math.floor(fw / 2);
    // Seated at desk
    this._drawHair(ctx, pal, cx, 3, hair);
    this._drawHead(ctx, pal, cx, 3);
    this._drawAccessory(ctx, pal, cx, 5, acc);
    this._drawBody(ctx, pal, cx, 10, 'typing');
    this._drawLegs(ctx, pal, cx, 18, 'sit');
  },

  // ════════════════════════════════════════════
  // Boss Character (larger, with crown)
  // ════════════════════════════════════════════

  _generateBoss(scene) {
    const fw = 24;
    const fh = 32;
    const frames = 6;
    const canvas = document.createElement('canvas');
    canvas.width = fw * frames * PX;
    canvas.height = fh * PX;
    const ctx = canvas.getContext('2d');

    const pal = this._palette(0x10a37f);
    pal.crown = '#ffd700';
    pal.crownGem = '#f85149';

    const drawBossFrame = (frameIdx) => {
      ctx.save();
      ctx.translate(frameIdx * fw * PX, 0);
      const cx = Math.floor(fw / 2);
      const bobY = (frameIdx === 1 || frameIdx === 3) ? -1 : 0;
      const headY = 7 + bobY;

      // Crown
      this._rect(ctx, cx - 2, headY - 4, 4, 1, pal.crown);
      this._px(ctx, cx - 3, headY - 5, pal.crown);
      this._px(ctx, cx, headY - 5, pal.crownGem);
      this._px(ctx, cx + 2, headY - 5, pal.crown);
      this._rect(ctx, cx - 3, headY - 3, 6, 1, pal.crown);

      // Hair
      this._drawHair(ctx, pal, cx, headY, 'short');
      this._drawHead(ctx, pal, cx, headY);

      // Tie
      const bodyY = headY + 7;
      const armPose = (frameIdx === 2) ? 'swing1' : (frameIdx === 4) ? 'swing2' : 'down';
      this._drawBody(ctx, pal, cx, bodyY, frameIdx === 5 ? 'typing' : armPose);

      // Tie detail
      this._px(ctx, cx, bodyY + 1, '#d29922');
      this._px(ctx, cx, bodyY + 2, '#d29922');
      this._px(ctx, cx - 1, bodyY + 3, '#d29922');
      this._px(ctx, cx, bodyY + 3, '#d29922');
      this._px(ctx, cx + 1, bodyY + 3, '#d29922');
      this._px(ctx, cx, bodyY + 4, '#b8860b');

      const legY = bodyY + 8;
      const legPose = frameIdx === 5 ? 'sit' :
                      frameIdx === 2 ? 'walk1' :
                      frameIdx === 4 ? 'walk2' : 'stand';
      this._drawLegs(ctx, pal, cx, legY, legPose);

      ctx.restore();
    };

    for (let i = 0; i < frames; i++) drawBossFrame(i);

    const texture = scene.textures.addCanvas('boss', canvas);
    for (let i = 0; i < frames; i++) {
      texture.add(i, 0, i * fw * PX, 0, fw * PX, fh * PX);
    }
  },

  // ════════════════════════════════════════════
  // Cat mascot (replaces duck)
  // ════════════════════════════════════════════

  _generateCat(scene) {
    const fw = 14;
    const fh = 14;
    const frames = 4;
    const canvas = document.createElement('canvas');
    canvas.width = fw * frames * PX;
    canvas.height = fh * PX;
    const ctx = canvas.getContext('2d');

    const cat = '#8b949e';
    const catDark = '#6e7681';
    const catLight = '#adbac7';
    const nose = '#f47067';
    const eye = '#0d1117';
    const inner = '#d2a8ff';

    const drawCatFrame = (fi) => {
      ctx.save();
      ctx.translate(fi * fw * PX, 0);

      // Ears
      this._px(ctx, 3, 1, cat);
      this._px(ctx, 2, 2, cat);    this._px(ctx, 3, 2, cat);    this._px(ctx, 4, 2, cat);
      this._px(ctx, 3, 2, inner);
      this._px(ctx, 9, 1, cat);
      this._px(ctx, 8, 2, cat);    this._px(ctx, 9, 2, cat);    this._px(ctx, 10, 2, cat);
      this._px(ctx, 9, 2, inner);

      // Head
      this._rect(ctx, 3, 3, 8, 5, cat);
      this._rect(ctx, 2, 4, 10, 3, cat);

      // Face
      this._px(ctx, 4, 5, eye);   this._px(ctx, 9, 5, eye);  // eyes
      // Eye shine
      this._px(ctx, 4, 4, catLight); this._px(ctx, 9, 4, catLight);
      this._px(ctx, 6, 6, nose); this._px(ctx, 7, 6, nose);  // nose

      // Whiskers
      this._px(ctx, 2, 6, catDark); this._px(ctx, 1, 5, catDark);
      this._px(ctx, 11, 6, catDark); this._px(ctx, 12, 5, catDark);

      // Body
      this._rect(ctx, 4, 8, 6, 3, cat);
      this._rect(ctx, 3, 9, 8, 2, cat);
      // Belly
      this._rect(ctx, 5, 9, 4, 2, catLight);

      // Legs
      this._rect(ctx, 3, 11, 2, 2, cat);
      this._rect(ctx, 9, 11, 2, 2, cat);

      // Tail
      const tailWag = (fi % 2 === 0) ? 0 : 1;
      this._px(ctx, 11, 9 - tailWag, cat);
      this._px(ctx, 12, 8 - tailWag, cat);
      this._px(ctx, 12, 7 - tailWag, catDark);

      ctx.restore();
    };

    for (let i = 0; i < frames; i++) drawCatFrame(i);

    const texture = scene.textures.addCanvas('cat', canvas);
    for (let i = 0; i < frames; i++) {
      texture.add(i, 0, i * fw * PX, 0, fw * PX, fh * PX);
    }
  },

  // ════════════════════════════════════════════
  // Palette Generation
  // ════════════════════════════════════════════

  _palette(bodyColor) {
    return {
      // Body
      body: this._hex(bodyColor),
      bodyDark: this._hex(this._darken(bodyColor, 0.65)),
      bodyLight: this._hex(this._lighten(bodyColor, 0.3)),
      // Skin
      skin: '#f0c8a0',
      skinShadow: '#d4a878',
      blush: '#f0a0a0',
      // Face
      eye: '#1c2128',
      eyeHighlight: '#e6edf3',
      mouth: '#d4a878',
      // Hair (derived from body)
      hair: this._hex(this._darken(bodyColor, 0.4)),
      hairHighlight: this._hex(this._darken(bodyColor, 0.6)),
      // Clothes
      pants: '#2d333b',
      pantsShadow: '#21262d',
      shoes: '#161b22',
      shoeHighlight: '#30363d',
    };
  },

  // ════════════════════════════════════════════
  // Color Utilities
  // ════════════════════════════════════════════

  _hex(n) {
    if (typeof n === 'string') return n;
    return '#' + n.toString(16).padStart(6, '0');
  },

  _darken(c, f) {
    const r = ((c >> 16) & 0xff) * f;
    const g = ((c >> 8) & 0xff) * f;
    const b = (c & 0xff) * f;
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  },

  _lighten(c, f) {
    const r = Math.min(255, ((c >> 16) & 0xff) + 255 * f);
    const g = Math.min(255, ((c >> 8) & 0xff) + 255 * f);
    const b = Math.min(255, (c & 0xff) + 255 * f);
    return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
  },

  /**
   * Get texture key for agent index
   */
  getTextureKey(index) {
    const keys = [
      'char_green', 'char_blue', 'char_amber', 'char_purple', 'char_coral',
      'char_lime', 'char_orange', 'char_sky', 'char_lavender', 'char_salmon',
    ];
    return keys[index % keys.length];
  },

  // ════════════════════════════════════════════
  // PNG Asset Override System
  // ════════════════════════════════════════════

  /**
   * Try to load PNG spritesheets from assets/ directory.
   * Call this in Phaser's preload() to override programmatic sprites.
   * Falls back to programmatic generation if PNGs not found.
   */
  preloadPNGAssets(scene) {
    const charKeys = [
      'char_green', 'char_blue', 'char_amber', 'char_purple', 'char_coral',
      'char_lime', 'char_orange', 'char_sky', 'char_lavender', 'char_salmon',
    ];
    const charFW = 20 * PX;  // 60px per frame
    const charFH = 28 * PX;  // 84px per frame

    charKeys.forEach(key => {
      scene.load.spritesheet(key, `assets/${key}.png`, {
        frameWidth: charFW,
        frameHeight: charFH,
      });
    });

    scene.load.spritesheet('boss', 'assets/boss.png', {
      frameWidth: 24 * PX,
      frameHeight: 32 * PX,
    });

    scene.load.spritesheet('cat', 'assets/cat.png', {
      frameWidth: 14 * PX,
      frameHeight: 14 * PX,
    });

    // Optional full background
    scene.load.image('office_bg', 'assets/office_bg.png');
  },

  /**
   * Check which PNG assets loaded successfully, generate the rest.
   * Call this in create() instead of generateAll().
   */
  generateWithOverrides(scene) {
    const charConfigs = [
      { key: 'char_green',    body: 0x10a37f, hair: 'short',   acc: 'none' },
      { key: 'char_blue',     body: 0x1f6feb, hair: 'spiky',   acc: 'glasses' },
      { key: 'char_amber',    body: 0xd29922, hair: 'long',    acc: 'none' },
      { key: 'char_purple',   body: 0xa371f7, hair: 'curly',   acc: 'none' },
      { key: 'char_coral',    body: 0xf47067, hair: 'mohawk',  acc: 'headphones' },
      { key: 'char_lime',     body: 0x3fb950, hair: 'bun',     acc: 'none' },
      { key: 'char_orange',   body: 0xdb6d28, hair: 'cap',     acc: 'none' },
      { key: 'char_sky',      body: 0x79c0ff, hair: 'beanie',  acc: 'glasses' },
      { key: 'char_lavender', body: 0xd2a8ff, hair: 'long',    acc: 'none' },
      { key: 'char_salmon',   body: 0xff7b72, hair: 'short',   acc: 'headphones' },
    ];

    let pngCount = 0;
    charConfigs.forEach(cfg => {
      if (scene.textures.exists(cfg.key)) {
        pngCount++;
      } else {
        this._generateCharacter(scene, cfg.key, cfg.body, cfg.hair, cfg.acc);
      }
    });

    if (!scene.textures.exists('boss')) {
      this._generateBoss(scene);
    } else {
      pngCount++;
    }

    if (!scene.textures.exists('cat')) {
      this._generateCat(scene);
    } else {
      pngCount++;
    }

    if (pngCount > 0) {
      console.log(`[Sprites] Loaded ${pngCount} PNG asset(s), generated rest programmatically`);
    }
  },
};
