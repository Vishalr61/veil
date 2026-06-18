/* =========================================================================
   Full-screen overlays drawn over the world: the title menu, level-clear and
   game-over cards, the pause screen, and the menu's attract-mode backdrop.
   Pure consumers of G + the daily helpers; buttons come from render/geometry.
   ========================================================================= */

import { ctx } from './surface';
import { G } from '../game/state';
import { CW, CH, OFF_X, OFF_Y, PW, PH } from '../core/dims';
import { TAU, clamp } from '../core/math';
import { glowText, luminousTitle, luminousButton, fmtScore } from './primitives';
import { playBtnRect, dailyBtnRect, scoresBtnRect, pauseHomeRect, pauseMuteRect, pauseMotionRect, goBtnRects } from './geometry';
import { isMuted } from '../audio/audio';
import { todayKey, isConsecutive } from '../daily/daily';
import { genNebula } from './background';
import { BANDS } from '../core/bands';
import { getScores, justSetEntry } from '../game/leaderboard';
import { DAILY_FLOORS } from '../game/blueprints';

function dim(a) { ctx.save(); ctx.fillStyle = `rgba(3,5,12,${a})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
export function drawMenu() {
  dim(0.5);
  const cx = CW / 2, bob = Math.sin(G.menuT * 1.2) * 2;

  // top stat
  glowText('HI ' + fmtScore(G.highScore), cx, CH * 0.12, 17, '#9fe8ff', { blur: 8, font: 'mono', spacing: 2 });

  // hero wordmark with a breathing bloom, set in the upper third
  const titleY = CH * 0.32 + bob;
  const pulse = 30 + 8 * Math.sin(G.menuT * 1.6);
  luminousTitle('VEIL', cx, titleY, 68, { blur: pulse, glow: '#6fd8ff', spacing: 18 });

  // a thin luminous rule under the mark
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const lw = 66, ly = titleY + 48;
  const lg = ctx.createLinearGradient(cx - lw, 0, cx + lw, 0);
  lg.addColorStop(0, 'rgba(111,216,255,0)'); lg.addColorStop(0.5, 'rgba(160,232,255,0.85)'); lg.addColorStop(1, 'rgba(111,216,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(cx - lw, ly, lw * 2, 2); ctx.restore();
  glowText('draw light into the dark', cx, ly + 22, 14, '#bfeaff', { blur: 6, weight: 500, spacing: 3 });

  // primary CTA + secondary row
  luminousButton(playBtnRect(), 'PLAY', '#5cf0b0', { primary: true });
  const tk = todayKey(new Date()), done = G.dailyPlayedKey === tk;
  luminousButton(dailyBtnRect(), done ? 'DAILY ✓' : 'DAILY', '#ff7ad0');
  luminousButton(scoresBtnRect(), 'SCORES', '#7fc8ff');

  const liveStreak = (G.dailyStreakDate === tk || isConsecutive(G.dailyStreakDate, tk)) ? G.dailyStreak : 0;
  if (liveStreak > 1) glowText('streak ' + liveStreak, cx, CH * 0.88, 14, '#ffd29a', { blur: 4, font: 'mono', spacing: 1 });
}
export function drawScores() {
  dim(0.74);
  const cx = CW / 2;
  glowText('HIGH SCORES', cx, CH * 0.15, 26, '#ffe93b', { blur: 10, font: 'mono', spacing: 2, core: '#fff' });
  const list = getScores(), hot = justSetEntry();
  if (!list.length) {
    glowText('NO RUNS YET', cx, CH / 2 - 10, 16, '#9fb6e8', { blur: 6, font: 'mono', spacing: 2 });
    glowText('play a round to set a score', cx, CH / 2 + 18, 12, '#6f86b8', { blur: 0, font: 'mono', spacing: 1 });
  } else {
    const top = CH * 0.27, rowH = Math.min(38, (CH * 0.46) / list.length), lx = cx - 132, rx = cx + 132;
    list.forEach((e, i) => {
      const y = top + i * rowH, isHot = e === hot;
      const rankCol = isHot ? '#fff' : i === 0 ? '#ffe27a' : '#7f97c8';
      glowText(String(i + 1).padStart(2, '0'), lx, y, 16, rankCol, { align: 'left', font: 'mono', blur: isHot ? 10 : 0, spacing: 1 });
      glowText(fmtScore(e.score), lx + 34, y, 18, isHot ? '#fff' : i === 0 ? '#ffe27a' : '#cfe6ff', { align: 'left', font: 'mono', blur: isHot ? 12 : 6, core: isHot ? '#fff' : undefined, spacing: 1 });
      glowText('L' + e.level + (e.daily ? '  D' : ''), rx, y, 13, isHot ? '#9fd0ff' : '#8fa8d8', { align: 'right', font: 'mono', spacing: 1 });
    });
  }
  const blink = 0.5 + 0.5 * Math.sin(G.menuT * 3);
  glowText('TAP TO RETURN', cx, CH * 0.87, 14, '#cfe6ff', { blur: 10, weight: 700, spacing: 2, alpha: blink });
}
export function drawLevelClear() {
  dim(0.45);
  const cx = CW / 2, cyc = CH / 2, t = clamp((2.9 - G.lcTimer) * 2.2, 0, 1), pop = 1 + (1 - t) * 0.3;
  const lastFloor = G.isDaily && G.level >= DAILY_FLOORS;
  glowText(G.isDaily ? 'FLOOR CLEARED' : 'VEIL CLEARED', cx, cyc - 36, 44 * pop, G.pal.edge2, { blur: 26, font: 'mono', spacing: 2, core: '#fff', alpha: t });
  glowText((G.isDaily ? 'FLOOR ' : 'LEVEL ') + G.level + '  ·  ' + Math.round(G.percent * 100) + '% revealed', cx, cyc + 8, 16, '#cfe6ff', { blur: 8, weight: 600, spacing: 1, alpha: t });
  glowText('+ ' + G.lastBonus + '  bonus', cx, cyc + 40, 18, G.pal.accent, { blur: 12, weight: 800, alpha: t });
  const next = lastFloor ? 'clearing the rift...' : 'next: ' + (G.isDaily ? 'floor ' : 'level ') + (G.level + 1);
  glowText(next, cx, cyc + 78, 12, '#7f97c8', { blur: 0, spacing: 2, alpha: t * (0.6 + 0.4 * Math.sin(G.menuT * 4)) });
}
export function drawGameOver() {
  dim(0.66);
  const cx = CW / 2, cyc = CH / 2, t = clamp(G.goTimer * 1.6, 0, 1);
  glowText(G.dailyWon ? 'DAILY COMPLETE' : 'THE DARK WINS', cx, cyc - 98, G.dailyWon ? 34 : 38, G.dailyWon ? '#5cf0b0' : '#ff6b7e', { blur: 26, font: 'mono', spacing: 2, core: '#fff', alpha: t });
  glowText('SCORE', cx, cyc - 56, 11, '#7f97c8', { font: 'mono', spacing: 3, alpha: t });
  glowText(fmtScore(G.score), cx, cyc - 26, 30, '#dff1ff', { blur: 14, font: 'mono', weight: 700, spacing: 1, core: '#fff', alpha: t });

  // the score-chase beat: NEW BEST, or how far you fell short of your best
  const isBest = G.score >= G.highScore && G.score > 0;
  if (isBest) {
    const over = G.score - G.prevHighScore;
    glowText('NEW BEST!' + (over > 0 && G.prevHighScore > 0 ? '  +' + over : ''), cx, cyc + 10, 18, '#ffe27a', { blur: 12, font: 'mono', weight: 800, spacing: 2, alpha: t * (0.7 + 0.3 * Math.sin(G.menuT * 6)) });
  } else {
    const gap = Math.max(0, G.highScore - G.score);
    glowText('BEST ' + fmtScore(G.highScore) + (gap > 0 ? '   ' + gap + ' TO BEAT' : ''), cx, cyc + 10, 13, G.pal ? G.pal.edge : '#9ad', { blur: 8, font: 'mono', weight: 700, spacing: 1, alpha: t });
  }

  // local rank + how far you got (+ daily tag)
  let sub = G.dailyWon ? 'all ' + G.level + ' rift floors cleared' : G.isDaily ? 'reached floor ' + G.level : 'reached level ' + G.level;
  if (G.lastRank > 0) sub = '#' + G.lastRank + ' on this device    ' + sub;
  glowText(sub, cx, cyc + 40, 12, '#8fa8d8', { font: 'mono', spacing: 1, alpha: t });
  if (G.isDaily) glowText('DAILY ' + G.dailyRunKey + (G.dailyStreak > 1 ? '    ' + G.dailyStreak + ' STREAK' : ''), cx, cyc + 62, 11, '#9fd0ff', { font: 'mono', spacing: 1, weight: 700, alpha: t });

  const b = goBtnRects();
  luminousButton(b.primary, G.isDaily ? 'SHARE' : 'RETRY', G.isDaily ? '#ff7ad0' : '#5cf0b0', { primary: true });
  luminousButton(b.home, 'HOME', '#7fc8ff');
}
export function drawPaused() {
  dim(0.55);
  const cx = CW / 2, cyc = CH / 2;
  glowText('PAUSED', cx, cyc - 44, 30, '#cfe6ff', { blur: 18, font: 'pixel', spacing: 2, core: '#fff' });
  const blink = 0.5 + 0.5 * Math.sin(G.menuT * 3);
  glowText('tap the board to resume', cx, cyc - 8, 13, '#9fb6e8', { blur: 8, weight: 600, spacing: 1, alpha: blink });
  // touch-reachable settings (keyboard M / R don't exist on mobile)
  luminousButton(pauseMuteRect(), isMuted() ? 'SOUND OFF' : 'SOUND ON', isMuted() ? '#7f93c0' : '#5cf0b0');
  luminousButton(pauseMotionRect(), G.reduceMotion ? 'MOTION OFF' : 'MOTION ON', G.reduceMotion ? '#7f93c0' : '#7fc8ff');
  luminousButton(pauseHomeRect(), 'QUIT TO HOME', '#ff8a9a');
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
