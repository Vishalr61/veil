/* =========================================================================
   Full-screen overlays drawn over the world: the title menu, level-clear and
   game-over cards, the pause screen, and the menu's attract-mode backdrop.
   Pure consumers of G + the daily helpers; buttons come from render/geometry.
   ========================================================================= */

import { ctx } from './surface';
import { G } from '../game/state';
import { CW, CH, OFF_X, OFF_Y, PW, PH } from '../core/dims';
import { TAU, clamp } from '../core/math';
import { glowText, retroTitle, retroButton, fmtScore } from './primitives';
import { playBtnRect, dailyBtnRect } from './geometry';
import { todayKey, isConsecutive } from '../daily/daily';
import { genNebula } from './background';
import { BANDS } from '../core/bands';

function dim(a) { ctx.save(); ctx.fillStyle = `rgba(3,5,12,${a})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
export function drawMenu() {
  dim(0.6);
  const cx = CW / 2, cyc = CH / 2, bob = Math.sin(G.menuT * 1.4) * 3;
  glowText('HI ' + fmtScore(G.highScore), cx, CH * 0.15, 22, '#ffe93b', { blur: 8, font: 'mono', spacing: 1 });
  retroTitle('VEIL', cx, cyc - 92 + bob, 50, { blur: 22, glow: '#00f0ff', spacing: 2 });
  glowText('DRAW LIGHT INTO THE DARK', cx, cyc - 52 + bob, 21, '#00f0ff', { blur: 8, font: 'mono', spacing: 2 });
  const blink = 0.45 + 0.55 * Math.sin(G.menuT * 4);
  glowText('PRESS START', cx, cyc - 8, 11, '#ffffff', { blur: 10, font: 'pixel', alpha: blink });

  retroButton(playBtnRect(), 'PLAY', '#39ff14');
  const tk = todayKey(new Date()), done = G.dailyPlayedKey === tk;
  retroButton(dailyBtnRect(), done ? 'DAILY ✓' : 'DAILY', '#ff2d95');

  glowText('DRAG TO STEER', cx, cyc + 158, 18, '#9fd8ff', { blur: 4, font: 'mono', spacing: 1 });
  const liveStreak = (G.dailyStreakDate === tk || isConsecutive(G.dailyStreakDate, tk)) ? G.dailyStreak : 0;
  if (liveStreak > 1) glowText('STREAK ' + liveStreak, cx, cyc + 184, 18, '#ffb15a', { blur: 4, font: 'mono', spacing: 1 });
}
export function drawLevelClear() {
  dim(0.45);
  const cx = CW / 2, cyc = CH / 2, t = clamp((2.9 - G.lcTimer) * 2.2, 0, 1), pop = 1 + (1 - t) * 0.3;
  glowText('VEIL CLEARED', cx, cyc - 36, 44 * pop, G.pal.edge2, { blur: 26, font: 'mono', spacing: 2, core: '#fff', alpha: t });
  glowText('LEVEL ' + G.level + '  ·  ' + Math.round(G.percent * 100) + '% revealed', cx, cyc + 8, 16, '#cfe6ff', { blur: 8, weight: 600, spacing: 1, alpha: t });
  glowText('+ ' + G.lastBonus + '  bonus', cx, cyc + 40, 18, G.pal.accent, { blur: 12, weight: 800, alpha: t });
  glowText('next: level ' + (G.level + 1), cx, cyc + 78, 12, '#7f97c8', { blur: 0, spacing: 2, alpha: t * (0.6 + 0.4 * Math.sin(G.menuT * 4)) });
}
export function drawGameOver() {
  dim(0.6);
  const cx = CW / 2, cyc = CH / 2, t = clamp(G.goTimer * 1.6, 0, 1);
  glowText('THE DARK WINS', cx, cyc - 40, 46, '#ff6b7e', { blur: 26, font: 'mono', spacing: 2, core: '#fff', alpha: t });
  glowText('SCORE  ' + fmtScore(G.score), cx, cyc + 6, 22, '#dff1ff', { blur: 12, weight: 700, spacing: 2, alpha: t });
  const isBest = G.score >= G.highScore && G.score > 0;
  glowText((isBest ? 'NEW BEST!  ' : 'BEST  ') + fmtScore(G.highScore), cx, cyc + 38, 14, isBest ? '#ffe27a' : G.pal.edge, { blur: 8, weight: 700, spacing: 1, alpha: t });
  const blink = 0.5 + 0.5 * Math.sin(G.menuT * 3);
  if (G.isDaily) {
    glowText('DAILY  ' + G.dailyRunKey + (G.dailyStreak > 1 ? '   🔥 ' + G.dailyStreak : ''), cx, cyc + 60, 12, '#9fd0ff', { blur: 6, spacing: 2, weight: 700, alpha: t });
    glowText('TAP TO SHARE RESULT', cx, cyc + 96, 15, '#cfe6ff', { blur: 10, weight: 700, spacing: 2, alpha: t * blink });
  } else {
    glowText('reached level ' + G.level, cx, cyc + 60, 12, '#7f97c8', { blur: 0, spacing: 1, alpha: t });
    glowText('PRESS ANY KEY TO RETRY', cx, cyc + 96, 15, '#cfe6ff', { blur: 10, weight: 700, spacing: 2, alpha: t * blink });
  }
}
export function drawPaused() {
  dim(0.55);
  const cx = CW / 2, cyc = CH / 2;
  glowText('PAUSED', cx, cyc - 10, 30, '#cfe6ff', { blur: 18, font: 'pixel', spacing: 2, core: '#fff' });
  const blink = 0.5 + 0.5 * Math.sin(G.menuT * 3);
  glowText('P / ESC resume      M mute      R reduce motion', cx, cyc + 36, 13, '#9fb6e8', { blur: 8, weight: 700, spacing: 1, alpha: blink });
}

export function drawAttractWorld() {
  if (!G.menuNebula) G.menuNebula = genNebula(BANDS[0], 1, PW, PH);
  ctx.save();
  ctx.translate(OFF_X, OFF_Y);
  ctx.globalAlpha = 0.5; ctx.drawImage(G.menuNebula.canvas, 0, 0, PW, PH); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const m of G.motes) { ctx.globalAlpha = m.a * 0.8; ctx.fillStyle = '#cfe6ff'; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); }
  ctx.restore();
}
