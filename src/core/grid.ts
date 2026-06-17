/* =========================================================================
   Grid <-> pixel conversions. Pure helpers over the current layout dims;
   shared by capture, player, enemies, and render. The grid is a flat
   COLS*ROWS array indexed `y * COLS + x`.
   ========================================================================= */

import { COLS, ROWS, CELL } from './dims';
import { clamp } from './math';

// Flat index for a grid cell, or -1 if out of bounds.
export function cellIndex(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
  return y * COLS + x;
}

// Pixel center of a cell (in play-field space, before the world transform).
export function centerPx(idx: number): { x: number; y: number } {
  const x = idx % COLS, y = (idx / COLS) | 0;
  return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
}

// Cell index containing a pixel point, clamped to the interior bounds.
export function cellOfPx(px: { x: number; y: number }): number {
  const cx = clamp(Math.floor(px.x / CELL), 0, COLS - 1);
  const cy = clamp(Math.floor(px.y / CELL), 0, ROWS - 1);
  return cy * COLS + cx;
}
