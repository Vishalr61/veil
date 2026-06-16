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
import {
  initAudio, setMuted, isMuted, setPadLevel,
  sfxStartDraw, sfxCapture, sfxBold, sfxDeath, sfxLevel, sfxPickup, sfxShield, sfxBlip, sfxBest,
} from './audio/audio';

/* ----------------------------- config ---------------------------------- */
/* Layout is derived from the device viewport at startup (see computeLayout)
   so the play field fills the screen in portrait instead of letterboxing.
   These are seeded with sane defaults and overwritten before first render. */
let COLS = 24, ROWS = 44, CELL = 16;
let PW = COLS * CELL, PH = ROWS * CELL;
let MARGIN = 0, HUD_H = 64;
let CW = PW, CH = HUD_H + PH;
let OFF_X = 0, OFF_Y = HUD_H;
let INTERIOR_TOTAL = (COLS - 2) * (ROWS - 2);
let safeTop = 0, safeBottom = 0;

/* ----------------------------- utilities ------------------------------- */

function cellIndex(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
  return y * COLS + x;
}
function centerPx(idx) {
  const x = idx % COLS, y = (idx / COLS) | 0;
  return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
}
function cellOfPx(px) {
  const cx = clamp(Math.floor(px.x / CELL), 0, COLS - 1);
  const cy = clamp(Math.floor(px.y / CELL), 0, ROWS - 1);
  return cy * COLS + cx;
}
function createSurface(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * SS);
  c.height = Math.round(h * SS);
  const cx = c.getContext('2d');
  cx.setTransform(SS, 0, 0, SS, 0, 0);
  return { canvas: c, ctx: cx, w, h };
}

/* ----------------------------- canvas / layout ------------------------- */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

// Read iOS/Android safe-area insets (notch / home indicator). Needs the page
// meta to use viewport-fit=cover, which index.html sets.
function readSafeInsets() {
  // Read the --sat/--sab custom properties (defined in index.html with env()).
  // Reading resolved CSS vars off :root is more reliable than a probe element.
  try {
    const cs = getComputedStyle(document.documentElement);
    safeTop = parseFloat(cs.getPropertyValue('--sat')) || 0;
    safeBottom = parseFloat(cs.getPropertyValue('--sab')) || 0;
  } catch (e) { safeTop = 0; safeBottom = 0; }
}

