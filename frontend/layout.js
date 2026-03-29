/**
 * Codex Office - Layout Configuration
 * Defines office zones, desk positions, waypoints, and UI constants.
 */

const CANVAS = { width: 1280, height: 720 };

// Color palette (OpenAI/Codex inspired)
const COLORS = {
  // Office
  floor: 0x1c2128,
  floorTile: 0x21262d,
  wallTop: 0x0d1117,
  wallBottom: 0x161b22,
  trim: 0x30363d,
  // Furniture
  desk: 0x6e4b35,
  deskTop: 0x8b6914,
  monitor: 0x0d1117,
  monitorScreen: 0x10a37f,
  monitorScreenOff: 0x21262d,
  chair: 0x373e47,
  chairSeat: 0x484f58,
  couch: 0x1a6b52,
  couchCushion: 0x10a37f,
  coffeeMachine: 0x484f58,
  coffeeAccent: 0x8b6914,
  plant: 0x3fb950,
  plantDark: 0x238636,
  plantPot: 0x8b6914,
  serverRack: 0x1c2128,
  serverLed: 0x10a37f,
  serverLedWarn: 0xd29922,
  serverLedError: 0xf85149,
  whiteboard: 0xe6edf3,
  whiteboardFrame: 0x6e7681,
  window: 0x0a1628,
  windowFrame: 0x30363d,
  // Characters
  skinTone: 0xf0c8a0,
  // Elevator
  elevatorShaft: 0x0a0c10,
  elevatorDoor: 0x484f58,
  elevatorDoorEdge: 0x30363d,
  elevatorInterior: 0x161b22,
  elevatorLight: 0x3fb950,
  elevatorLightOff: 0xf85149,
  // Brand
  codexGreen: 0x10a37f,
  codexDark: 0x0d1117,
  accent: 0x1f6feb,
  warning: 0xd29922,
  error: 0xf85149,
};

// Agent color assignments (body colors for different agents)
const AGENT_COLORS = [
  0x10a37f, // green
  0x1f6feb, // blue
  0xd29922, // amber
  0xa371f7, // purple
  0xf47067, // coral
  0x3fb950, // lime
  0xdb6d28, // orange
  0x79c0ff, // sky
  0xd2a8ff, // lavender
  0xff7b72, // salmon
];

// Office zones
const ZONES = {
  desk: {
    label: 'Workspace',
    slots: [
      { x: 180, y: 440 },
      { x: 340, y: 440 },
      { x: 500, y: 440 },
      { x: 660, y: 440 },
      { x: 180, y: 560 },
      { x: 340, y: 560 },
      { x: 500, y: 560 },
      { x: 660, y: 560 },
    ],
  },
  thinking: {
    label: 'Think Tank',
    bounds: { x: 200, y: 180, w: 400, h: 150 },
    waypoints: [
      { x: 220, y: 220 },
      { x: 380, y: 200 },
      { x: 520, y: 240 },
      { x: 380, y: 280 },
      { x: 260, y: 260 },
    ],
  },
  breakroom: {
    label: 'Break Room',
    bounds: { x: 860, y: 380, w: 300, h: 250 },
    waypoints: [
      { x: 900, y: 460 },
      { x: 1020, y: 420 },
      { x: 1100, y: 500 },
      { x: 960, y: 540 },
      { x: 1060, y: 580 },
    ],
  },
  error: {
    label: 'Server Room',
    position: { x: 1060, y: 180 },
  },
};

// Furniture positions
const FURNITURE = {
  desks: [
    // Row 1
    { x: 180, y: 420, hasMonitor: true },
    { x: 340, y: 420, hasMonitor: true },
    { x: 500, y: 420, hasMonitor: true },
    { x: 660, y: 420, hasMonitor: true },
    // Row 2
    { x: 180, y: 540, hasMonitor: true },
    { x: 340, y: 540, hasMonitor: true },
    { x: 500, y: 540, hasMonitor: true },
    { x: 660, y: 540, hasMonitor: true },
  ],
  couch: { x: 900, y: 520, w: 160, h: 60 },
  coffeeTable: { x: 980, y: 420, w: 60, h: 40 },
  coffeeMachine: { x: 1140, y: 390 },
  plants: [
    { x: 60, y: 400 },
    { x: 780, y: 380 },
    { x: 1180, y: 520 },
  ],
  serverRack: { x: 1000, y: 120, w: 180, h: 100 },
  whiteboard: { x: 460, y: 100, w: 200, h: 80 },
  window: { x: 100, y: 80, w: 240, h: 120 },
  clock: { x: 780, y: 100 },
  door: { x: 830, y: 600 },
  contextMeter: { x: 1080, y: 260, w: 30, h: 80 },
};

// Depth layers
const DEPTH = {
  floor: 0,
  walls: 1,
  furnitureBg: 2,
  furniture: 10,
  characters: 100,
  charactersFront: 150,
  bubbles: 200,
  ui: 300,
};

// Speech bubbles
const BUBBLES = {
  coding: [
    'Shipping code!',
    'Writing functions...',
    'Almost done!',
    'Building feature...',
    'Refactoring...',
    'const result = ...',
    'git commit -m "fix"',
    'npm run build',
  ],
  thinking: [
    'Hmm, let me think...',
    'Analyzing...',
    'Planning approach...',
    'Considering options...',
    'What if we try...',
    'Reading the docs...',
    'Interesting pattern...',
  ],
  searching: [
    'Searching files...',
    'grep -r "bug"',
    'Finding references...',
    'Looking it up...',
    'Scanning codebase...',
  ],
  idle: [
    'Coffee break!',
    'Taking a breather',
    'Stretching...',
    'Nice weather today',
    'Back soon!',
    'Recharging...',
    'Checking Slack...',
  ],
  error: [
    'Something broke!',
    'Stack overflow...',
    'Need help here!',
    'Error 500!',
    'Segfault?!',
  ],
  join: [
    'Ready to work!',
    'Reporting for duty!',
    'Let\'s go!',
    'Hello team!',
  ],
  leave: [
    'See ya!',
    'Signing off!',
    'Task complete!',
    'GG!',
  ],
  subagent: [
    'Exploring code...',
    'Found something!',
    'Subtask progress...',
    'Reporting back...',
    'On it!',
  ],
};

// Boss character (always present)
const BOSS = {
  name: 'Codex',
  color: 0x10a37f,
  startPos: { x: 450, y: 300 },
  waypoints: [
    { x: 300, y: 280 },
    { x: 500, y: 260 },
    { x: 650, y: 300 },
    { x: 400, y: 340 },
    { x: 250, y: 300 },
    { x: 550, y: 320 },
  ],
};
