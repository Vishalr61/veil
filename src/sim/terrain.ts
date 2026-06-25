/* =========================================================================
   Terrain — seeded solid obstacles inside the field.

   Obstacles ('rock') block the player and enemies, forcing routing and
   enclosure planning instead of uniform edge-nibbling. Two guarantees:
     - the spawn area stays clear
     - every remaining OPEN interior cell is reachable from spawn (any pocket
       that an obstacle would isolate is simply filled in as rock, so the
       reveal target is always achievable)
   Deterministic from a seed, so a daily hides the same terrain for everyone.
   ========================================================================= */

import { SeededRng } from '../core/rng';
import { OBSTACLE } from '../core/constants';

// Layout motif: how rock is shaped. 'blobs' is the original procedural look;
// 'open' places none; 'pillars'/'veins' are authored shapes for early bands.
export type ObstacleMotif = 'open' | 'pillars' | 'veins' | 'blobs' | 'grove';

export interface TerrainParams {
  cols: number;
  rows: number;
  level: number;
  startIdx: number;        // player spawn cell (kept clear)
  motif?: ObstacleMotif;   // default 'blobs' (procedural)
  density?: number;        // default obstacleBudget(level)
}

// Fraction of the interior turned to rock. Levels 1 are open; it ramps after.
export function obstacleBudget(level: number): number {
  if (level < 2) return 0;
  return Math.min(0.04 + 0.02 * (level - 2), 0.16);
}

/** Returns a Uint8Array(cols*rows): 1 = obstacle, 0 = open. */
export function genObstacles(rng: SeededRng, p: TerrainParams): Uint8Array {
  const { cols, rows, level, startIdx } = p;
  const motif = p.motif ?? 'blobs';
  const density = p.density ?? obstacleBudget(level);
  const obst = new Uint8Array(cols * rows);
  const target = Math.floor((cols - 2) * (rows - 2) * density);
  if (motif === 'open' || target <= 0) return obst;

  const sx = startIdx % cols, sy = (startIdx / cols) | 0;
  if (motif === 'pillars') placePillars(rng, obst, cols, rows, target, sx, sy);
  else if (motif === 'veins') placeVeins(rng, obst, cols, rows, target, sx, sy);
  else if (motif === 'grove') placeGrove(rng, obst, cols, rows, target, sx, sy);
  else placeBlobs(rng, obst, cols, rows, target, sx, sy);

  // Same guarantees for every motif: connected, no dead-ends, spawn kept clear.
  fillIsolatedPockets(obst, cols, rows, startIdx);
  erodeDeadEnds(obst, cols, rows);          // no cul-de-sacs the player could get boxed into
  fillIsolatedPockets(obst, cols, rows, startIdx);
  return obst;
}

const inInteriorOf = (cols: number, rows: number) =>
  (x: number, y: number) => x > 0 && y > 0 && x < cols - 1 && y < rows - 1;
const farFromSpawnOf = (sx: number, sy: number) =>
  (x: number, y: number) => Math.abs(x - sx) + Math.abs(y - sy) >= 4;

// Organic rock blobs via short random walks — the original procedural look.
function placeBlobs(rng: SeededRng, obst: Uint8Array, cols: number, rows: number, target: number, sx: number, sy: number): void {
  const inInterior = inInteriorOf(cols, rows), farFromSpawn = farFromSpawnOf(sx, sy);
  let count = 0, guard = 0;
  while (count < target && guard++ < 600) {
    let cx = 1 + rng.int(cols - 2), cy = 1 + rng.int(rows - 2);
    const blob = 3 + rng.int(9);
    for (let k = 0; k < blob && count < target; k++) {
      const i = cy * cols + cx;
      if (inInterior(cx, cy) && farFromSpawn(cx, cy) && !obst[i]) { obst[i] = 1; count++; }
      const d = rng.int(4);
      cx = Math.max(1, Math.min(cols - 2, cx + (d === 0 ? 1 : d === 1 ? -1 : 0)));
      cy = Math.max(1, Math.min(rows - 2, cy + (d === 2 ? 1 : d === 3 ? -1 : 0)));
    }
  }
}