// Derive grid dimensions + offsets so the play field fills the viewport.
function computeLayout() {
  readSafeInsets();
  const vw = Math.max(320, window.innerWidth | 0);
  const vh = Math.max(480, window.innerHeight | 0);
  CW = vw; CH = vh; MARGIN = 0;
  HUD_H = Math.round(Math.min(70, vh * 0.06) + safeTop + 10);
  const top = HUD_H, bottom = vh - Math.max(safeBottom, 6), availH = bottom - top;
  const cell = clamp(Math.round(vw / 23), 12, 34);   // ~23 columns on a phone
  COLS = Math.max(14, Math.floor(vw / cell));
  ROWS = Math.max(16, Math.floor(availH / cell));
  CELL = cell;
  PW = COLS * CELL; PH = ROWS * CELL;
  OFF_X = Math.floor((vw - PW) / 2);
  OFF_Y = top + Math.floor((availH - PH) / 2);
  INTERIOR_TOTAL = (COLS - 2) * (ROWS - 2);
}
function applyCanvasSize() {
  canvas.width = Math.round(CW * SS);
  canvas.height = Math.round(CH * SS);
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
}
let lastVW = 0, lastVH = 0;
function relayout(force) {
  const vw = window.innerWidth | 0, vh = window.innerHeight | 0;
  // Ignore tiny changes (mobile URL-bar show/hide) to avoid resetting mid-play.
  if (!force && Math.abs(vw - lastVW) < 40 && Math.abs(vh - lastVH) < 40) return;
  lastVW = vw; lastVH = vh;
  computeLayout(); applyCanvasSize();
  menuNebula = null;
  // Grid dimensions may have changed; rebuild the current level to stay valid.
  if (state === 'playing' || state === 'paused') initLevel(level);
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

/* ----------------------------- settings -------------------------------- */
let reduceMotion = false;
try { reduceMotion = localStorage.getItem('veil_reduce') === '1'; } catch (e) {}

/* ----------------------------- state ----------------------------------- */
let grid = new Uint8Array(COLS * ROWS);
let veilBoard: Uint8Array = new Uint8Array(0);   // hidden content per cell, revealed on capture
let state = 'menu';
let gameSeed = 1;                   // per-run seed; the daily challenge will set this to a date seed
let rng = new SeededRng(gameSeed);  // seeded simulation stream, re-forked per level in initLevel
let isDaily = false;                // is the current run the daily challenge?
let dailyRunKey = '';               // date key of the active/last daily run
let dailyResultText = '';           // shareable result, built at daily game over
let dailyBest = 0, dailyPlayedKey = '';
try { dailyBest = parseInt(localStorage.getItem('veil_daily_best') || '0', 10) || 0; } catch (e) {}
try { dailyPlayedKey = localStorage.getItem('veil_daily_played') || ''; } catch (e) {}
let dailyStreak = 0, dailyStreakDate = '';
try { dailyStreak = parseInt(localStorage.getItem('veil_daily_streak') || '0', 10) || 0; } catch (e) {}
try { dailyStreakDate = localStorage.getItem('veil_daily_streak_date') || ''; } catch (e) {}
let onboarded = false;                 // has the player completed the first-run teach?
try { onboarded = localStorage.getItem('veil_onboarded') === '1'; } catch (e) {}
let onboarding = false, firstMoveDone = false;
let level = 1;
let score = 0, dispScore = 0;
let highScore = 0;
try { highScore = parseInt(localStorage.getItem('veil_highscore') || '0', 10) || 0; } catch (e) {}
let lives = 3;
let combo = 0, comboT = 0;
let percent = 0, dispPercent = 0;
let target = 0.68;
let baseSpeed = 9.5;
let time = 0, menuT = 0;
let lcTimer = 0, goTimer = 0;
let lastBonus = 0;

let player = null, buffered = null;
let hasTrail = false, trailCells = [], trailPoints = [];
let enemies = [], particles = [], motes = [], popups = [], pickups = [], twinkles = [];
let revealQueue = [];

let nebula = null, fog = null, pal = bandForLevel(1);
let borderPath = null;

let shakeAmt = 0, flash = 0, zoom = 1;
let timeScale = 1, timeScaleTarget = 1;     // global (death cinematic only)
let deathFreeze = 0, drawSoundLock = 0;
let enemyFreezeT = 0, enemySlowT = 0;        // power-up effects on enemies
let shield = false;
let pickupSpawnT = 6;
let shootingStars = [], shootTimer = 4;
let banner = { text: '', sub: '', t: 0 };
let hintActive = false;

/* ----------------------------- background art -------------------------- */
function genNebula(p, level?: number) {
  level = level || 1;
  const s = createSurface(PW, PH), c = s.ctx;
  c.fillStyle = '#04050d'; c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'lighter';

  // band style drives the backdrop flavor (magma / caves / ocean / surface / sky / aurora / space)
  const style = p.style || 'space';
  const big = style === 'magma' || style === 'surface';
  const wispy = style === 'aurora' || style === 'sky';
  const dense = style === 'space' || style === 'ocean';

  // nebula clouds
  const blobCount = dense ? 60 : big ? 32 : 44;
  for (let i = 0; i < blobCount; i++) {
    const col = p.blobs[(Math.random() * p.blobs.length) | 0];
    const x = rand(-80, PW + 80), y = rand(-60, PH + 60);
    const r = big ? rand(160, 360) : dense ? rand(36, 150) : rand(70, 300);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(0.4, col + '66'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.2, 0.5); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // signature accent per band
  if (style === 'magma') {
    for (let i = 0; i < 7; i++) {                       // glowing lava veins rising from below
      let vx = rand(0, PW), vy = PH + 10;
      c.globalAlpha = rand(0.3, 0.6); c.strokeStyle = p.blobs[3]; c.lineWidth = rand(1.5, 3.5);
      c.shadowColor = p.edge; c.shadowBlur = 8; c.beginPath(); c.moveTo(vx, vy);
      for (let k = 0; k < 6; k++) { vx += rand(-30, 30); vy -= rand(40, 80); c.lineTo(vx, vy); }
      c.stroke();
    }
    c.shadowBlur = 0;
  } else if (style === 'caves') {
    for (let i = 0; i < 14; i++) {                      // crystal shards
      const x = rand(0, PW), y = rand(0, PH), h = rand(20, 60), w = rand(6, 16);
      c.globalAlpha = rand(0.15, 0.4); c.fillStyle = p.blobs[3];
      c.save(); c.translate(x, y); c.rotate(rand(0, TAU));
      c.beginPath(); c.moveTo(0, -h); c.lineTo(w, h * 0.5); c.lineTo(-w, h * 0.5); c.closePath(); c.fill();
      c.restore();
    }
  } else if (style === 'sky') {
    for (let i = 0; i < 6; i++) {                        // soft horizontal cloud bands
      const y = rand(0, PH), h = rand(40, 110);
      const g = c.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, p.blobs[4] + '40'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = rand(0.2, 0.5); c.fillStyle = g; c.fillRect(0, y - h, PW, h * 2);
    }
  } else if (style === 'aurora') {
    for (let i = 0; i < 6; i++) {                        // vertical aurora ribbons
      const x = rand(0, PW), w = rand(30, 90), col = i % 2 ? p.blobs[3] : p.accent;
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col + '50'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = rand(0.25, 0.55); c.fillStyle = g; c.fillRect(x - w, 0, w * 2, PH);
    }
  }

  // dust filaments / lanes — structure, not just round blobs
  for (let i = 0, n = wispy ? 11 : 5; i < n; i++) {
    const col = p.blobs[2 + ((Math.random() * 3) | 0)], len = rand(120, 380);
    c.save();
    c.translate(rand(0, PW), rand(0, PH)); c.rotate(rand(0, TAU));
    const g = c.createLinearGradient(-len / 2, 0, len / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col + '40'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.1, 0.24); c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, len / 2, rand(8, 22), 0, 0, TAU); c.fill();
    c.restore();
  }

  // bright cores
  for (let i = 0; i < 5; i++) {
    const x = rand(PW * 0.2, PW * 0.8), y = rand(PH * 0.2, PH * 0.8), r = rand(40, 110);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, p.blobs[p.blobs.length - 1]); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.4, 0.72); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // a focal landmark: a distant galaxy — gives the level a sense of place
  const gx = rand(PW * 0.25, PW * 0.75), gy = rand(PH * 0.22, PH * 0.6), gr = rand(64, 116);
  const gg = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
  gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.2, p.blobs[p.blobs.length - 1]);
  gg.addColorStop(0.55, p.blobs[2] + '66'); gg.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.62; c.fillStyle = gg;
  c.beginPath(); c.arc(gx, gy, gr, 0, TAU); c.fill();
  for (let k = 0; k < 64; k++) {                 // flattened halo of stars around it
    const a = rand(0, TAU), rr = rand(6, gr * 0.92);
    c.globalAlpha = rand(0.3, 0.9); c.fillStyle = p.star;
    c.beginPath(); c.arc(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr * 0.5, rand(0.4, 1.3), 0, TAU); c.fill();
  }

  // star field — varied sizes, a few tinted stars
  for (let i = 0, n = (style === 'sky' || style === 'surface') ? 150 : dense ? 420 : 320; i < n; i++) {
    const x = Math.random() * PW, y = Math.random() * PH, a = Math.random();
    const r = a > 0.92 ? rand(1.2, 2.4) : rand(0.4, 1.1);
    c.globalAlpha = rand(0.25, 0.95); c.fillStyle = a > 0.97 ? p.edge2 : p.star;
    if (a > 0.95) { c.shadowColor = p.star; c.shadowBlur = 6; } else c.shadowBlur = 0;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  // open star clusters
  c.shadowBlur = 0;
  for (let cl = 0; cl < 3; cl++) {
    const cxs = rand(PW * 0.1, PW * 0.9), cys = rand(PH * 0.1, PH * 0.9);
    for (let k = 0; k < 22; k++) {
      c.globalAlpha = rand(0.3, 0.9); c.fillStyle = p.star;
      c.beginPath(); c.arc(cxs + rand(-26, 26), cys + rand(-26, 26), rand(0.4, 1.2), 0, TAU); c.fill();
    }
  }

  c.shadowBlur = 0; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  return s;
}
function genTwinkles() {
  twinkles = [];
  for (let i = 0; i < 90; i++) {
    twinkles.push({ x: Math.random() * PW, y: Math.random() * PH, r: rand(0.6, 1.8), phase: Math.random() * TAU, spd: rand(1.5, 4) });
  }
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Band-specific texture on the dark veil — the surface the player actually stares at.
function fogSignature(c, pal, style) {
  const d1 = pal.blobs[1], d2 = pal.blobs[2];
  if (style === 'caves') {                              // rocky angular shards
    for (let i = 0; i < 26; i++) {
      const x = rand(0, PW), y = rand(0, PH), w = rand(20, 60), h = rand(14, 40);
      c.globalAlpha = rand(0.12, 0.24); c.fillStyle = d1;
      c.save(); c.translate(x, y); c.rotate(rand(-0.4, 0.4));
      c.beginPath(); c.moveTo(-w / 2, h / 2); c.lineTo(0, -h / 2); c.lineTo(w / 2, h / 2); c.closePath(); c.fill();
      c.restore();
    }
  } else if (style === 'ocean') {                       // horizontal caustic ripples
    for (let i = 0; i < 28; i++) {
      c.globalAlpha = rand(0.04, 0.1); c.fillStyle = d2;
      c.beginPath(); c.ellipse(rand(0, PW), rand(0, PH), rand(40, 120), rand(1.5, 4), 0, 0, TAU); c.fill();
    }
  } else if (style === 'sky') {                         // soft cloud cover
    for (let i = 0; i < 18; i++) {
      const x = rand(0, PW), y = rand(0, PH), r = rand(34, 96);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(d2, 0.14)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 1; c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  } else if (style === 'magma') {                       // ember cracks
    for (let i = 0; i < 12; i++) {
      let x = rand(0, PW), y = rand(0, PH);
      c.globalAlpha = 1; c.strokeStyle = hexA(pal.blobs[3], 0.22); c.lineWidth = rand(0.6, 1.6);
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rand(-40, 40); y += rand(-40, 40); c.lineTo(x, y); }
      c.stroke();
    }
  } else if (style === 'aurora') {                      // faint vertical shimmer
    for (let i = 0; i < 8; i++) {
      const x = rand(0, PW), w = rand(20, 60);
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, hexA(pal.blobs[3], 0.1)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 1; c.fillStyle = g; c.fillRect(x - w, 0, w * 2, PH);
    }
  } else if (style === 'surface') {                     // organic mottling
    for (let i = 0; i < 30; i++) {
      c.globalAlpha = rand(0.08, 0.18); c.fillStyle = d2;
      c.beginPath(); c.arc(rand(0, PW), rand(0, PH), rand(10, 36), 0, TAU); c.fill();
    }
  } else {                                              // space: faint stars in the dark
    for (let i = 0; i < 120; i++) {
      c.globalAlpha = rand(0.05, 0.22); c.fillStyle = pal.star;
      c.beginPath(); c.arc(Math.random() * PW, Math.random() * PH, rand(0.3, 0.9), 0, TAU); c.fill();
    }
  }
  c.globalAlpha = 1;
}
function genFog(pal) {
  const style = pal.style || 'space';
  const s = createSurface(PW, PH), c = s.ctx;
  const d0 = pal.blobs[0], d1 = pal.blobs[1];           // band-tinted near-black
  c.fillStyle = d0; c.fillRect(0, 0, PW, PH);
  const g = c.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, hexA(d1, 0.5)); g.addColorStop(1, hexA(d0, 0));   // subtle lift up top
  c.fillStyle = g; c.fillRect(0, 0, PW, PH);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * PW, y = Math.random() * PH, r = rand(40, 160);
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, Math.random() > 0.5 ? 'rgba(0,0,0,0.5)' : hexA(d1, 0.16));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  fogSignature(c, pal, style);
  for (let i = 0; i < 500; i++) {
    c.globalAlpha = rand(0.02, 0.06);
    c.fillStyle = Math.random() > 0.5 ? hexA(d1, 1) : '#000';
    c.fillRect(Math.random() * PW, Math.random() * PH, 1.4, 1.4);
  }
  c.globalAlpha = 1;
  return s;
}
function clearFogCell(idx) {
  const x = idx % COLS, y = (idx / COLS) | 0, c = fog.ctx;
  c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
  c.fillRect(x * CELL, y * CELL, CELL, CELL); c.restore();
}

/* ----------------------------- grid / capture -------------------------- */
function recomputeBorderPath() {
  const p = new Path2D();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y * COLS + x] !== FILLED) continue;
      const x0 = x * CELL, y0 = y * CELL, x1 = x0 + CELL, y1 = y0 + CELL;
      let n = cellIndex(x + 1, y); if (n !== -1 && grid[n] !== FILLED) { p.moveTo(x1, y0); p.lineTo(x1, y1); }
      n = cellIndex(x - 1, y); if (n !== -1 && grid[n] !== FILLED) { p.moveTo(x0, y0); p.lineTo(x0, y1); }
      n = cellIndex(x, y + 1); if (n !== -1 && grid[n] !== FILLED) { p.moveTo(x0, y1); p.lineTo(x1, y1); }
      n = cellIndex(x, y - 1); if (n !== -1 && grid[n] !== FILLED) { p.moveTo(x0, y0); p.lineTo(x1, y0); }
    }
  }
  borderPath = p;
}
function recomputePercent() {
  let f = 0;
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 1; x < COLS - 1; x++)
      if (grid[y * COLS + x] === FILLED) f++;
  percent = f / INTERIOR_TOTAL;
}

