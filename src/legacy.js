/* =========================================================================
   VEIL  —  draw light into the dark   ·   v2
   Territory-capture game. Cut continuous lines through a dark veil to
   enclose space and reveal the nebula beneath, while drifters hunt you.
   Single-file, no dependencies. Plays from file:// (just open index.html).
   ========================================================================= */

'use strict';

/* ----------------------------- config ---------------------------------- */
const COLS = 44;
const ROWS = 27;
const CELL = 20;
const PW = COLS * CELL;          // 880
const PH = ROWS * CELL;          // 540
const MARGIN = 14;
const HUD_H = 50;
const CW = PW + MARGIN * 2;
const CH = HUD_H + PH + MARGIN;
const SS = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1))); // DPR-aware
const OFF_X = MARGIN;
const OFF_Y = HUD_H;

const EMPTY = 0, FILLED = 1, TRAIL = 2;
const INTERIOR_TOTAL = (COLS - 2) * (ROWS - 2);
const COMBO_WINDOW = 4.5;        // seconds to chain a capture

/* ----------------------------- palettes -------------------------------- */
const PALETTES = [
  { name: 'aurora', blobs: ['#0a2a43', '#0f5568', '#1b8a7a', '#2bd4a7', '#86ffd9'],
    star: '#dff9ff', edge: '#63fbef', edge2: '#bafff5', trail: '#eafffb', player: '#ffffff', accent: '#5ffbd0' },
  { name: 'violet', blobs: ['#190b3a', '#3a1d7a', '#6a34d6', '#a865ff', '#e6c6ff'],
    star: '#f1e6ff', edge: '#c69bff', edge2: '#ecdcff', trail: '#f6ecff', player: '#ffffff', accent: '#c89bff' },
  { name: 'ember', blobs: ['#2c0a26', '#5e1140', '#a8264f', '#e85d3a', '#ffb55a'],
    star: '#ffe9d6', edge: '#ff9d6e', edge2: '#ffd9b0', trail: '#fff0df', player: '#ffffff', accent: '#ff9b5a' },
  { name: 'ocean', blobs: ['#041f3a', '#0a4d8c', '#1683cf', '#37b6ff', '#9fe4ff'],
    star: '#e5f6ff', edge: '#7fdcff', edge2: '#cdf2ff', trail: '#ecfbff', player: '#ffffff', accent: '#6fd2ff' },
  { name: 'rose', blobs: ['#2a0b22', '#6a1450', '#b8327f', '#ff5fa8', '#ffc2e0'],
    star: '#ffe7f4', edge: '#ff8fc6', edge2: '#ffd2e8', trail: '#fff0f7', player: '#ffffff', accent: '#ff8fc6' },
];

const ENEMY_COL = '#ff465c', ENEMY_GLOW = '#ff7a52';
const CHASER_COL = '#ff44d4', CHASER_GLOW = '#ff7ae8';

/* ----------------------------- utilities ------------------------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

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

/* ----------------------------- canvas ---------------------------------- */
const canvas = document.getElementById('game');
canvas.width = Math.round(CW * SS);
canvas.height = Math.round(CH * SS);
const ctx = canvas.getContext('2d');

function fitToWindow() {
  const pad = 24;
  const scale = Math.min((window.innerWidth - pad) / CW, (window.innerHeight - pad) / CH, 1.6);
  canvas.style.width = Math.round(CW * scale) + 'px';
  canvas.style.height = Math.round(CH * scale) + 'px';
}
window.addEventListener('resize', fitToWindow);
fitToWindow();

/* ----------------------------- audio ----------------------------------- */
let ac = null, masterGain = null, padGain = null;
let muted = false, reduceMotion = false;
try { muted = localStorage.getItem('veil_muted') === '1'; } catch (e) {}
try { reduceMotion = localStorage.getItem('veil_reduce') === '1'; } catch (e) {}