// Scattered compact columns — discrete obstacles that teach routing.
function placePillars(rng: SeededRng, obst: Uint8Array, cols: number, rows: number, target: number, sx: number, sy: number): void {
  const inInterior = inInteriorOf(cols, rows), farFromSpawn = farFromSpawnOf(sx, sy);
  const stamp = [[0, 0], [1, 0], [0, 1], [1, 1]];   // a 2x2 column
  let count = 0, guard = 0;
  while (count < target && guard++ < 600) {
    const cx = 1 + rng.int(cols - 2), cy = 1 + rng.int(rows - 2);
    if (!farFromSpawn(cx, cy)) continue;
    for (const [dx, dy] of stamp) {
      const x = cx + dx, y = cy + dy, i = y * cols + x;
      if (count < target && inInterior(x, y) && farFromSpawn(x, y) && !obst[i]) { obst[i] = 1; count++; }
    }
  }
}

// Linear lava-crack walls that carve the board into chambers (and a deep vault).
function placeVeins(rng: SeededRng, obst: Uint8Array, cols: number, rows: number, target: number, sx: number, sy: number): void {
  const inInterior = inInteriorOf(cols, rows), farFromSpawn = farFromSpawnOf(sx, sy);
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];   // horizontal, vertical, two diagonals
  let count = 0, guard = 0;
  while (count < target && guard++ < 400) {
    let cx = 1 + rng.int(cols - 2), cy = 1 + rng.int(rows - 2);
    const [dx, dy] = dirs[rng.int(dirs.length)];
    const len = 4 + rng.int(8);
    for (let k = 0; k < len && count < target; k++) {
      if (inInterior(cx, cy) && farFromSpawn(cx, cy) && !obst[cy * cols + cx]) { obst[cy * cols + cx] = 1; count++; }
      cx += dx; cy += dy;
      if (cx <= 0 || cx >= cols - 1 || cy <= 0 || cy >= rows - 1) break;
    }
  }
}

// A few large ORGANIC clumps (rounded thickets) — discrete, soft-edged masses
// that read as garden groves, distinct from blobs' wandering walks and pillars'
// hard 2x2 stamps. Each clump is a jittered disc.
function placeGrove(rng: SeededRng, obst: Uint8Array, cols: number, rows: number, target: number, sx: number, sy: number): void {
  const inInterior = inInteriorOf(cols, rows), farFromSpawn = farFromSpawnOf(sx, sy);
  let count = 0, guard = 0;
  while (count < target && guard++ < 200) {
    const ccx = 2 + rng.int(cols - 4), ccy = 2 + rng.int(rows - 4);
    if (!farFromSpawn(ccx, ccy)) continue;
    const rad = 2 + rng.int(3);                       // clump radius 2..4
    for (let dy = -rad; dy <= rad && count < target; dy++) {
      for (let dx = -rad; dx <= rad && count < target; dx++) {
        const d = Math.hypot(dx, dy) + rng.range(-0.6, 0.6);   // jittered edge
        if (d > rad) continue;
        const x = ccx + dx, y = ccy + dy, i = y * cols + x;
        if (inInterior(x, y) && farFromSpawn(x, y) && !obst[i]) { obst[i] = 1; count++; }
      }
    }
  }
}

function openNeighbors(obst: Uint8Array, cols: number, rows: number, i: number): number {
  const x = i % cols, y = (i / cols) | 0;
  let c = 0;
  if (x + 1 < cols && !obst[i + 1]) c++;
  if (x - 1 >= 0 && !obst[i - 1]) c++;
  if (y + 1 < rows && !obst[i + cols]) c++;
  if (y - 1 >= 0 && !obst[i - cols]) c++;
  return c;
}

// Fill any open interior cell with < 2 open neighbors (a dead-end), repeatedly,
// so every remaining open cell is on a through-route. The border counts as open,
// so the spawn fringe is never eroded.
function erodeDeadEnds(obst: Uint8Array, cols: number, rows: number): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        if (obst[i]) continue;
        if (openNeighbors(obst, cols, rows, i) < 2) { obst[i] = 1; changed = true; }
      }
    }
  }
}

