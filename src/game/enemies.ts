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
import { exposureField } from '../sim/veil';
import { spawnPopup } from './particles';
import { hapticHeavy } from '../platform/haptics';

export function eCell(e) {
  const cx = clamp(Math.floor(e.x / CELL), 0, COLS - 1);
  const cy = clamp(Math.floor(e.y / CELL), 0, ROWS - 1);
  return cy * COLS + cx;
}
export interface EnemyCounts { drifter: number; chaser: number; cutter: number; sentinel: number; sleeper: number; }

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
  sleeper: { name: 'GUARDIAN', desc: 'sleeps on the vault — breach it and it wakes' },
};
// Deterministically pick the k deepest open cells (max distance from any wall/
// rock) — where the vault and its guardian belong. Ties break by index so the
// choice is stable across engines (the daily replays it).
function deepestOpenCells(k: number): number[] {
  const dist = exposureField(COLS, ROWS, (i) => G.grid[i] === EMPTY);
  const open: number[] = [];
  for (let i = 0; i < dist.length; i++) if (G.grid[i] === EMPTY) open.push(i);
  open.sort((a, b) => (dist[b] - dist[a]) || (a - b));
  return open.slice(0, k);
}
export function genEnemies(lv, counts: EnemyCounts = enemyCounts(lv), vault = false) {
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
      r: CELL * 0.42, type, speed, comp, steerT: G.rng.range(0.2, 0.6) });
  }
  function placeSleeper(speed) {
    const p = spawnCell(6, true);
    out.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: CELL * 0.42, type: 'sleeper', asleep: true, speed, comp: speed * 0.7071, steerT: 0 });
  }
  for (let i = 0; i < n.drifter; i++) place('drifter', spd);
  for (let i = 0; i < n.chaser; i++) place('chaser', spd * 0.74);
  for (let i = 0; i < n.cutter; i++) place('cutter', spd * 0.8);
  for (let i = 0; i < n.sentinel; i++) place('sentinel', spd * 0.82);
  if (n.sleeper > 0 && vault) {
    // vault guardians sit on the deepest cells (the prize), and hunt at a
    // readable, escapable pace once breached — a chosen risk, not an ambush.
    for (const idx of deepestOpenCells(n.sleeper)) {
      const c = centerPx(idx);
      out.push({ x: c.x, y: c.y, vx: 0, vy: 0, r: CELL * 0.42, type: 'sleeper', asleep: true, speed: spd * 0.7, comp: spd * 0.7 * 0.7071, steerT: 0 });
    }
  } else {
    for (let i = 0; i < n.sleeper; i++) placeSleeper(spd * 0.95);
  }
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