function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ac.createGain();
    masterGain.gain.value = muted ? 0 : 0.9;
    masterGain.connect(ac.destination);
    padGain = ac.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(masterGain);
    startPad();
  } catch (e) { ac = null; }
}
function startPad() {
  if (!ac) return;
  [55, 82.4, 110].forEach((f, i) => {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.value = 0.5 / (i + 1);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
    const lg = ac.createGain(); lg.gain.value = 1.5;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(padGain);
    o.start(); lfo.start();
  });
  padGain.gain.linearRampToValueAtTime(0.03, ac.currentTime + 4);
}
function tone(freq, dur, type, gain, when, slideTo) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + (when || 0);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function sfxStartDraw() { tone(420, 0.12, 'triangle', 0.10, 0, 540); }
function sfxCapture(ch) {
  const base = 360 + Math.min(ch, 8) * 40;
  [0, 4, 7, 11].forEach((n, i) => tone(base * Math.pow(2, n / 12), 0.22, 'triangle', 0.10, i * 0.045, base * Math.pow(2, n / 12) * 1.5));
}
function sfxBold() { [0, 7, 12, 19].forEach((n, i) => tone(330 * Math.pow(2, n / 12), 0.3, 'sawtooth', 0.08, i * 0.05)); }
function sfxDeath() { tone(220, 0.5, 'sawtooth', 0.18, 0, 50); tone(110, 0.6, 'square', 0.10, 0.02, 40); }
function sfxLevel() { [0, 4, 7, 12, 16].forEach((n, i) => tone(440 * Math.pow(2, n / 12), 0.3, 'triangle', 0.12, i * 0.09)); }
function sfxPickup() { [0, 5, 9, 14].forEach((n, i) => tone(520 * Math.pow(2, n / 12), 0.16, 'triangle', 0.10, i * 0.04, 1400)); }
function sfxShield() { tone(300, 0.4, 'sine', 0.14, 0, 700); tone(450, 0.4, 'triangle', 0.08, 0.03); }
function sfxBlip() { tone(660, 0.08, 'triangle', 0.08, 0, 880); }
function sfxBest() { [0, 4, 7, 12, 16, 19].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 0.35, 'triangle', 0.10, i * 0.1)); }
function setMuted(m) {
  muted = m;
  try { localStorage.setItem('veil_muted', m ? '1' : '0'); } catch (e) {}
  if (masterGain) masterGain.gain.value = m ? 0 : 0.9;
}

/* ----------------------------- state ----------------------------------- */
let grid = new Uint8Array(COLS * ROWS);
let state = 'menu';
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

let nebula = null, fog = null, pal = PALETTES[0];
let borderPath = null;

let shakeAmt = 0, flash = 0, zoom = 1;
let timeScale = 1, timeScaleTarget = 1;     // global (death cinematic only)
let deathFreeze = 0, drawSoundLock = 0;
let enemyFreezeT = 0, enemySlowT = 0;        // power-up effects on enemies
let shield = false;
let pickupSpawnT = 6;
let banner = { text: '', sub: '', t: 0 };
let hintActive = false;

