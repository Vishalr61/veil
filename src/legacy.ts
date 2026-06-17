/* =========================================================================
   VEIL  —  draw light into the dark   ·   v2
   Territory-capture game. Cut continuous lines through a dark veil to
   enclose space and reveal the nebula beneath, while drifters hunt you.
   Single-file, no dependencies. Plays from file:// (just open index.html).
   ========================================================================= */

'use strict';

import { hapticLight, hapticMedium, hapticHeavy } from './platform/haptics.js';
import { TAU, clamp, lerp, rand } from './core/math';
import { SeededRng } from './core/rng';
import { genVeilBoard, VEIL_CACHE, VEIL_HAZARD } from './sim/veil';
import { genObstacles, openInteriorCount } from './sim/terrain';
import { todayKey, seedFromDateKey, shareText, isConsecutive } from './daily/daily';
import { shareResult } from './platform/share';
import { EMPTY, FILLED, TRAIL, OBSTACLE, COMBO_WINDOW, SS } from './core/constants';
import { ENEMY_COL, ENEMY_GLOW, CHASER_COL, CHASER_GLOW } from './core/palettes';
import { bandForLevel, BANDS } from './core/bands';
import { genNebula, genFog } from './render/background';
import { canvas, ctx } from './render/surface';
import { glowText, drawScanlines, roundRectPath } from './render/primitives';
import {
  COLS, ROWS, CELL, PW, PH, MARGIN, HUD_H, CW, CH, OFF_X, OFF_Y, INTERIOR_TOTAL,
  safeTop, safeBottom, computeLayout, applyCanvasSize, setInteriorTotal,
} from './core/dims';
import { G } from './game/state';
import { cellIndex, centerPx, cellOfPx } from './core/grid';
import { drawWorld, tickShootingStars } from './render/world';
import { spawnPopup, updatePopups, updateParticles, initMotes, updateMotes } from './game/particles';
import { eCell, ENEMY_INFO, genEnemies, moveEnemy } from './game/enemies';
import { recomputeBorderPath, recomputePercent, doCapture } from './game/capture';
import { playBtnRect, dailyBtnRect, pauseBtnRect } from './render/geometry';
import { drawHUD } from './render/hud';
import { drawMenu, drawLevelClear, drawGameOver, drawPaused, drawAttractWorld } from './render/overlays';
import {
  initAudio, setMuted, isMuted, setPadLevel,
  sfxStartDraw, sfxCapture, sfxBold, sfxDeath, sfxLevel, sfxPickup, sfxShield, sfxBlip, sfxBest,
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
try { (localStorage.getItem('veil_seen_enemies') || '').split(',').forEach(s => s && G.seenEnemies.add(s)); } catch (e) {}
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
    if (Math.random() < 0.5) {
      const c = centerPx(idx), ang = Math.random() * TAU, sp = rand(15, 70);
      G.particles.push({ x: c.x, y: c.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: rand(0.3, 0.9), max: 0.9, r: rand(1, 2.6), col: Math.random() < 0.5 ? G.pal.blobs[4] : G.pal.edge });
    }
  }
}

