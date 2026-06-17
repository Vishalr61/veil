/* =========================================================================
   Capture — the heart of the loop. When a trail closes back onto filled land,
   doCapture() flood-fills the enclosed empty cells, scores them (with an
   anti-nibble value curve + combo multiplier), and resolves veil-as-discovery:
   caches reward, rifts punish. It also queues the sweeping fog reveal.

   It deliberately does NOT decide level completion — the caller checks
   `G.percent >= G.target` after calling, keeping flow control in one place.
   ========================================================================= */

import { G } from './state';
import { ROWS, COLS, CELL, INTERIOR_TOTAL } from '../core/dims';
import { EMPTY, FILLED, COMBO_WINDOW } from '../core/constants';
import { cellIndex, centerPx } from '../core/grid';
import { eCell } from './enemies';
import { spawnPopup, veilBurst } from './particles';
import { VEIL_CACHE, VEIL_HAZARD } from '../sim/veil';
import { sfxBold, sfxCapture } from '../audio/audio';
import { hapticMedium, hapticHeavy } from '../platform/haptics';

export function comboMult() { return Math.min(1 + 0.3 * (G.combo - 1), 6); }

export function recomputeBorderPath() {
  const p = new Path2D();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (G.grid[y * COLS + x] !== FILLED) continue;
      const x0 = x * CELL, y0 = y * CELL, x1 = x0 + CELL, y1 = y0 + CELL;
      let n = cellIndex(x + 1, y); if (n !== -1 && G.grid[n] !== FILLED) { p.moveTo(x1, y0); p.lineTo(x1, y1); }
      n = cellIndex(x - 1, y); if (n !== -1 && G.grid[n] !== FILLED) { p.moveTo(x0, y0); p.lineTo(x0, y1); }
      n = cellIndex(x, y + 1); if (n !== -1 && G.grid[n] !== FILLED) { p.moveTo(x0, y1); p.lineTo(x1, y1); }
      n = cellIndex(x, y - 1); if (n !== -1 && G.grid[n] !== FILLED) { p.moveTo(x0, y0); p.lineTo(x1, y0); }
    }
  }
  G.borderPath = p;
}
export function recomputePercent() {
  let f = 0;
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 1; x < COLS - 1; x++)
      if (G.grid[y * COLS + x] === FILLED) f++;
  G.percent = f / INTERIOR_TOTAL;
}

export function doCapture() {
  for (const idx of G.trailCells) G.grid[idx] = FILLED;

  const reach = new Uint8Array(COLS * ROWS), stack = [];
  for (const e of G.enemies) {
    const i = eCell(e);
    if (G.grid[i] === EMPTY && !reach[i]) { reach[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop(), x = i % COLS, y = (i / COLS) | 0;
    const ns = [cellIndex(x + 1, y), cellIndex(x - 1, y), cellIndex(x, y + 1), cellIndex(x, y - 1)];
    for (const nn of ns) if (nn !== -1 && G.grid[nn] === EMPTY && !reach[nn]) { reach[nn] = 1; stack.push(nn); }
  }

  const captured = [];
  for (let i = 0; i < G.grid.length; i++)
    if (G.grid[i] === EMPTY && !reach[i]) { G.grid[i] = FILLED; captured.push(i); }
  for (const idx of G.trailCells) captured.push(idx);

  // sweeping reveal: queue cells by distance from the closing point
  const origin = G.player.px;
  for (const idx of captured) {
    const c = centerPx(idx);
    G.revealQueue.push({ idx, d: Math.hypot(c.x - origin.x, c.y - origin.y) });
  }
  G.revealQueue.sort((a, b) => a.d - b.d);

  const area = captured.length;
  if (area > 0) {
    if (G.comboT > 0) G.combo++; else G.combo = 1;
    G.comboT = COMBO_WINDOW;
    const mult = comboMult();
    // anti-nibble: value per cell rises with cut size
    const valuePerCell = 4 + Math.min(area, 220) * 0.12;
    const gained = Math.round(area * valuePerCell * mult);
    G.score += gained;
    spawnPopup(origin.x, origin.y - 6, '+' + gained, G.pal.edge2, area > 50 ? 20 : 15);
    if (G.combo >= 3) spawnPopup(origin.x, origin.y - 26, 'x' + mult.toFixed(1) + ' CHAIN', G.pal.accent, 14);
    if (area >= 60) {
      const bonus = Math.round(area * 6 * mult);
      G.score += bonus;
      spawnPopup(origin.x, origin.y + 14, 'BOLD CUT  +' + bonus, '#ffe27a', 18);
      sfxBold(); hapticHeavy();
      G.flash = G.reduceMotion ? 0.2 : 0.55;
      G.zoom = G.reduceMotion ? 1 : 1 + Math.min(0.05, area * 0.0006);
    } else {
      hapticMedium();
      G.flash = G.reduceMotion ? 0.08 : Math.min(0.35, 0.1 + area * 0.003);
      G.zoom = G.reduceMotion ? 1 : 1 + Math.min(0.025, area * 0.0004);
    }
    G.shakeAmt = G.reduceMotion ? 0 : Math.min(10, 2.5 + area * 0.04);
    sfxCapture(G.combo);
    G.hintActive = false;
    if (G.onboarding) {                    // first-ever capture: the "whoa" beat
      G.onboarding = false; G.onboarded = true;
      try { localStorage.setItem('veil_onboarded', '1'); } catch (e) {}
      G.banner = { text: 'THE COSMOS REVEALS', sub: 'enclose more to clear the level', t: 2.4 };
    }
  }

  // veil-as-discovery: capturing uncovers whatever the dark was hiding here
  for (const idx of captured) {
    const v = G.veilBoard[idx];
    if (!v) continue;
    G.veilBoard[idx] = 0;
    const c = centerPx(idx);
    if (v === VEIL_CACHE) {
      const bonus = 250 + G.level * 60;
      G.score += bonus;
      spawnPopup(c.x, c.y, '✦ +' + bonus, '#ffe27a', 15);
      veilBurst(c.x, c.y, '#ffe27a');
      hapticMedium();
    } else if (v === VEIL_HAZARD) {
      G.combo = 0; G.comboT = 0;                                   // a rift breaks your chain
      spawnPopup(c.x, c.y, '✶ RIFT', '#ff6a8a', 15);
      G.flash = G.reduceMotion ? 0.12 : 0.35; G.shakeAmt = G.reduceMotion ? 0 : Math.max(G.shakeAmt, 8);
      veilBurst(c.x, c.y, '#ff6a8a');
      hapticHeavy();
    }
  }

  G.trailCells = []; G.trailPoints = []; G.hasTrail = false;
  recomputeBorderPath();
  recomputePercent();
}

