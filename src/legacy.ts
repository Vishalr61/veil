/* =========================================================================
   VEIL  —  draw light into the dark   ·   v2
   Territory-capture game. Cut continuous lines through a dark veil to
   enclose space and reveal the nebula beneath, while drifters hunt you.
   Single-file, no dependencies. Plays from file:// (just open index.html).
   ========================================================================= */

'use strict';

import { TAU, rand } from './core/math';
import { SeededRng } from './core/rng';
import { genVeilBoard } from './sim/veil';
import { genObstacles, openInteriorCount } from './sim/terrain';
import { todayKey, seedFromDateKey, shareText, isConsecutive } from './daily/daily';
import { shareResult } from './platform/share';
import { EMPTY, FILLED, OBSTACLE, SS } from './core/constants';
import { bandForLevel, LEVELS_PER_BAND, RIFT_BAND } from './core/bands';
import { genNebula, genFog } from './render/background';
import { canvas, ctx } from './render/surface';
import { glowText, drawScanlines, drawVignette, roundRectPath } from './render/primitives';
import {
  COLS, ROWS, CELL, PW, PH, MARGIN, HUD_H, CW, CH, OFF_X, OFF_Y, INTERIOR_TOTAL,
  safeTop, safeBottom, computeLayout, applyCanvasSize, setInteriorTotal,
} from './core/dims';
import { G } from './game/state';
import { centerPx } from './core/grid';
import { drawWorld, tickShootingStars } from './render/world';
import { spawnPopup, updatePopups, updateParticles, updateRings, initMotes, updateMotes } from './game/particles';
import { ENEMY_INFO, genEnemies, moveEnemy } from './game/enemies';
import { blueprintForLevel, newEnemyAtLevel, dailyBlueprint, dailyNewEnemy, DAILY_FLOORS, levelTimeBudget } from './game/blueprints';
import { recomputeBorderPath, recomputePercent, boldClearBonus } from './game/capture';
import { submitScore } from './game/leaderboard';
import { recordRun } from './game/stats';
import { maybeSpawnPickup, updatePickups } from './game/powerups';
import { updatePlayer, checkCollisions, respawnAt, clearTrail, timeoutDeath } from './game/player';
import { playBtnRect, dailyBtnRect, pauseBtnRect, pauseHomeRect, pauseMuteRect, pauseMotionRect, muteBtnRect, goBtnRects, scoresBtnRect } from './render/geometry';
import { drawHUD } from './render/hud';
import { drawMenu, drawLevelClear, drawGameOver, drawPaused, drawAttractWorld, drawScores } from './render/overlays';
import {
  initAudio, resumeAudio, setMuted, isMuted, setPadLevel,
  sfxStartDraw, sfxCapture, sfxBold, sfxDeath, sfxLevel, sfxPickup, sfxShield, sfxBlip, sfxBest, sfxDailyClear,
  setMusicIntensity, setMusicTheme,
} from './audio/audio';


/* ----------------------------- canvas / layout ------------------------- */

let lastVW = 0, lastVH = 0;
function relayout(force) {
  const vw = window.innerWidth | 0, vh = window.innerHeight | 0;
  // Ignore tiny changes (mobile URL-bar show/hide) to avoid resetting mid-play.
  if (!force && Math.abs(vw - lastVW) < 40 && Math.abs(vh - lastVH) < 40) return;
  lastVW = vw; lastVH = vh;
  computeLayout(); applyCanvasSize();
  G.menuNebula = null;
  // Grid dimensions may have changed; rebuild the current level to stay valid.
  if (G.state === 'playing' || G.state === 'paused') initLevel(G.level);
}
window.addEventListener('resize', () => relayout(false));
window.addEventListener('orientationchange', () => relayout(true));
lastVW = window.innerWidth | 0; lastVH = window.innerHeight | 0;
computeLayout(); applyCanvasSize();
// Safe-area insets can populate a frame or two after load in a WKWebView;
// re-check so the HUD ends up below the notch/Dynamic Island, not under it.
window.addEventListener('load', () => relayout(true));
requestAnimationFrame(() => relayout(true));
setTimeout(() => relayout(true), 400);