/* ----------------------------- background art -------------------------- */
function genNebula(p) {
  const s = createSurface(PW, PH), c = s.ctx;
  c.fillStyle = '#04050d'; c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const col = p.blobs[(Math.random() * p.blobs.length) | 0];
    const x = rand(-80, PW + 80), y = rand(-60, PH + 60), r = rand(70, 320);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(0.4, col + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.16, 0.4); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  for (let i = 0; i < 5; i++) {
    const x = rand(PW * 0.2, PW * 0.8), y = rand(PH * 0.2, PH * 0.8), r = rand(40, 110);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, p.blobs[p.blobs.length - 1]); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.3, 0.55); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 320; i++) {
    const x = Math.random() * PW, y = Math.random() * PH, a = Math.random();
    const r = a > 0.92 ? rand(1.2, 2.2) : rand(0.4, 1.1);
    c.globalAlpha = rand(0.25, 0.95); c.fillStyle = p.star;
    if (a > 0.95) { c.shadowColor = p.star; c.shadowBlur = 6; } else c.shadowBlur = 0;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
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
function genFog() {
  const s = createSurface(PW, PH), c = s.ctx;
  const g = c.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, '#0a0d1c'); g.addColorStop(1, '#06080f');
  c.fillStyle = g; c.fillRect(0, 0, PW, PH);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * PW, y = Math.random() * PH, r = rand(40, 160);
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    rg.addColorStop(0, dark ? 'rgba(2,3,9,0.5)' : 'rgba(40,52,92,0.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  for (let i = 0; i < 600; i++) {
    c.globalAlpha = rand(0.02, 0.08);
    c.fillStyle = Math.random() > 0.5 ? '#12203f' : '#000008';
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
      sfxBold();
      flash = reduceMotion ? 0.2 : 0.55;
      zoom = reduceMotion ? 1 : 1 + Math.min(0.05, area * 0.0006);
    } else {
      flash = reduceMotion ? 0.08 : Math.min(0.35, 0.1 + area * 0.003);
      zoom = reduceMotion ? 1 : 1 + Math.min(0.025, area * 0.0004);
    }
    shakeAmt = reduceMotion ? 0 : Math.min(10, 2.5 + area * 0.04);
    sfxCapture(combo);
    hintActive = false;
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
  let r = Math.random() * total;
  for (const p of PU_TYPES) { if ((r -= p.w) <= 0) return p; }
  return PU_TYPES[0];
}
function maybeSpawnPickup(dt) {
  pickupSpawnT -= dt;
  if (pickupSpawnT > 0 || pickups.length >= 2) return;
  pickupSpawnT = rand(7, 12);
  const pcell = cellOfPx(player.px);
  let idx = -1;
  for (let t = 0; t < 50; t++) {
    const cx = 2 + ((Math.random() * (COLS - 4)) | 0), cy = 2 + ((Math.random() * (ROWS - 4)) | 0);
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
  sfxPickup();
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
  const spd = Math.min(115 + 8 * (lv - 1), 205);
  const sc = centerPx((COLS >> 1));
  function place(type, speed) {
    let x, y, tries = 0;
    do {
      const cx = 2 + ((Math.random() * (COLS - 4)) | 0), cy = 2 + ((Math.random() * (ROWS - 4)) | 0);
      x = (cx + 0.5) * CELL; y = (cy + 0.5) * CELL; tries++;
    } while (Math.hypot(x - sc.x, y - sc.y) < CELL * 7 && tries < 60);
    const comp = speed * 0.7071;
    out.push({ x, y, vx: (Math.random() < 0.5 ? -1 : 1) * comp, vy: (Math.random() < 0.5 ? -1 : 1) * comp,
      r: CELL * 0.42, type, speed, comp, steerT: rand(0.2, 0.6) });
  }
  for (let i = 0; i < drifters; i++) place('drifter', spd);
  for (let i = 0; i < chasers; i++) place('chaser', spd * 0.74);
  return out;
}
function moveEnemy(e, dt) {
  if (e.type === 'chaser') {
    e.steerT -= dt;
    if (e.steerT <= 0) {
      e.steerT = 0.4;
      // hunt the trail tip while you draw, else hunt you
      const tgt = hasTrail ? player.px : player.px;
      const dx = tgt.x - e.x, dy = tgt.y - e.y;
      e.vx = (dx === 0 ? (e.vx > 0 ? 1 : -1) : Math.sign(dx)) * e.comp;
      e.vy = (dy === 0 ? (e.vy > 0 ? 1 : -1) : Math.sign(dy)) * e.comp;
    }
  }
  let nx = e.x + e.vx * dt;
  const cyc = clamp(Math.floor(e.y / CELL), 0, ROWS - 1);
  const cxn = Math.floor((nx + Math.sign(e.vx) * e.r) / CELL);
  if (cxn < 0 || cxn >= COLS || grid[cyc * COLS + cxn] === FILLED) { e.vx = -e.vx; nx = e.x; }
  e.x = nx;
  let ny = e.y + e.vy * dt;
  const cxc = clamp(Math.floor(e.x / CELL), 0, COLS - 1);
  const cyn = Math.floor((ny + Math.sign(e.vy) * e.r) / CELL);
  if (cyn < 0 || cyn >= ROWS || grid[cyn * COLS + cxc] === FILLED) { e.vy = -e.vy; ny = e.y; }
  e.y = ny;
}

/* ----------------------------- player ---------------------------------- */
function chooseDir(ax, ay) {
  if (buffered) {
    const nx = ax + buffered.x, ny = ay + buffered.y;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) { buffered = null; }
    else {
      const i = ny * COLS + nx;
      if (grid[i] !== TRAIL) { const d = buffered; buffered = null; return d; }
      buffered = null;
    }
  }
  if (player.dir) {
    const nx = ax + player.dir.x, ny = ay + player.dir.y;
    if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && grid[ny * COLS + nx] !== TRAIL) return player.dir;
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
      if (drawSoundLock <= 0) { sfxStartDraw(); drawSoundLock = 0.25; }
    }
    grid[arrived] = TRAIL; trailCells.push(arrived); trailPoints.push(centerPx(arrived));
  } else if (v === FILLED) {
    if (hasTrail) { trailPoints.push(centerPx(arrived)); doCapture(); }
  }
  const nd = chooseDir(ax, ay);
  if (nd) { player.dir = nd; player.to = (ay + nd.y) * COLS + (ax + nd.x); player.stopped = false; }
  else { player.stopped = true; player.to = arrived; }
}
function updatePlayer(dt) {
  if (player.stopped) {
    const ax = player.to % COLS, ay = (player.to / COLS) | 0, nd = chooseDir(ax, ay);
    if (nd) {
      player.dir = nd; player.from = player.to; player.to = (ay + nd.y) * COLS + (ax + nd.x);
      player.stopped = false; player.t = 0;
    }
  }
  if (!player.stopped) {
    // snappier over captured land, deliberate while drawing
    const seg = baseSpeed * (grid[player.from] === FILLED ? 1.35 : 1.0);
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
    sfxShield(); spawnPopup(player.px.x, player.px.y, 'BLOCKED', pal.edge2, 16);
    for (let i = 0; i < 24; i++) { const ang = Math.random() * TAU, sp = rand(60, 200); particles.push({ x: player.px.x, y: player.px.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.8), max: 0.8, r: rand(1.2, 3), col: pal.edge2 }); }
    respawnAt();
    return;
  }
  lives--; combo = 0; comboT = 0;
  shakeAmt = reduceMotion ? 0 : 16; flash = reduceMotion ? 0.25 : 0.8; deathFreeze = 0.5;
  if (!reduceMotion) timeScaleTarget = 0.22;
  sfxDeath();
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
  pal = PALETTES[(lv - 1) % PALETTES.length];
  grid = new Uint8Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      grid[y * COLS + x] = (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) ? FILLED : EMPTY;

  nebula = genNebula(pal); fog = genFog(); genTwinkles();
  for (let i = 0; i < grid.length; i++) if (grid[i] === FILLED) clearFogCell(i);

  const start = (COLS >> 1);
  player = { from: start, to: start, t: 0, dir: null, stopped: true, invuln: 1.0, tail: [], px: centerPx(start) };
  buffered = null; hasTrail = false; trailCells = []; trailPoints = [];
  enemies = genEnemies(lv);

  baseSpeed = Math.min(9.5 + 0.5 * (lv - 1), 16);
  target = Math.min(0.66 + 0.02 * (lv - 1), 0.82);

  combo = 0; comboT = 0;
  shakeAmt = 0; flash = 0; zoom = 1; deathFreeze = 0; timeScale = 1; timeScaleTarget = 1;
  enemyFreezeT = 0; enemySlowT = 0; shield = false;
  pickups.length = 0; popups.length = 0; particles.length = 0; revealQueue.length = 0;
  pickupSpawnT = rand(5, 8);
  recomputeBorderPath(); recomputePercent(); dispPercent = percent;
  banner = { text: 'LEVEL ' + lv, sub: pal.name.toUpperCase() + '  ·  reveal ' + Math.round(target * 100) + '%', t: 2.0 };
  hintActive = (lv === 1);
  state = 'playing';
}
function startGame() { score = 0; dispScore = 0; lives = 3; initLevel(1); }
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
    if (padGain && !muted) padGain.gain.value = 0.03 + 0.05 * Math.min(1, percent / target);
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
function setFont(size, weight, spacing) {
  ctx.font = `${weight || 600} ${size}px 'Segoe UI', system-ui, Arial, sans-serif`;
  try { ctx.letterSpacing = (spacing || 0) + 'px'; } catch (e) {}
}
function glowText(txt, x, y, size, color, opts) {
  opts = opts || {};
  ctx.save();
  setFont(size, opts.weight, opts.spacing);
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'middle';
  ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
  ctx.shadowColor = color; ctx.shadowBlur = opts.blur == null ? 18 : opts.blur;
  ctx.fillStyle = opts.fill || color; ctx.fillText(txt, x, y);
  ctx.shadowBlur = 0;
  if (opts.core) { ctx.fillStyle = opts.core; ctx.fillText(txt, x, y); }
  ctx.restore();
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
    const isCh = e.type === 'chaser';
    let prox = 0;
    if (player && player.px && state === 'playing') prox = clamp(1 - Math.hypot(player.px.x - e.x, player.px.y - e.y) / (CELL * 6), 0, 1);
    const frozen = enemyFreezeT > 0;
    const col = frozen ? '#bfe9ff' : (isCh ? CHASER_COL : ENEMY_COL);
    const glow = frozen ? '#bfe9ff' : (isCh ? CHASER_GLOW : ENEMY_GLOW);
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
    glowText(banner.text, PW / 2, PH / 2 - 14, 40, pal.edge2, { blur: 26, weight: 800, spacing: 5, core: '#fff', alpha: a });
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
  const cy = HUD_H / 2;

  glowText('SCORE', MARGIN + 4, cy - 12, 9, '#6f86b8', { align: 'left', blur: 0, spacing: 2, weight: 700 });
  glowText(fmtScore(dispScore), MARGIN + 4, cy + 5, 20, pal.trail, { align: 'left', blur: 10, weight: 700, core: '#fff', spacing: 1 });

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

  // right cluster
  let rx = CW - MARGIN - 4;
  ctx.save();
  ctx.translate(rx - 7, cy);
  ctx.strokeStyle = muted ? '#6a7290' : pal.accent; ctx.fillStyle = muted ? '#6a7290' : pal.accent; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-7, -2.5); ctx.lineTo(-3, -2.5); ctx.lineTo(1, -6); ctx.lineTo(1, 6); ctx.lineTo(-3, 2.5); ctx.lineTo(-7, 2.5); ctx.closePath(); ctx.fill();
  if (muted) { ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(9, 5); ctx.moveTo(9, -5); ctx.lineTo(4, 5); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(2, 0, 5, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(2, 0, 8, -0.7, 0.7); ctx.globalAlpha = 0.6; ctx.stroke(); }
  ctx.restore();
  rx -= 26;

  if (shield) { drawGlowOrb(rx - 5, cy, 4.5, '#7dffc4', '#7dffc4', 13); rx -= 18; }

  for (let i = 0; i < Math.min(lives, 6); i++) drawGlowOrb(rx - i * 16, cy, 4, '#fff', pal.player, 11);
  rx -= Math.min(lives, 6) * 16 + 8;
  glowText('LVL ' + level, rx, cy, 16, pal.edge2, { align: 'right', blur: 8, weight: 800, spacing: 1 });
}