/* ----------------------------- power-ups ------------------------------- */
const PU_TYPES = [
  { type: 'score',  w: 34, col: '#ffe27a', label: 'score' },
  { type: 'freeze', w: 20, col: '#8fe6ff', label: 'freeze' },
  { type: 'slow',   w: 20, col: '#9fb8ff', label: 'slow' },
  { type: 'shield', w: 16, col: '#7dffc4', label: 'shield' },
  { type: 'life',   w: 8,  col: '#ff8fb0', label: 'life' },
];
function pickPU() {
  const total = PU_TYPES.reduce((s, p) => s + p.w, 0);
  let r = G.rng.next() * total;
  for (const p of PU_TYPES) { if ((r -= p.w) <= 0) return p; }
  return PU_TYPES[0];
}
function maybeSpawnPickup(dt) {
  G.pickupSpawnT -= dt;
  if (G.pickupSpawnT > 0 || G.pickups.length >= 2) return;
  G.pickupSpawnT = G.rng.range(7, 12);
  const pcell = cellOfPx(G.player.px);
  let idx = -1;
  for (let t = 0; t < 50; t++) {
    const cx = 2 + G.rng.int(COLS - 4), cy = 2 + G.rng.int(ROWS - 4);
    const i = cy * COLS + cx;
    if (G.grid[i] !== EMPTY) continue;
    if (Math.abs(cx - pcell % COLS) + Math.abs(cy - (pcell / COLS | 0)) < 5) continue;
    idx = i; break;
  }
  if (idx === -1) return;
  const def = pickPU();
  const c = centerPx(idx);
  G.pickups.push({ x: c.x, y: c.y, cell: idx, type: def.type, col: def.col, life: 13, max: 13, bob: Math.random() * TAU });
}
function updatePickups(dt) {
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const p = G.pickups[i];
    p.life -= dt; p.bob += dt * 3;
    // disappear if its cell got captured under it
    if (G.grid[p.cell] !== EMPTY || p.life <= 0) { G.pickups.splice(i, 1); continue; }
    if (Math.hypot(G.player.px.x - p.x, G.player.px.y - p.y) < CELL * 0.95) {
      applyPickup(p); G.pickups.splice(i, 1);
    }
  }
}
function applyPickup(p) {
  sfxPickup(); hapticLight();
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * TAU, sp = rand(40, 150);
    G.particles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.9), max: 0.9, r: rand(1.2, 3), col: p.col });
  }
  if (p.type === 'score') { const g = 400 + G.level * 150; G.score += g; spawnPopup(p.x, p.y, '+' + g, p.col, 18); }
  else if (p.type === 'freeze') { G.enemyFreezeT = 3.6; spawnPopup(p.x, p.y, 'FREEZE', p.col, 16); }
  else if (p.type === 'slow') { G.enemySlowT = 5.5; spawnPopup(p.x, p.y, 'SLOW', p.col, 16); }
  else if (p.type === 'shield') { G.shield = true; spawnPopup(p.x, p.y, 'SHIELD', p.col, 16); }
  else if (p.type === 'life') { G.lives++; spawnPopup(p.x, p.y, '+1 LIFE', p.col, 16); }
}

/* ----------------------------- player ---------------------------------- */
function chooseDir(ax, ay) {
  if (G.buffered) {
    const nx = ax + G.buffered.x, ny = ay + G.buffered.y;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) { G.buffered = null; }
    else {
      const i = ny * COLS + nx;
      if (G.grid[i] !== TRAIL && G.grid[i] !== OBSTACLE) { const d = G.buffered; G.buffered = null; return d; }
      G.buffered = null;
    }
  }
  if (G.player.dir) {
    const nx = ax + G.player.dir.x, ny = ay + G.player.dir.y;
    if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && G.grid[ny * COLS + nx] !== TRAIL && G.grid[ny * COLS + nx] !== OBSTACLE) return G.player.dir;
  }
  return null;
}
function arrive() {
  const arrived = G.player.to, prev = G.player.from;
  G.player.from = arrived;
  const ax = arrived % COLS, ay = (arrived / COLS) | 0, v = G.grid[arrived];
  if (v === EMPTY) {
    if (!G.hasTrail) {
      G.hasTrail = true; G.trailCells = []; G.trailPoints = [centerPx(prev)];
      if (G.drawSoundLock <= 0) { sfxStartDraw(); hapticLight(); G.drawSoundLock = 0.25; }
    }
    G.grid[arrived] = TRAIL; G.trailCells.push(arrived); G.trailPoints.push(centerPx(arrived));
  } else if (v === FILLED) {
    if (G.hasTrail) { G.trailPoints.push(centerPx(arrived)); doCapture(); if (G.percent >= G.target) winLevel(); }
  }
  const nd = chooseDir(ax, ay);
  if (nd) { G.player.dir = nd; G.player.to = (ay + nd.y) * COLS + (ax + nd.x); G.player.stopped = false; }
  else { G.player.stopped = true; G.player.to = arrived; }
}
function hasEscape(idx) {
  const x = idx % COLS, y = (idx / COLS) | 0;
  const ns = [cellIndex(x + 1, y), cellIndex(x - 1, y), cellIndex(x, y + 1), cellIndex(x, y - 1)];
  for (const n of ns) if (n !== -1 && G.grid[n] !== TRAIL && G.grid[n] !== OBSTACLE) return true;
  return false;
}
function updatePlayer(dt) {
  // Continuously honor a held joystick direction so a turn lands at the next valid cell.
  if (joyActive && joyDir && !G.buffered) G.buffered = joyDir;
  if (G.onboarding && !G.firstMoveDone && !G.player.stopped) G.firstMoveDone = true;
  if (G.player.stopped) {
    const ax = G.player.to % COLS, ay = (G.player.to / COLS) | 0, nd = chooseDir(ax, ay);
    if (nd) {
      G.player.dir = nd; G.player.from = G.player.to; G.player.to = (ay + nd.y) * COLS + (ax + nd.x);
      G.player.stopped = false; G.player.t = 0;
    } else if (G.hasTrail && !hasEscape(G.player.to)) {
      respawnAt();   // boxed in by trail/rock — snap the line back, resume on safe ground (no penalty)
    }
  }
  if (!G.player.stopped) {
    // snappier over captured land, deliberate while drawing
    const seg = G.baseSpeed * (G.grid[G.player.from] === FILLED ? 1.45 : 1.0);
    G.player.t += seg * dt;
    let guard = 0;
    while (G.player.t >= 1 && !G.player.stopped) { G.player.t -= 1; arrive(); if (++guard > COLS + ROWS) break; }
    if (G.player.stopped) G.player.t = 0;
  }
  const a = centerPx(G.player.from), b = centerPx(G.player.to);
  G.player.px = { x: lerp(a.x, b.x, G.player.t), y: lerp(a.y, b.y, G.player.t) };
  G.player.tail.push({ x: G.player.px.x, y: G.player.px.y });
  if (G.player.tail.length > 14) G.player.tail.shift();
  if (G.hasTrail && Math.random() < 0.5)
    G.particles.push({ x: G.player.px.x, y: G.player.px.y, vx: rand(-12, 12), vy: rand(-12, 12), life: rand(0.25, 0.5), max: 0.5, r: rand(0.8, 1.8), col: G.pal.trail });
}
function nearestFilled(idx) {
  if (G.grid[idx] === FILLED) return idx;
  const seen = new Uint8Array(COLS * ROWS), q = [idx]; seen[idx] = 1;
  let head = 0;
  while (head < q.length) {
    const i = q[head++], x = i % COLS, y = (i / COLS) | 0;
    const ns = [cellIndex(x + 1, y), cellIndex(x - 1, y), cellIndex(x, y + 1), cellIndex(x, y - 1)];
    for (const n of ns) { if (n === -1 || seen[n]) continue; if (G.grid[n] === FILLED) return n; seen[n] = 1; q.push(n); }
  }
  return (COLS >> 1);
}