/* ----- settings + persisted state — loaded into the shared G object ----- */
/* All mutable game state lives in G (see game/state.ts). Here we only hydrate
   the values that persist across sessions from localStorage. */
try { G.reduceMotion = localStorage.getItem('veil_reduce') === '1'; } catch (e) {}
try { G.dailyBest = parseInt(localStorage.getItem('veil_daily_best') || '0', 10) || 0; } catch (e) {}
try { G.dailyPlayedKey = localStorage.getItem('veil_daily_played') || ''; } catch (e) {}
try { G.dailyStreak = parseInt(localStorage.getItem('veil_daily_streak') || '0', 10) || 0; } catch (e) {}
try { G.dailyStreakDate = localStorage.getItem('veil_daily_streak_date') || ''; } catch (e) {}
try { G.onboarded = localStorage.getItem('veil_onboarded') === '1'; } catch (e) {}
try { G.highScore = parseInt(localStorage.getItem('veil_highscore') || '0', 10) || 0; } catch (e) {}

/* ----------------------------- background art -------------------------- */
function genTwinkles() {
  G.twinkles = [];
  for (let i = 0; i < 90; i++) {
    G.twinkles.push({ x: Math.random() * PW, y: Math.random() * PH, r: rand(0.6, 1.8), phase: Math.random() * TAU, spd: rand(1.5, 4) });
  }
}
function clearFogCell(idx) {
  const x = idx % COLS, y = (idx / COLS) | 0, c = G.fog.ctx;
  c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
  c.fillRect(x * CELL, y * CELL, CELL, CELL); c.restore();
}

/* ----------------------------- grid / capture -------------------------- */
function processReveal() {
  if (!G.revealQueue.length) return;
  const n = Math.max(2, Math.ceil(G.revealQueue.length / 7)); // finishes in ~7 frames
  for (let k = 0; k < n && G.revealQueue.length; k++) {
    const { idx } = G.revealQueue.shift();
    clearFogCell(idx);
    // fog "shatters" as it clears: a few fast rock shards + ember bits
    if (Math.random() < 0.45) {
      const c = centerPx(idx), bits = 1 + ((Math.random() * 2) | 0);
      for (let b = 0; b < bits; b++) {
        const ang = Math.random() * TAU, sp = rand(40, 130);
        G.particles.push({ x: c.x, y: c.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          life: rand(0.25, 0.7), max: 0.7, r: rand(0.8, 2.2),
          col: Math.random() < 0.4 ? G.pal.blobs[4] : Math.random() < 0.7 ? G.pal.edge : '#1a0604' });
      }
    }
  }
}