/* ----------------------------- overlays -------------------------------- */
function dim(a) { ctx.save(); ctx.fillStyle = `rgba(3,5,12,${a})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
function drawMenu() {
  dim(0.5);
  const cx = CW / 2, cyc = CH / 2, bob = Math.sin(menuT * 1.4) * 4;
  glowText('V E I L', cx, cyc - 78 + bob, 78, '#bfe4ff', { blur: 34, weight: 800, spacing: 10, core: '#ffffff' });
  glowText('draw light into the dark', cx, cyc - 26 + bob, 15, '#8fb4ff', { blur: 8, spacing: 4, weight: 600 });
  const blink = 0.55 + 0.45 * Math.sin(menuT * 3);
  glowText('PRESS ANY KEY  ·  TAP TO BEGIN', cx, cyc + 28, 16, '#dff1ff', { blur: 12, alpha: blink, weight: 700, spacing: 2 });
  glowText('ARROWS / WASD move      enclose space to reveal the cosmos', cx, cyc + 70, 12, '#7f97c8', { blur: 0, spacing: 1 });
  glowText('grab power-ups in the open      bold cuts score big', cx, cyc + 90, 12, '#7f97c8', { blur: 0, spacing: 1 });
  glowText('P pause      M mute      R reduce motion ' + (reduceMotion ? '(on)' : ''), cx, cyc + 110, 12, '#7f97c8', { blur: 0, spacing: 1 });
  if (highScore > 0) glowText('BEST  ' + fmtScore(highScore), cx, cyc + 146, 13, pal.edge, { blur: 8, weight: 700, spacing: 2 });
}
function drawLevelClear() {
  dim(0.45);
  const cx = CW / 2, cyc = CH / 2, t = clamp((2.9 - lcTimer) * 2.2, 0, 1), pop = 1 + (1 - t) * 0.3;
  glowText('VEIL CLEARED', cx, cyc - 36, 46 * pop, pal.edge2, { blur: 30, weight: 800, spacing: 4, core: '#fff', alpha: t });
  glowText('LEVEL ' + level + '  ·  ' + Math.round(percent * 100) + '% revealed', cx, cyc + 8, 16, '#cfe6ff', { blur: 8, weight: 600, spacing: 1, alpha: t });
  glowText('+ ' + lastBonus + '  bonus', cx, cyc + 40, 18, pal.accent, { blur: 12, weight: 800, alpha: t });
  glowText('next: level ' + (level + 1), cx, cyc + 78, 12, '#7f97c8', { blur: 0, spacing: 2, alpha: t * (0.6 + 0.4 * Math.sin(menuT * 4)) });
}
function drawGameOver() {
  dim(0.6);
  const cx = CW / 2, cyc = CH / 2, t = clamp(goTimer * 1.6, 0, 1);
  glowText('THE DARK WINS', cx, cyc - 40, 48, '#ff6b7e', { blur: 28, weight: 800, spacing: 3, core: '#fff', alpha: t });
  glowText('SCORE  ' + fmtScore(score), cx, cyc + 6, 22, '#dff1ff', { blur: 12, weight: 700, spacing: 2, alpha: t });
  const isBest = score >= highScore && score > 0;
  glowText((isBest ? 'NEW BEST!  ' : 'BEST  ') + fmtScore(highScore), cx, cyc + 38, 14, isBest ? '#ffe27a' : pal.edge, { blur: 8, weight: 700, spacing: 1, alpha: t });
  glowText('reached level ' + level, cx, cyc + 60, 12, '#7f97c8', { blur: 0, spacing: 1, alpha: t });
  const blink = 0.5 + 0.5 * Math.sin(menuT * 3);
  glowText('PRESS ANY KEY TO RETRY', cx, cyc + 96, 15, '#cfe6ff', { blur: 10, weight: 700, spacing: 2, alpha: t * blink });
}
function drawPaused() {
  dim(0.55);
  const cx = CW / 2, cyc = CH / 2;
  glowText('PAUSED', cx, cyc - 10, 46, '#cfe6ff', { blur: 24, weight: 800, spacing: 6, core: '#fff' });
  const blink = 0.5 + 0.5 * Math.sin(menuT * 3);
  glowText('P / ESC resume      M mute      R reduce motion', cx, cyc + 36, 13, '#9fb6e8', { blur: 8, weight: 700, spacing: 1, alpha: blink });
}

/* ----------------------------- main render ----------------------------- */
let menuNebula = null;
function drawAttractWorld() {
  if (!menuNebula) menuNebula = genNebula(PALETTES[0]);
  ctx.save();
  ctx.translate(OFF_X, OFF_Y);
  ctx.globalAlpha = 0.5; ctx.drawImage(menuNebula.canvas, 0, 0, PW, PH); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) { ctx.globalAlpha = m.a * 0.8; ctx.fillStyle = '#cfe6ff'; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function render() {
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
  ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, CW, CH);
  if (state === 'menu') { drawAttractWorld(); drawMenu(); return; }
  drawWorld(); drawHUD();
  if (state === 'levelclear') drawLevelClear();
  else if (state === 'gameover') drawGameOver();
  else if (state === 'paused') drawPaused();
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
function anyKeyAction() {
  initAudio();
  if (state === 'menu' || state === 'gameover') { startGame(); sfxBlip(); }
  else if (state === 'levelclear') { nextLevel(); sfxBlip(); }
  else if (state === 'paused') state = 'playing';
}
window.addEventListener('keydown', (e) => {
  initAudio();
  const k = e.key;
  if (k === 'm' || k === 'M') { setMuted(!muted); return; }
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

let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  initAudio();
  const t = e.changedTouches[0]; touchStart = { x: t.clientX, y: t.clientY }; e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0]; if (!touchStart) return;
  const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y, dist = Math.hypot(dx, dy);
  touchStart = null;
  if (dist < 22) {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
    else anyKeyAction();
    return;
  }
  if (state === 'playing') buffered = Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
  else anyKeyAction();
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('mousedown', () => { initAudio(); if (state !== 'playing' && state !== 'paused') anyKeyAction(); });

document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') state = 'paused'; last = 0; });
