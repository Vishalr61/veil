/* =========================================================================
   Power-ups — weighted spawn table, placement on open cells away from the
   player, pickup collision, and effects (score / freeze / slow / shield /
   life). Spawn timing uses the seeded run RNG so the daily stays fair.
   ========================================================================= */

import { G } from './state';
import { rand, TAU } from '../core/math';
import { CELL, COLS, ROWS } from '../core/dims';
import { EMPTY } from '../core/constants';
import { centerPx, cellOfPx } from '../core/grid';
import { spawnPopup } from './particles';
import { sfxPickup } from '../audio/audio';
import { hapticLight } from '../platform/haptics';

const PU_TYPES = [
  { type: 'score',  w: 34, col: '#ffe27a', label: 'score' },
  { type: 'freeze', w: 20, col: '#8fe6ff', label: 'freeze' },
  { type: 'slow',   w: 20, col: '#9fb8ff', label: 'slow' },
  { type: 'shield', w: 16, col: '#7dffc4', label: 'shield' },
  { type: 'life',   w: 8,  col: '#ff8fb0', label: 'life' },
];
function pickPU() {
  const total = PU_TYPES.reduce((s, p) => s + p.w, 0);
  let r = G.rng.next() * total;
  for (const p of PU_TYPES) { if ((r -= p.w) <= 0) return p; }
  return PU_TYPES[0];
}
export function maybeSpawnPickup(dt) {
  G.pickupSpawnT -= dt;
  if (G.pickupSpawnT > 0 || G.pickups.length >= 2) return;
  G.pickupSpawnT = G.rng.range(7, 12);
  const pcell = cellOfPx(G.player.px);
  let idx = -1;
  for (let t = 0; t < 50; t++) {
    const cx = 2 + G.rng.int(COLS - 4), cy = 2 + G.rng.int(ROWS - 4);
    const i = cy * COLS + cx;
    if (G.grid[i] !== EMPTY) continue;
    if (Math.abs(cx - pcell % COLS) + Math.abs(cy - (pcell / COLS | 0)) < 5) continue;
    idx = i; break;
  }
  if (idx === -1) return;
  const def = pickPU();
  const c = centerPx(idx);
  G.pickups.push({ x: c.x, y: c.y, cell: idx, type: def.type, col: def.col, life: 13, max: 13, bob: Math.random() * TAU });
}
export function updatePickups(dt) {
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.life -= dt; p.bob += dt * 3;
    // disappear if its cell got captured under it
    if (G.grid[p.cell] !== EMPTY || p.life <= 0) { G.pickups.splice(i, 1); continue; }
    if (Math.hypot(G.player.px.x - p.x, G.player.px.y - p.y) < CELL * 0.95) {
      applyPickup(p); G.pickups.splice(i, 1);
    }
  }
}
function applyPickup(p) {
  sfxPickup(); hapticLight();
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * TAU, sp = rand(40, 150);
    G.particles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.9), max: 0.9, r: rand(1.2, 3), col: p.col });
  }
  if (p.type === 'score') { const g = 400 + G.level * 150; G.score += g; spawnPopup(p.x, p.y, '+' + g, p.col, 18); }
  else if (p.type === 'freeze') { G.enemyFreezeT = 3.6; spawnPopup(p.x, p.y, 'FREEZE', p.col, 16); }
  else if (p.type === 'slow') { G.enemySlowT = 5.5; spawnPopup(p.x, p.y, 'SLOW', p.col, 16); }
  else if (p.type === 'shield') { G.shield = true; spawnPopup(p.x, p.y, 'SHIELD', p.col, 16); }
  else if (p.type === 'life') { G.lives++; spawnPopup(p.x, p.y, '+1 LIFE', p.col, 16); }
}