/* ----------------------------- death finalize -------------------------- */
// Runs after the death freeze: respawn, or end the run (game over + persist
// high score / daily streak). Kept here with flow since it ends the session.
// Persist daily streak / best / played-today + build the share text. Shared by
// the death path and the all-floors-cleared completion path.
function finalizeDaily() {
  recordDailyStreak(G.dailyRunKey);
  G.dailyResultText = shareText({ key: G.dailyRunKey, score: G.score, level: G.level, percent: G.percent, streak: G.dailyStreak });
  if (G.score > G.dailyBest) { G.dailyBest = G.score; try { localStorage.setItem('veil_daily_best', String(G.dailyBest)); } catch (e) {} }
  G.dailyPlayedKey = G.dailyRunKey; try { localStorage.setItem('veil_daily_played', G.dailyPlayedKey); } catch (e) {}
}
function persistHighAndRank() {
  if (G.score > G.highScore) { G.highScore = G.score; try { localStorage.setItem('veil_highscore', String(G.highScore)); } catch (e) {} sfxBest(); }
  G.lastRank = submitScore({ score: Math.round(G.score), level: G.level, date: todayKey(new Date()), daily: G.isDaily });
  recordRun(G.runCaches, G.maxCombo, G.level);   // fold into lifetime totals (scores-screen footer)
}
// Cleared all 10 Rift floors — the win condition for the daily.
function completeDaily() {
  G.dailyWon = true;
  const clearBonus = 2500 + G.lives * 500;
  G.lastBonus = clearBonus; G.score += clearBonus;
  persistHighAndRank();
  finalizeDaily();
  clearTrail();
  G.state = 'gameover'; G.goTimer = 0;
  G.flash = G.reduceMotion ? 0.2 : 0.6; sfxDailyClear();
}
function finishDeath() {
  G.deathFreeze = 0; G.hitstop = 0; G.timeScaleTarget = 1;
  if (G.lives <= 0) {
    G.state = 'gameover'; G.goTimer = 0;
    clearTrail();
    persistHighAndRank();
    if (G.isDaily) finalizeDaily();
    return;
  }
  respawnAt(); G.player.invuln = 1.7;
}

