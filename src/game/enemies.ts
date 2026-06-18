/* =========================================================================
   Enemies — spawn tables, the staggered introduction schedule, and per-frame
   movement/AI. Behaviors are deliberately READABLE at a glance:
     drifter  — bounces in a straight line, ignores you (the predictable base)
     chaser   — periodically re-aims straight at you; hunts you and your trail
     cutter   — while you're drawing, beelines to the BASE of your line to slice it
   (sentinel + sleeper exist but are currently disabled in enemyCounts.)
   ========================================================================= */

import { G } from './state';
import { clamp } from '../core/math';
import { CELL, COLS, ROWS } from '../core/dims';
import { EMPTY, FILLED, OBSTACLE } from '../core/constants';
import { centerPx, cellOfPx } from '../core/grid';
import { spawnPopup } from './particles';
import { hapticHeavy } from '../platform/haptics';
import { sfxBlink, sfxSentinel } from '../audio/audio';

// Plays a sound only when the player is near enough to care (avoids a chorus
// from many actors firing across a big board).
function near(e, cells) { return G.player && G.player.px && Math.hypot(G.player.px.x - e.x, G.player.px.y - e.y) < CELL * cells; }

export function eCell(e) {
  const cx = clamp(Math.floor(e.x / CELL), 0, COLS - 1);
  const cy = clamp(Math.floor(e.y / CELL), 0, ROWS - 1);
  return cy * COLS + cx;
}
export interface EnemyCounts { drifter: number; chaser: number; cutter: number; sentinel: number; sleeper: number; wraith?: number; qix?: number; }