/* ----------------------------- collisions / death ---------------------- */
function checkCollisions() {
  const pc = cellOfPx(G.player.px), safe = G.grid[pc] === FILLED;
  for (const e of G.enemies) {
    if (e.type === 'sleeper' && e.asleep) continue;   // dormant: harmless until woken
    const ec = eCell(e);
    if (G.grid[ec] === TRAIL) { triggerDeath(); return; }
    if (!safe && G.player.invuln <= 0 && Math.hypot(G.player.px.x - e.x, G.player.px.y - e.y) < CELL * 0.78) { triggerDeath(); return; }
  }
}
function respawnAt() {
  clearTrail();
  const safe = nearestFilled(cellOfPx(G.player.px));
  G.player.from = G.player.to = safe; G.player.t = 0; G.player.dir = null; G.player.stopped = true; G.player.tail = [];
  G.buffered = null;
}
function triggerDeath() {
  if (G.deathFreeze > 0 || G.player.invuln > 0 || G.state !== 'playing') return;
  if (G.shield) {
    G.shield = false; G.player.invuln = 1.4; G.flash = G.reduceMotion ? 0.2 : 0.4; G.shakeAmt = G.reduceMotion ? 0 : 8;
    sfxShield(); hapticMedium(); spawnPopup(G.player.px.x, G.player.px.y, 'BLOCKED', G.pal.edge2, 16);
    for (let i = 0; i < 24; i++) { const ang = Math.random() * TAU, sp = rand(60, 200); G.particles.push({ x: G.player.px.x, y: G.player.px.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.8), max: 0.8, r: rand(1.2, 3), col: G.pal.edge2 }); }
    respawnAt();
    return;
  }
  G.lives--; G.combo = 0; G.comboT = 0;
  G.shakeAmt = G.reduceMotion ? 0 : 16; G.flash = G.reduceMotion ? 0.25 : 0.8; G.deathFreeze = 0.5;
  if (!G.reduceMotion) G.timeScaleTarget = 0.22;
  sfxDeath(); hapticHeavy();
  for (let i = 0; i < 46; i++) {
    const ang = Math.random() * TAU, sp = rand(40, 220);
    G.particles.push({ x: G.player.px.x, y: G.player.px.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 1.0), max: 1.0, r: rand(1.5, 3.5), col: i % 3 === 0 ? '#ffffff' : G.pal.player });
  }
}
function finishDeath() {
  G.deathFreeze = 0; G.timeScaleTarget = 1;
  if (G.lives <= 0) {
    G.state = 'gameover'; G.goTimer = 0;
    clearTrail();
    if (G.score > G.highScore) { G.highScore = G.score; try { localStorage.setItem('veil_highscore', String(G.highScore)); } catch (e) {} sfxBest(); }
    if (G.isDaily) {
      recordDailyStreak(G.dailyRunKey);
      G.dailyResultText = shareText({ key: G.dailyRunKey, score: G.score, level: G.level, percent: G.percent, streak: G.dailyStreak });
      if (G.score > G.dailyBest) { G.dailyBest = G.score; try { localStorage.setItem('veil_daily_best', String(G.dailyBest)); } catch (e) {} }
      G.dailyPlayedKey = G.dailyRunKey; try { localStorage.setItem('veil_daily_played', G.dailyPlayedKey); } catch (e) {}
    }
    return;
  }
  respawnAt(); G.player.invuln = 1.7;
}
function clearTrail() {
  for (const idx of G.trailCells) if (G.grid[idx] === TRAIL) G.grid[idx] = EMPTY;
  G.trailCells = []; G.trailPoints = []; G.hasTrail = false;
}