function veilBurst(x: number, y: number, col: string) {
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * TAU, sp = rand(40, 165);
    particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.9), max: 0.9, r: rand(1.2, 3), col });
  }
}
function doCapture() {
  for (const idx of trailCells) grid[idx] = FILLED;

  const reach = new Uint8Array(COLS * ROWS), stack = [];
  for (const e of enemies) {
    const i = eCell(e);
    if (grid[i] === EMPTY && !reach[i]) { reach[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop(), x = i % COLS, y = (i / COLS) | 0;
    const ns = [cellIndex(x + 1, y), cellIndex(x - 1, y), cellIndex(x, y + 1), cellIndex(x, y - 1)];
    for (const nn of ns) if (nn !== -1 && grid[nn] === EMPTY && !reach[nn]) { reach[nn] = 1; stack.push(nn); }
  }

  const captured = [];
  for (let i = 0; i < grid.length; i++)
    if (grid[i] === EMPTY && !reach[i]) { grid[i] = FILLED; captured.push(i); }
  for (const idx of trailCells) captured.push(idx);

  // sweeping reveal: queue cells by distance from the closing point
  const origin = player.px;
  for (const idx of captured) {
    const c = centerPx(idx);
    revealQueue.push({ idx, d: Math.hypot(c.x - origin.x, c.y - origin.y) });
  }
  revealQueue.sort((a, b) => a.d - b.d);

  const area = captured.length;
  if (area > 0) {
    if (comboT > 0) combo++; else combo = 1;
    comboT = COMBO_WINDOW;
    const mult = comboMult();
    // anti-nibble: value per cell rises with cut size
    const valuePerCell = 4 + Math.min(area, 220) * 0.12;
    const gained = Math.round(area * valuePerCell * mult);
    score += gained;
    spawnPopup(origin.x, origin.y - 6, '+' + gained, pal.edge2, area > 50 ? 20 : 15);
    if (combo >= 3) spawnPopup(origin.x, origin.y - 26, 'x' + mult.toFixed(1) + ' CHAIN', pal.accent, 14);
    if (area >= 60) {
      const bonus = Math.round(area * 6 * mult);
      score += bonus;
      spawnPopup(origin.x, origin.y + 14, 'BOLD CUT  +' + bonus, '#ffe27a', 18);
      sfxBold(); hapticHeavy();
      flash = reduceMotion ? 0.2 : 0.55;
      zoom = reduceMotion ? 1 : 1 + Math.min(0.05, area * 0.0006);
    } else {
      hapticMedium();
      flash = reduceMotion ? 0.08 : Math.min(0.35, 0.1 + area * 0.003);
      zoom = reduceMotion ? 1 : 1 + Math.min(0.025, area * 0.0004);
    }
    shakeAmt = reduceMotion ? 0 : Math.min(10, 2.5 + area * 0.04);
    sfxCapture(combo);
    hintActive = false;
    if (onboarding) {                    // first-ever capture: the "whoa" beat
      onboarding = false; onboarded = true;
      try { localStorage.setItem('veil_onboarded', '1'); } catch (e) {}
      banner = { text: 'THE COSMOS REVEALS', sub: 'enclose more to clear the level', t: 2.4 };
    }
  }

  // veil-as-discovery: capturing uncovers whatever the dark was hiding here
  for (const idx of captured) {
    const v = veilBoard[idx];
    if (!v) continue;
    veilBoard[idx] = 0;
    const c = centerPx(idx);
    if (v === VEIL_CACHE) {
      const bonus = 250 + level * 60;
      score += bonus;
      spawnPopup(c.x, c.y, '✦ +' + bonus, '#ffe27a', 15);
      veilBurst(c.x, c.y, '#ffe27a');
      hapticMedium();
    } else if (v === VEIL_HAZARD) {
      combo = 0; comboT = 0;                                   // a rift breaks your chain
      spawnPopup(c.x, c.y, '✶ RIFT', '#ff6a8a', 15);
      flash = reduceMotion ? 0.12 : 0.35; shakeAmt = reduceMotion ? 0 : Math.max(shakeAmt, 8);
      veilBurst(c.x, c.y, '#ff6a8a');
      hapticHeavy();
    }
  }

  trailCells = []; trailPoints = []; hasTrail = false;
  recomputeBorderPath();
  recomputePercent();
  if (percent >= target) winLevel();
}

function processReveal() {
  if (!revealQueue.length) return;
  const n = Math.max(2, Math.ceil(revealQueue.length / 7)); // finishes in ~7 frames
  for (let k = 0; k < n && revealQueue.length; k++) {
    const { idx } = revealQueue.shift();
    clearFogCell(idx);
    if (Math.random() < 0.5) {
      const c = centerPx(idx), ang = Math.random() * TAU, sp = rand(15, 70);
      particles.push({ x: c.x, y: c.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: rand(0.3, 0.9), max: 0.9, r: rand(1, 2.6), col: Math.random() < 0.5 ? pal.blobs[4] : pal.edge });
    }
  }
}

function comboMult() { return Math.min(1 + 0.3 * (combo - 1), 6); }

/* ----------------------------- popups / particles ---------------------- */
function spawnPopup(x, y, text, color, size) {
  popups.push({ x, y, vy: -26, life: 1.1, max: 1.1, text, color, size: size || 14 });
}
function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy * dt; p.vy *= 0.92; p.life -= dt;
    if (p.life <= 0) popups.splice(i, 1);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function initMotes() {
  motes.length = 0;
  for (let i = 0; i < 46; i++)
    motes.push({ x: Math.random() * PW, y: Math.random() * PH, vx: rand(-6, 6), vy: rand(-6, 6), r: rand(0.5, 1.6), a: rand(0.05, 0.3) });
}
function updateMotes(dt) {
  for (const m of motes) {
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.x < 0) m.x += PW; else if (m.x > PW) m.x -= PW;
    if (m.y < 0) m.y += PH; else if (m.y > PH) m.y -= PH;
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
  let r = rng.next() * total;
  for (const p of PU_TYPES) { if ((r -= p.w) <= 0) return p; }
  return PU_TYPES[0];
}
function maybeSpawnPickup(dt) {
  pickupSpawnT -= dt;
  if (pickupSpawnT > 0 || pickups.length >= 2) return;
  pickupSpawnT = rng.range(7, 12);
  const pcell = cellOfPx(player.px);
  let idx = -1;
  for (let t = 0; t < 50; t++) {
    const cx = 2 + rng.int(COLS - 4), cy = 2 + rng.int(ROWS - 4);
    const i = cy * COLS + cx;
    if (grid[i] !== EMPTY) continue;
    if (Math.abs(cx - pcell % COLS) + Math.abs(cy - (pcell / COLS | 0)) < 5) continue;
    idx = i; break;
  }
  if (idx === -1) return;
  const def = pickPU();
  const c = centerPx(idx);
  pickups.push({ x: c.x, y: c.y, cell: idx, type: def.type, col: def.col, life: 13, max: 13, bob: Math.random() * TAU });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt; p.bob += dt * 3;
    // disappear if its cell got captured under it
    if (grid[p.cell] !== EMPTY || p.life <= 0) { pickups.splice(i, 1); continue; }
    if (Math.hypot(player.px.x - p.x, player.px.y - p.y) < CELL * 0.95) {
      applyPickup(p); pickups.splice(i, 1);
    }
  }
}
function applyPickup(p) {
  sfxPickup(); hapticLight();
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * TAU, sp = rand(40, 150);
    particles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.9), max: 0.9, r: rand(1.2, 3), col: p.col });
  }
  if (p.type === 'score') { const g = 400 + level * 150; score += g; spawnPopup(p.x, p.y, '+' + g, p.col, 18); }
  else if (p.type === 'freeze') { enemyFreezeT = 3.6; spawnPopup(p.x, p.y, 'FREEZE', p.col, 16); }
  else if (p.type === 'slow') { enemySlowT = 5.5; spawnPopup(p.x, p.y, 'SLOW', p.col, 16); }
  else if (p.type === 'shield') { shield = true; spawnPopup(p.x, p.y, 'SHIELD', p.col, 16); }
  else if (p.type === 'life') { lives++; spawnPopup(p.x, p.y, '+1 LIFE', p.col, 16); }
}