// Flood the open space from spawn; any open interior cell we can't reach is in a
// walled-off pocket, so make it rock too. Guarantees a fully connected playfield.
function fillIsolatedPockets(obst: Uint8Array, cols: number, rows: number, startIdx: number): void {
  const n = cols * rows;
  const seen = new Uint8Array(n);
  const stack = [startIdx];
  seen[startIdx] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % cols, y = (i / cols) | 0;
    const ns = [
      x + 1 < cols ? i + 1 : -1,
      x - 1 >= 0 ? i - 1 : -1,
      y + 1 < rows ? i + cols : -1,
      y - 1 >= 0 ? i - cols : -1,
    ];
    for (const nb of ns) {
      if (nb < 0 || seen[nb] || obst[nb]) continue;
      seen[nb] = 1;
      stack.push(nb);
    }
  }
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      if (!obst[i] && !seen[i]) obst[i] = 1;
    }
  }
}

/* ----------------------------- obstacle KINDS ----------------------------- */
// Visual-only object kinds for Bloom obstacles. Each contiguous obstacle CLUSTER
// gets ONE kind (shape-influenced), so a board reads as distinct garden objects —
// boulders, logs, bushes, flowerbeds, mushroom mounds — not uniform rock.
export const OBK_BOULDER = 0, OBK_LOG = 1, OBK_BUSH = 2, OBK_FLOWERBED = 3, OBK_MUSHROOM = 4;

// Flood-fill the OBSTACLE cells of a (cols x rows) grid into connected clusters and
// label every cell with its cluster's kind. Deterministic (a position hash picks the
// kind), so re-running on the same layout is stable. Pure: no rendering, no globals.
//
// `unlocked` = how many of the 5 kinds have been introduced so far (in OBK order:
// BOULDER, LOG, BUSH, FLOWERBED, MUSHROOM). A cluster whose natural (shape-picked) kind
// isn't unlocked yet is REMAPPED across the kinds that ARE unlocked (by position hash) —
// so the newest kind reliably SHOWS UP at its unlock floor regardless of cluster shape,
// rather than only appearing when the terrain happens to make the matching shape. The
// kinds therefore arrive ONE AT A TIME as floors climb. Default 5 = every kind.
export function assignObstacleKinds(grid: Uint8Array, cols: number, rows: number, unlocked = 5): Uint8Array {
  const n = cols * rows, kind = new Uint8Array(n), seen = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (grid[start] !== OBSTACLE || seen[start]) continue;
    const cells: number[] = [start]; seen[start] = 1;
    let head = 0, minX = cols, minY = rows, maxX = 0, maxY = 0;
    while (head < cells.length) {
      const c = cells[head++], x = c % cols, y = (c / cols) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x + 1 < cols && grid[c + 1] === OBSTACLE && !seen[c + 1]) { seen[c + 1] = 1; cells.push(c + 1); }
      if (x - 1 >= 0 && grid[c - 1] === OBSTACLE && !seen[c - 1]) { seen[c - 1] = 1; cells.push(c - 1); }
      if (y + 1 < rows && grid[c + cols] === OBSTACLE && !seen[c + cols]) { seen[c + cols] = 1; cells.push(c + cols); }
      if (y - 1 >= 0 && grid[c - cols] === OBSTACLE && !seen[c - cols]) { seen[c - cols] = 1; cells.push(c - cols); }
    }
    const w = maxX - minX + 1, hgt = maxY - minY + 1, sz = cells.length;
    const aspect = Math.max(w, hgt) / Math.max(1, Math.min(w, hgt));
    const hsh = ((minX * 73856093) ^ (minY * 19349663)) >>> 0;
    let k: number;
    if (sz <= 2) k = (hsh % 2) ? OBK_BUSH : OBK_FLOWERBED;                 // tiny clump
    else if (aspect >= 2.4) k = OBK_LOG;                                   // long & thin
    else if (sz >= 10) k = (hsh % 3 === 0) ? OBK_MUSHROOM : OBK_BOULDER;   // big & compact
    else k = [OBK_BOULDER, OBK_BUSH, OBK_FLOWERBED, OBK_MUSHROOM][hsh % 4]; // medium: mixed
    if (k >= unlocked) k = hsh % unlocked;   // not introduced yet → spread across the unlocked kinds
    for (const c of cells) kind[c] = k;
  }
  return kind;
}

/** Count open (non-obstacle) interior cells — the reveal-target denominator. */
export function openInteriorCount(obst: Uint8Array, cols: number, rows: number): number {
  let c = 0;
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++)
      if (!obst[y * cols + x]) c++;
  return c;
}
