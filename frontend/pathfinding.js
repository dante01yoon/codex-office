/**
 * Codex Office - A* Pathfinding
 * Tile-based pathfinding with obstacle avoidance for character movement.
 * Grid: 32x32 pixel tiles = 40 columns x 23 rows (1280x720 canvas).
 */

const Pathfinder = (() => {
  const TILE = 32;
  const COLS = Math.ceil(CANVAS.width / TILE);   // 40
  const ROWS = Math.ceil(CANVAS.height / TILE);   // 23

  // Cost constants for movement
  const STRAIGHT_COST = 10;
  const DIAGONAL_COST = 14; // ~10 * sqrt(2)

  // 8-directional neighbor offsets: [dx, dy, cost]
  const NEIGHBORS = [
    [-1,  0, STRAIGHT_COST],
    [ 1,  0, STRAIGHT_COST],
    [ 0, -1, STRAIGHT_COST],
    [ 0,  1, STRAIGHT_COST],
    [-1, -1, DIAGONAL_COST],
    [ 1, -1, DIAGONAL_COST],
    [-1,  1, DIAGONAL_COST],
    [ 1,  1, DIAGONAL_COST],
  ];

  // Obstacle grid: true = blocked
  let grid = null;

  // ========================================
  // Grid Construction
  // ========================================

  /**
   * Mark a rectangular area on the grid as blocked.
   * Adds a small padding (1 tile) around each obstacle so agents don't clip.
   */
  function markRect(x, y, w, h, padding) {
    const pad = padding !== undefined ? padding : 1;
    const c0 = Math.max(0, Math.floor((x - pad * TILE) / TILE));
    const r0 = Math.max(0, Math.floor((y - pad * TILE) / TILE));
    const c1 = Math.min(COLS - 1, Math.ceil((x + w + pad * TILE) / TILE));
    const r1 = Math.min(ROWS - 1, Math.ceil((y + h + pad * TILE) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        grid[r][c] = true;
      }
    }
  }

  /**
   * Build the obstacle grid from FURNITURE data in layout.js.
   */
  function buildGrid() {
    // Initialize empty grid
    grid = [];
    for (let r = 0; r < ROWS; r++) {
      grid[r] = new Array(COLS).fill(false);
    }

    // Desks (~80x40 each, centered on their x/y)
    if (FURNITURE.desks) {
      FURNITURE.desks.forEach((d) => {
        markRect(d.x - 40, d.y - 20, 80, 40, 0);
      });
    }

    // Couch
    if (FURNITURE.couch) {
      const c = FURNITURE.couch;
      markRect(c.x, c.y, c.w, c.h, 0);
    }

    // Coffee table
    if (FURNITURE.coffeeTable) {
      const t = FURNITURE.coffeeTable;
      markRect(t.x, t.y, t.w, t.h, 0);
    }

    // Coffee machine (~30x50)
    if (FURNITURE.coffeeMachine) {
      const cm = FURNITURE.coffeeMachine;
      markRect(cm.x - 15, cm.y - 25, 30, 50, 0);
    }

    // Server rack
    if (FURNITURE.serverRack) {
      const sr = FURNITURE.serverRack;
      markRect(sr.x, sr.y, sr.w, sr.h, 0);
    }

    // Plants (~20x20 each)
    if (FURNITURE.plants) {
      FURNITURE.plants.forEach((p) => {
        markRect(p.x - 10, p.y - 10, 20, 20, 0);
      });
    }

    // Whiteboard (wall-mounted, block the area beneath it for safety)
    if (FURNITURE.whiteboard) {
      const wb = FURNITURE.whiteboard;
      markRect(wb.x, wb.y, wb.w, wb.h, 0);
    }
  }

  // ========================================
  // Binary Min-Heap for open set
  // ========================================

  class MinHeap {
    constructor() {
      this.data = [];
    }

    push(node) {
      this.data.push(node);
      this._bubbleUp(this.data.length - 1);
    }

    pop() {
      const top = this.data[0];
      const last = this.data.pop();
      if (this.data.length > 0) {
        this.data[0] = last;
        this._sinkDown(0);
      }
      return top;
    }

    get size() {
      return this.data.length;
    }

    _bubbleUp(i) {
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (this.data[i].f < this.data[parent].f) {
          [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
          i = parent;
        } else {
          break;
        }
      }
    }

    _sinkDown(i) {
      const len = this.data.length;
      while (true) {
        let smallest = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < len && this.data[left].f < this.data[smallest].f) smallest = left;
        if (right < len && this.data[right].f < this.data[smallest].f) smallest = right;
        if (smallest !== i) {
          [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
          i = smallest;
        } else {
          break;
        }
      }
    }
  }

  // ========================================
  // A* Algorithm
  // ========================================

  function heuristic(c0, r0, c1, r1) {
    // Octile distance heuristic for 8-directional movement
    const dx = Math.abs(c1 - c0);
    const dy = Math.abs(r1 - r0);
    return STRAIGHT_COST * (dx + dy) + (DIAGONAL_COST - 2 * STRAIGHT_COST) * Math.min(dx, dy);
  }

  /**
   * Core A* search on the tile grid.
   * Returns array of {col, row} tile coords from start to end, or null if no path.
   */
  function astar(startCol, startRow, endCol, endRow) {
    // Clamp to grid bounds
    startCol = Math.max(0, Math.min(COLS - 1, startCol));
    startRow = Math.max(0, Math.min(ROWS - 1, startRow));
    endCol = Math.max(0, Math.min(COLS - 1, endCol));
    endRow = Math.max(0, Math.min(ROWS - 1, endRow));

    // If start or end is blocked, find nearest unblocked tile
    if (grid[startRow][startCol]) {
      const alt = findNearestOpen(startCol, startRow);
      if (!alt) return null;
      startCol = alt.col;
      startRow = alt.row;
    }
    if (grid[endRow][endCol]) {
      const alt = findNearestOpen(endCol, endRow);
      if (!alt) return null;
      endCol = alt.col;
      endRow = alt.row;
    }

    // Same tile
    if (startCol === endCol && startRow === endRow) {
      return [{ col: startCol, row: startRow }];
    }

    const openSet = new MinHeap();
    // gScore and parent tracking using flat index
    const gScore = new Float32Array(ROWS * COLS).fill(Infinity);
    const cameFrom = new Int32Array(ROWS * COLS).fill(-1);
    const closed = new Uint8Array(ROWS * COLS);

    const startIdx = startRow * COLS + startCol;
    const endIdx = endRow * COLS + endCol;

    gScore[startIdx] = 0;
    openSet.push({
      col: startCol,
      row: startRow,
      f: heuristic(startCol, startRow, endCol, endRow),
    });

    while (openSet.size > 0) {
      const current = openSet.pop();
      const idx = current.row * COLS + current.col;

      if (idx === endIdx) {
        // Reconstruct path
        return reconstructPath(cameFrom, endIdx);
      }

      if (closed[idx]) continue;
      closed[idx] = 1;

      for (const [dc, dr, moveCost] of NEIGHBORS) {
        const nc = current.col + dc;
        const nr = current.row + dr;

        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (grid[nr][nc]) continue;

        const nIdx = nr * COLS + nc;
        if (closed[nIdx]) continue;

        // For diagonal moves, ensure both adjacent cardinal tiles are open
        // to prevent cutting corners
        if (dc !== 0 && dr !== 0) {
          if (grid[current.row][current.col + dc] || grid[current.row + dr][current.col]) {
            continue;
          }
        }

        const tentativeG = gScore[idx] + moveCost;
        if (tentativeG < gScore[nIdx]) {
          gScore[nIdx] = tentativeG;
          cameFrom[nIdx] = idx;
          openSet.push({
            col: nc,
            row: nr,
            f: tentativeG + heuristic(nc, nr, endCol, endRow),
          });
        }
      }
    }

    // No path found
    return null;
  }

  function reconstructPath(cameFrom, endIdx) {
    const path = [];
    let idx = endIdx;
    while (idx !== -1) {
      const row = Math.floor(idx / COLS);
      const col = idx % COLS;
      path.push({ col, row });
      idx = cameFrom[idx];
    }
    path.reverse();
    return path;
  }

  /**
   * Find the nearest unblocked tile via BFS from a blocked tile.
   */
  function findNearestOpen(col, row) {
    const visited = new Set();
    const queue = [{ col, row }];
    visited.add(row * COLS + col);

    while (queue.length > 0) {
      const cur = queue.shift();
      if (!grid[cur.row][cur.col]) {
        return cur;
      }
      for (const [dc, dr] of NEIGHBORS) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const key = nr * COLS + nc;
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ col: nc, row: nr });
      }
    }
    return null;
  }

  // ========================================
  // Path Smoothing
  // ========================================

  /**
   * Line-of-sight check between two tiles using Bresenham's line.
   * Returns true if every tile on the line is walkable.
   */
  function lineOfSight(c0, r0, c1, r1) {
    let dc = Math.abs(c1 - c0);
    let dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc - dr;
    let c = c0;
    let r = r0;

    while (true) {
      if (grid[r][c]) return false;
      if (c === c1 && r === r1) break;
      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c += sc; }
      if (e2 <  dc) { err += dc; r += sr; }
    }
    return true;
  }

  /**
   * Greedy path smoothing: skip waypoints when there is line-of-sight
   * between non-adjacent points.
   */
  function smoothPath(tilePath) {
    if (tilePath.length <= 2) return tilePath;

    const smoothed = [tilePath[0]];
    let anchor = 0;

    while (anchor < tilePath.length - 1) {
      let farthest = anchor + 1;
      for (let i = tilePath.length - 1; i > anchor + 1; i--) {
        if (lineOfSight(
          tilePath[anchor].col, tilePath[anchor].row,
          tilePath[i].col, tilePath[i].row
        )) {
          farthest = i;
          break;
        }
      }
      smoothed.push(tilePath[farthest]);
      anchor = farthest;
    }

    return smoothed;
  }

  // ========================================
  // Public API
  // ========================================

  /**
   * Find a path between two pixel coordinates.
   * @param {number} startX - Start X in pixels
   * @param {number} startY - Start Y in pixels
   * @param {number} endX   - End X in pixels
   * @param {number} endY   - End Y in pixels
   * @returns {Array<{x:number, y:number}>|null} Array of pixel waypoints or null
   */
  function findPath(startX, startY, endX, endY) {
    // Lazy-init the grid on first call
    if (!grid) buildGrid();

    // Convert pixel coords to tile coords
    const startCol = Math.floor(startX / TILE);
    const startRow = Math.floor(startY / TILE);
    const endCol = Math.floor(endX / TILE);
    const endRow = Math.floor(endY / TILE);

    const tilePath = astar(startCol, startRow, endCol, endRow);
    if (!tilePath) return null;

    // Smooth the path to remove unnecessary zigzags
    const smoothed = smoothPath(tilePath);

    // Convert tile coords back to pixel centers
    const waypoints = smoothed.map((t) => ({
      x: t.col * TILE + TILE / 2,
      y: t.row * TILE + TILE / 2,
    }));

    // Replace the last waypoint with the exact destination
    // so agents land precisely where intended
    if (waypoints.length > 0) {
      waypoints[waypoints.length - 1].x = endX;
      waypoints[waypoints.length - 1].y = endY;
    }

    // Drop the first waypoint if it is essentially where we already are
    if (waypoints.length > 1) {
      const d = Math.hypot(waypoints[0].x - startX, waypoints[0].y - startY);
      if (d < TILE) {
        waypoints.shift();
      }
    }

    return waypoints;
  }

  /**
   * Force a rebuild of the obstacle grid (e.g., if furniture changes).
   */
  function rebuildGrid() {
    buildGrid();
  }

  /**
   * Check if a pixel position is walkable.
   */
  function isWalkable(px, py) {
    if (!grid) buildGrid();
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    return !grid[row][col];
  }

  return {
    findPath,
    rebuildGrid,
    isWalkable,
    TILE,
    COLS,
    ROWS,
  };
})();