/* ----------------------------- enemies --------------------------------- */
function eCell(e) {
  const cx = clamp(Math.floor(e.x / CELL), 0, COLS - 1);
  const cy = clamp(Math.floor(e.y / CELL), 0, ROWS - 1);
  return cy * COLS + cx;
}
function genEnemies(lv) {
  const out = [];
  const drifters = Math.min(2 + Math.floor((lv - 1) / 2), 7);
  const chasers = lv >= 3 ? Math.min(1 + Math.floor((lv - 3) / 3), 2) : 0;
  const sentinels = lv >= 2 ? Math.min(1 + Math.floor((lv - 2) / 3), 3) : 0;   // punish edge-camping
  const sleepers = lv >= 4 ? Math.min(1 + Math.floor((lv - 4) / 3), 3) : 0;    // dormant under the veil
  const spd = Math.min(115 + 8 * (lv - 1), 205);
  const sc = centerPx((COLS >> 1));
  function spawnCell(minGap, needEmpty) {
    let x = sc.x, y = sc.y, tries = 0, cx = 2, cy = 2;
    do {
      cx = 2 + rng.int(COLS - 4); cy = 2 + rng.int(ROWS - 4);
      x = (cx + 0.5) * CELL; y = (cy + 0.5) * CELL; tries++;
    } while ((Math.hypot(x - sc.x, y - sc.y) < CELL * minGap
      || (needEmpty ? grid[cy * COLS + cx] !== EMPTY : grid[cy * COLS + cx] === OBSTACLE)) && tries < 60);
    return { x, y };
  }
  function place(type, speed) {
    const p = spawnCell(7, false), comp = speed * 0.7071;
    out.push({ x: p.x, y: p.y, vx: (rng.next() < 0.5 ? -1 : 1) * comp, vy: (rng.next() < 0.5 ? -1 : 1) * comp,
      r: CELL * 0.42, type, speed, comp, steerT: rng.range(0.2, 0.6) });
  }
  function placeSleeper(speed) {
    const p = spawnCell(6, true);
    out.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: CELL * 0.42, type: 'sleeper', asleep: true, speed, comp: speed * 0.7071, steerT: 0 });
  }
  for (let i = 0; i < drifters; i++) place('drifter', spd);
  for (let i = 0; i < chasers; i++) place('chaser', spd * 0.74);
  for (let i = 0; i < sentinels; i++) place('sentinel', spd * 0.82);
  for (let i = 0; i < sleepers; i++) placeSleeper(spd * 0.95);
  return out;
}
function moveEnemy(e, dt) {
  // veil-sleeper: dormant until a capture reveals it or the player draws near
  if (e.type === 'sleeper' && e.asleep) {
    const woke = grid[eCell(e)] === FILLED || (player && Math.hypot(player.px.x - e.x, player.px.y - e.y) < CELL * 3);
    if (!woke) return;
    e.asleep = false; e.steerT = 0;
    flash = reduceMotion ? 0.12 : 0.3; shakeAmt = reduceMotion ? 0 : Math.max(shakeAmt, 7);
    hapticHeavy(); spawnPopup(e.x, e.y, 'WOKE', '#ff5c6e', 16);
  }
  // chasers + awake sleepers always hunt; sentinels hunt only while you rest on safe ground
  const hunting = e.type === 'chaser' || (e.type === 'sleeper' && !e.asleep)
    || (e.type === 'sentinel' && player && grid[cellOfPx(player.px)] === FILLED);
  if (hunting) {
    e.steerT -= dt;
    if (e.steerT <= 0) {
      e.steerT = e.type === 'sentinel' ? 0.5 : 0.4;
      const dx = player.px.x - e.x, dy = player.px.y - e.y;
      e.vx = (dx === 0 ? (e.vx > 0 ? 1 : -1) : Math.sign(dx)) * e.comp;
      e.vy = (dy === 0 ? (e.vy > 0 ? 1 : -1) : Math.sign(dy)) * e.comp;
    }
  }
  let nx = e.x + e.vx * dt;
  const cyc = clamp(Math.floor(e.y / CELL), 0, ROWS - 1);
  const cxn = Math.floor((nx + Math.sign(e.vx) * e.r) / CELL);
  if (cxn < 0 || cxn >= COLS || grid[cyc * COLS + cxn] === FILLED || grid[cyc * COLS + cxn] === OBSTACLE) { e.vx = -e.vx; nx = e.x; }
  e.x = nx;
  let ny = e.y + e.vy * dt;
  const cxc = clamp(Math.floor(e.x / CELL), 0, COLS - 1);
  const cyn = Math.floor((ny + Math.sign(e.vy) * e.r) / CELL);
  if (cyn < 0 || cyn >= ROWS || grid[cyn * COLS + cxc] === FILLED || grid[cyn * COLS + cxc] === OBSTACLE) { e.vy = -e.vy; ny = e.y; }
  e.y = ny;
}

/* ----------------------------- player ---------------------------------- */
function chooseDir(ax, ay) {
  if (buffered) {
    const nx = ax + buffered.x, ny = ay + buffered.y;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) { buffered = null; }
    else {
      const i = ny * COLS + nx;
      if (grid[i] !== TRAIL && grid[i] !== OBSTACLE) { const d = buffered; buffered = null; return d; }
      buffered = null;
    }
  }
  if (player.dir) {
    const nx = ax + player.dir.x, ny = ay + player.dir.y;
    if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && grid[ny * COLS + nx] !== TRAIL && grid[ny * COLS + nx] !== OBSTACLE) return player.dir;
  }
  return null;
}
function arrive() {
  const arrived = player.to, prev = player.from;
  player.from = arrived;
  const ax = arrived % COLS, ay = (arrived / COLS) | 0, v = grid[arrived];
  if (v === EMPTY) {
    if (!hasTrail) {
      hasTrail = true; trailCells = []; trailPoints = [centerPx(prev)];
      if (drawSoundLock <= 0) { sfxStartDraw(); hapticLight(); drawSoundLock = 0.25; }
    }
    grid[arrived] = TRAIL; trailCells.push(arrived); trailPoints.push(centerPx(arrived));
  } else if (v === FILLED) {
    if (hasTrail) { trailPoints.push(centerPx(arrived)); doCapture(); }
  }
  const nd = chooseDir(ax, ay);
  if (nd) { player.dir = nd; player.to = (ay + nd.y) * COLS + (ax + nd.x); player.stopped = false; }
  else { player.stopped = true; player.to = arrived; }
}
function hasEscape(idx) {
  const x = idx % COLS, y = (idx / COLS) | 0;
  const ns = [cellIndex(x + 1, y), cellIndex(x - 1, y), cellIndex(x, y + 1), cellIndex(x, y - 1)];
  for (const n of ns) if (n !== -1 && grid[n] !== TRAIL && grid[n] !== OBSTACLE) return true;
  return false;
}
function updatePlayer(dt) {
  // Continuously honor a held joystick direction so a turn lands at the next valid cell.
  if (joyActive && joyDir && !buffered) buffered = joyDir;
  if (onboarding && !firstMoveDone && !player.stopped) firstMoveDone = true;
  if (player.stopped) {
    const ax = player.to % COLS, ay = (player.to / COLS) | 0, nd = chooseDir(ax, ay);
    if (nd) {
      player.dir = nd; player.from = player.to; player.to = (ay + nd.y) * COLS + (ax + nd.x);
      player.stopped = false; player.t = 0;
    } else if (hasTrail && !hasEscape(player.to)) {
      respawnAt();   // boxed in by trail/rock — snap the line back, resume on safe ground (no penalty)
    }
  }
  if (!player.stopped) {
    // snappier over captured land, deliberate while drawing
    const seg = baseSpeed * (grid[player.from] === FILLED ? 1.45 : 1.0);
    player.t += seg * dt;
    let guard = 0;
    while (player.t >= 1 && !player.stopped) { player.t -= 1; arrive(); if (++guard > COLS + ROWS) break; }
    if (player.stopped) player.t = 0;
  }
  const a = centerPx(player.from), b = centerPx(player.to);
  player.px = { x: lerp(a.x, b.x, player.t), y: lerp(a.y, b.y, player.t) };
  player.tail.push({ x: player.px.x, y: player.px.y });
  if (player.tail.length > 14) player.tail.shift();
  if (hasTrail && Math.random() < 0.5)
    particles.push({ x: player.px.x, y: player.px.y, vx: rand(-12, 12), vy: rand(-12, 12), life: rand(0.25, 0.5), max: 0.5, r: rand(0.8, 1.8), col: pal.trail });
}
function nearestFilled(idx) {
  if (grid[idx] === FILLED) return idx;
  const seen = new Uint8Array(COLS * ROWS), q = [idx]; seen[idx] = 1;
  let head = 0;
  while (head < q.length) {
    const i = q[head++], x = i % COLS, y = (i / COLS) | 0;
    const ns = [cellIndex(x + 1, y), cellIndex(x - 1, y), cellIndex(x, y + 1), cellIndex(x, y - 1)];
    for (const n of ns) { if (n === -1 || seen[n]) continue; if (grid[n] === FILLED) return n; seen[n] = 1; q.push(n); }
  }
  return (COLS >> 1);
}

/* ----------------------------- collisions / death ---------------------- */
function checkCollisions() {
  const pc = cellOfPx(player.px), safe = grid[pc] === FILLED;
  for (const e of enemies) {
    if (e.type === 'sleeper' && e.asleep) continue;   // dormant: harmless until woken
    const ec = eCell(e);
    if (grid[ec] === TRAIL) { triggerDeath(); return; }
    if (!safe && player.invuln <= 0 && Math.hypot(player.px.x - e.x, player.px.y - e.y) < CELL * 0.78) { triggerDeath(); return; }
  }
}
function respawnAt() {
  clearTrail();
  const safe = nearestFilled(cellOfPx(player.px));
  player.from = player.to = safe; player.t = 0; player.dir = null; player.stopped = true; player.tail = [];
  buffered = null;
}
function triggerDeath() {
  if (deathFreeze > 0 || player.invuln > 0 || state !== 'playing') return;
  if (shield) {
    shield = false; player.invuln = 1.4; flash = reduceMotion ? 0.2 : 0.4; shakeAmt = reduceMotion ? 0 : 8;
    sfxShield(); hapticMedium(); spawnPopup(player.px.x, player.px.y, 'BLOCKED', pal.edge2, 16);
    for (let i = 0; i < 24; i++) { const ang = Math.random() * TAU, sp = rand(60, 200); particles.push({ x: player.px.x, y: player.px.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.8), max: 0.8, r: rand(1.2, 3), col: pal.edge2 }); }
    respawnAt();
    return;
  }
  lives--; combo = 0; comboT = 0;
  shakeAmt = reduceMotion ? 0 : 16; flash = reduceMotion ? 0.25 : 0.8; deathFreeze = 0.5;
  if (!reduceMotion) timeScaleTarget = 0.22;
  sfxDeath(); hapticHeavy();
  for (let i = 0; i < 46; i++) {
    const ang = Math.random() * TAU, sp = rand(40, 220);
    particles.push({ x: player.px.x, y: player.px.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 1.0), max: 1.0, r: rand(1.5, 3.5), col: i % 3 === 0 ? '#ffffff' : pal.player });
  }
}
function finishDeath() {
  deathFreeze = 0; timeScaleTarget = 1;
  if (lives <= 0) {
    state = 'gameover'; goTimer = 0;
    clearTrail();
    if (score > highScore) { highScore = score; try { localStorage.setItem('veil_highscore', String(highScore)); } catch (e) {} sfxBest(); }
    if (isDaily) {
      recordDailyStreak(dailyRunKey);
      dailyResultText = shareText({ key: dailyRunKey, score, level, percent, streak: dailyStreak });
      if (score > dailyBest) { dailyBest = score; try { localStorage.setItem('veil_daily_best', String(dailyBest)); } catch (e) {} }
      dailyPlayedKey = dailyRunKey; try { localStorage.setItem('veil_daily_played', dailyPlayedKey); } catch (e) {}
    }
    return;
  }
  respawnAt(); player.invuln = 1.7;
}
function clearTrail() {
  for (const idx of trailCells) if (grid[idx] === TRAIL) grid[idx] = EMPTY;
  trailCells = []; trailPoints = []; hasTrail = false;
}

