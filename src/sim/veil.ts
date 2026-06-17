/* =========================================================================
   Veil-as-discovery — the differentiator.

   The dark veil hides board state. Capturing territory is the only way to
   uncover it. This module deterministically places hidden content; the
   reveal/resolution (score, particles, penalties) happens where capture does.

   Risk/reward: a big blind cut uncovers more — both caches AND rifts.
   Generation is seeded so a daily challenge hides the same things for everyone.
   ========================================================================= */

import { SeededRng } from '../core/rng';

export const VEIL_NONE = 0;
export const VEIL_CACHE = 1;   // reward when revealed (score / later: currency, power-ups)
export const VEIL_HAZARD = 2;  // a "rift" — risk when revealed blindly

export interface VeilGenParams {
  cols: number;
  rows: number;
  level: number;
  isOpen: (idx: number) => boolean; // a placeable interior cell (open, not border/filled)
  caches?: number;                  // override count (default veilCacheCount)
  rifts?: number;                   // override count (default veilHazardCount)
}

// Caches show from level 1 (pure reward intro); rifts only appear from level 3.
export function veilCacheCount(level: number): number {
  return Math.min(2 + Math.floor(level / 2), 6);
}
export function veilHazardCount(level: number): number {
  return level < 3 ? 0 : Math.min(1 + Math.floor((level - 3) / 2), 5);
}

export function genVeilBoard(rng: SeededRng, p: VeilGenParams): Uint8Array {
  const board = new Uint8Array(p.cols * p.rows);
  const open: number[] = [];
  for (let i = 0; i < board.length; i++) if (p.isOpen(i)) open.push(i);
  if (open.length === 0) return board;

  // exposure = distance from the nearest wall/rock. Deep cells need a big, risky
  // cut to enclose, so weighting caches toward them makes boldness out-score nibbling.
  const dist = exposureField(p.cols, p.rows, p.isOpen);
  placeWeighted(board, open, rng, VEIL_CACHE, p.caches ?? veilCacheCount(p.level), (i) => {
    const d = dist[i];
    return d > 0 ? d * d : 0.01;
  });
  // rifts spread roughly evenly across what's left
  placeWeighted(board, open, rng, VEIL_HAZARD, p.rifts ?? veilHazardCount(p.level), () => 1);
  return board;
}

// Multi-source BFS: distance from each open cell to the nearest non-open cell.
// Exported so the vault guardian can be placed on the deepest (most exposed) cell.
export function exposureField(cols: number, rows: number, isOpen: (i: number) => boolean): Int32Array {
  const n = cols * rows;
  const dist = new Int32Array(n).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < n; i++) if (!isOpen(i)) { dist[i] = 0; q.push(i); }
  let head = 0;
  while (head < q.length) {
    const i = q[head++], x = i % cols, y = (i / cols) | 0;
    const ns = [x + 1 < cols ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < rows ? i + cols : -1, y - 1 >= 0 ? i - cols : -1];
    for (const nb of ns) if (nb >= 0 && dist[nb] < 0) { dist[nb] = dist[i] + 1; q.push(nb); }
  }
  return dist;
}

// Weighted draw without replacement from `open` (distinct cells -> no overlap).
function placeWeighted(board: Uint8Array, open: number[], rng: SeededRng, content: number, count: number, weightOf: (i: number) => number): void {
  for (let k = 0; k < count && open.length > 0; k++) {
    let total = 0;
    for (const i of open) total += weightOf(i);
    let r = rng.next() * total, pick = open.length - 1;
    for (let j = 0; j < open.length; j++) { r -= weightOf(open[j]); if (r <= 0) { pick = j; break; } }
    board[open[pick]] = content;
    open.splice(pick, 1);
  }
}