/* ----------------------------- flow ------------------------------------ */
function initLevel(lv) {
  G.level = lv;
  G.rng = new SeededRng(G.gameSeed).fork('lv' + lv); // deterministic per-level simulation stream
  // The daily is its own zone (The Rift) with a dedicated 10-floor blueprint set;
  // the campaign uses the band + authored/procedural blueprint for the level.
  G.pal = G.isDaily ? RIFT_BAND : bandForLevel(lv);
  const bp = G.isDaily ? dailyBlueprint(lv) : blueprintForLevel(lv);
  G.grid = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      G.grid[y * COLS + x] = (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? FILLED : EMPTY;
  const obst = genObstacles(G.rng.fork('terrain'), { cols: COLS, rows: ROWS, level: lv, startIdx: COLS >> 1, motif: bp.motif, density: bp.density });
  for (let i = 0; i < G.grid.length; i++) if (obst[i]) G.grid[i] = OBSTACLE;
  setInteriorTotal(openInteriorCount(obst, COLS, ROWS));   // target denominator excludes rock
  G.veilBoard = genVeilBoard(G.rng.fork('veil'), { cols: COLS, rows: ROWS, level: lv, isOpen: (i) => G.grid[i] === EMPTY, caches: bp.caches, rifts: bp.rifts });

  G.nebula = genNebula(G.pal, lv, PW, PH, bp.depth); G.fog = genFog(G.pal, PW, PH, bp.depth); genTwinkles();
  for (let i = 0; i < G.grid.length; i++) if (G.grid[i] === FILLED || G.grid[i] === OBSTACLE) clearFogCell(i);

  const start = (COLS >> 1);
  G.player = { from: start, to: start, t: 0, dir: null, stopped: true, invuln: 1.0, tail: [], px: centerPx(start) };
  G.buffered = null; G.hasTrail = false; G.trailCells = []; G.trailPoints = [];
  // zone summits (every 5th floor, or the daily's last floor) get THE QIX boss
  const summit = G.isDaily ? lv >= DAILY_FLOORS : lv % LEVELS_PER_BAND === 0;
  G.enemies = genEnemies(lv, summit ? { ...bp.enemies, qix: 1 } : bp.enemies);

  // gentler ramp + a lower cap so high levels stay controllable (was 11 + 0.6*lv, cap 18,
  // which hit max ~L12 and felt twitchy/buggy to steer).
  G.baseSpeed = Math.min(11 + 0.32 * (lv - 1), 15);
  // cap the reveal target ~74%: the last ~15-20% of a board was a slow, grindy
  // chip-away against the most crowded enemies. Early levels (<0.74) are
  // unchanged; the curve now climbs to 0.74 and holds, with difficulty carried
  // by enemies / speed / music. Covers campaign, daily, and procedural alike.
  G.target = Math.min(bp.target, 0.74);

  G.combo = 0; G.comboT = 0; G.levelT = 0;
  G.levelTimeMax = levelTimeBudget(lv);   // level time budget — generous early, tighter later
  G.shakeAmt = 0; G.flash = 0; G.zoom = 1; G.deathFreeze = 0; G.hitstop = 0; G.timeScale = 1; G.timeScaleTarget = 1;
  G.enemyFreezeT = 0; G.enemySlowT = 0; G.surgeT = 0; G.scanT = 0; G.shield = false;
  G.pickups.length = 0; G.popups.length = 0; G.particles.length = 0; G.rings.length = 0; G.revealQueue.length = 0;
  G.pickupSpawnT = G.rng.range(5, 8);
  recomputeBorderPath(); recomputePercent(); G.dispPercent = G.percent;
  const floors = G.isDaily ? DAILY_FLOORS : LEVELS_PER_BAND;
  const floor = G.isDaily ? lv : ((lv - 1) % LEVELS_PER_BAND) + 1;   // which floor of the band / daily run
  // just the zone name (no per-level titles) — keep the banner simple
  G.banner = { text: G.pal.name.toUpperCase(),
    sub: 'floor ' + floor + '/' + floors + '  ·  reveal ' + Math.round(G.target * 100) + '%', t: 2.0 };
  // a level that introduces a new enemy always teaches what it does (wins over the title)
  const newType = G.isDaily ? dailyNewEnemy(lv) : newEnemyAtLevel(lv);
  if (newType) G.banner = { text: ENEMY_INFO[newType].name, sub: ENEMY_INFO[newType].desc, t: 3.4, enemy: newType };
  if (summit) G.banner = { text: ENEMY_INFO.qix.name, sub: ENEMY_INFO.qix.desc, t: 3.2, enemy: 'qix' };   // boss floor
  G.hintActive = (lv === 1 && !G.isDaily);
  setMusicTheme(G.isDaily ? 'rift' : G.pal.style);   // soundtrack key/tempo follows the zone
  G.introT = G.reduceMotion ? 0 : 1;   // fade the level up + settle the zoom (covers the hard cut)
  G.state = 'playing';
}
function startGame(seed?: number) {
  G.score = 0; G.dispScore = 0; G.lives = 3;
  G.prevHighScore = G.highScore; G.lastRank = 0; G.beatBestThisRun = false; G.dailyWon = false;   // snapshot best before the run, for the game-over summary
  G.maxCombo = 0; G.runCaches = 0;   // reset run-summary stats
  G.gameSeed = seed != null ? (seed >>> 0) : (Math.random() * 0xffffffff) >>> 0;
  G.onboarding = !G.onboarded && !G.isDaily; G.firstMoveDone = false;
  initLevel(1);
}
function winLevel() {
  const pctBonus = Math.round(G.percent * 100) * G.level * 6, lifeBonus = G.lives * 350;
  // speed bonus: reward the time you had left on the clock
  G.lastTimeBonus = Math.max(0, Math.round((G.levelTimeMax - G.levelT) * (8 + G.level)));
  // bold clear: reward overshooting the target in one daring sweep (Qix/Xonix risk-reward)
  G.lastOverBonus = boldClearBonus(G.percent, G.target, G.level);
  G.lastBonus = pctBonus + lifeBonus + G.lastTimeBonus + G.lastOverBonus; G.score += G.lastBonus;
  G.state = 'levelclear'; G.lcTimer = 2.9; G.flash = G.reduceMotion ? 0.2 : 0.5;
  sfxLevel();
  for (let i = 0; i < 60; i++)
    G.particles.push({ x: rand(0, PW), y: rand(PH * 0.4, PH), vx: rand(-20, 20), vy: rand(-120, -40), life: rand(1, 2), max: 2, r: rand(1.5, 3), col: G.pal.edge });
}
function nextLevel() {
  if (G.isDaily) { if (G.level >= DAILY_FLOORS) { completeDaily(); return; } initLevel(G.level + 1); return; }
  if (G.level % 3 === 0) G.lives++;
  initLevel(G.level + 1);
}

/* ----------------------------- update ---------------------------------- */
function update(dt) {
  if (G.reduceMotion) G.timeScale = 1;
  else if (G.hitstop > 0) { G.hitstop -= dt; G.timeScale = 0.16; }   // capture slow-mo: world crawls, fx play on
  else G.timeScale += (G.timeScaleTarget - G.timeScale) * Math.min(1, dt * 8);
  const wdt = dt * G.timeScale;
  G.time += dt; G.menuT += dt;
  if (G.drawSoundLock > 0) G.drawSoundLock -= dt;
  G.shakeAmt = Math.max(0, G.shakeAmt - 45 * dt);
  G.flash = Math.max(0, G.flash - dt * 1.8);
  if (G.introT > 0) G.introT = Math.max(0, G.introT - dt * 1.7);   // ~0.6s level fade-up
  G.zoom += (1 - G.zoom) * Math.min(1, dt * 6);
  if (G.banner.t > 0) G.banner.t -= dt;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  processReveal();
  tickShootingStars(wdt);
  updateParticles(wdt); updateRings(wdt);
  updatePopups(dt);
  updateMotes(wdt);
  G.dispScore += (G.score - G.dispScore) * Math.min(1, dt * 9);
  G.dispPercent += (G.percent - G.dispPercent) * Math.min(1, dt * 6);

  if (G.state === 'playing') {
    if (G.enemyFreezeT > 0) G.enemyFreezeT -= dt;
    if (G.enemySlowT > 0) G.enemySlowT -= dt;
    if (G.surgeT > 0) G.surgeT -= dt;
    if (G.scanT > 0) G.scanT -= dt;
    if (G.deathFreeze > 0) { G.deathFreeze -= dt; if (G.deathFreeze <= 0) finishDeath(); }
    else {
      updatePlayer(wdt);
      // the moment this run's live score overtakes your previous best, celebrate
      // it mid-play — the core "beat your high score" hook.
      if (!G.beatBestThisRun && G.prevHighScore > 0 && G.score > G.prevHighScore) {
        G.beatBestThisRun = true;
        spawnPopup(G.player.px.x, G.player.px.y - 30, 'NEW BEST!', '#ffe27a', 18);
        G.flash = G.reduceMotion ? 0.15 : 0.4; sfxBest();
      }
      G.levelT += dt;
      if (G.levelT >= G.levelTimeMax) timeoutDeath();          // ran out of time -> lose a life (Airxonix)
      else if (G.percent >= G.target) winLevel();              // auto-clear once the target is revealed
      else {
        if (G.enemyFreezeT <= 0) { const edt = wdt * (G.enemySlowT > 0 ? 0.38 : 1); for (const e of G.enemies) moveEnemy(e, edt); }
        maybeSpawnPickup(dt);
        updatePickups(dt);
        checkCollisions();
        if (G.player.invuln > 0) G.player.invuln -= dt;
      }
    }
    setPadLevel(G.percent / G.target);
  } else if (G.state === 'levelclear') {
    G.lcTimer -= dt;
    if (Math.random() < 0.4)
      G.particles.push({ x: rand(0, PW), y: PH + 6, vx: rand(-15, 15), vy: rand(-90, -40), life: rand(1.2, 2.2), max: 2.2, r: rand(1, 2.5), col: G.pal.edge });
    if (G.lcTimer <= 0) nextLevel();
  } else if (G.state === 'gameover') {
    G.goTimer += dt;
  }
  // soundtrack intensity is LEVEL-based: hold the early groove (the "initial
  // beat") consistently, and layer in energy as the levels climb — rather than
  // ramping within a level toward the target, which got busy too fast.
  let mi = 0.32;   // menu / scores
  if (G.state === 'playing') {
    const perLevel = G.isDaily ? 0.042 : 0.013;        // daily is only 10 floors, so ramp faster
    mi = Math.min(0.42 + (G.level - 1) * perLevel, 0.82);
  } else if (G.state === 'levelclear') mi = 0.8;        // brief celebratory peak
  else if (G.state === 'gameover') mi = 0.12;
  else if (G.state === 'paused') mi = 0.18;
  setMusicIntensity(mi);
}



/* ----------------------------- main render ----------------------------- */
function drawTouchUI() {
  // pause / resume button (top-right, inside the safe area)
  const r = pauseBtnRect();
  ctx.save();
  ctx.globalAlpha = 0.45; ctx.fillStyle = '#0a1430';
  roundRectPath(r.x, r.y, r.w, r.h, 11); ctx.fill();
  ctx.globalAlpha = 0.9; ctx.fillStyle = G.pal ? G.pal.edge2 : '#cfe6ff';
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  if (G.state === 'paused') {
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 9); ctx.lineTo(cx - 6, cy + 9); ctx.lineTo(cx + 10, cy); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(cx - 8, cy - 9, 5, 18); ctx.fillRect(cx + 3, cy - 9, 5, 18);
  }
  ctx.restore();

  // floating joystick — retro arcade gate (octagon) + neon square knob
  if (G.joyActive && G.state === 'playing') {
    const maxR = CELL * 2.4;
    const dx = joyX - joyOX, dy = joyY - joyOY, len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, maxR), tx = joyOX + dx / len * cl, ty = joyOY + dy / len * cl;
    ctx.save();
    ctx.globalAlpha = 0.32; ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 3;
    ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8, px = joyOX + Math.cos(a) * maxR, py = joyOY + Math.sin(a) * maxR; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0;
    const k = CELL * 0.9;
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#ff2d95'; ctx.fillRect(tx - k / 2, ty - k / 2, k, k);
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(tx - k / 2, ty - k / 2, k, k);
    ctx.restore();
  }

  // first-run coach: teach drag-to-steer until the player first moves
  if (G.onboarding && !G.firstMoveDone && G.state === 'playing') {
    const ox = CW / 2, oy = CH - 120 - safeBottom;
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 3);
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.3 * pulse; ctx.strokeStyle = G.pal.edge2; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ox, oy, 34, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.7; ctx.fillStyle = G.pal.edge;
    ctx.beginPath(); ctx.arc(ox + Math.cos(G.time * 2) * 16, oy + Math.sin(G.time * 2) * 16, 14, 0, TAU); ctx.fill();
    ctx.restore();
    glowText('DRAG ANYWHERE TO STEER', ox, oy - 58, 15, '#dff1ff', { blur: 12, weight: 800, spacing: 2, alpha: 0.6 + 0.4 * pulse });
  }
}
function render() {
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
  ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, CW, CH);
  if (G.state === 'menu') { drawAttractWorld(); drawMenu(); drawVignette(CW, CH, 0.5); return; }
  if (G.state === 'scores') { drawAttractWorld(); drawScores(); drawVignette(CW, CH, 0.5); return; }
  drawWorld(); drawHUD();
  if (G.state === 'playing' || G.state === 'paused') drawTouchUI();
  if (G.state === 'levelclear') drawLevelClear();
  else if (G.state === 'gameover') drawGameOver();
  else if (G.state === 'paused') drawPaused();
  drawScanlines(CW, CH, 0.3);   // lighter CRT over gameplay than the menu
}

