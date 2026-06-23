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

// A small filled heart — reads as "lives" instantly, crisp with only a tight glow
// (no wide additive bloom that bleeds over the rest of the HUD).
function drawHeart(x: number, y: number, s: number, col: string) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s / 4.2, s / 4.2);
  // a rounder, fuller heart with a soft glow
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(0, 3.7);
  ctx.bezierCurveTo(-4.7, -0.1, -3.2, -4.7, 0, -1.9);
  ctx.bezierCurveTo(3.2, -4.7, 4.7, -0.1, 0, 3.7);
  ctx.closePath(); ctx.fill();
  // a glossy top-left highlight
  ctx.shadowBlur = 0; ctx.globalAlpha = 0.45; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(-1.4, -1.7, 1.0, 0.7, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export function drawHUD() {
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, HUD_H);
  bg.addColorStop(0, 'rgba(4,6,14,0.9)'); bg.addColorStop(1, 'rgba(7,10,22,0.4)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, HUD_H);
  ctx.globalAlpha = 0.5; ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 8;     // band-tinted glowing hairline
  ctx.strokeStyle = G.pal.edge2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HUD_H - 0.5); ctx.lineTo(CW, HUD_H - 0.5); ctx.stroke();
  ctx.restore();

  const u = Math.max(1, HUD_H / 64);   // scale unit so the HUD grows on bigger viewports
  const cy = safeTop + (HUD_H - safeTop) / 2;
  const pad = 16 * u;
  const L = { font: 'mono' as const, weight: 700, spacing: 2, blur: 0 };
  // shared time state (drives the TIME stat + the base bar). Easy turns the
  // clock OFF (levelTimeMax = Infinity): show a calm ∞ and skip the depleting bar.
  const noClock = !isFinite(G.levelTimeMax);
  const tf = noClock ? 1 : clamp(1 - G.levelT / G.levelTimeMax, 0, 1);
  const rem = Math.max(0, Math.ceil(G.levelTimeMax - G.levelT)), low = !noClock && tf < 0.2;
  const tcol = (noClock || tf > 0.4) ? G.pal.edge2 : tf > 0.2 ? '#ffce5c' : '#ff5a4a';
  const tpulse = low ? 0.6 + 0.4 * Math.sin(G.time * 9) : 1;
  const mmss = noClock ? '∞' : (rem >= 60 ? Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0') : '0:' + String(rem).padStart(2, '0'));

  // LEFT — SCORE (labelled by level) + combo
  glowText((G.isDaily ? 'FLOOR ' : 'LEVEL ') + G.level, pad, cy - 13 * u, 9 * u, G.pal.edge2, { align: 'left', ...L });
  glowText(Math.round(G.dispScore).toLocaleString('en-US'), pad, cy + 10 * u, 23 * u, '#ffffff', { align: 'left', blur: 4, font: 'mono', core: '#fff', spacing: 1 });
  if (G.combo > 1 && G.state === 'playing') {
    const mx = pad, mult = comboMult();
    glowText('x' + mult.toFixed(1) + ' CHAIN', mx, cy + 26 * u, 9.5 * u, G.pal.accent, { align: 'left', blur: 6, weight: 800, font: 'mono', spacing: 1, alpha: 0.6 + 0.4 * clamp(G.comboT / COMBO_WINDOW, 0, 1) });
  }

  // CENTER — REVEAL % over the target bar (TIME + LIVES live on the right)
  const barW = Math.min(150 * u, CW * 0.26), barH = 6 * u, bx = CW / 2 - barW / 2, by = cy + 6 * u;
  const frac = clamp(G.dispPercent / G.target, 0, 1);
  glowText(Math.round(G.dispPercent * 100) + '%', CW / 2, cy - 9 * u, 22 * u, '#ffffff', { blur: 4, font: 'mono', core: '#fff', spacing: 1 });
  ctx.save();
  roundRectPath(bx, by, barW, barH, barH / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  roundRectPath(bx, by, barW, barH, barH / 2); ctx.clip();
  const g = ctx.createLinearGradient(bx, 0, bx + barW, 0);
  g.addColorStop(0, G.pal.edge); g.addColorStop(1, G.pal.edge2);
  ctx.fillStyle = g; ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 10; ctx.fillRect(bx, by, barW * frac, barH);
  ctx.restore();
  if (frac > 0.02 && frac < 0.999) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlowOrb(bx + barW * frac, by + barH / 2, 2.4 * u, '#fff', G.pal.edge2, 9); ctx.restore(); }
  // TARGET / active-power-up line — one slot, high enough to clear the base bar
  const fx = [];
  if (G.enemyFreezeT > 0) fx.push('FREEZE ' + Math.ceil(G.enemyFreezeT));
  if (G.enemySlowT > 0) fx.push('SLOW ' + Math.ceil(G.enemySlowT));
  if (G.surgeT > 0) fx.push('2x ' + Math.ceil(G.surgeT));
  const labelY = cy + 16 * u;
  if (fx.length) glowText(fx.join('   '), CW / 2, labelY, 9 * u, '#bfe0ff', { blur: 6, weight: 800, font: 'mono', spacing: 1 });
  else glowText('TARGET ' + Math.round(G.target * 100) + '%', CW / 2, labelY, 8.5 * u, '#7f93c0', { blur: 0, spacing: 1.5, weight: 700 });

  // RIGHT — a tappable mute glyph, with TIME (m:ss) above LIVES (hearts) to its
  // left. The m:ss + hearts are self-evident, so no labels needed here.
  const muteOn = !isMuted(), mcol = muteOn ? G.pal.accent : '#6a7290';
  ctx.save();
  ctx.translate(CW - 83, cy);
  ctx.strokeStyle = mcol; ctx.fillStyle = mcol; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-7, -2.5); ctx.lineTo(-3, -2.5); ctx.lineTo(1, -6); ctx.lineTo(1, 6); ctx.lineTo(-3, 2.5); ctx.lineTo(-7, 2.5); ctx.closePath(); ctx.fill();
  if (muteOn) { ctx.beginPath(); ctx.arc(2, 0, 5, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(2, 0, 8, -0.7, 0.7); ctx.globalAlpha = 0.6; ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(9, 5); ctx.moveTo(9, -5); ctx.lineTo(4, 5); ctx.stroke(); }
  ctx.restore();

  const rgt = CW - 106;   // right edge of the TIME/LIVES stack (left of the mute glyph)
  glowText(mmss, rgt, cy - 9 * u, 19 * u, tcol, { align: 'right', font: 'mono', blur: low ? 12 : 6, weight: 800, spacing: 1, alpha: tpulse });
  let rx = rgt;
  if (G.shield) { drawGlowOrb(rx - 4 * u, cy + 11 * u, 5 * u, '#7dffc4', '#7dffc4', 13 * u); rx -= 16 * u; }
  const shown = Math.min(G.lives, 6), lifeCol = '#ff5e76';
  for (let i = 0; i < shown; i++) drawHeart(rx - 3 * u - i * 16 * u, cy + 11 * u, 7.5 * u, lifeCol);
  if (G.lives > 6) glowText('+' + (G.lives - 6), rx - shown * 15 * u, cy + 11 * u, 11 * u, lifeCol, { align: 'right', font: 'mono', weight: 800, blur: 4 });

  // base depleting time bar (hidden on Easy, where there's no clock to deplete)
  if (!noClock) {
    ctx.save();
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, HUD_H - 6, CW, 5);
    ctx.globalAlpha = tpulse; ctx.fillStyle = tcol; ctx.shadowColor = tcol; ctx.shadowBlur = 10;
    ctx.fillRect(0, HUD_H - 6, CW * tf, 5);
    ctx.restore();
  }
}
