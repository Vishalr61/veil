/* =========================================================================
   Layout dimensions — derived from the device viewport at startup so the
   play field fills the screen in portrait instead of letterboxing.

   These are exported as LIVE BINDINGS. They're reassigned only inside this
   module (computeLayout / setInteriorTotal), so every importer always reads
   the current value. Importers must NOT assign to them directly — route the
   one capture-time recompute through setInteriorTotal().
   ========================================================================= */

import { clamp } from './math';
import { SS } from './constants';
import { canvas, ctx } from '../render/surface';

// Seeded with sane defaults; overwritten by computeLayout before first render.
export let COLS = 24, ROWS = 44, CELL = 16;
export let PW = COLS * CELL, PH = ROWS * CELL;
export let MARGIN = 0, HUD_H = 64;
export let CW = PW, CH = HUD_H + PH;
export let OFF_X = 0, OFF_Y = HUD_H;
export let INTERIOR_TOTAL = (COLS - 2) * (ROWS - 2);
export let safeTop = 0, safeBottom = 0;

// Read iOS/Android safe-area insets (notch / home indicator). Needs the page
// meta to use viewport-fit=cover, which index.html sets.
function readSafeInsets() {
  // Read the --sat/--sab custom properties (defined in index.html with env()).
  // Reading resolved CSS vars off :root is more reliable than a probe element.
  try {
    const cs = getComputedStyle(document.documentElement);
    safeTop = parseFloat(cs.getPropertyValue('--sat')) || 0;
    safeBottom = parseFloat(cs.getPropertyValue('--sab')) || 0;
  } catch (e) { safeTop = 0; safeBottom = 0; }
}

// Derive grid dimensions + offsets so the play field fills the viewport.
export function computeLayout() {
  readSafeInsets();
  const vw = Math.max(320, window.innerWidth | 0);
  const vh = Math.max(480, window.innerHeight | 0);
  CW = vw; CH = vh; MARGIN = 0;
  HUD_H = Math.round(Math.min(70, vh * 0.06) + safeTop + 10);
  const top = HUD_H, bottom = vh - Math.max(safeBottom, 6), availH = bottom - top;
  const cell = clamp(Math.round(vw / 23), 12, 34);   // ~23 columns on a phone
  COLS = Math.max(14, Math.floor(vw / cell));
  ROWS = Math.max(16, Math.floor(availH / cell));
  CELL = cell;
  PW = COLS * CELL; PH = ROWS * CELL;
  OFF_X = Math.floor((vw - PW) / 2);
  OFF_Y = top + Math.floor((availH - PH) / 2);
  INTERIOR_TOTAL = (COLS - 2) * (ROWS - 2);
}

export function applyCanvasSize() {
  canvas.width = Math.round(CW * SS);
  canvas.height = Math.round(CH * SS);
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
}

// Capture recomputes the target denominator to exclude rock. Importers can't
// reassign a live binding, so they call this setter instead.
export function setInteriorTotal(n: number) { INTERIOR_TOTAL = n; }