/* ----------------------------- flow ------------------------------------ */
function initLevel(lv) {
  level = lv;
  rng = new SeededRng(gameSeed).fork('lv' + lv); // deterministic per-level simulation stream
  pal = bandForLevel(lv);
  grid = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      grid[y * COLS + x] = (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? FILLED : EMPTY;
  const obst = genObstacles(rng.fork('terrain'), { cols: COLS, rows: ROWS, level: lv, startIdx: COLS >> 1 });
  for (let i = 0; i < grid.length; i++) if (obst[i]) grid[i] = OBSTACLE;
  INTERIOR_TOTAL = openInteriorCount(obst, COLS, ROWS);   // target denominator excludes rock
  veilBoard = genVeilBoard(rng.fork('veil'), { cols: COLS, rows: ROWS, level: lv, isOpen: (i) => grid[i] === EMPTY });

  nebula = genNebula(pal, lv); fog = genFog(pal); genTwinkles();
  for (let i = 0; i < grid.length; i++) if (grid[i] === FILLED || grid[i] === OBSTACLE) clearFogCell(i);

  const start = (COLS >> 1);
  player = { from: start, to: start, t: 0, dir: null, stopped: true, invuln: 1.0, tail: [], px: centerPx(start) };
  buffered = null; hasTrail = false; trailCells = []; trailPoints = [];
  enemies = genEnemies(lv);

  baseSpeed = Math.min(11 + 0.6 * (lv - 1), 18);
  target = Math.min(0.66 + 0.02 * (lv - 1), 0.82);

  combo = 0; comboT = 0;
  shakeAmt = 0; flash = 0; zoom = 1; deathFreeze = 0; timeScale = 1; timeScaleTarget = 1;
  enemyFreezeT = 0; enemySlowT = 0; shield = false;
  pickups.length = 0; popups.length = 0; particles.length = 0; revealQueue.length = 0;
  pickupSpawnT = rng.range(5, 8);
  recomputeBorderPath(); recomputePercent(); dispPercent = percent;
  banner = { text: 'LEVEL ' + lv, sub: pal.name.toUpperCase() + '  ·  reveal ' + Math.round(target * 100) + '%', t: 2.0 };
  hintActive = (lv === 1);
  state = 'playing';
}
function startGame(seed?: number) {
  score = 0; dispScore = 0; lives = 3;
  gameSeed = seed != null ? (seed >>> 0) : (Math.random() * 0xffffffff) >>> 0;
  onboarding = !onboarded && !isDaily; firstMoveDone = false;
  initLevel(1);
}
function winLevel() {
  const pctBonus = Math.round(percent * 100) * level * 6, lifeBonus = lives * 350;
  lastBonus = pctBonus + lifeBonus; score += lastBonus;
  state = 'levelclear'; lcTimer = 2.9; flash = reduceMotion ? 0.2 : 0.5;
  sfxLevel();
  for (let i = 0; i < 60; i++)
    particles.push({ x: rand(0, PW), y: rand(PH * 0.4, PH), vx: rand(-20, 20), vy: rand(-120, -40), life: rand(1, 2), max: 2, r: rand(1.5, 3), col: pal.edge });
}
function nextLevel() { if (level % 3 === 0) lives++; initLevel(level + 1); }

/* ----------------------------- update ---------------------------------- */
function update(dt) {
  if (reduceMotion) timeScale = 1; else timeScale += (timeScaleTarget - timeScale) * Math.min(1, dt * 8);
  const wdt = dt * timeScale;
  time += dt; menuT += dt;
  if (drawSoundLock > 0) drawSoundLock -= dt;
  shakeAmt = Math.max(0, shakeAmt - 45 * dt);
  flash = Math.max(0, flash - dt * 1.8);
  zoom += (1 - zoom) * Math.min(1, dt * 6);
  if (banner.t > 0) banner.t -= dt;
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
  processReveal();
  tickShootingStars(wdt);
  updateParticles(wdt);
  updatePopups(dt);
  updateMotes(wdt);
  dispScore += (score - dispScore) * Math.min(1, dt * 9);
  dispPercent += (percent - dispPercent) * Math.min(1, dt * 6);

  if (state === 'playing') {
    if (enemyFreezeT > 0) enemyFreezeT -= dt;
    if (enemySlowT > 0) enemySlowT -= dt;
    if (deathFreeze > 0) { deathFreeze -= dt; if (deathFreeze <= 0) finishDeath(); }
    else {
      updatePlayer(wdt);
      if (enemyFreezeT <= 0) { const edt = wdt * (enemySlowT > 0 ? 0.38 : 1); for (const e of enemies) moveEnemy(e, edt); }
      maybeSpawnPickup(dt);
      updatePickups(dt);
      checkCollisions();
      if (player.invuln > 0) player.invuln -= dt;
    }
    setPadLevel(percent / target);
  } else if (state === 'levelclear') {
    lcTimer -= dt;
    if (Math.random() < 0.4)
      particles.push({ x: rand(0, PW), y: PH + 6, vx: rand(-15, 15), vy: rand(-90, -40), life: rand(1.2, 2.2), max: 2.2, r: rand(1, 2.5), col: pal.edge });
    if (lcTimer <= 0) nextLevel();
  } else if (state === 'gameover') {
    goTimer += dt;
  }
}

/* ----------------------------- render helpers -------------------------- */
function setFont(size, weight, spacing, family) {
  const fam = family === 'pixel' ? "'Press Start 2P', monospace"
    : family === 'mono' ? "'VT323', monospace"
    : "'Segoe UI', system-ui, Arial, sans-serif";
  ctx.font = `${weight || 600} ${size}px ${fam}`;
  try { ctx.letterSpacing = (spacing || 0) + 'px'; } catch (e) {}
}
function glowText(txt, x, y, size, color, opts) {
  opts = opts || {};
  ctx.save();
  setFont(size, opts.weight, opts.spacing, opts.font);
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'middle';
  ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
  ctx.shadowColor = color; ctx.shadowBlur = opts.blur == null ? 18 : opts.blur;
  ctx.fillStyle = opts.fill || color; ctx.fillText(txt, x, y);
  ctx.shadowBlur = 0;
  if (opts.core) { ctx.fillStyle = opts.core; ctx.fillText(txt, x, y); }
  ctx.restore();
}
// retro title with chromatic aberration (cyan/magenta split + white core)
function retroTitle(txt, x, y, size, opts) {
  opts = opts || {};
  ctx.save();
  setFont(size, 400, opts.spacing || 0, 'pixel');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const off = Math.max(2, size * 0.06);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#00f0ff'; ctx.fillText(txt, x - off, y);
  ctx.fillStyle = '#ff2d95'; ctx.fillText(txt, x + off, y);
  ctx.globalAlpha = 1;
  ctx.shadowColor = opts.glow || '#7df9ff'; ctx.shadowBlur = opts.blur || 18;
  ctx.fillStyle = '#ffffff'; ctx.fillText(txt, x, y);
  ctx.restore();
}
// CRT scanlines + vignette overlay
function drawScanlines(vig?: number) {
  vig = vig == null ? 0.5 : vig;
  ctx.save();
  ctx.globalAlpha = 0.06; ctx.fillStyle = '#000';
  for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.3, CW / 2, CH / 2, CH * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${vig})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, CW, CH);
  ctx.restore();
}
// chunky double-bordered neon button
function retroButton(r, label, col) {
  ctx.save();
  ctx.globalAlpha = 0.82; ctx.fillStyle = '#0a0a16'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 3;
  ctx.shadowColor = col; ctx.shadowBlur = 12;
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.shadowBlur = 0; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
  ctx.restore();
  glowText(label, r.x + r.w / 2, r.y + r.h / 2, Math.min(13, r.h * 0.28), col, { blur: 8, font: 'pixel' });
}
function fmtScore(n) { return String(Math.round(n)).padStart(7, '0'); }
function drawGlowOrb(x, y, r, core, glow, glowR) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, glowR || r * 3);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, glowR || r * 3, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function pointAlong(pts, dist) {
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, len = Math.hypot(dx, dy);
    if (dist <= len) return { x: pts[i - 1].x + dx * (dist / len), y: pts[i - 1].y + dy * (dist / len) };
    dist -= len;
  }
  return pts[pts.length - 1];
}