/* ----------------------------- loop ------------------------------------ */
let last = 0;
function frame(now) {
  if (!last) last = now;
  let dt = (now - last) / 1000; last = now;
  if (dt > 1 / 30) dt = 1 / 30;
  update(dt); render();
  requestAnimationFrame(frame);
}
try { document.fonts.load("700 16px 'Press Start 2P'"); document.fonts.load("400 16px 'VT323'"); } catch (e) {}
initMotes();
requestAnimationFrame(frame);

/* ----------------------------- input ----------------------------------- */
const DIRS = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
  W: { x: 0, y: -1 }, S: { x: 0, y: 1 }, A: { x: -1, y: 0 }, D: { x: 1, y: 0 },
};
function toggleReduce() {
  G.reduceMotion = !G.reduceMotion;
  try { localStorage.setItem('veil_reduce', G.reduceMotion ? '1' : '0'); } catch (e) {}
  if (G.reduceMotion) { G.shakeAmt = 0; G.zoom = 1; G.timeScale = 1; G.timeScaleTarget = 1; }
  if (G.state === 'playing') spawnPopup(G.player.px.x, G.player.px.y, 'MOTION ' + (G.reduceMotion ? 'OFF' : 'ON'), G.pal.edge2, 14);
}
function startDaily() {
  G.dailyRunKey = todayKey(new Date());
  G.isDaily = true;
  startGame(seedFromDateKey(G.dailyRunKey));
}
function shareDailyResult() {
  if (G.dailyResultText) shareResult(G.dailyResultText);
}
function recordDailyStreak(key) {
  if (G.dailyStreakDate === key) return;                 // already counted today
  G.dailyStreak = isConsecutive(G.dailyStreakDate, key) ? G.dailyStreak + 1 : 1;
  G.dailyStreakDate = key;
  try { localStorage.setItem('veil_daily_streak', String(G.dailyStreak)); } catch (e) {}
  try { localStorage.setItem('veil_daily_streak_date', G.dailyStreakDate); } catch (e) {}
}
function anyKeyAction() {
  initAudio();
  if (G.state === 'gameover' && G.isDaily) { shareDailyResult(); G.isDaily = false; G.state = 'menu'; sfxBlip(); return; }
  if (G.state === 'menu' || G.state === 'gameover') { G.isDaily = false; startGame(); sfxBlip(); }
  else if (G.state === 'levelclear') { nextLevel(); sfxBlip(); }
  else if (G.state === 'paused') G.state = 'playing';
}
// Abandon the current run and return to the title (from pause or game-over).
function goHome() { G.isDaily = false; G.joyActive = false; G.joyDir = null; G.state = 'menu'; sfxBlip(); }
window.addEventListener('keydown', (e) => {
  initAudio();
  const k = e.key;
  // dev-only level navigation (dev server build only):  [ / ] step, 1-9 jump
  if (import.meta.env.DEV && (G.state === 'playing' || G.state === 'paused')) {
    if (k === ']') { initLevel(G.level + 1); return; }
    if (k === '[') { initLevel(Math.max(1, G.level - 1)); return; }
    if (k >= '1' && k <= '9') { initLevel(parseInt(k, 10)); return; }
  }
  if (k === 'm' || k === 'M') { setMuted(!isMuted()); return; }
  if (k === 'r' || k === 'R') { toggleReduce(); return; }
  if ((k === 'q' || k === 'Q') && (G.state === 'paused' || G.state === 'gameover')) { goHome(); return; }
  if (G.state === 'scores') { goHome(); return; }   // any key leaves the scores view
  if (G.state === 'playing') {
    if (DIRS[k]) { G.buffered = DIRS[k]; e.preventDefault(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') G.state = 'paused';
    return;
  }
  if (G.state === 'paused') { if (k === 'p' || k === 'P' || k === 'Escape') G.state = 'playing'; return; }
  if (k === 'Escape') return;
  // On the title, don't let a stray key launch a run — only Enter/Space = PLAY.
  // (Result screens below still continue on any key, which is expected there.)
  if (G.state === 'menu') { if (k === 'Enter' || k === ' ') { anyKeyAction(); e.preventDefault(); } return; }
  anyKeyAction(); e.preventDefault();
}, { passive: false });

/* ----- touch: floating joystick (steer) + auto-forward + pause button ---- */
let joyOX = 0, joyOY = 0, joyX = 0, joyY = 0;

function localPt(t) {
  const r = canvas.getBoundingClientRect();
  const sx = r.width ? CW / r.width : 1, sy = r.height ? CH / r.height : 1;
  return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
}
function inRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
// Snap the drag vector to a 4-way grid direction, ignoring a small dead zone.
function steerFromVec(dx, dy) {
  const dz = Math.max(9, CELL * 0.45);
  if (Math.abs(dx) < dz && Math.abs(dy) < dz) return null;
  return Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
}

function joyStart(p) { G.joyActive = true; joyOX = p.x; joyOY = p.y; joyX = p.x; joyY = p.y; G.joyDir = null; }
function joyMove(p) {
  joyX = p.x; joyY = p.y;
  const d = steerFromVec(p.x - joyOX, p.y - joyOY);
  if (d) { G.joyDir = d; G.buffered = d; }   // held dir is re-applied each frame in updatePlayer
}
function joyEnd() { G.joyActive = false; G.joyDir = null; }   // stop steering, keep advancing

// Unified pointer-down for BOTH touch and mouse, so desktop hits the same
// buttons as a phone. (The old mouse handler ignored position, so the DAILY
// button and the pause/home buttons did nothing under a mouse.)
function pointerDown(p) {
  initAudio();
  if (G.state === 'playing') {
    if (inRect(p.x, p.y, pauseBtnRect())) { G.state = 'paused'; return; }
    if (inRect(p.x, p.y, muteBtnRect())) { setMuted(!isMuted()); sfxBlip(); return; }   // quick mute
    joyStart(p); return;
  }
  if (G.state === 'paused') {
    if (inRect(p.x, p.y, pauseMuteRect())) { setMuted(!isMuted()); sfxBlip(); return; }
    if (inRect(p.x, p.y, pauseMotionRect())) { toggleReduce(); return; }
    if (inRect(p.x, p.y, pauseHomeRect())) { goHome(); return; }
    G.state = 'playing'; return;
  }
  if (G.state === 'scores') { goHome(); return; }
  if (G.state === 'gameover') {
    if (inRect(p.x, p.y, goBtnRects().home)) { goHome(); return; }
    anyKeyAction(); return;   // anywhere else: retry (or share + menu for the daily)
  }
  if (G.state === 'levelclear') { anyKeyAction(); return; }
  // menu — start a run ONLY from the PLAY button; clicking empty space does
  // nothing (no more "click anywhere on the title to play").
  if (inRect(p.x, p.y, dailyBtnRect())) { startDaily(); sfxBlip(); return; }
  if (inRect(p.x, p.y, scoresBtnRect())) { G.state = 'scores'; sfxBlip(); return; }
  if (inRect(p.x, p.y, playBtnRect())) anyKeyAction();   // PLAY
}

canvas.addEventListener('touchstart', (e) => { pointerDown(localPt(e.changedTouches[0])); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { if (G.joyActive && G.state === 'playing') joyMove(localPt(e.changedTouches[0])); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchend', (e) => { joyEnd(); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchcancel', () => { joyEnd(); });

// Mouse mirrors touch — including drag-to-steer on desktop (matches "DRAG TO STEER").
canvas.addEventListener('mousedown', (e) => { pointerDown(localPt(e)); });
window.addEventListener('mousemove', (e) => { if (G.joyActive && G.state === 'playing') joyMove(localPt(e)); });
window.addEventListener('mouseup', () => { joyEnd(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (G.state === 'playing') G.state = 'paused'; }
  else resumeAudio();   // browser suspends the context when hidden; revive it on return
  last = 0;
});
