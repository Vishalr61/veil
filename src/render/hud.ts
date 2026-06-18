/* =========================================================================
   HUD — the top bar. Three clear zones: LEFT (level + score + combo), CENTER
   (reveal % + target bar + active power-up timers), RIGHT (lives, a tappable
   mute glyph, and — drawn separately — the pause button). Tuned to stay
   uncluttered on a phone. Pure consumer of G.
   ========================================================================= */

import { ctx } from './surface';
import { G } from '../game/state';
import { CW, HUD_H, safeTop } from '../core/dims';
import { COMBO_WINDOW } from '../core/constants';
import { clamp } from '../core/math';
import { glowText, fmtScore, roundRectPath, drawGlowOrb } from './primitives';
import { comboMult } from '../game/capture';
import { isMuted } from '../audio/audio';

export function drawHUD() {
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, HUD_H);
  bg.addColorStop(0, 'rgba(4,6,14,0.9)'); bg.addColorStop(1, 'rgba(7,10,22,0.4)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, HUD_H);
  ctx.globalAlpha = 0.5; ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 8;     // band-tinted glowing hairline
  ctx.strokeStyle = G.pal.edge2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HUD_H - 0.5); ctx.lineTo(CW, HUD_H - 0.5); ctx.stroke();
  ctx.restore();

  const cy = safeTop + (HUD_H - safeTop) / 2;   // vertical centre below the notch / safe inset
  const pad = 14;

  // LEFT — level (small, top), score (big), combo (when chaining)
  glowText((G.isDaily ? 'FLR ' : 'LVL ') + G.level, pad, cy - 13, 11, G.pal.edge2, { align: 'left', blur: 4, font: 'mono', spacing: 2 });
  glowText(fmtScore(G.dispScore), pad, cy + 8, 21, G.pal.trail, { align: 'left', blur: 8, font: 'mono', core: '#fff', spacing: 1 });
  if (G.combo > 1 && G.state === 'playing') {
    const mx = pad + 74, mult = comboMult();
    glowText('x' + mult.toFixed(1), mx, cy - 13, 12, G.pal.accent, { align: 'left', blur: 8, weight: 800 });
    ctx.save();
    roundRectPath(mx, cy - 4, 44, 4, 2); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.clip();
    ctx.fillStyle = G.pal.accent; ctx.shadowColor = G.pal.accent; ctx.shadowBlur = 6;
    ctx.fillRect(mx, cy - 4, 44 * clamp(G.comboT / COMBO_WINDOW, 0, 1), 4);
    ctx.restore();
  }

  // CENTER — reveal % over the target bar
  const barW = Math.min(200, CW * 0.42), barH = 7, bx = CW / 2 - barW / 2, by = cy + 5;
  const frac = clamp(G.dispPercent / G.target, 0, 1);
  glowText(Math.round(G.dispPercent * 100) + '%', CW / 2, cy - 11, 17, '#ffffff', { blur: 8, font: 'mono', core: '#fff', spacing: 1 });
  ctx.save();
  roundRectPath(bx, by, barW, barH, barH / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  roundRectPath(bx, by, barW, barH, barH / 2); ctx.clip();
  const g = ctx.createLinearGradient(bx, 0, bx + barW, 0);
  g.addColorStop(0, G.pal.edge); g.addColorStop(1, G.pal.edge2);
  ctx.fillStyle = g; ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 10; ctx.fillRect(bx, by, barW * frac, barH);
  ctx.restore();
  if (frac > 0.02 && frac < 0.999) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlowOrb(bx + barW * frac, by + barH / 2, 2.4, '#fff', G.pal.edge2, 9); ctx.restore(); }
  glowText('TARGET ' + Math.round(G.target * 100) + '%', CW / 2, by + barH + 7, 8.5, '#7f93c0', { blur: 0, spacing: 1.5, weight: 700 });
  // active power-up timers — one tidy centred line under the bar
  const fx = [];
  if (G.enemyFreezeT > 0) fx.push('FREEZE ' + Math.ceil(G.enemyFreezeT));
  if (G.enemySlowT > 0) fx.push('SLOW ' + Math.ceil(G.enemySlowT));
  if (G.surgeT > 0) fx.push('2x ' + Math.ceil(G.surgeT));
  if (fx.length) glowText(fx.join('   '), CW / 2, by + barH + 19, 9.5, '#bfe0ff', { blur: 6, weight: 800, font: 'mono', spacing: 1 });

  // RIGHT — lives, then a tappable mute glyph (the pause button is drawn by drawTouchUI)
  const muteOn = !isMuted(), mcol = muteOn ? G.pal.accent : '#6a7290';
  ctx.save();
  ctx.translate(CW - 83, cy);   // centre of muteBtnRect, so the tap target lines up
  ctx.strokeStyle = mcol; ctx.fillStyle = mcol; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-7, -2.5); ctx.lineTo(-3, -2.5); ctx.lineTo(1, -6); ctx.lineTo(1, 6); ctx.lineTo(-3, 2.5); ctx.lineTo(-7, 2.5); ctx.closePath(); ctx.fill();
  if (muteOn) { ctx.beginPath(); ctx.arc(2, 0, 5, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(2, 0, 8, -0.7, 0.7); ctx.globalAlpha = 0.6; ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(9, 5); ctx.moveTo(9, -5); ctx.lineTo(4, 5); ctx.stroke(); }
  ctx.restore();

  let rx = CW - 120;
  if (G.shield) { drawGlowOrb(rx, cy, 4.5, '#7dffc4', '#7dffc4', 13); rx -= 17; }
  for (let i = 0; i < Math.min(G.lives, 6); i++) drawGlowOrb(rx - i * 15, cy, 4, '#fff', G.pal.player, 11);

  // LEVEL TIME — a bar that depletes along the bottom of the HUD; reddens + pulses when low
  const tf = clamp(1 - G.levelT / G.levelTimeMax, 0, 1);
  const tcol = tf > 0.33 ? G.pal.edge : tf > 0.12 ? '#ffb15a' : '#ff5a4a';
  const tpulse = tf < 0.12 ? 0.5 + 0.5 * Math.sin(G.time * 10) : 1;
  ctx.save();
  ctx.globalAlpha = 0.2; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, HUD_H - 3, CW, 2);
  ctx.globalAlpha = 0.9 * tpulse; ctx.fillStyle = tcol; ctx.shadowColor = tcol; ctx.shadowBlur = 6;
  ctx.fillRect(0, HUD_H - 3, CW * tf, 2);
  ctx.restore();
}