/* ----------------------------- world render ---------------------------- */
// "Read the veil": a faint disturbance bleeds through the fog where content
// is hidden — it tells you WHERE, never WHAT, so the cache-or-rift gamble
// survives while attentive players can route around (or toward) the unknown.
function drawVeilTells() {
  if (!veilBoard.length) return;
  const px = player ? player.px : null;
  const scoutR = CELL * 3.6;            // how close you must be to sense type
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < veilBoard.length; i++) {
    const v = veilBoard[i];
    if (!v) continue;
    const c = centerPx(i);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.6 + i * 0.6);
    const baseR = CELL * (0.5 + 0.28 * pulse);
    // neutral disturbance: shows WHERE, always
    let g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, baseR);
    g.addColorStop(0, '#d6e6ff'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.05 + 0.06 * pulse;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y, baseR, 0, TAU); ctx.fill();
    // scout: get close to sense WHAT it is — gold cache / red rift
    if (px) {
      const scoutT = clamp(1 - Math.hypot(px.x - c.x, px.y - c.y) / scoutR, 0, 1);
      if (scoutT > 0.02) {
        const r2 = baseR * 1.15;
        g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r2);
        g.addColorStop(0, v === VEIL_CACHE ? '#ffd86a' : '#ff7a93');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.2 * scoutT;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c.x, c.y, r2, 0, TAU); ctx.fill();
      }
    }
  }
  ctx.restore();
}
function tickShootingStars(dt) {
  shootTimer -= dt;
  if (shootTimer <= 0) {
    shootTimer = rand(3.5, 8);
    const dir = Math.random() < 0.5 ? 1 : -1;
    shootingStars.push({
      x: dir > 0 ? rand(-20, PW * 0.4) : rand(PW * 0.6, PW + 20),
      y: rand(-20, PH * 0.35),
      vx: dir * rand(320, 520), vy: rand(150, 290),
      life: 0, max: rand(0.55, 1.0),
    });
  }
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life >= s.max) shootingStars.splice(i, 1);
  }
}
function drawShootingStars() {
  if (!shootingStars.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const s of shootingStars) {
    const a = Math.sin((s.life / s.max) * Math.PI);     // fade in then out
    const tx = s.x - s.vx * 0.045, ty = s.y - s.vy * 0.045;
    const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, pal.edge2);
    ctx.strokeStyle = g; ctx.globalAlpha = a * 0.9; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawObstacles() {
  ctx.save();
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (grid[y * COLS + x] !== OBSTACLE) continue;
      const px = x * CELL, py = y * CELL;
      ctx.fillStyle = pal.blobs[1];                      // band-tinted solid mass (ice/coral/rock/asteroid)
      ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = hexA(pal.edge2, 0.16); ctx.fillRect(px, py, CELL, 2);          // themed top light
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, py + CELL - 2, CELL, 2);  // bottom shadow
    }
  }
  ctx.restore();
}
function drawWorld() {
  const sx = (shakeAmt && !reduceMotion) ? rand(-shakeAmt, shakeAmt) : 0;
  const sy = (shakeAmt && !reduceMotion) ? rand(-shakeAmt, shakeAmt) : 0;
  ctx.save();
  const cxp = OFF_X + PW / 2, cyp = OFF_Y + PH / 2;
  ctx.translate(cxp, cyp); ctx.scale(zoom, zoom); ctx.translate(-cxp, -cyp);
  ctx.translate(OFF_X + sx, OFF_Y + sy);

  ctx.save();
  roundRectPath(0, 0, PW, PH, 8); ctx.clip();

  ctx.drawImage(nebula.canvas, 0, 0, PW, PH);

  // twinkles (hidden under fog where unrevealed)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of twinkles) {
    ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * t.spd + t.phase));
    ctx.fillStyle = pal.star;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // floating motes over the revealed cosmos
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) { ctx.globalAlpha = m.a; ctx.fillStyle = pal.star; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); }
  ctx.restore();

  ctx.drawImage(fog.canvas, 0, 0, PW, PH);
  drawVeilTells();
  drawShootingStars();
  drawObstacles();

  // coastline glow
  if (borderPath) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = pal.edge; ctx.shadowBlur = 14; ctx.strokeStyle = pal.edge;
    ctx.globalAlpha = 0.5; ctx.lineWidth = 3.5; ctx.stroke(borderPath);
    ctx.globalAlpha = 0.95; ctx.lineWidth = 1.4; ctx.shadowBlur = 6; ctx.strokeStyle = pal.edge2; ctx.stroke(borderPath);
    ctx.restore();
  }

  // power-ups
  for (const p of pickups) {
    const bob = Math.sin(p.bob) * 2.5;
    const fade = clamp(p.life / 2, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    drawGlowOrb(p.x, p.y + bob, 5.5, '#fff', p.col, 20);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = p.col; ctx.globalAlpha = fade * (0.5 + 0.4 * Math.sin(time * 6));
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 9 + Math.sin(time * 6) * 1.5, 0, TAU); ctx.stroke();
    ctx.restore();
    drawPUGlyph(p.type, p.x, p.y + bob, p.col, fade);
  }

  // trail
  if (hasTrail && trailPoints.length) {
    const pts = trailPoints.slice();
    if (player && player.px) pts.push(player.px);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.shadowColor = pal.accent; ctx.shadowBlur = 16; ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.5; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = pal.trail; ctx.globalAlpha = 1; ctx.shadowBlur = 8; ctx.lineWidth = 2.4; ctx.stroke();
    // live energy pulse running along the wire
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (total > 4) {
      const pos = pointAlong(pts, (time * 220) % total);
      ctx.globalCompositeOperation = 'lighter';
      drawGlowOrb(pos.x, pos.y, 2.4, '#fff', pal.edge2, 12);
    }
    ctx.restore();
  }

  // particles
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  ctx.restore();

  // enemies (danger glow scales with proximity to player)
  for (const e of enemies) {
    const pulse = 1 + Math.sin(time * 6 + e.x) * 0.08;
    const frozen = enemyFreezeT > 0;
    // dormant veil-sleeper: a faint tell under the dark, not a full threat glow
    if (e.type === 'sleeper' && e.asleep) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 + 0.12 * Math.sin(time * 2 + e.y);
      const dg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 2.4);
      dg.addColorStop(0, '#ff5c6e'); dg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 2.4, 0, TAU); ctx.fill(); ctx.restore();
      continue;
    }
    const isCh = e.type === 'chaser', isSent = e.type === 'sentinel', isSleep = e.type === 'sleeper';
    let prox = 0;
    if (player && player.px && state === 'playing') prox = clamp(1 - Math.hypot(player.px.x - e.x, player.px.y - e.y) / (CELL * 6), 0, 1);
    const col = frozen ? '#bfe9ff' : isSleep ? '#ff3a4e' : isSent ? '#ffb14a' : isCh ? CHASER_COL : ENEMY_COL;
    const glow = frozen ? '#bfe9ff' : isSleep ? '#ff6a4a' : isSent ? '#ffd07a' : isCh ? CHASER_GLOW : ENEMY_GLOW;
    drawGlowOrb(e.x, e.y, e.r * pulse, col, glow, e.r * (3.2 + prox * 2.4));
    if (prox > 0.35 && !frozen) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = glow; ctx.globalAlpha = (prox - 0.35) * 1.2 * (0.6 + 0.4 * Math.sin(time * 14));
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.9, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = frozen ? 'rgba(10,30,50,0.5)' : 'rgba(20,0,6,0.55)';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(e.x - e.r * 0.18, e.y - e.r * 0.18, e.r * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // player
  if (player && player.px && state === 'playing') {
    const blink = player.invuln > 0 ? (Math.sin(time * 30) > 0 ? 0.35 : 1) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < player.tail.length; i++) {
      const t = player.tail[i], a = (i / player.tail.length) * 0.5;
      ctx.globalAlpha = a * blink; ctx.fillStyle = pal.trail;
      ctx.beginPath(); ctx.arc(t.x, t.y, 2 + i * 0.25, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = blink; ctx.globalCompositeOperation = 'source-over';
    drawGlowOrb(player.px.x, player.px.y, 5.5, '#ffffff', pal.player, 22);
    ctx.globalCompositeOperation = 'lighter';
    // shield ring
    if (shield) {
      ctx.strokeStyle = '#7dffc4'; ctx.globalAlpha = (0.6 + 0.3 * Math.sin(time * 6)) * blink;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.px.x, player.px.y, 12, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = pal.accent; ctx.globalAlpha = (0.4 + 0.3 * Math.sin(time * 8)) * blink;
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(player.px.x, player.px.y, 9 + Math.sin(time * 8) * 1.5, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // popups
  for (const p of popups) {
    glowText(p.text, p.x, p.y, p.size, p.color, { blur: 12, weight: 800, alpha: clamp(p.life / p.max, 0, 1) });
  }

  ctx.restore(); // clip

  // frame + vignette
  ctx.save(); roundRectPath(0, 0, PW, PH, 8); ctx.strokeStyle = 'rgba(140,180,255,0.10)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  const vg = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.35, PW / 2, PH / 2, PH * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; roundRectPath(0, 0, PW, PH, 8); ctx.fill();

  // hint + banner (over board, crisp)
  if (hintActive && state === 'playing') {
    const a = 0.5 + 0.4 * Math.sin(time * 3);
    glowText('leave the edge, draw a loop, return — reveal the cosmos', PW / 2, PH - 26, 13, pal.edge2, { blur: 8, alpha: a, weight: 700, spacing: 1 });
  }
  if (banner.t > 0) {
    const a = clamp(banner.t, 0, 1) * clamp((2.0 - banner.t) * 3, 0, 1);
    glowText(banner.text, PW / 2, PH / 2 - 14, 24, pal.edge2, { blur: 22, font: 'pixel', spacing: 2, core: '#fff', alpha: a });
    glowText(banner.sub, PW / 2, PH / 2 + 20, 14, '#cfe6ff', { blur: 6, weight: 600, spacing: 2, alpha: a });
  }

  ctx.restore(); // world

  if (flash > 0.001) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${flash * 0.4})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
}
function drawPUGlyph(type, x, y, col, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = '#06121a'; ctx.fillStyle = '#06121a'; ctx.lineWidth = 1.6;
  ctx.translate(x, y);
  if (type === 'life') { ctx.beginPath(); ctx.moveTo(0, 2.4); ctx.bezierCurveTo(-3.4, -1.6, -1.2, -3.6, 0, -1.4); ctx.bezierCurveTo(1.2, -3.6, 3.4, -1.6, 0, 2.4); ctx.closePath(); ctx.fill(); }
  else if (type === 'shield') { ctx.beginPath(); ctx.moveTo(0, -3.4); ctx.lineTo(3, -2); ctx.lineTo(3, 1); ctx.lineTo(0, 3.6); ctx.lineTo(-3, 1); ctx.lineTo(-3, -2); ctx.closePath(); ctx.fill(); }
  else if (type === 'freeze') { for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -3.6); ctx.lineTo(0, 3.6); ctx.stroke(); ctx.restore(); } }
  else if (type === 'slow') { ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -2.6); ctx.moveTo(0, 0); ctx.lineTo(2, 0.6); ctx.stroke(); }
  else { ctx.beginPath(); for (let i = 0; i < 5; i++) { const ang = -Math.PI / 2 + i * TAU / 5; const ang2 = ang + TAU / 10; ctx.lineTo(Math.cos(ang) * 3.6, Math.sin(ang) * 3.6); ctx.lineTo(Math.cos(ang2) * 1.6, Math.sin(ang2) * 1.6); } ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

/* ----------------------------- HUD ------------------------------------- */
function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(6,9,20,0.55)'; ctx.fillRect(0, 0, CW, HUD_H);
  ctx.strokeStyle = 'rgba(120,170,255,0.12)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HUD_H - 0.5); ctx.lineTo(CW, HUD_H - 0.5); ctx.stroke();
  ctx.restore();
  const cy = safeTop + (HUD_H - safeTop) / 2;   // center below the notch / safe inset

  glowText('SCORE', MARGIN + 8, cy - 13, 11, '#6f86b8', { align: 'left', blur: 0, spacing: 1, font: 'mono' });
  glowText(fmtScore(dispScore), MARGIN + 8, cy + 6, 24, pal.trail, { align: 'left', blur: 8, font: 'mono', core: '#fff', spacing: 1 });

  // combo meter
  if (combo > 1 && state === 'playing') {
    const mx = MARGIN + 128, mw = 64;
    const mult = comboMult();
    glowText('x' + mult.toFixed(1), mx, cy - 9, 14, pal.accent, { align: 'left', blur: 10, weight: 800 });
    ctx.save();
    roundRectPath(mx, cy + 2, mw, 5, 2.5); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.clip();
    ctx.fillStyle = pal.accent; ctx.shadowColor = pal.accent; ctx.shadowBlur = 8;
    ctx.fillRect(mx, cy + 2, mw * clamp(comboT / COMBO_WINDOW, 0, 1), 5);
    ctx.restore();
  }

  // power-up status (center-left, under hint of bar)
  if (enemyFreezeT > 0) glowText('FREEZE ' + enemyFreezeT.toFixed(1), CW / 2 - 150, cy, 11, '#8fe6ff', { align: 'right', blur: 6, weight: 800, spacing: 1 });
  if (enemySlowT > 0) glowText('SLOW ' + enemySlowT.toFixed(1), CW / 2 + 150, cy, 11, '#9fb8ff', { align: 'left', blur: 6, weight: 800, spacing: 1 });

  // percent bar
  const barW = 230, barH = 11, bx = CW / 2 - barW / 2, by = cy - barH / 2 + 4;
  ctx.save();
  roundRectPath(bx, by, barW, barH, 5); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.clip();
  const fillW = barW * clamp(dispPercent / target, 0, 1);
  const g = ctx.createLinearGradient(bx, 0, bx + barW, 0);
  g.addColorStop(0, pal.edge); g.addColorStop(1, pal.edge2);
  ctx.fillStyle = g; ctx.shadowColor = pal.edge; ctx.shadowBlur = 10; ctx.fillRect(bx, by, fillW, barH);
  ctx.restore();
  glowText(Math.round(dispPercent * 100) + '%', CW / 2, by - 9, 11, pal.edge2, { blur: 6, weight: 800 });
  glowText('TARGET ' + Math.round(target * 100) + '%', CW / 2, by + barH + 9, 9, '#7f93c0', { blur: 0, spacing: 1.5, weight: 700 });

  // right cluster (kept left of the pause button at CW-56)
  let rx = CW - 66;
  ctx.save();
  ctx.translate(rx - 7, cy);
  ctx.strokeStyle = isMuted() ? '#6a7290' : pal.accent; ctx.fillStyle = isMuted() ? '#6a7290' : pal.accent; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-7, -2.5); ctx.lineTo(-3, -2.5); ctx.lineTo(1, -6); ctx.lineTo(1, 6); ctx.lineTo(-3, 2.5); ctx.lineTo(-7, 2.5); ctx.closePath(); ctx.fill();
  if (isMuted()) { ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(9, 5); ctx.moveTo(9, -5); ctx.lineTo(4, 5); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(2, 0, 5, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(2, 0, 8, -0.7, 0.7); ctx.globalAlpha = 0.6; ctx.stroke(); }
  ctx.restore();
  rx -= 26;

  if (shield) { drawGlowOrb(rx - 5, cy, 4.5, '#7dffc4', '#7dffc4', 13); rx -= 18; }

  for (let i = 0; i < Math.min(lives, 6); i++) drawGlowOrb(rx - i * 16, cy, 4, '#fff', pal.player, 11);
  rx -= Math.min(lives, 6) * 16 + 8;
  glowText('LVL ' + level, rx, cy, 19, pal.edge2, { align: 'right', blur: 8, font: 'mono', spacing: 1 });
}

/* ----------------------------- overlays -------------------------------- */
function dim(a) { ctx.save(); ctx.fillStyle = `rgba(3,5,12,${a})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
function drawMenu() {
  dim(0.6);
  const cx = CW / 2, cyc = CH / 2, bob = Math.sin(menuT * 1.4) * 3;
  glowText('HI ' + fmtScore(highScore), cx, CH * 0.15, 22, '#ffe93b', { blur: 8, font: 'mono', spacing: 1 });
  retroTitle('VEIL', cx, cyc - 92 + bob, 50, { blur: 22, glow: '#00f0ff', spacing: 2 });
  glowText('DRAW LIGHT INTO THE DARK', cx, cyc - 52 + bob, 21, '#00f0ff', { blur: 8, font: 'mono', spacing: 2 });
  const blink = 0.45 + 0.55 * Math.sin(menuT * 4);
  glowText('PRESS START', cx, cyc - 8, 11, '#ffffff', { blur: 10, font: 'pixel', alpha: blink });

  retroButton(playBtnRect(), 'PLAY', '#39ff14');
  const tk = todayKey(new Date()), done = dailyPlayedKey === tk;
  retroButton(dailyBtnRect(), done ? 'DAILY ✓' : 'DAILY', '#ff2d95');

  glowText('DRAG TO STEER', cx, cyc + 158, 18, '#9fd8ff', { blur: 4, font: 'mono', spacing: 1 });
  const liveStreak = (dailyStreakDate === tk || isConsecutive(dailyStreakDate, tk)) ? dailyStreak : 0;
  if (liveStreak > 1) glowText('STREAK ' + liveStreak, cx, cyc + 184, 18, '#ffb15a', { blur: 4, font: 'mono', spacing: 1 });
}
function drawLevelClear() {
  dim(0.45);
  const cx = CW / 2, cyc = CH / 2, t = clamp((2.9 - lcTimer) * 2.2, 0, 1), pop = 1 + (1 - t) * 0.3;
  glowText('VEIL CLEARED', cx, cyc - 36, 44 * pop, pal.edge2, { blur: 26, font: 'mono', spacing: 2, core: '#fff', alpha: t });
  glowText('LEVEL ' + level + '  ·  ' + Math.round(percent * 100) + '% revealed', cx, cyc + 8, 16, '#cfe6ff', { blur: 8, weight: 600, spacing: 1, alpha: t });
  glowText('+ ' + lastBonus + '  bonus', cx, cyc + 40, 18, pal.accent, { blur: 12, weight: 800, alpha: t });
  glowText('next: level ' + (level + 1), cx, cyc + 78, 12, '#7f97c8', { blur: 0, spacing: 2, alpha: t * (0.6 + 0.4 * Math.sin(menuT * 4)) });
}
function drawGameOver() {
  dim(0.6);
  const cx = CW / 2, cyc = CH / 2, t = clamp(goTimer * 1.6, 0, 1);
  glowText('THE DARK WINS', cx, cyc - 40, 46, '#ff6b7e', { blur: 26, font: 'mono', spacing: 2, core: '#fff', alpha: t });
  glowText('SCORE  ' + fmtScore(score), cx, cyc + 6, 22, '#dff1ff', { blur: 12, weight: 700, spacing: 2, alpha: t });
  const isBest = score >= highScore && score > 0;
  glowText((isBest ? 'NEW BEST!  ' : 'BEST  ') + fmtScore(highScore), cx, cyc + 38, 14, isBest ? '#ffe27a' : pal.edge, { blur: 8, weight: 700, spacing: 1, alpha: t });
  const blink = 0.5 + 0.5 * Math.sin(menuT * 3);
  if (isDaily) {
    glowText('DAILY  ' + dailyRunKey + (dailyStreak > 1 ? '   🔥 ' + dailyStreak : ''), cx, cyc + 60, 12, '#9fd0ff', { blur: 6, spacing: 2, weight: 700, alpha: t });
    glowText('TAP TO SHARE RESULT', cx, cyc + 96, 15, '#cfe6ff', { blur: 10, weight: 700, spacing: 2, alpha: t * blink });
  } else {
    glowText('reached level ' + level, cx, cyc + 60, 12, '#7f97c8', { blur: 0, spacing: 1, alpha: t });
    glowText('PRESS ANY KEY TO RETRY', cx, cyc + 96, 15, '#cfe6ff', { blur: 10, weight: 700, spacing: 2, alpha: t * blink });
  }
}
function drawPaused() {
  dim(0.55);
  const cx = CW / 2, cyc = CH / 2;
  glowText('PAUSED', cx, cyc - 10, 30, '#cfe6ff', { blur: 18, font: 'pixel', spacing: 2, core: '#fff' });
  const blink = 0.5 + 0.5 * Math.sin(menuT * 3);
  glowText('P / ESC resume      M mute      R reduce motion', cx, cyc + 36, 13, '#9fb6e8', { blur: 8, weight: 700, spacing: 1, alpha: blink });
}

/* ----------------------------- main render ----------------------------- */
let menuNebula = null;
function drawAttractWorld() {
  if (!menuNebula) menuNebula = genNebula(BANDS[0]);
  ctx.save();
  ctx.translate(OFF_X, OFF_Y);
  ctx.globalAlpha = 0.5; ctx.drawImage(menuNebula.canvas, 0, 0, PW, PH); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) { ctx.globalAlpha = m.a * 0.8; ctx.fillStyle = '#cfe6ff'; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawTouchUI() {
  // pause / resume button (top-right, inside the safe area)
  const r = pauseBtnRect();
  ctx.save();
  ctx.globalAlpha = 0.45; ctx.fillStyle = '#0a1430';
  roundRectPath(r.x, r.y, r.w, r.h, 11); ctx.fill();
  ctx.globalAlpha = 0.9; ctx.fillStyle = pal ? pal.edge2 : '#cfe6ff';
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  if (state === 'paused') {
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 9); ctx.lineTo(cx - 6, cy + 9); ctx.lineTo(cx + 10, cy); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(cx - 8, cy - 9, 5, 18); ctx.fillRect(cx + 3, cy - 9, 5, 18);
  }
  ctx.restore();

  // floating joystick — retro arcade gate (octagon) + neon square knob
  if (joyActive && state === 'playing') {
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
  if (onboarding && !firstMoveDone && state === 'playing') {
    const ox = CW / 2, oy = CH - 120 - safeBottom;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.3 * pulse; ctx.strokeStyle = pal.edge2; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ox, oy, 34, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.7; ctx.fillStyle = pal.edge;
    ctx.beginPath(); ctx.arc(ox + Math.cos(time * 2) * 16, oy + Math.sin(time * 2) * 16, 14, 0, TAU); ctx.fill();
    ctx.restore();
    glowText('DRAG ANYWHERE TO STEER', ox, oy - 58, 15, '#dff1ff', { blur: 12, weight: 800, spacing: 2, alpha: 0.6 + 0.4 * pulse });
  }
}
function render() {
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
  ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, CW, CH);
  if (state === 'menu') { drawAttractWorld(); drawMenu(); drawScanlines(); return; }
  drawWorld(); drawHUD();
  if (state === 'playing' || state === 'paused') drawTouchUI();
  if (state === 'levelclear') drawLevelClear();
  else if (state === 'gameover') drawGameOver();
  else if (state === 'paused') drawPaused();
  drawScanlines(0.3);   // lighter CRT over gameplay than the menu
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
  reduceMotion = !reduceMotion;
  try { localStorage.setItem('veil_reduce', reduceMotion ? '1' : '0'); } catch (e) {}
  if (reduceMotion) { shakeAmt = 0; zoom = 1; timeScale = 1; timeScaleTarget = 1; }
  if (state === 'playing') spawnPopup(player.px.x, player.px.y, 'MOTION ' + (reduceMotion ? 'OFF' : 'ON'), pal.edge2, 14);
}
function menuBtnW() { return Math.min(264, CW - 56); }
function playBtnRect() { const w = menuBtnW(); return { x: CW / 2 - w / 2, y: CH / 2 + 26, w, h: 50 }; }
function dailyBtnRect() { const w = menuBtnW(); return { x: CW / 2 - w / 2, y: CH / 2 + 90, w, h: 50 }; }
function startDaily() {
  dailyRunKey = todayKey(new Date());
  isDaily = true;
  startGame(seedFromDateKey(dailyRunKey));
}
function shareDailyResult() {
  if (dailyResultText) shareResult(dailyResultText);
}
function recordDailyStreak(key) {
  if (dailyStreakDate === key) return;                 // already counted today
  dailyStreak = isConsecutive(dailyStreakDate, key) ? dailyStreak + 1 : 1;
  dailyStreakDate = key;
  try { localStorage.setItem('veil_daily_streak', String(dailyStreak)); } catch (e) {}
  try { localStorage.setItem('veil_daily_streak_date', dailyStreakDate); } catch (e) {}
}
function anyKeyAction() {
  initAudio();
  if (state === 'gameover' && isDaily) { shareDailyResult(); isDaily = false; state = 'menu'; sfxBlip(); return; }
  if (state === 'menu' || state === 'gameover') { isDaily = false; startGame(); sfxBlip(); }
  else if (state === 'levelclear') { nextLevel(); sfxBlip(); }
  else if (state === 'paused') state = 'playing';
}
window.addEventListener('keydown', (e) => {
  initAudio();
  const k = e.key;
  // dev-only level navigation (dev server build only):  [ / ] step, 1-9 jump
  if (import.meta.env.DEV && (state === 'playing' || state === 'paused')) {
    if (k === ']') { initLevel(level + 1); return; }
    if (k === '[') { initLevel(Math.max(1, level - 1)); return; }
    if (k >= '1' && k <= '9') { initLevel(parseInt(k, 10)); return; }
  }
  if (k === 'm' || k === 'M') { setMuted(!isMuted()); return; }
  if (k === 'r' || k === 'R') { toggleReduce(); return; }
  if (state === 'playing') {
    if (DIRS[k]) { buffered = DIRS[k]; e.preventDefault(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') state = 'paused';
    return;
  }
  if (state === 'paused') { if (k === 'p' || k === 'P' || k === 'Escape') state = 'playing'; return; }
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
function pauseBtnRect() { return { x: CW - 56, y: safeTop + 8, w: 46, h: 46 }; }
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
  if (state === 'playing') {
    if (inRect(p.x, p.y, pauseBtnRect())) { state = 'paused'; e.preventDefault(); return; }
    joyActive = true; joyOX = p.x; joyOY = p.y; joyX = p.x; joyY = p.y; joyDir = null;
  } else if (state === 'paused') {
    state = 'playing';
  } else {
    if (state === 'menu' && inRect(p.x, p.y, dailyBtnRect())) { startDaily(); sfxBlip(); }
    else anyKeyAction();
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!joyActive || state !== 'playing') return;
  const t = e.changedTouches[0], p = localPt(t);
  joyX = p.x; joyY = p.y;
  const d = steerFromVec(p.x - joyOX, p.y - joyOY);
  if (d) { joyDir = d; buffered = d; }  // held dir is re-applied each frame in updatePlayer
  e.preventDefault();
}, { passive: false });

// Lift finger -> stop steering, but keep advancing in the last direction.
canvas.addEventListener('touchend', (e) => { joyActive = false; joyDir = null; e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchcancel', () => { joyActive = false; joyDir = null; });

canvas.addEventListener('mousedown', () => { initAudio(); if (state !== 'playing' && state !== 'paused') anyKeyAction(); });

document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') state = 'paused'; last = 0; });
