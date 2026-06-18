/* =========================================================================
   HUD — the top bar: score, combo meter, power-up timers, the reveal/target
   progress bar, mute glyph, shield/lives pips, and level. Pure consumer of G.
   ========================================================================= */

import { ctx } from './surface';
import { G } from '../game/state';
import { CW, HUD_H, MARGIN, safeTop } from '../core/dims';
import { COMBO_WINDOW } from '../core/constants';
import { clamp } from '../core/math';
import { glowText, fmtScore, roundRectPath, drawGlowOrb } from './primitives';
import { comboMult } from '../game/capture';
import { isMuted } from '../audio/audio';

export function drawHUD() {
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, HUD_H);
  bg.addColorStop(0, 'rgba(4,6,14,0.88)'); bg.addColorStop(1, 'rgba(7,10,22,0.45)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, HUD_H);
  ctx.globalAlpha = 0.5; ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 8;     // band-tinted glowing hairline
  ctx.strokeStyle = G.pal.edge2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HUD_H - 0.5); ctx.lineTo(CW, HUD_H - 0.5); ctx.stroke();
  ctx.restore();
  const cy = safeTop + (HUD_H - safeTop) / 2;   // center below the notch / safe inset
  // Group the readouts into a centered band so a wide window isn't sparse. On a
  // phone the band IS the full width, so left/right anchors match the old layout.
  const band = Math.min(CW - 24, 780);
  const lx = Math.max((CW - band) / 2, MARGIN + 10);
  const rxAnchor = Math.min((CW + band) / 2, CW - 66);

  glowText('SCORE', lx, cy - 13, 10, '#6f86b8', { align: 'left', blur: 0, spacing: 2, font: 'mono' });
  glowText(fmtScore(G.dispScore), lx, cy + 6, 24, G.pal.trail, { align: 'left', blur: 8, font: 'mono', core: '#fff', spacing: 1 });

  // combo meter
  if (G.combo > 1 && G.state === 'playing') {
    const mx = lx + 118, mw = 64;
    const mult = comboMult();
    glowText('x' + mult.toFixed(1), mx, cy - 9, 14, G.pal.accent, { align: 'left', blur: 10, weight: 800 });
    ctx.save();
    roundRectPath(mx, cy + 2, mw, 5, 2.5); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.clip();
    ctx.fillStyle = G.pal.accent; ctx.shadowColor = G.pal.accent; ctx.shadowBlur = 8;
    ctx.fillRect(mx, cy + 2, mw * clamp(G.comboT / COMBO_WINDOW, 0, 1), 5);
    ctx.restore();
  }

  // power-up status (center-left, under hint of bar)
  if (G.enemyFreezeT > 0) glowText('FREEZE ' + G.enemyFreezeT.toFixed(1), CW / 2 - 150, cy, 11, '#8fe6ff', { align: 'right', blur: 6, weight: 800, spacing: 1 });
  if (G.enemySlowT > 0) glowText('SLOW ' + G.enemySlowT.toFixed(1), CW / 2 + 150, cy, 11, '#9fb8ff', { align: 'left', blur: 6, weight: 800, spacing: 1 });
  if (G.surgeT > 0) glowText('2x ' + G.surgeT.toFixed(1), CW / 2 + 150, cy - 16, 11, '#ffce5c', { align: 'left', blur: 6, weight: 800, spacing: 1 });

  // CENTER — progress toward the reveal target: big % over a rounded glowing bar
  const barW = Math.min(240, CW * 0.4), barH = 7, bx = CW / 2 - barW / 2, by = cy + 5;
  const frac = clamp(G.dispPercent / G.target, 0, 1);
  ctx.save();
  roundRectPath(bx, by, barW, barH, barH / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  roundRectPath(bx, by, barW, barH, barH / 2); ctx.clip();
  const g = ctx.createLinearGradient(bx, 0, bx + barW, 0);
  g.addColorStop(0, G.pal.edge); g.addColorStop(1, G.pal.edge2);
  ctx.fillStyle = g; ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 10; ctx.fillRect(bx, by, barW * frac, barH);
  ctx.restore();
  if (frac > 0.02 && frac < 0.999) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlowOrb(bx + barW * frac, by + barH / 2, 2.4, '#fff', G.pal.edge2, 9); ctx.restore(); }
  glowText(Math.round(G.dispPercent * 100) + '%', CW / 2, cy - 10, 17, '#ffffff', { blur: 8, font: 'mono', core: '#fff', spacing: 1 });
  glowText('TARGET ' + Math.round(G.target * 100) + '%', CW / 2, by + barH + 8, 8.5, '#7f93c0', { blur: 0, spacing: 1.5, weight: 700 });

  // right cluster (band-anchored, kept left of the pause button at CW-56)
  let rx = rxAnchor;
  ctx.save();
  ctx.translate(rx - 7, cy);
  ctx.strokeStyle = isMuted() ? '#6a7290' : G.pal.accent; ctx.fillStyle = isMuted() ? '#6a7290' : G.pal.accent; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-7, -2.5); ctx.lineTo(-3, -2.5); ctx.lineTo(1, -6); ctx.lineTo(1, 6); ctx.lineTo(-3, 2.5); ctx.lineTo(-7, 2.5); ctx.closePath(); ctx.fill();
  if (isMuted()) { ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(9, 5); ctx.moveTo(9, -5); ctx.lineTo(4, 5); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(2, 0, 5, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(2, 0, 8, -0.7, 0.7); ctx.globalAlpha = 0.6; ctx.stroke(); }
  ctx.restore();
  rx -= 26;

  if (G.shield) { drawGlowOrb(rx - 5, cy, 4.5, '#7dffc4', '#7dffc4', 13); rx -= 18; }

  for (let i = 0; i < Math.min(G.lives, 6); i++) drawGlowOrb(rx - i * 16, cy, 4, '#fff', G.pal.player, 11);
  rx -= Math.min(G.lives, 6) * 16 + 8;
  glowText((G.isDaily ? 'FLR ' : 'LVL ') + G.level, rx, cy, 19, G.pal.edge2, { align: 'right', blur: 8, font: 'mono', spacing: 1 });
}
