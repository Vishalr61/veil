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
import { barLayout, diffBtnRects, pauseHomeRect, pauseControlRect, pauseMuteRect, pauseMotionRect, goBtnRects } from './geometry';
import { isMuted } from '../audio/audio';
import { todayKey, isConsecutive } from '../daily/daily';
import { getScores, justSetEntry } from '../game/leaderboard';
import { getLifetime } from '../game/stats';
import { DAILY_FLOORS } from '../game/blueprints';

function dim(a) { ctx.save(); ctx.fillStyle = `rgba(3,5,12,${a})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }

const INK = '#eef1f7', MUTED = '#79849c', ACCENT = '#8fb8e8';   // premium-minimal palette

// Home "draw-and-flood" intro timeline (seconds): a pen traces the frontier
// outline, the teal floods in, then the UI reveals. Reduce-motion skips it.
export const MENU_DRAW = 2.6, MENU_FLOOD_AT = 2.6, MENU_FLOOD_DUR = 0.7, MENU_REVEAL_AT = 3.05, MENU_REVEAL_DUR = 0.85;
export const MENU_INTRO_DONE = MENU_REVEAL_AT + MENU_REVEAL_DUR;
function menuPhase() {
  const it = G.reduceMotion ? 999 : G.menuIntroT;
  return {
    drawP: clamp(it / MENU_DRAW, 0, 1),
    floodA: clamp((it - MENU_FLOOD_AT) / MENU_FLOOD_DUR, 0, 1),
    revealA: clamp((it - MENU_REVEAL_AT) / MENU_REVEAL_DUR, 0, 1),
    penGone: it >= MENU_DRAW + 0.25,
  };
}

// A sharp-cornered title button (Horizon reference): a solid WHITE primary with
// black text, a dark fill + crisp light hairline for the rest. `alpha` fades it in.
function minBtn(r: any, label: string, primary: boolean, tint?: string, alpha = 1) {
  const bx = r.x + r.w / 2, by = r.y + r.h / 2, rad = 3;   // sharp (no pill)
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRectPath(r.x, r.y, r.w, r.h, rad);
  if (primary) { ctx.fillStyle = '#ffffff'; ctx.fill(); }
  else {
    ctx.fillStyle = 'rgba(8,16,24,0.45)'; ctx.fill();
    roundRectPath(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, rad);
    ctx.strokeStyle = tint ? tint + '88' : 'rgba(185,205,230,0.42)'; ctx.lineWidth = 1.4; ctx.stroke();
  }
  ctx.restore();
  glowText(label, bx, by + 0.5, primary ? 16 : 14, primary ? '#06070d' : (tint || '#e6eef7'),
    { weight: primary ? 800 : 700, spacing: primary ? 3 : 2.5, blur: 0, alpha });
}
export function drawMenu() {
  const cx = CW / 2;
  const A = menuPhase().revealA;     // the UI fades in only once the intro reveals it
  if (A <= 0.005) return;
  // a light scrim — just enough for text legibility over the Horizon backdrop
  ctx.save(); ctx.fillStyle = `rgba(5,8,14,${0.16 * A})`; ctx.fillRect(0, 0, CW, CH); ctx.restore();

  // BEST — top-left, mono, only when there's a score
  if (G.highScore > 0) glowText('BEST  ' + fmtScore(G.highScore), 22, 40, 12, '#8fa6c8', { font: 'mono', spacing: 4, weight: 700, blur: 0, align: 'left', alpha: A });

  // wordmark — large, crisp, light, generously tracked; scales down on short
  // (landscape) screens so it never crowds the frontier + bar.
  const short = CH < 560;
  const titleY = short ? CH * 0.25 : CH * 0.33;
  const wm = short ? Math.min(76, CH * 0.19) : 104;
  glowText('VEIL', cx, titleY, wm, INK, { weight: 700, spacing: short ? 18 : 26, blur: short ? 7 : 10, core: '#fff', alpha: A });
  glowText('draw light into the dark', cx, titleY + wm * 0.62, short ? 11 : 15, '#8fa6c8', { font: 'mono', weight: 400, spacing: short ? 4 : 6, blur: 0, alpha: A });

  // the button bar — one horizontal row on wide screens, stacked on phones
  const bar = barLayout();
  minBtn(bar.play, 'PLAY', true, undefined, A);
  const tk = todayKey(new Date()), done = G.dailyPlayedKey === tk;
  minBtn(bar.daily, done ? 'DAILY ✓' : 'DAILY', false, undefined, A);
  minBtn(bar.scores, 'SCORES', false, undefined, A);
  if (bar.wide) {   // divider between SCORES and the difficulty chips
    ctx.save(); ctx.globalAlpha = 0.3 * A; ctx.strokeStyle = '#cfdaea'; ctx.lineWidth = 1;
    const dy = bar.dividerY + bar.dividerH * 0.18;
    ctx.beginPath(); ctx.moveTo(bar.dividerX, dy); ctx.lineTo(bar.dividerX, dy + bar.dividerH * 0.64); ctx.stroke(); ctx.restore();
  }

  // difficulty — the chosen mode reads as a solid white chip (MED abbreviated on the bar).
  const diffLabels: Record<string, string> = bar.wide
    ? { easy: 'EASY', medium: 'MED', hard: 'HARD' }
    : { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
  const chips = diffBtnRects();
  for (const r of chips) {
    const on = G.diff === r.key, rad = 3;
    ctx.save(); ctx.globalAlpha = A;
    roundRectPath(r.x, r.y, r.w, r.h, rad);
    if (on) { ctx.fillStyle = '#ffffff'; ctx.fill(); }
    else {
      ctx.fillStyle = 'rgba(8,16,24,0.4)'; ctx.fill();
      roundRectPath(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, rad);
      ctx.strokeStyle = 'rgba(185,205,230,0.34)'; ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.restore();
    glowText(diffLabels[r.key], r.x + r.w / 2, r.y + r.h / 2 + 0.5, on ? 12.5 : 11.5, on ? '#06070d' : '#cfdaea',
      { weight: on ? 800 : 700, spacing: 2, blur: 0, alpha: A });
  }

  const liveStreak = (G.dailyStreakDate === tk || isConsecutive(G.dailyStreakDate, tk)) ? G.dailyStreak : 0;
  if (liveStreak > 1) glowText(liveStreak + ' DAY STREAK', cx, titleY + wm * 0.62 + 26, 11, MUTED, { font: 'mono', spacing: 2, weight: 600, blur: 0, alpha: A });
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

// Seeded, stable menu star positions (built once).
let menuStars: { x: number; y: number; r: number; spd: number; ph: number }[] | null = null;
function buildMenuStars() {
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out: any[] = [];
  for (let i = 0; i < 26; i++) out.push({ x: rnd() * 0.96 + 0.02, y: rnd() * 0.5 + 0.02, r: rnd() * 1.7 + 1, spd: rnd() * 2 + 1.2, ph: rnd() * TAU });
  return out;
}
// The "Horizon" home backdrop (per the design reference): a dark field + faint grid +
// twinkling stars, the glowing jagged TEAL FRONTIER you claim along the lower third,
// the player dot + trail rising from it, and a slow spinning Qix diamond. Portrait-fit.
const FRONTIER = [[0, 0.12, 0.70], [0.12, 0.26, 0.63], [0.26, 0.40, 0.72], [0.40, 0.50, 0.66], [0.50, 0.66, 0.60], [0.66, 0.80, 0.69], [0.80, 0.92, 0.64], [0.92, 1.0, 0.68]];
function frontierPath() {
  ctx.beginPath();
  ctx.moveTo(0, FRONTIER[0][2] * PH);
  for (let i = 0; i < FRONTIER.length; i++) {
    const xe = FRONTIER[i][1] * PW, yf = FRONTIER[i][2] * PH;
    ctx.lineTo(xe, yf);                                                  // horizontal run
    if (i < FRONTIER.length - 1) ctx.lineTo(xe, FRONTIER[i + 1][2] * PH); // vertical step
  }
}
// The frontier as a top-edge polyline (fractions) — used to TRACE it with the pen.
const FRONTIER_PTS: number[][] = (() => {
  const pts: number[][] = [[0, FRONTIER[0][2]]];
  for (let i = 0; i < FRONTIER.length; i++) {
    pts.push([FRONTIER[i][1], FRONTIER[i][2]]);
    if (i < FRONTIER.length - 1) pts.push([FRONTIER[i][1], FRONTIER[i + 1][2]]);
  }
  return pts;
})();
// Stroke the outline up to `prog` (0..1) of its length; returns the pen tip in px.
function drawFrontierOutline(prog: number): [number, number] {
  const pts = FRONTIER_PTS.map((p) => [p[0] * PW, p[1] * PH]);
  let total = 0; const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(L); total += L; }
  const target = prog * total;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  let acc = 0, penX = pts[0][0], penY = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const L = seg[i - 1];
    if (acc + L <= target) { ctx.lineTo(pts[i][0], pts[i][1]); acc += L; penX = pts[i][0]; penY = pts[i][1]; }
    else { const f = L > 0 ? (target - acc) / L : 0; penX = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f; penY = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f; ctx.lineTo(penX, penY); break; }
  }
  ctx.stroke();
  return [penX, penY];
}
export function drawAttractWorld() {
  if (!menuStars) menuStars = buildMenuStars();
  const t = G.reduceMotion ? 0 : G.time;
  const { drawP, floodA, revealA, penGone } = menuPhase();
  ctx.save();
  ctx.translate(OFF_X, OFF_Y);
  // dark field
  const vg = ctx.createLinearGradient(0, 0, 0, PH);
  vg.addColorStop(0, '#05060c'); vg.addColorStop(0.55, '#070913'); vg.addColorStop(1, '#04050b');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, PW, PH);
  // faint grid + twinkling stars — fade in with the reveal
  if (revealA > 0.01) {
    ctx.save();
    ctx.globalAlpha = revealA; ctx.strokeStyle = 'rgba(70,90,150,0.055)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= PW; x += 44) { ctx.moveTo(x, 0); ctx.lineTo(x, PH); }
    for (let y = 0; y <= PH; y += 44) { ctx.moveTo(0, y); ctx.lineTo(PW, y); }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of menuStars) {
      ctx.globalAlpha = (G.reduceMotion ? 0.4 : 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * s.spd + s.ph))) * 0.6 * revealA;
      ctx.fillStyle = '#cdd9f0'; ctx.beginPath(); ctx.arc(s.x * PW, s.y * PH, s.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // the FRONTIER fill — floods in once the outline closes
  if (floodA > 0.01) {
    ctx.save();
    frontierPath(); ctx.lineTo(PW, PH); ctx.lineTo(0, PH); ctx.closePath();
    const fg = ctx.createLinearGradient(0, PH * 0.56, 0, PH);
    fg.addColorStop(0, 'rgba(46,230,207,0.34)'); fg.addColorStop(0.55, 'rgba(17,136,170,0.2)'); fg.addColorStop(1, 'rgba(10,58,90,0.42)');
    ctx.globalAlpha = floodA; ctx.fillStyle = fg; ctx.fill();
    if (floodA < 1) {   // a quick capture flash as it floods
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - floodA) * 0.22;
      frontierPath(); ctx.lineTo(PW, PH); ctx.lineTo(0, PH); ctx.closePath();
      ctx.fillStyle = '#39f0e0'; ctx.fill();
    }
    ctx.restore();
  }
  // the frontier OUTLINE — drawn progressively by the pen, then a steady glow
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = '#39f0e0'; ctx.shadowBlur = (drawP < 1 ? 8 : 11) * (G.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 2));
  ctx.strokeStyle = '#aafff2'; ctx.lineWidth = drawP < 1 ? 2.6 : 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = drawP < 1 ? 1 : 0.85;
  const [penX, penY] = drawFrontierOutline(drawP);
  ctx.restore();
  // the PEN/hero that draws the outline — only while tracing
  if (!penGone && drawP < 1 && !G.reduceMotion) {
    const fl = 0.85 + 0.15 * Math.sin(t * 8);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#aafff2'; ctx.shadowBlur = 18 * fl; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(penX, penY, 6 * fl, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // (no center player dot/trail — it read as a stray marker)
  if (revealA > 0.01) {
    // Qix diamond (slow spin), upper-right — a bigger, bolder landmark
    const qr = Math.min(42, PW * 0.11);
    ctx.save(); ctx.globalAlpha = revealA; ctx.translate(0.81 * PW, 0.135 * PH); ctx.rotate((G.reduceMotion ? 0.5 : t * 0.22) + Math.PI / 4);
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ff5ad0'; ctx.shadowBlur = 11;
    ctx.strokeStyle = '#ff5ad0'; ctx.lineWidth = 3; ctx.strokeRect(-qr, -qr, qr * 2, qr * 2);
    ctx.strokeStyle = '#ff9ae4'; ctx.lineWidth = 2.4; ctx.strokeRect(-qr * 0.5, -qr * 0.5, qr, qr);
    ctx.restore();
  }
  ctx.restore();
}