// Staggered introduction: drifters alone early, then a new type every ~3 levels
// so each enemy gets room to breathe before the next arrives. This is the
// procedural fallback; authored levels override counts via their blueprint.
export function enemyCounts(lv): EnemyCounts {
  return {
    drifter: Math.min(1 + Math.floor(lv / 2), 6),
    chaser: lv >= 3 ? Math.min(1 + Math.floor((lv - 3) / 3), 2) : 0,
    cutter: lv >= 7 ? Math.min(1 + Math.floor((lv - 7) / 4), 2) : 0,
    sentinel: 0,   // disabled — "hunts only when you rest" was too unreadable; revisiting
    sleeper: 0,    // disabled — one-shot wake was too punishing
  };
}
export const ENEMY_INFO = {
  chaser: { name: 'CHASER', desc: 'hunts you and your trail' },
  cutter: { name: 'CUTTER', desc: 'races to slice your line' },
  sentinel: { name: 'SENTINEL', desc: 'attacks while you rest on land' },
  sleeper: { name: 'VEIL-SLEEPER', desc: 'reveals in the dark — wake it' },
  wraith: { name: 'WRAITH', desc: 'blinks through the rift toward you' },
  qix: { name: 'THE QIX', desc: 'a vast roamer — claim the board to shrink it' },
};
export function genEnemies(lv, counts: EnemyCounts = enemyCounts(lv)) {
  const out = [];
  const n = counts;
  const spd = Math.min(115 + 8 * (lv - 1), 205);
  const sc = centerPx((COLS >> 1));
  function spawnCell(minGap, needEmpty) {
    let x = sc.x, y = sc.y, tries = 0, cx = 2, cy = 2;
    do {
      cx = 2 + G.rng.int(COLS - 4); cy = 2 + G.rng.int(ROWS - 4);
      x = (cx + 0.5) * CELL; y = (cy + 0.5) * CELL; tries++;
    } while ((Math.hypot(x - sc.x, y - sc.y) < CELL * minGap
      || (needEmpty ? G.grid[cy * COLS + cx] !== EMPTY : G.grid[cy * COLS + cx] === OBSTACLE)) && tries < 60);
    return { x, y };
  }
  function place(type, speed) {
    const p = spawnCell(7, false), comp = speed * 0.7071;
    out.push({ x: p.x, y: p.y, vx: (G.rng.next() < 0.5 ? -1 : 1) * comp, vy: (G.rng.next() < 0.5 ? -1 : 1) * comp,
      r: CELL * 0.42, type, speed, comp, steerT: G.rng.range(0.2, 0.6),
      blinkT: type === 'wraith' ? G.rng.range(0.9, 1.6) : 0, charging: 0 });
  }
  function placeSleeper(speed) {
    const p = spawnCell(6, true);
    out.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: CELL * 0.42, type: 'sleeper', asleep: true, speed, comp: speed * 0.7071, steerT: 0 });
  }
  for (let i = 0; i < n.drifter; i++) place('drifter', spd);
  for (let i = 0; i < n.chaser; i++) place('chaser', spd * 0.74);
  for (let i = 0; i < n.cutter; i++) place('cutter', spd * 0.8);
  for (let i = 0; i < n.sentinel; i++) place('sentinel', spd * 0.82);
  for (let i = 0; i < (n.wraith || 0); i++) place('wraith', spd * 0.7);
  for (let i = 0; i < (n.qix || 0); i++) {
    const p = spawnCell(9, false), s = spd * 0.45, r = CELL * 1.15;   // a slow roamer (moderate size)
    out.push({ x: p.x, y: p.y, vx: (G.rng.next() < 0.5 ? -1 : 1) * s * 0.7071, vy: (G.rng.next() < 0.5 ? -1 : 1) * s * 0.7071,
      r, baseR: r, type: 'qix', speed: s, comp: s * 0.7071, steerT: G.rng.range(0.8, 1.4) });
  }
  for (let i = 0; i < n.sleeper; i++) placeSleeper(spd * 0.95);
  return out;
}
export function moveEnemy(e, dt) {
  // veil-sleeper: dormant until a capture reveals it or the player draws near
  if (e.type === 'sleeper' && e.asleep) {
    const woke = G.grid[eCell(e)] === FILLED || (G.player && Math.hypot(G.player.px.x - e.x, G.player.px.y - e.y) < CELL * 3);
    if (!woke) return;
    e.asleep = false; e.steerT = 0;
    G.flash = G.reduceMotion ? 0.12 : 0.3; G.shakeAmt = G.reduceMotion ? 0 : Math.max(G.shakeAmt, 7);
    hapticHeavy(); spawnPopup(e.x, e.y, 'WOKE', '#ff5c6e', 16);
  }
  // wraith (daily): holds position, then telegraphs (~0.7s) and BLINKS ~5 cells
  // toward you. Readable because the charge is shown; deterministic timing.
  if (e.type === 'wraith') {
    if (e.charging > 0) {
      e.charging -= dt;
      if (e.charging <= 0 && G.player) {
        const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y, d = Math.hypot(dx, dy) || 1, hop = CELL * 5;
        const tx = clamp(e.x + dx / d * hop, CELL * 1.5, (COLS - 1.5) * CELL);
        const ty = clamp(e.y + dy / d * hop, CELL * 1.5, (ROWS - 1.5) * CELL);
        const cc = clamp(Math.floor(ty / CELL), 1, ROWS - 2) * COLS + clamp(Math.floor(tx / CELL), 1, COLS - 2);
        if (G.grid[cc] !== OBSTACLE && G.grid[cc] !== FILLED) { e.x = tx; e.y = ty; }
        e.blinkT = 2.4;
        if (near(e, 12)) sfxBlink();
      }
      return;
    }
    e.blinkT -= dt;
    if (e.blinkT <= 0) e.charging = 0.7;
    return;   // holds still between blinks (no drift)
  }
  // qix (boss): a vast, slow roamer. It shrinks as you claim the board, and
  // lazily drifts toward you on a timer; otherwise it just bounces. Falls
  // through to the generic movement below.
  if (e.type === 'qix') {
    e.r = e.baseR * (1 - 0.4 * G.percent);
    e.steerT -= dt;
    if (e.steerT <= 0 && G.player) {
      e.steerT = 1.2;
      const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.vx = e.vx * 0.6 + (dx / d) * e.comp * 0.4;
      e.vy = e.vy * 0.6 + (dy / d) * e.comp * 0.4;
    }
  }
  // cutter: while you draw, beeline to the BASE of your line (a fixed point) to cut you
  // off — a predictable straight approach. Otherwise it just drifts like a regular enemy.
  if (e.type === 'cutter') {
    e.steerT -= dt;
    if (e.steerT <= 0 && G.hasTrail && G.trailPoints.length) {
      e.steerT = 0.5;
      const t0 = G.trailPoints[0];
      const dx = t0.x - e.x, dy = t0.y - e.y;
      e.vx = (dx === 0 ? (e.vx > 0 ? 1 : -1) : Math.sign(dx)) * e.comp;
      e.vy = (dy === 0 ? (e.vy > 0 ? 1 : -1) : Math.sign(dy)) * e.comp;
    }
  }
  // chasers + awake sleepers always hunt; sentinels hunt only while you rest on safe ground
  const hunting = e.type === 'chaser' || (e.type === 'sleeper' && !e.asleep)
    || (e.type === 'sentinel' && G.player && G.grid[cellOfPx(G.player.px)] === FILLED);
  // sentinel "eye opens" cue: rising edge of hunting, near the player, debounced
  if (e.type === 'sentinel') {
    if (hunting && !e.huntPrev && near(e, 14) && G.time - (e.armSfxT || -9) > 2.5) { sfxSentinel(); e.armSfxT = G.time; }
    e.huntPrev = hunting;
  }
  if (hunting) {
    e.steerT -= dt;
    if (e.steerT <= 0) {
      e.steerT = e.type === 'sentinel' ? 0.5 : 0.4;
      const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y;
      e.vx = (dx === 0 ? (e.vx > 0 ? 1 : -1) : Math.sign(dx)) * e.comp;
      e.vy = (dy === 0 ? (e.vy > 0 ? 1 : -1) : Math.sign(dy)) * e.comp;
    }
  }
  let nx = e.x + e.vx * dt;
  const cyc = clamp(Math.floor(e.y / CELL), 0, ROWS - 1);
  const cxn = Math.floor((nx + Math.sign(e.vx) * e.r) / CELL);
  if (cxn < 0 || cxn >= COLS || G.grid[cyc * COLS + cxn] === FILLED || G.grid[cyc * COLS + cxn] === OBSTACLE) { e.vx = -e.vx; nx = e.x; }
  e.x = nx;
  let ny = e.y + e.vy * dt;
  const cxc = clamp(Math.floor(e.x / CELL), 0, COLS - 1);
  const cyn = Math.floor((ny + Math.sign(e.vy) * e.r) / CELL);
  if (cyn < 0 || cyn >= ROWS || G.grid[cyn * COLS + cxc] === FILLED || G.grid[cyn * COLS + cxc] === OBSTACLE) { e.vy = -e.vy; ny = e.y; }
  e.y = ny;
}
