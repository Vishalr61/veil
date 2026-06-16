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

export interface TerrainParams {
  cols: number;
  rows: number;
  level: number;
  startIdx: number; // player spawn cell (kept clear)
}

// Fraction of the interior turned to rock. Levels 1 are open; it ramps after.
export function obstacleBudget(level: number): number {
  if (level < 2) return 0;
  return Math.min(0.04 + 0.02 * (level - 2), 0.16);
}

/** Returns a Uint8Array(cols*rows): 1 = obstacle, 0 = open. */
export function genObstacles(rng: SeededRng, p: TerrainParams): Uint8Array {
  const { cols, rows, level, startIdx } = p;
  const n = cols * rows;
  const obst = new Uint8Array(n);
  const target = Math.floor((cols - 2) * (rows - 2) * obstacleBudget(level));
  if (target <= 0) return obst;

  const sx = startIdx % cols, sy = (startIdx / cols) | 0;
  const inInterior = (x: number, y: number) => x > 0 && y > 0 && x < cols - 1 && y < rows - 1;
  const farFromSpawn = (x: number, y: number) => Math.abs(x - sx) + Math.abs(y - sy) >= 4;

  // grow a handful of organic rock blobs via short random walks
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

  fillIsolatedPockets(obst, cols, rows, startIdx);
  return obst;
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

/** Count open (non-obstacle) interior cells — the reveal-target denominator. */
export function openInteriorCount(obst: Uint8Array, cols: number, rows: number): number {
  let c = 0;
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++)
      if (!obst[y * cols + x]) c++;
  return c;
}