/* ----------------------------- flow ------------------------------------ */
function initLevel(lv) {
  G.level = lv;
  G.rng = new SeededRng(G.gameSeed).fork('lv' + lv); // deterministic per-level simulation stream
  G.pal = bandForLevel(lv);
  G.grid = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      G.grid[y * COLS + x] = (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? FILLED : EMPTY;
  const obst = genObstacles(G.rng.fork('terrain'), { cols: COLS, rows: ROWS, level: lv, startIdx: COLS >> 1 });
  for (let i = 0; i < G.grid.length; i++) if (obst[i]) G.grid[i] = OBSTACLE;
  setInteriorTotal(openInteriorCount(obst, COLS, ROWS));   // target denominator excludes rock
  G.veilBoard = genVeilBoard(G.rng.fork('veil'), { cols: COLS, rows: ROWS, level: lv, isOpen: (i) => G.grid[i] === EMPTY });

  G.nebula = genNebula(G.pal, lv, PW, PH); G.fog = genFog(G.pal, PW, PH); genTwinkles();
  for (let i = 0; i < G.grid.length; i++) if (G.grid[i] === FILLED || G.grid[i] === OBSTACLE) clearFogCell(i);

  const start = (COLS >> 1);
  G.player = { from: start, to: start, t: 0, dir: null, stopped: true, invuln: 1.0, tail: [], px: centerPx(start) };
  G.buffered = null; G.hasTrail = false; G.trailCells = []; G.trailPoints = [];
  G.enemies = genEnemies(lv);

  G.baseSpeed = Math.min(11 + 0.6 * (lv - 1), 18);
  G.target = Math.min(0.66 + 0.02 * (lv - 1), 0.82);

  G.combo = 0; G.comboT = 0;
  G.shakeAmt = 0; G.flash = 0; G.zoom = 1; G.deathFreeze = 0; G.timeScale = 1; G.timeScaleTarget = 1;
  G.enemyFreezeT = 0; G.enemySlowT = 0; G.shield = false;
  G.pickups.length = 0; G.popups.length = 0; G.particles.length = 0; G.revealQueue.length = 0;
  G.pickupSpawnT = G.rng.range(5, 8);
  recomputeBorderPath(); recomputePercent(); G.dispPercent = G.percent;
  G.banner = { text: 'LEVEL ' + lv, sub: G.pal.name.toUpperCase() + '  ·  reveal ' + Math.round(G.target * 100) + '%', t: 2.0 };
  // first time a non-basic enemy appears, teach what it does (once ever)
  for (const et of ['chaser', 'cutter']) {
    if (!G.seenEnemies.has(et) && G.enemies.some((e) => e.type === et)) {
      G.seenEnemies.add(et);
      try { localStorage.setItem('veil_seen_enemies', [...G.seenEnemies].join(',')); } catch (e) {}
      G.banner = { text: ENEMY_INFO[et].name, sub: ENEMY_INFO[et].desc, t: 3.4, enemy: et };
      break;
    }
  }
  G.hintActive = (lv === 1);
  G.state = 'playing';
}
function startGame(seed?: number) {
  G.score = 0; G.dispScore = 0; G.lives = 3;
  G.gameSeed = seed != null ? (seed >>> 0) : (Math.random() * 0xffffffff) >>> 0;
  G.onboarding = !G.onboarded && !G.isDaily; G.firstMoveDone = false;
  initLevel(1);
}
function winLevel() {
  const pctBonus = Math.round(G.percent * 100) * G.level * 6, lifeBonus = G.lives * 350;
  G.lastBonus = pctBonus + lifeBonus; G.score += G.lastBonus;
  G.state = 'levelclear'; G.lcTimer = 2.9; G.flash = G.reduceMotion ? 0.2 : 0.5;
  sfxLevel();
  for (let i = 0; i < 60; i++)
    G.particles.push({ x: rand(0, PW), y: rand(PH * 0.4, PH), vx: rand(-20, 20), vy: rand(-120, -40), life: rand(1, 2), max: 2, r: rand(1.5, 3), col: G.pal.edge });
}
function nextLevel() { if (G.level % 3 === 0) G.lives++; initLevel(G.level + 1); }

/* ----------------------------- update ---------------------------------- */
function update(dt) {
  if (G.reduceMotion) G.timeScale = 1; else G.timeScale += (G.timeScaleTarget - G.timeScale) * Math.min(1, dt * 8);
  const wdt = dt * G.timeScale;
  G.time += dt; G.menuT += dt;
  if (G.drawSoundLock > 0) G.drawSoundLock -= dt;
  G.shakeAmt = Math.max(0, G.shakeAmt - 45 * dt);
  G.flash = Math.max(0, G.flash - dt * 1.8);
  G.zoom += (1 - G.zoom) * Math.min(1, dt * 6);
  if (G.banner.t > 0) G.banner.t -= dt;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  processReveal();
  tickShootingStars(wdt);
  updateParticles(wdt);
  updatePopups(dt);
  updateMotes(wdt);
  G.dispScore += (G.score - G.dispScore) * Math.min(1, dt * 9);
  G.dispPercent += (G.percent - G.dispPercent) * Math.min(1, dt * 6);

  if (G.state === 'playing') {
    if (G.enemyFreezeT > 0) G.enemyFreezeT -= dt;
    if (G.enemySlowT > 0) G.enemySlowT -= dt;
    if (G.deathFreeze > 0) { G.deathFreeze -= dt; if (G.deathFreeze <= 0) finishDeath(); }
    else {
      updatePlayer(wdt);
      if (G.enemyFreezeT <= 0) { const edt = wdt * (G.enemySlowT > 0 ? 0.38 : 1); for (const e of G.enemies) moveEnemy(e, edt); }
      maybeSpawnPickup(dt);
      updatePickups(dt);
      checkCollisions();
      if (G.player.invuln > 0) G.player.invuln -= dt;
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
  if (joyActive && G.state === 'playing') {
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
  if (G.state === 'menu') { drawAttractWorld(); drawMenu(); drawScanlines(CW, CH); return; }
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
  if (G.state === 'playing') {
    if (DIRS[k]) { G.buffered = DIRS[k]; e.preventDefault(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') G.state = 'paused';
    return;
  }
  if (G.state === 'paused') { if (k === 'p' || k === 'P' || k === 'Escape') G.state = 'playing'; return; }
  if (k === 'Escape') return;
  anyKeyAction(); e.preventDefault();
}, { passive: false });

/* ----- touch: floating joystick (steer) + auto-forward + pause button ---- */
let joyActive = false, joyOX = 0, joyOY = 0, joyX = 0, joyY = 0, joyDir = null;

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

canvas.addEventListener('touchstart', (e) => {
  initAudio();
  const t = e.changedTouches[0], p = localPt(t);
  if (G.state === 'playing') {
    if (inRect(p.x, p.y, pauseBtnRect())) { G.state = 'paused'; e.preventDefault(); return; }
    joyActive = true; joyOX = p.x; joyOY = p.y; joyX = p.x; joyY = p.y; joyDir = null;
  } else if (G.state === 'paused') {
    G.state = 'playing';
  } else {
    if (G.state === 'menu' && inRect(p.x, p.y, dailyBtnRect())) { startDaily(); sfxBlip(); }
    else anyKeyAction();
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!joyActive || G.state !== 'playing') return;
  const t = e.changedTouches[0], p = localPt(t);
  joyX = p.x; joyY = p.y;
  const d = steerFromVec(p.x - joyOX, p.y - joyOY);
  if (d) { joyDir = d; G.buffered = d; }  // held dir is re-applied each frame in updatePlayer
  e.preventDefault();
}, { passive: false });

// Lift finger -> stop steering, but keep advancing in the last direction.
canvas.addEventListener('touchend', (e) => { joyActive = false; joyDir = null; e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchcancel', () => { joyActive = false; joyDir = null; });

canvas.addEventListener('mousedown', () => { initAudio(); if (G.state !== 'playing' && G.state !== 'paused') anyKeyAction(); });

document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') G.state = 'paused'; last = 0; });
