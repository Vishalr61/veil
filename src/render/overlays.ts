/* =========================================================================
   Full-screen overlays drawn over the world: the title menu, level-clear and
   game-over cards, the pause screen, and the menu's attract-mode backdrop.
   Pure consumers of G + the daily helpers; buttons come from render/geometry.
   ========================================================================= */

import { ctx } from './surface';
import { G } from '../game/state';
import { CW, CH, OFF_X, OFF_Y, PW, PH } from '../core/dims';
import { TAU, clamp } from '../core/math';
import { glowText, luminousTitle, luminousButton, fmtScore, setFont } from './primitives';
import { playBtnRect, dailyBtnRect, scoresBtnRect, pauseHomeRect, pauseControlRect, pauseMuteRect, pauseMotionRect, goBtnRects } from './geometry';
import { isMuted } from '../audio/audio';
import { todayKey, isConsecutive } from '../daily/daily';
import { genNebula } from './background';
import { drawShootingStars } from './world';
import { BANDS, RIFT_BAND } from '../core/bands';
import { getScores, justSetEntry } from '../game/leaderboard';
import { getLifetime } from '../game/stats';
import { DAILY_FLOORS } from '../game/blueprints';

function dim(a) { ctx.save(); ctx.fillStyle = `rgba(3,5,12,${a})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
export function drawMenu() {
  // A vertical scrim instead of a flat dim: keeps the backdrop (and its side
  // veins) vivid full-width, while darkening only the title + button bands so
  // the wordmark and labels stay crisp over a bright nebula.
  ctx.save();
  const sg = ctx.createLinearGradient(0, 0, 0, CH);
  sg.addColorStop(0.0, 'rgba(3,5,12,0.34)');
  sg.addColorStop(0.30, 'rgba(3,5,12,0.54)');   // VEIL wordmark band
  sg.addColorStop(0.52, 'rgba(3,5,12,0.34)');
  sg.addColorStop(0.80, 'rgba(3,5,12,0.60)');   // PLAY / DAILY / SCORES band
  sg.addColorStop(1.0, 'rgba(3,5,12,0.44)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, CW, CH);
  ctx.restore();
  const cx = CW / 2, bob = Math.sin(G.menuT * 1.2) * 2;
  const pal = G.menuPal || G.pal;
  const acc = pal.edge2 || '#9fe8ff';   // the chosen zone's accent — ties the chrome to the backdrop

  // top stat — a clean centred "BEST" badge, zone-tinted
  glowText('BEST', cx, CH * 0.092, 9.5, acc, { blur: 5, font: 'mono', weight: 700, spacing: 4 });
  glowText(fmtScore(G.highScore), cx, CH * 0.125, 17, '#eafaff', { blur: 7, font: 'mono', spacing: 2, core: '#fff' });

  // hero wordmark with a breathing bloom, haloed in the zone colour
  const titleY = CH * 0.31 + bob;
  const pulse = 28 + 7 * Math.sin(G.menuT * 1.6);
  luminousTitle('VEIL', cx, titleY, 72, { blur: pulse, glow: pal.edge || '#6fd8ff', bot: acc, spacing: 20 });

  // subtitle — a fluid, tightly-tracked tagline framed by two faint zone-tinted dots
  const subY = titleY + 50;
  ctx.save(); setFont(13, 400, 0.3, undefined); const stw = ctx.measureText('draw light into the dark').width; ctx.restore();
  glowText('draw light into the dark', cx, subY, 13, '#dcefff', { blur: 9, weight: 400, spacing: 0.3 });
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 8;
  for (const off of [-(stw / 2 + 15), stw / 2 + 15]) { ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(cx + off, subY, 1.6, 0, TAU); ctx.fill(); }
  ctx.restore();

  // primary CTA + secondary row, each with a leading glyph
  luminousButton(playBtnRect(), 'PLAY', '#5cf0b0', { primary: true, icon: 'play' });
  const tk = todayKey(new Date()), done = G.dailyPlayedKey === tk;
  luminousButton(dailyBtnRect(), done ? 'DAILY ✓' : 'DAILY', '#ff7ad0', { icon: 'daily' });
  luminousButton(scoresBtnRect(), 'SCORES', '#7fc8ff', { icon: 'scores' });

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
  // lifetime totals — a sense-of-progression footer across all runs on this device
  const lt = getLifetime();
  if (lt.runs > 0) {
    const parts = [lt.runs + ' RUN' + (lt.runs > 1 ? 'S' : ''), lt.caches + ' CACHES', 'CHAIN ' + lt.bestChain + 'x', 'L' + lt.bestLevel];
    glowText(parts.join('   ·   '), cx, CH * 0.80, 11, '#7f97c8', { blur: 5, font: 'mono', spacing: 1, weight: 700 });
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
  // run recap (the score-chase beat): best chain + caches uncovered this run
  if (!G.isDaily && (G.maxCombo > 1 || G.runCaches > 0)) {
    const bits = [];
    if (G.maxCombo > 1) bits.push('BEST CHAIN ' + G.maxCombo + 'x');
    if (G.runCaches > 0) bits.push(G.runCaches + ' CACHE' + (G.runCaches > 1 ? 'S' : ''));
    glowText(bits.join('   ·   '), cx, cyc + 62, 11, '#9fd0ff', { font: 'mono', spacing: 1, weight: 700, alpha: t });
  }
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
  luminousButton(pauseControlRect(), G.tapControl ? 'CONTROL: TAP' : 'CONTROL: DRAG', '#c0a0ff');
  luminousButton(pauseHomeRect(), 'QUIT TO HOME', '#ff8a9a');
}

export function drawAttractWorld() {
  // A vivid, *varied* backdrop: pick a random zone per page-load so the title
  // showcases the game's palettes (Depths/Aurora/Deep Space/… and the Rift),
  // generated rich (deeper, brighter) rather than the old dim Depths.
  if (!G.menuNebula) {
    const pool = [...BANDS, RIFT_BAND];
    G.menuPal = pool[Math.floor(Math.random() * pool.length)];
    G.menuNebula = genNebula(G.menuPal, 4, PW, PH, 0.62);
  }
  const pal = G.menuPal || BANDS[0];
  ctx.save();
  ctx.translate(OFF_X, OFF_Y);
  // slow parallax drift; the nebula is over-scaled so the drift never bares an edge
  const dx = Math.sin(G.menuT * 0.05) * 16, dy = Math.cos(G.menuT * 0.04) * 11;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(G.menuNebula.canvas, dx - 20, dy - 16, PW + 40, PH + 32);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const m of G.motes) {
    const tw = 0.55 + 0.45 * Math.sin(G.menuT * 1.3 + m.x);   // gentle per-star twinkle
    ctx.globalAlpha = m.a * 0.85 * tw; ctx.fillStyle = pal.star;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
  }
  drawShootingStars(pal.edge2);   // reuse the in-game streaks, tinted to this zone
  ctx.restore();
}
