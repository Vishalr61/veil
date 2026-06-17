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
  ctx.fillStyle = 'rgba(6,9,20,0.55)'; ctx.fillRect(0, 0, CW, HUD_H);
  ctx.strokeStyle = 'rgba(120,170,255,0.12)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HUD_H - 0.5); ctx.lineTo(CW, HUD_H - 0.5); ctx.stroke();
  ctx.restore();
  const cy = safeTop + (HUD_H - safeTop) / 2;   // center below the notch / safe inset

  glowText('SCORE', MARGIN + 8, cy - 13, 11, '#6f86b8', { align: 'left', blur: 0, spacing: 1, font: 'mono' });
  glowText(fmtScore(G.dispScore), MARGIN + 8, cy + 6, 24, G.pal.trail, { align: 'left', blur: 8, font: 'mono', core: '#fff', spacing: 1 });

  // combo meter
  if (G.combo > 1 && G.state === 'playing') {
    const mx = MARGIN + 128, mw = 64;
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

  // percent bar
  const barW = 230, barH = 11, bx = CW / 2 - barW / 2, by = cy - barH / 2 + 4;
  ctx.save();
  roundRectPath(bx, by, barW, barH, 5); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.clip();
  const fillW = barW * clamp(G.dispPercent / G.target, 0, 1);
  const g = ctx.createLinearGradient(bx, 0, bx + barW, 0);
  g.addColorStop(0, G.pal.edge); g.addColorStop(1, G.pal.edge2);
  ctx.fillStyle = g; ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 10; ctx.fillRect(bx, by, fillW, barH);
  ctx.restore();
  glowText(Math.round(G.dispPercent * 100) + '%', CW / 2, by - 9, 11, G.pal.edge2, { blur: 6, weight: 800 });
  glowText('TARGET ' + Math.round(G.target * 100) + '%', CW / 2, by + barH + 9, 9, '#7f93c0', { blur: 0, spacing: 1.5, weight: 700 });

  // right cluster (kept left of the pause button at CW-56)
  let rx = CW - 66;
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
  glowText('LVL ' + G.level, rx, cy, 19, G.pal.edge2, { align: 'right', blur: 8, font: 'mono', spacing: 1 });
}
