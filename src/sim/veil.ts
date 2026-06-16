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
  placeN(board, open, rng, VEIL_CACHE, veilCacheCount(p.level));
  placeN(board, open, rng, VEIL_HAZARD, veilHazardCount(p.level));
  return board;
}

// Place n items on distinct open cells (drawn without replacement -> no overlap).
function placeN(board: Uint8Array, open: number[], rng: SeededRng, content: number, n: number): void {
  for (let k = 0; k < n && open.length > 0; k++) {
    const j = rng.int(open.length);
    board[open[j]] = content;
    open.splice(j, 1);
  }
}
