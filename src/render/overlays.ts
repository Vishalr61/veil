/* =========================================================================
   Full-screen overlays drawn over the world: the title menu, level-clear and
   game-over cards, the pause screen, and the menu's attract-mode backdrop.
   Pure consumers of G + the daily helpers; buttons come from render/geometry.
   ========================================================================= */

import { ctx } from './surface';
import { G } from '../game/state';
import { CW, CH, OFF_X, OFF_Y, PW, PH } from '../core/dims';
import { TAU, clamp } from '../core/math';
import { glowText, fmtScore, roundRectPath } from './primitives';
import { playBtnRect, dailyBtnRect, scoresBtnRect, diffBtnRects, pauseHomeRect, pauseControlRect, pauseMuteRect, pauseMotionRect, goBtnRects } from './geometry';
import { isMuted } from '../audio/audio';
import { todayKey, isConsecutive } from '../daily/daily';
import { getScores, justSetEntry } from '../game/leaderboard';
import { getLifetime } from '../game/stats';
import { DAILY_FLOORS } from '../game/blueprints';

function dim(a) { ctx.save(); ctx.fillStyle = `rgba(3,5,12,${a})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }

const INK = '#eef1f7', MUTED = '#79849c', ACCENT = '#8fb8e8';   // premium-minimal palette
// A restrained menu button: a confident light fill for the primary, a quiet
// hairline outline for the rest. No glow — crisp edges carry it.
function minBtn(r: any, label: string, primary: boolean, tint?: string) {
  const bx = r.x + r.w / 2, by = r.y + r.h / 2, rad = r.h / 2;
  ctx.save();
  roundRectPath(r.x, r.y, r.w, r.h, rad);
  if (primary) { ctx.fillStyle = INK; ctx.fill(); }
  else {
    ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fill();
    roundRectPath(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, rad - 0.75);
    ctx.strokeStyle = tint ? tint + '55' : 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.25; ctx.stroke();
  }
  ctx.restore();
  glowText(label, bx, by + 0.5, primary ? 16 : 14, primary ? '#0a0e16' : (tint || '#b3bdd0'),
    { weight: primary ? 800 : 600, spacing: primary ? 3 : 2.5, blur: 0 });
}
export function drawMenu() {
  const cx = CW / 2;
  // a whisper of a scrim for legibility (the backdrop is already calm)
  ctx.save(); ctx.fillStyle = 'rgba(5,8,14,0.28)'; ctx.fillRect(0, 0, CW, CH); ctx.restore();

  // BEST — tiny, restrained, only when there's a score
  if (G.highScore > 0) glowText('BEST  ' + fmtScore(G.highScore), cx, CH * 0.12, 12, MUTED, { font: 'mono', spacing: 3, weight: 600, blur: 0 });

  // wordmark — large, crisp, light, generously tracked; only a whisper of glow
  const titleY = CH * 0.37;
  glowText('VEIL', cx, titleY, 86, INK, { weight: 700, spacing: 28, blur: 6, core: '#fff' });
  // a single thin accent rule + the tagline, with room to breathe
  ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = ACCENT; ctx.fillRect(cx - 26, titleY + 42, 52, 1.5); ctx.restore();
  glowText('draw light into the dark', cx, titleY + 64, 13, MUTED, { weight: 500, spacing: 4, blur: 0 });

  // a confident light PLAY + quiet outlined DAILY / SCORES
  minBtn(playBtnRect(), 'PLAY', true);
  const tk = todayKey(new Date()), done = G.dailyPlayedKey === tk;
  minBtn(dailyBtnRect(), done ? 'DAILY ✓' : 'DAILY', false);
  minBtn(scoresBtnRect(), 'SCORES', false);

  // difficulty — a quiet three-up selector; the chosen mode reads as a light fill.
  // (The daily ignores this and always runs Medium — see effectiveDiff.)
  const diffLabels: Record<string, string> = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
  const chips = diffBtnRects();
  glowText('DIFFICULTY', cx, chips[0].y - 18, 9, MUTED, { font: 'mono', spacing: 3, weight: 600, blur: 0 });
  for (const r of chips) {
    const on = G.diff === r.key, rad = r.h / 2;
    ctx.save();
    roundRectPath(r.x, r.y, r.w, r.h, rad);
    if (on) { ctx.fillStyle = INK; ctx.fill(); }
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fill();
      roundRectPath(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, rad - 0.75);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.25; ctx.stroke();
    }
    ctx.restore();
    glowText(diffLabels[r.key], r.x + r.w / 2, r.y + r.h / 2 + 0.5, on ? 13 : 11.5, on ? '#0a0e16' : MUTED,
      { weight: on ? 800 : 600, spacing: 2, blur: 0 });
  }

  const liveStreak = (G.dailyStreakDate === tk || isConsecutive(G.dailyStreakDate, tk)) ? G.dailyStreak : 0;
  if (liveStreak > 1) glowText(liveStreak + ' DAY STREAK', cx, CH * 0.9, 11, MUTED, { font: 'mono', spacing: 2, weight: 600, blur: 0 });
}
export function drawScores() {
  dim(0.74);
  const cx = CW / 2;
  glowText('HIGH SCORES', cx, CH * 0.15, 25, INK, { blur: 4, weight: 800, spacing: 5, core: '#fff' });
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
  // lifetime totals — a sense-of-progression footer across all runs on this device
  const lt = getLifetime();
  if (lt.runs > 0) {
    const parts = [lt.runs + ' RUN' + (lt.runs > 1 ? 'S' : ''), lt.caches + ' CACHES', 'CHAIN ' + lt.bestChain + 'x', 'L' + lt.bestLevel];
    glowText(parts.join('   ·   '), cx, CH * 0.80, 11, '#7f97c8', { blur: 5, font: 'mono', spacing: 1, weight: 700 });
  }
  const blink = 0.5 + 0.5 * Math.sin(G.menuT * 3);
  glowText('TAP TO RETURN', cx, CH * 0.87, 12, MUTED, { blur: 0, weight: 700, spacing: 3, alpha: blink });
}
export function drawLevelClear() {
  dim(0.45);
  const cx = CW / 2, cyc = CH / 2, t = clamp((2.9 - G.lcTimer) * 2.2, 0, 1), pop = 1 + (1 - t) * 0.3;
  const lastFloor = G.isDaily && G.level >= DAILY_FLOORS;
  glowText(G.isDaily ? 'FLOOR CLEARED' : 'VEIL CLEARED', cx, cyc - 36, 40 * pop, INK, { blur: 12, weight: 800, spacing: 4, core: '#fff', alpha: t });
  glowText((G.isDaily ? 'FLOOR ' : 'LEVEL ') + G.level + '  ·  ' + Math.round(G.percent * 100) + '% revealed', cx, cyc + 8, 16, '#cfe6ff', { blur: 8, weight: 600, spacing: 1, alpha: t });
  glowText('+ ' + G.lastBonus + '  bonus', cx, cyc + 40, 18, G.pal.accent, { blur: 12, weight: 800, alpha: t });
  const bonusBits = [];
  if (G.lastTimeBonus > 0) bonusBits.push('SPEED +' + G.lastTimeBonus);
  if (G.lastOverBonus > 0) bonusBits.push('BOLD CLEAR +' + G.lastOverBonus);
  if (bonusBits.length) glowText(bonusBits.join('    '), cx, cyc + 62, 11, '#ffce5c', { blur: 8, weight: 700, spacing: 1, font: 'mono', alpha: t });
  const next = lastFloor ? 'clearing the rift...' : 'next: ' + (G.isDaily ? 'floor ' : 'level ') + (G.level + 1);
  glowText(next, cx, cyc + 84, 12, '#7f97c8', { blur: 0, spacing: 2, alpha: t * (0.6 + 0.4 * Math.sin(G.menuT * 4)) });
}
export function drawGameOver() {
  dim(0.66);
  const cx = CW / 2, cyc = CH / 2, t = clamp(G.goTimer * 1.6, 0, 1);
  glowText(G.dailyWon ? 'DAILY COMPLETE' : 'THE DARK WINS', cx, cyc - 98, G.dailyWon ? 33 : 37, G.dailyWon ? '#5cf0b0' : '#ff6b7e', { blur: 12, weight: 800, spacing: 4, core: '#fff', alpha: t });
  glowText('SCORE', cx, cyc - 56, 10, MUTED, { font: 'mono', spacing: 4, weight: 700, alpha: t });
  glowText(fmtScore(G.score), cx, cyc - 26, 32, INK, { blur: 6, font: 'mono', weight: 700, spacing: 1, core: '#fff', alpha: t });

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
  // run recap (the score-chase beat): best chain + caches uncovered this run
  if (!G.isDaily && (G.maxCombo > 1 || G.runCaches > 0)) {
    const bits = [];
    if (G.maxCombo > 1) bits.push('BEST CHAIN ' + G.maxCombo + 'x');
    if (G.runCaches > 0) bits.push(G.runCaches + ' CACHE' + (G.runCaches > 1 ? 'S' : ''));
    glowText(bits.join('   ·   '), cx, cyc + 62, 11, '#9fd0ff', { font: 'mono', spacing: 1, weight: 700, alpha: t });
  }
  if (G.isDaily) glowText('DAILY ' + G.dailyRunKey + (G.dailyStreak > 1 ? '    ' + G.dailyStreak + ' STREAK' : ''), cx, cyc + 62, 11, '#9fd0ff', { font: 'mono', spacing: 1, weight: 700, alpha: t });

  const b = goBtnRects();
  minBtn(b.primary, G.isDaily ? 'SHARE' : 'RETRY', true);
  minBtn(b.home, 'HOME', false);
}
export function drawPaused() {
  dim(0.6);
  const cx = CW / 2, cyc = CH / 2;
  glowText('PAUSED', cx, cyc - 44, 30, INK, { blur: 6, weight: 800, spacing: 6, core: '#fff' });
  const blink = 0.5 + 0.5 * Math.sin(G.menuT * 3);
  glowText('tap the board to resume', cx, cyc - 10, 12, MUTED, { blur: 0, weight: 600, spacing: 2, alpha: blink });
  // touch-reachable settings (keyboard M / R don't exist on mobile)
  minBtn(pauseMuteRect(), isMuted() ? 'SOUND OFF' : 'SOUND ON', false);
  minBtn(pauseMotionRect(), G.reduceMotion ? 'MOTION OFF' : 'MOTION ON', false);
  minBtn(pauseControlRect(), 'CONTROL: ' + G.controlMode.toUpperCase(), false);
  minBtn(pauseHomeRect(), 'QUIT TO HOME', false, '#e08a96');
}

export function drawAttractWorld() {
  // Premium-minimal backdrop: near-black with a faint vertical gradient, a single
  // soft glow behind the wordmark, and a sparse calm starfield. No vivid nebula —
  // the quiet is the point.
  ctx.save();
  ctx.translate(OFF_X, OFF_Y);
  const vg = ctx.createLinearGradient(0, 0, 0, PH);
  vg.addColorStop(0, '#080b13'); vg.addColorStop(0.45, '#0a0e1a'); vg.addColorStop(1, '#06080e');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, PW, PH);
  const gx = PW / 2, gy = PH * 0.34, glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, PW * 0.78);
  glow.addColorStop(0, 'rgba(80,130,190,0.10)'); glow.addColorStop(0.6, 'rgba(50,80,130,0.035)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, PW, PH);
  ctx.globalCompositeOperation = 'lighter';
  for (const m of G.motes) { ctx.globalAlpha = m.a * 0.32; ctx.fillStyle = '#9fb0cc'; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.7, 0, TAU); ctx.fill(); }
  ctx.restore();
}
