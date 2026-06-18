/* =========================================================================
   Player movement + collisions/death. The player advances cell-to-cell along
   a grid; leaving filled land starts a vulnerable trail, returning to it fires
   a capture. Enemies touching the trail (or an unsafe player) trigger death.
   Steering comes from the buffered direction / held joystick in G; the death
   FINALIZE step (game-over, high-score, daily streak) stays in flow (legacy).
   ========================================================================= */

import { G } from './state';
import { COLS, ROWS, CELL } from '../core/dims';
import { EMPTY, FILLED, TRAIL, OBSTACLE } from '../core/constants';
import { cellIndex, centerPx, cellOfPx } from '../core/grid';
import { doCapture } from './capture';
import { eCell } from './enemies';
import { spawnPopup } from './particles';
import { lerp, rand, TAU } from '../core/math';
import { sfxStartDraw, sfxShield, sfxDeath } from '../audio/audio';
import { hapticLight, hapticMedium, hapticHeavy } from '../platform/haptics';

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
      G.fuseT = 0; G.fuseMax = Math.max(2.8, 6 - G.level * 0.12);   // arm the fuse (tighter at higher levels)
      if (G.drawSoundLock <= 0) { sfxStartDraw(); hapticLight(); G.drawSoundLock = 0.25; }
    }
    G.grid[arrived] = TRAIL; G.trailCells.push(arrived); G.trailPoints.push(centerPx(arrived));
  } else if (v === FILLED) {
    if (G.hasTrail) { G.trailPoints.push(centerPx(arrived)); doCapture(); }
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
export function updatePlayer(dt) {
  // The FUSE: while a line is open, a spark crawls it; close (capture) or get
  // back to safe ground before it runs out, or it catches you. Punishes long,
  // greedy single draws — the genre's core tension.
  if (G.hasTrail) {
    G.fuseT += dt;
    if (G.fuseT >= G.fuseMax) { spawnPopup(G.player.px.x, G.player.px.y, 'BURNED', '#ff7a4a', 16); triggerDeath(); return; }
  }
  // Continuously honor a held joystick direction so a turn lands at the next valid cell.
  if (G.joyActive && G.joyDir && !G.buffered) G.buffered = G.joyDir;
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
    const seg = G.baseSpeed * (G.grid[G.player.from] === FILLED ? 1.35 : 1.0);
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
export function checkCollisions() {
  const pc = cellOfPx(G.player.px), safe = G.grid[pc] === FILLED;
  for (const e of G.enemies) {
    if (e.type === 'sleeper' && e.asleep) continue;   // dormant: harmless until woken
    const ec = eCell(e);
    if (G.grid[ec] === TRAIL) { triggerDeath(); return; }
    if (!safe && G.player.invuln <= 0 && Math.hypot(G.player.px.x - e.x, G.player.px.y - e.y) < CELL * 0.78) { triggerDeath(); return; }
  }
}
export function respawnAt() {
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

// The level timer ran out — lose a life (Airxonix). Reset the clock for the retry.
export function timeoutDeath() {
  if (G.deathFreeze > 0 || G.player.invuln > 0 || G.state !== 'playing') return;
  spawnPopup(G.player.px.x, G.player.px.y, 'TIME!', '#ff6b7e', 18);
  G.levelT = 0;
  triggerDeath();
}

export function clearTrail() {
  for (const idx of G.trailCells) if (G.grid[idx] === TRAIL) G.grid[idx] = EMPTY;
  G.trailCells = []; G.trailPoints = []; G.hasTrail = false;
}
