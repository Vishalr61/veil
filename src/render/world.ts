/* =========================================================================
   World render — everything inside the play field: the revealed nebula,
   fog, veil "tells", obstacles, coastline, power-ups, trail, particles,
   enemies, the player, and over-board hint/banner text. Pure consumer of
   the shared G state + ctx; writes nothing back except shooting-star fx.
   ========================================================================= */

import { ctx } from './surface';
import { G } from '../game/state';
import { centerPx } from '../core/grid';
import { CELL, COLS, ROWS, OFF_X, OFF_Y, PW, PH, CW, CH } from '../core/dims';
import { TAU, clamp, rand } from '../core/math';
import { EMPTY, OBSTACLE, FILLED } from '../core/constants';
import { VEIL_CACHE } from '../sim/veil';
import { OBK_BOULDER, OBK_LOG, OBK_BUSH, OBK_FLOWERBED, OBK_MUSHROOM } from '../sim/terrain';
import { hexA } from './background';
import { roundRectPath, drawGlowOrb, pointAlong, glowText } from './primitives';
import { CHASER_COL, CHASER_GLOW, ENEMY_COL, ENEMY_GLOW } from '../core/palettes';
import { BLUR_SCALE } from '../platform/perf';

// "Read the veil": a faint disturbance bleeds through the fog where content
// is hidden — it tells you WHERE, never WHAT, so the cache-or-rift gamble
// survives while attentive players can route around (or toward) the unknown.
function drawVeilTells() {
  if (!G.veilBoard.length) return;
  const px = G.player ? G.player.px : null;
  const scoutR = CELL * 3.6;            // how close you must be to sense type
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < G.veilBoard.length; i++) {
    const v = G.veilBoard[i];
    if (!v) continue;
    const c = centerPx(i);
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 1.6 + i * 0.6);
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
export function tickShootingStars(dt) {
  G.shootTimer -= dt;
  if (G.shootTimer <= 0) {
    G.shootTimer = rand(3.5, 8);
    const dir = Math.random() < 0.5 ? 1 : -1;
    G.shootingStars.push({
      x: dir > 0 ? rand(-20, PW * 0.4) : rand(PW * 0.6, PW + 20),
      y: rand(-20, PH * 0.35),
      vx: dir * rand(320, 520), vy: rand(150, 290),
      life: 0, max: rand(0.55, 1.0),
    });
  }
  for (let i = G.shootingStars.length - 1; i >= 0; i--) {
    const s = G.shootingStars[i];
    s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.life >= s.max) G.shootingStars.splice(i, 1);
  }
}
export function drawShootingStars(col = G.pal.edge2) {
  if (!G.shootingStars.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const s of G.shootingStars) {
    const a = Math.sin((s.life / s.max) * Math.PI);     // fade in then out
    const tx = s.x - s.vx * 0.045, ty = s.y - s.vy * 0.045;
    const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
    ctx.strokeStyle = g; ctx.globalAlpha = a * 0.9; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
    ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
const ROCK_SHADES = ['#2c2740', '#322d49', '#383351', '#3e3858'];   // cool basalt, dark -> light

// A single Depths obstacle cell: raised, textured rock that reads as a solid
// barrier (lighter than the floor; stony rim, NOT the coastline glow). The body
// tone varies SMOOTHLY across cells (low-frequency, no per-tile banding) so a
// cluster reads as one rock mass. 5 deterministic variants add surface interest:
// basalt / cracked / obsidian / ore / sulfur — the lava lives INSIDE the rock.
function drawDepthsRock(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;

  // body: smoothly-varying basalt tone, continuous across cells (flat fill, no
  // internal gradient/band — that was what made it look tiled).
  const m = Math.sin(x * 0.55 + y * 0.32) + Math.sin(y * 0.7 - x * 0.22);   // ~-2..2, smooth
  ctx.fillStyle = ROCK_SHADES[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);

  // fine mineral grain (stable per cell)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(px + (h % 7) + 2, py + ((h >> 2) % 6) + 2, 1.3, 1.3);
  ctx.fillStyle = 'rgba(196,192,220,0.1)'; ctx.fillRect(px + ((h >> 3) % 9) + 2, py + ((h >> 6) % 9) + 2, 1.1, 1.1);

  if (v < 18) {                       // CRACKED — dark fissure with a molten glow inside
    const y0 = py + 3 + (h % 4), y1 = py + s - 4 - ((h >> 2) % 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(px + 2, y0); ctx.lineTo(px + s - 3, y1); ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(G.pal.blobs[3], 0.45); ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(px + 2, y0); ctx.lineTo(px + s - 3, y1); ctx.stroke(); ctx.restore();
  } else if (v < 32) {                // OBSIDIAN — glassy diagonal sheen on the same body tone
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(170,185,255,0.2)'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(px + s * 0.2, py + s * 0.8); ctx.lineTo(px + s * 0.7, py + s * 0.16); ctx.stroke(); ctx.restore();
  } else if (v < 44) {                // ORE — a glowing gold speck embedded in the rock
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const ox = px + 4 + (h % Math.max(1, s - 8)), oy = py + 4 + ((h >> 4) % Math.max(1, s - 8));
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 3.5);
    g.addColorStop(0, G.pal.blobs[4]); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, 3.5, 0, TAU); ctx.fill(); ctx.restore();
  } else if (v < 52) {                // SULFUR — faint volcanic-mineral tint
    ctx.fillStyle = 'rgba(190,160,70,0.11)'; ctx.fillRect(px, py, s, s);
  }                                   // else (~48%) plain basalt

  // soft silhouette ONLY on open-facing edges (2-step falloff = rounded mass, not
  // a hard tile bevel). Interior edges (rock meeting rock) get nothing, so a
  // cluster reads as one seamless mass with a defined stony outline.
  if (G.grid[idx - COLS] === EMPTY) { ctx.fillStyle = 'rgba(206,202,230,0.4)'; ctx.fillRect(px, py, s, 1); ctx.fillStyle = 'rgba(206,202,230,0.15)'; ctx.fillRect(px, py + 1, s, 1.5); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = 'rgba(206,202,230,0.28)'; ctx.fillRect(px, py, 1, s); ctx.fillStyle = 'rgba(206,202,230,0.1)'; ctx.fillRect(px + 1, py, 1.5, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px, py + s - 1, s, 1); ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.fillRect(px, py + s - 2.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px + s - 1, py, 1, s); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px + s - 2.5, py, 1.5, s); }
}

const FACET_TONES = ['#322248', '#3c2a58', '#46306a', '#2a1c44'];   // cut-crystal facets, varied

// A Crystal Caves obstacle: a faceted CUT-CRYSTAL block — geometric planes split
// from an off-center hub, with light-catching edges and bright crystal rims.
// Deliberately NOT the Depths' smooth dark basalt: brighter, angular, refractive.
function drawCavesRock(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;
  const hx = px + s * 0.5 + ((h % 7) - 3), hy = py + s * 0.5 + (((h >> 3) % 7) - 3);   // off-center facet hub
  const cn = [[px, py], [px + s, py], [px + s, py + s], [px, py + s]];

  // 1. triangular facets fanning from the hub — each a different violet tone (cut gem)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = FACET_TONES[(h >> (i * 2)) & 3];
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cn[i][0], cn[i][1]); ctx.lineTo(cn[(i + 1) % 4][0], cn[(i + 1) % 4][1]); ctx.closePath(); ctx.fill();
  }

  // 2. light-catching facet edges + an occasional bright glint at the hub
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(G.pal.blobs[3], 0.28); ctx.lineWidth = 0.7;
  for (const c of cn) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
  if (v < 36) { ctx.fillStyle = hexA(G.pal.blobs[4], 0.28); ctx.beginPath(); ctx.arc(hx, hy, 3, 0, TAU); ctx.fill(); ctx.fillStyle = hexA(G.pal.blobs[4], 0.85); ctx.beginPath(); ctx.arc(hx, hy, 1.3, 0, TAU); ctx.fill(); }
  ctx.restore();

  // 3. sharp bright crystal rim on open-facing edges (defines the cluster); dark
  //    grounding shadow on the bottom/right.
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(G.pal.blobs[3], 0.45); ctx.lineWidth = 1; ctx.beginPath();
  if (G.grid[idx - COLS] === EMPTY) { ctx.moveTo(px + 0.5, py + 0.6); ctx.lineTo(px + s - 0.5, py + 0.6); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.moveTo(px + 0.5, py + s - 0.6); ctx.lineTo(px + s - 0.5, py + s - 0.6); }
  if (G.grid[idx - 1] === EMPTY) { ctx.moveTo(px + 0.6, py + 0.5); ctx.lineTo(px + 0.6, py + s - 0.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.moveTo(px + s - 0.6, py + 0.5); ctx.lineTo(px + s - 0.6, py + s - 0.5); }
  ctx.stroke(); ctx.restore();
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

const ABYSS_SHADES = ['#0a2630', '#0e2e3a', '#123642', '#163e4c'];   // dark teal stone, dark -> light

// An Abyss obstacle: smooth dark-teal encrusted stone with glowing bioluminescent
// specks — softer/rounder than the Depths basalt and the Caves crystal, with a
// soft cyan-lit rim. A third distinct material.
function drawAbyssRock(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;
  const m = Math.sin(x * 0.55 + y * 0.32) + Math.sin(y * 0.7 - x * 0.22);
  ctx.fillStyle = ABYSS_SHADES[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(px + (h % 7) + 2, py + ((h >> 2) % 6) + 2, 1.3, 1.3);
  ctx.fillStyle = 'rgba(150,210,220,0.1)'; ctx.fillRect(px + ((h >> 3) % 9) + 2, py + ((h >> 6) % 9) + 2, 1.1, 1.1);

  // boulder volume — rounded encrusted stone (darker lower) so it's not a flat tile
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(px, py + s * 0.6, s, s * 0.4);
  ctx.fillStyle = 'rgba(120,200,205,0.07)'; ctx.fillRect(px, py, s, s * 0.3);

  // bioluminescent polyps — 2-3 glowing dots (cheap additive halo + core, NO
  // shadowBlur: per-cell blur every frame tanks performance at obstacle density).
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0, polyps = 2 + (v % 2); i < polyps; i++) {
    const ox = px + 3 + ((h >> (i * 5)) % Math.max(1, s - 6)), oy = py + 3 + ((h >> (i * 5 + 2)) % Math.max(1, s - 6));
    ctx.globalAlpha = 0.14; ctx.fillStyle = G.pal.blobs[4]; ctx.beginPath(); ctx.arc(ox, oy, 2.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(ox, oy, 1.1, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // a small coral "crown" of bumps where the rock meets open water above
  if (G.grid[idx - COLS] === EMPTY) {
    ctx.save(); ctx.fillStyle = hexA(G.pal.blobs[2], 0.55);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(px + (i + 0.5) * s / 3, py + 1.5, 1.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // encrusted bioluminescent rim on open edges + grounding shadow
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(G.pal.blobs[3], 0.42); ctx.lineWidth = 1; ctx.beginPath();
  if (G.grid[idx - COLS] === EMPTY) { ctx.moveTo(px + 0.5, py + 0.6); ctx.lineTo(px + s - 0.5, py + 0.6); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.moveTo(px + 0.5, py + s - 0.6); ctx.lineTo(px + s - 0.5, py + s - 0.6); }
  if (G.grid[idx - 1] === EMPTY) { ctx.moveTo(px + 0.6, py + 0.5); ctx.lineTo(px + 0.6, py + s - 0.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.moveTo(px + s - 0.6, py + 0.5); ctx.lineTo(px + s - 0.6, py + s - 0.5); }
  ctx.stroke(); ctx.restore();
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

const FLORA_SHADES = ['#0c2414', '#10301c', '#163a22', '#1c442a'];   // mossy green stone, dark -> light

// An Overgrowth obstacle: mossy, root-wrapped stone with glowing flora specks and
// a leafy crown — organic and overgrown, a fourth distinct material. No per-cell
// shadowBlur (additive fake-glow only).
function drawFloraRock(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;
  const m = Math.sin(x * 0.55 + y * 0.32) + Math.sin(y * 0.7 - x * 0.22);
  ctx.fillStyle = FLORA_SHADES[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(px, py + s * 0.6, s, s * 0.4);
  ctx.fillStyle = hexA(G.pal.blobs[2], 0.16); ctx.fillRect(px + (h % 6) + 2, py + ((h >> 2) % 6) + 2, 2, 2);   // moss patch
  ctx.fillStyle = 'rgba(170,220,160,0.1)'; ctx.fillRect(px + ((h >> 3) % 9) + 2, py + ((h >> 6) % 9) + 2, 1.2, 1.2);

  ctx.save(); ctx.globalCompositeOperation = 'lighter';   // glowing flora specks (fake glow, no blur)
  for (let i = 0, n = 1 + (v % 2); i < n; i++) {
    const ox = px + 3 + ((h >> (i * 5)) % Math.max(1, s - 6)), oy = py + 3 + ((h >> (i * 5 + 2)) % Math.max(1, s - 6));
    ctx.globalAlpha = 0.13; ctx.fillStyle = G.pal.blobs[4]; ctx.beginPath(); ctx.arc(ox, oy, 2.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(ox, oy, 1, 0, TAU); ctx.fill();
  }
  // leafy/moss crown where rock meets open above
  if (G.grid[idx - COLS] === EMPTY) {
    ctx.globalAlpha = 0.45; ctx.strokeStyle = G.pal.blobs[3]; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const tx = px + (i + 0.5) * s / 4; ctx.beginPath(); ctx.moveTo(tx, py + 2); ctx.lineTo(tx + ((h >> i) % 3) - 1, py - 1.5); ctx.stroke(); }
  }
  ctx.restore();

  // soft green rim + grounding shadow
  if (G.grid[idx - COLS] === EMPTY) { ctx.fillStyle = hexA(G.pal.blobs[3], 0.28); ctx.fillRect(px, py, s, 1); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = hexA(G.pal.blobs[3], 0.2); ctx.fillRect(px, py, 1, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

const BLOOM_SHADES = ['#08231a', '#0c2e22', '#11392b', '#174634'];    // mossy teal-green stone (flowerbed/mushroom base)
const BOULDER_SHADES = ['#1e2622', '#28322c', '#323c36', '#3c4640'];  // bare grey-green stone
const LOG_SHADES = ['#16210f', '#1e2b15', '#28351b', '#323f23'];      // mossy green-olive wood (fits the garden)
const BUSH_SHADES = ['#0a2410', '#0e2e16', '#13381c', '#184224'];     // deep saturated leaf green
// The Bloom's crafted terrain. Each obstacle CLUSTER is a garden-object KIND
// (G.obstacleKind, from assignObstacleKinds): boulder / log / bush / flowerbed /
// mushroom mound — rendered distinctly but still neighbor edge-lit, so a multi-cell
// object reads as one coherent mass rather than uniform blocks.
function drawBloomRock(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const k = G.obstacleKind.length ? G.obstacleKind[idx] : 0;
  const m = Math.sin(x * 0.5 + y * 0.3) + Math.sin(y * 0.65 - x * 0.2);
  const shades = k === OBK_LOG ? LOG_SHADES : k === OBK_BUSH ? BUSH_SHADES : k === OBK_BOULDER ? BOULDER_SHADES : BLOOM_SHADES;
  ctx.fillStyle = shades[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(px, py + s * 0.62, s, s * 0.38);          // grounding shadow
  // edge lighting where this object meets open (bare stone gets a cool grey rim, plants green)
  const topOpen = G.grid[idx - COLS] === EMPTY;
  const litCol = k === OBK_BOULDER ? '#9fb0a8' : G.pal.blobs[3];
  if (topOpen) { ctx.fillStyle = hexA(litCol, 0.32); ctx.fillRect(px, py, s, 1.4); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = hexA(litCol, 0.2); ctx.fillRect(px, py, 1.2, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(px, py + s - 1.6, s, 1.6); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(px + s - 1.6, py, 1.6, s); }
  const cx = px + s / 2, cy = py + s / 2;
  ctx.save();
  if (k === OBK_LOG) {                                           // a MOSSY log: horizontal grain banding + green moss
    ctx.globalAlpha = 0.34; ctx.fillStyle = '#0b1207';
    ctx.fillRect(px, py + s * 0.34, s, 1); ctx.fillRect(px, py + s * 0.64, s, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3; ctx.fillStyle = G.pal.blobs[3];
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(px + 3 + ((h >> (i * 3)) % Math.max(1, s - 6)), py + 2 + ((h >> (i * 3 + 1)) % 4), 1.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  } else if (k === OBK_BUSH) {                                   // dense overlapping leaves + an occasional berry
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const ox = px + 2 + ((h >> (i * 3)) % Math.max(1, s - 4)), oy = py + 1 + ((h >> (i * 3 + 1)) % Math.max(1, s - 4)), rr = 1.8 + ((h >> (i * 3 + 2)) % 3) * 0.7;
      ctx.globalAlpha = 0.36; ctx.fillStyle = G.pal.blobs[3]; ctx.beginPath(); ctx.arc(ox, oy, rr, 0, TAU); ctx.fill();
    }
    if (h % 3 === 0) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff6a8a'; ctx.beginPath(); ctx.arc(cx, cy, 1.4, 0, TAU); ctx.fill(); }
  } else if (k === OBK_FLOWERBED) {                              // a bed of bright pink/gold flowers
    ctx.globalCompositeOperation = 'lighter';
    const fcol = (h % 2) ? '#ff9ad8' : '#ffd45c';
    ctx.globalAlpha = 0.6; ctx.fillStyle = fcol;
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + h; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, 1.7, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 0.95; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, TAU); ctx.fill();
  } else if (k === OBK_MUSHROOM && topOpen) {                    // a big glowing cap poking up
    ctx.globalCompositeOperation = 'lighter';
    const my = py, cr = s * 0.44, g = ctx.createRadialGradient(cx, my, 0, cx, my, cr);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, hexA(G.pal.blobs[4], 0.8)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.9; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, my, cr, cr * 0.7, 0, Math.PI, TAU); ctx.fill();
  } else {                                                       // BOULDER: smooth bare stone — a soft grey lit dome
    ctx.globalCompositeOperation = 'lighter';
    if (topOpen) { ctx.globalAlpha = 0.18; ctx.fillStyle = '#9fb0a8'; ctx.beginPath(); ctx.ellipse(px + s * 0.36, py + s * 0.32, s * 0.34, s * 0.22, -0.5, 0, TAU); ctx.fill(); }
    const ox = px + 3 + (h % Math.max(1, s - 6)), oy = py + 3 + ((h >> 6) % Math.max(1, s - 6));
    ctx.globalAlpha = 0.1; ctx.fillStyle = G.pal.blobs[4]; ctx.beginPath(); ctx.arc(ox, oy, 1.8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Bloom garden decor — non-blocking flora that appears on the territory you CLAIM
// (rendered only on FILLED cells), so revealing the garden is its own reward.
// Presentation only (Math.random; Bloom never runs the seeded daily).
export function genBloomDecor() {
  G.bloomDecor.length = 0;
  if (!G.pal || G.pal.style !== 'bloom') return;
  for (let i = 0; i < 46; i++) {
    const cxc = 1 + Math.floor(Math.random() * (COLS - 2)), cyc = 1 + Math.floor(Math.random() * (ROWS - 2));
    const r = Math.random();
    const type = r < 0.42 ? 'flower' : r < 0.72 ? 'glint' : r < 0.9 ? 'pool' : 'lily';
    G.bloomDecor.push({ cell: cyc * COLS + cxc, x: (cxc + 0.5) * CELL, y: (cyc + 0.5) * CELL, type,
      hue: Math.random(), size: 0.6 + Math.random() * 0.6, ph: Math.random() * TAU });
  }
}
function drawBloomDecor(d, t) {
  const x = d.x, y = d.y, col = d.hue < 0.5 ? G.pal.blobs[4] : '#ffe9a0';   // mint flora or warm pollen
  if (d.type === 'glint') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + d.ph));
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 1.4 * d.size, 0, TAU); ctx.fill();
  } else if (d.type === 'pool') {
    ctx.globalCompositeOperation = 'lighter';
    const r = CELL * (0.9 + d.size * 0.5), g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(G.pal.blobs[3], 0.18)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 1.5 + d.ph); ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  } else if (d.type === 'lily') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5; ctx.fillStyle = hexA(G.pal.blobs[2], 0.6);
    ctx.beginPath(); ctx.ellipse(x, y, CELL * 0.42 * d.size, CELL * 0.3 * d.size, d.ph, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.fillStyle = hexA(G.pal.blobs[4], 0.5);
    ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill();
  } else {   // flower — a few petals that gently sway around a bright core
    ctx.globalCompositeOperation = 'lighter';
    const sz = CELL * 0.3 * d.size, sway = t === 0 ? 0 : Math.sin(t * 1.5 + d.ph) * 0.5;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + sway, pxp = x + Math.cos(a) * sz, pyp = y + Math.sin(a) * sz;
      ctx.globalAlpha = 0.4; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pxp, pyp, sz * 0.62, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, sz * 0.5, 0, TAU); ctx.fill();
  }
}

const CLOUD_SHADES = ['#3a3450', '#4c4466', '#5e5680', '#74698f'];   // cool dusk cloud, dark -> light

// An Expanse obstacle: a dense dawn cloud — a cool shadowed body with a warm
// sunlit crown and soft puff texture. The cool tone contrasts the warm dawn sky
// so the barrier stays readable; a fifth, soft material. No per-cell shadowBlur.
function drawSkyCloud(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;
  const m = Math.sin(x * 0.5 + y * 0.3) + Math.sin(y * 0.66 - x * 0.2);
  ctx.fillStyle = CLOUD_SHADES[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = hexA(G.pal.blobs[3], 0.16); ctx.fillRect(px, py, s, s * 0.42);          // dawn-lit upper band
  ctx.fillStyle = 'rgba(14,10,28,0.34)'; ctx.fillRect(px, py + s * 0.6, s, s * 0.4);       // shadowed underside
  ctx.fillStyle = 'rgba(230,224,245,0.12)'; ctx.fillRect(px + (h % 6) + 2, py + ((h >> 2) % 5) + 2, 2.4, 2.4);   // puff highlight
  ctx.fillStyle = 'rgba(10,6,22,0.14)'; ctx.fillRect(px + ((h >> 3) % 8) + 2, py + ((h >> 5) % 7) + 4, 1.6, 1.6); // puff hollow

  ctx.save(); ctx.globalCompositeOperation = 'lighter';   // sunlit highlights (fake glow, no blur)
  for (let i = 0, n = 1 + (v % 2); i < n; i++) {
    const ox = px + 3 + ((h >> (i * 5)) % Math.max(1, s - 6)), oy = py + 2 + ((h >> (i * 5 + 2)) % Math.max(1, Math.floor(s * 0.5)));
    ctx.globalAlpha = 0.12; ctx.fillStyle = G.pal.blobs[4]; ctx.beginPath(); ctx.arc(ox, oy, 2.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ox, oy, 1, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // bright sunlit crown on top/left open edges; strong cool shadow on the underside
  if (G.grid[idx - COLS] === EMPTY) { ctx.fillStyle = hexA(G.pal.blobs[4], 0.5); ctx.fillRect(px, py, s, 1.5); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = hexA(G.pal.blobs[4], 0.28); ctx.fillRect(px, py, 1.5, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(8,6,20,0.5)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(8,6,20,0.4)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

const ICE_SHADES = ['#173a4e', '#1f4e64', '#2a647e', '#3a7e96'];   // glacial blue ice, dark -> light

// An Aurora obstacle: a block of frosted glacial ice — translucent blue body with
// internal cracks, a cold inner sheen and a snow-frost cap. A sixth material,
// distinct from the sharp cut-crystal of the Caves. No per-cell shadowBlur.
function drawIceRock(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;
  const m = Math.sin(x * 0.5 + y * 0.3) + Math.sin(y * 0.66 - x * 0.2);
  ctx.fillStyle = ICE_SHADES[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(200,235,245,0.12)'; ctx.fillRect(px, py, s * 0.55, s * 0.4);     // frosted upper-left sheen
  ctx.fillStyle = 'rgba(6,18,30,0.32)'; ctx.fillRect(px, py + s * 0.6, s, s * 0.4);       // cold lower shadow

  ctx.strokeStyle = 'rgba(185,232,246,0.22)'; ctx.lineWidth = 0.8;   // internal ice cracks
  ctx.beginPath();
  let cx = px + (h % 6) + 2, cy = py + 3; ctx.moveTo(cx, cy);
  for (let k = 0; k < 3; k++) { cx += ((h >> (k * 3)) % 7) - 3; cy += 4 + ((h >> (k * 2)) % 4); ctx.lineTo(cx, cy); }
  ctx.stroke();

  ctx.save(); ctx.globalCompositeOperation = 'lighter';   // cold inner glow (fake glow, no blur)
  for (let i = 0, n = 1 + (v % 2); i < n; i++) {
    const ox = px + 3 + ((h >> (i * 5)) % Math.max(1, s - 6)), oy = py + 3 + ((h >> (i * 5 + 2)) % Math.max(1, s - 6));
    ctx.globalAlpha = 0.1; ctx.fillStyle = G.pal.blobs[3]; ctx.beginPath(); ctx.arc(ox, oy, 2.4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(ox, oy, 0.9, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // bright frost cap on the top-open edge; cold rim left; deep shadow underside
  if (G.grid[idx - COLS] === EMPTY) {
    ctx.fillStyle = 'rgba(220,245,250,0.5)'; ctx.fillRect(px, py, s, 1.5);
    ctx.fillStyle = 'rgba(220,245,250,0.3)';
    for (let i = 0; i < 3; i++) ctx.fillRect(px + (i + 0.5) * s / 3 - 1.5 + ((h >> i) % 2), py - 1, 3, 2);   // frost bumps
  }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = hexA(G.pal.blobs[3], 0.3); ctx.fillRect(px, py, 1.5, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(4,14,24,0.5)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(4,14,24,0.4)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

const ASTEROID_SHADES = ['#161428', '#221f38', '#2f2b4a', '#3d375c'];   // cold grey-violet rock, dark -> light

// A Deep Space obstacle: a pitted metallic asteroid — cold grey-violet rock lit
// faintly by starlight, peppered with craters and mineral flecks. A seventh
// material; rocky like the Depths basalt but cratered and cold, not lava-veined.
function drawAsteroid(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;
  const m = Math.sin(x * 0.5 + y * 0.3) + Math.sin(y * 0.66 - x * 0.2);
  ctx.fillStyle = ASTEROID_SHADES[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(180,165,220,0.1)'; ctx.fillRect(px, py, s * 0.5, s * 0.45);   // starlit upper-left
  ctx.fillStyle = 'rgba(4,4,16,0.34)'; ctx.fillRect(px, py + s * 0.6, s, s * 0.4);     // dark underside

  for (let i = 0, n = 1 + (v % 2); i < n; i++) {   // craters (dark pit + lit lip)
    const ox = px + 3 + ((h >> (i * 5)) % Math.max(1, s - 6)), oy = py + 3 + ((h >> (i * 5 + 2)) % Math.max(1, s - 6)), cr = 1.6 + ((h >> (i * 3)) % 2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.arc(ox, oy, cr, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(185,170,225,0.18)'; ctx.beginPath(); ctx.arc(ox - 0.5, oy - 0.5, cr * 0.55, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(205,190,240,0.13)'; ctx.fillRect(px + (h % 7) + 1, py + ((h >> 3) % 7) + 1, 1.2, 1.2);   // mineral fleck

  // cold violet starlight rim on top/left open edges; deep void shadow underside
  if (G.grid[idx - COLS] === EMPTY) { ctx.fillStyle = hexA(G.pal.blobs[3], 0.38); ctx.fillRect(px, py, s, 1.5); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = hexA(G.pal.blobs[3], 0.24); ctx.fillRect(px, py, 1.5, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(2,2,10,0.5)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(2,2,10,0.4)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

const RIFT_SHADES = ['#1a0e2e', '#26143e', '#341a52', '#442468'];   // dark glassy violet

// A Rift obstacle: a shard of fractured glass-crystal with internal cracks and a
// chromatic rim split (cyan light edge / magenta shadow edge) — the daily zone's
// glitch signature, distinct from the campaign's solid materials. No shadowBlur.
function drawRiftShard(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const v = h % 100;
  const m = Math.sin(x * 0.5 + y * 0.3) + Math.sin(y * 0.66 - x * 0.2);
  ctx.fillStyle = RIFT_SHADES[Math.max(0, Math.min(3, Math.round((m + 2) / 4 * 3)))];
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(180,140,255,0.12)'; ctx.fillRect(px, py, s * 0.5, s * 0.42);   // glassy sheen
  ctx.fillStyle = 'rgba(4,2,12,0.34)'; ctx.fillRect(px, py + s * 0.6, s, s * 0.4);     // dark underside

  ctx.strokeStyle = 'rgba(150,210,255,0.25)'; ctx.lineWidth = 0.7;   // internal fracture crack
  ctx.beginPath(); let cx = px + (h % 6) + 2, cy = py + 3; ctx.moveTo(cx, cy);
  for (let k = 0; k < 3; k++) { cx += ((h >> (k * 3)) % 8) - 4; cy += 3 + ((h >> (k * 2)) % 4); ctx.lineTo(cx, cy); }
  ctx.stroke();

  ctx.save(); ctx.globalCompositeOperation = 'lighter';   // prism glints (fake glow, no blur)
  for (let i = 0, n = 1 + (v % 2); i < n; i++) {
    const ox = px + 3 + ((h >> (i * 5)) % Math.max(1, s - 6)), oy = py + 3 + ((h >> (i * 5 + 2)) % Math.max(1, s - 6));
    const col = (h >> i) & 1 ? '#5cf0ff' : '#ff5ce0';
    ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox, oy, 2.4, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ox, oy, 0.9, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // chromatic rim split — cyan on top/left open edges, magenta on bottom/right
  if (G.grid[idx - COLS] === EMPTY) { ctx.fillStyle = 'rgba(92,240,255,0.5)'; ctx.fillRect(px, py, s, 1.5); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = 'rgba(92,240,255,0.3)'; ctx.fillRect(px, py, 1.5, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(255,92,224,0.5)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(255,92,224,0.4)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

// A Rift VOID MONOLITH: near-black obsidian with a single glowing crack — a heavy,
// dark counterpoint to the translucent shard.
function drawRiftMonolith(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  const col = (h & 1) ? '#5cf0ff' : '#ff5ce0';
  ctx.fillStyle = '#0a0816'; ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(120,90,180,0.08)'; ctx.fillRect(px, py, s, s * 0.4);
  ctx.fillStyle = 'rgba(2,1,8,0.4)'; ctx.fillRect(px, py + s * 0.62, s, s * 0.38);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';   // a glowing crack (fake glow, no blur)
  ctx.globalAlpha = 0.5; ctx.strokeStyle = col; ctx.lineWidth = 1;
  const cx = px + s * 0.4 + (h % 4); let yy = py, xx = cx; ctx.beginPath(); ctx.moveTo(cx, py);
  for (let k = 0; k < 3; k++) { yy += s / 3; xx += ((h >> (k * 2)) % 3) - 1; ctx.lineTo(xx, yy); }
  ctx.stroke();
  ctx.globalAlpha = 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, py + s * 0.5, 1.4, 0, TAU); ctx.fill();
  ctx.restore();
  if (G.grid[idx - COLS] === EMPTY) { ctx.fillStyle = hexA(col, 0.3); ctx.fillRect(px, py, s, 1.3); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = 'rgba(120,90,180,0.18)'; ctx.fillRect(px, py, 1.3, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(2,1,8,0.5)'; ctx.fillRect(px, py + s - 1.3, s, 1.3); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(2,1,8,0.4)'; ctx.fillRect(px + s - 1.3, py, 1.3, s); }
}

// A Rift ENERGIZED CRYSTAL: a saturated violet facet with a live glowing core —
// the brightest of the three forms.
function drawRiftCrystal(px: number, py: number, x: number, y: number, idx: number) {
  const s = CELL;
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  ctx.fillStyle = '#3a1f6e'; ctx.fillRect(px, py, s, s);
  ctx.fillStyle = 'rgba(200,150,255,0.16)'; ctx.fillRect(px, py, s * 0.55, s * 0.45);
  ctx.fillStyle = 'rgba(8,4,20,0.3)'; ctx.fillRect(px, py + s * 0.6, s, s * 0.4);
  ctx.strokeStyle = 'rgba(190,150,255,0.3)'; ctx.lineWidth = 0.7;   // facet lines
  ctx.beginPath(); ctx.moveTo(px + 2, py + s - 2); ctx.lineTo(px + s * 0.5, py + 2); ctx.lineTo(px + s - 2, py + s - 2); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';   // energized core
  const ox = px + s * 0.5, oy = py + s * 0.5;
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#b86cff'; ctx.beginPath(); ctx.arc(ox, oy, 3.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.6; ctx.fillStyle = (h & 1) ? '#5cf0ff' : '#d8b0ff'; ctx.beginPath(); ctx.arc(ox, oy, 1.1, 0, TAU); ctx.fill();
  ctx.restore();
  if (G.grid[idx - COLS] === EMPTY) { ctx.fillStyle = 'rgba(120,240,255,0.55)'; ctx.fillRect(px, py, s, 1.5); }
  if (G.grid[idx - 1] === EMPTY) { ctx.fillStyle = 'rgba(120,240,255,0.35)'; ctx.fillRect(px, py, 1.5, s); }
  if (G.grid[idx + COLS] === EMPTY) { ctx.fillStyle = 'rgba(255,120,230,0.5)'; ctx.fillRect(px, py + s - 1.5, s, 1.5); }
  if (G.grid[idx + 1] === EMPTY) { ctx.fillStyle = 'rgba(255,120,230,0.4)'; ctx.fillRect(px + s - 1.5, py, 1.5, s); }
}

// Pick a Rift obstacle form per coarse region so formations stay coherent (a
// whole pillar reads as one material) rather than speckled cell-by-cell.
function drawRiftCell(px: number, py: number, x: number, y: number, idx: number) {
  const rh = (((x / 4) | 0) * 73856093) ^ (((y / 4) | 0) * 19349663);
  const v = (rh >>> 0) % 3;
  if (v === 0) drawRiftMonolith(px, py, x, y, idx);
  else if (v === 1) drawRiftCrystal(px, py, x, y, idx);
  else drawRiftShard(px, py, x, y, idx);
}

function drawObstacles() {
  const style = G.pal.style;
  ctx.save();
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const idx = y * COLS + x;
      if (G.grid[idx] !== OBSTACLE) continue;
      const px = x * CELL, py = y * CELL;
      if (style === 'magma') {
        drawDepthsRock(px, py, x, y, idx);
      } else if (style === 'caves') {
        drawCavesRock(px, py, x, y, idx);
      } else if (style === 'ocean') {
        drawAbyssRock(px, py, x, y, idx);
      } else if (style === 'flora') {
        drawFloraRock(px, py, x, y, idx);
      } else if (style === 'bloom') {
        drawBloomRock(px, py, x, y, idx);
      } else if (style === 'sky') {
        drawSkyCloud(px, py, x, y, idx);
      } else if (style === 'aurora') {
        drawIceRock(px, py, x, y, idx);
      } else if (style === 'space') {
        drawAsteroid(px, py, x, y, idx);
      } else if (style === 'rift') {
        drawRiftCell(px, py, x, y, idx);
      } else {
        ctx.fillStyle = G.pal.blobs[1];                      // band-tinted solid mass (ice/coral/rock/asteroid)
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = hexA(G.pal.edge2, 0.16); ctx.fillRect(px, py, CELL, 2);          // themed top light
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, py + CELL - 2, CELL, 2);  // bottom shadow
      }
    }
  }
  ctx.restore();
}
/* --- enemy designs: simple molecules, dim glow + gentle motion --- */
// A restrained molecular node: a solid core with a small, faint glow (much
// dimmer than drawGlowOrb so the enemies don't blow out).
function molNode(x, y, r, core, glow) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}
function bond(x1, y1, x2, y2, col) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
  ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
// Drifter — a calm drifting CELL: a bright core inside a softly-breathing,
// slightly irregular membrane, trailing a short comet smear opposite its travel
// so its direction reads. No orbiting satellites. Inert, just bounces.
function drawDrifterBody(e, o, pulse) {
  // REDUCE-MOTION: a clean, simple glowing cell — a core + one tidy membrane ring.
  // Zero animation (like the firefly's off-motion look).
  if (G.reduceMotion) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5; ctx.strokeStyle = o.glow; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.92, 0, TAU); ctx.stroke(); ctx.restore();
    molNode(e.x, e.y, e.r * 0.5, o.col, o.glow);
    return;
  }
  const t = G.time;
  const sp = Math.hypot(e.vx || 0, e.vy || 0) || 1;
  const ux = (e.vx || 0) / sp, uy = (e.vy || 1) / sp;   // travel direction
  // comet smear behind the cell (a soft tapered glow opposite velocity)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const tx = e.x - ux * e.r * 1.5, ty = e.y - uy * e.r * 1.5;
  const sm = ctx.createRadialGradient(tx, ty, 0, tx, ty, e.r * 1.6);
  sm.addColorStop(0, o.glow); sm.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.22; ctx.fillStyle = sm; ctx.beginPath(); ctx.arc(tx, ty, e.r * 1.6, 0, TAU); ctx.fill();
  // breathing membrane — a wobbling near-circle that reads as a living cell
  const mr = e.r * (0.92 + 0.06 * Math.sin(t * 2 + e.x));
  ctx.globalAlpha = 0.5; ctx.strokeStyle = o.glow; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const ang = i / 16 * TAU, wob = 1 + 0.08 * Math.sin(ang * 3 + t * 1.6 + e.y);
    const x = e.x + Math.cos(ang) * mr * wob, y = e.y + Math.sin(ang) * mr * wob;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke(); ctx.restore();
  // the bright nucleus
  molNode(e.x, e.y, e.r * 0.5 * (pulse || 1), o.col, o.glow);
}
// Chaser — a polar molecule whose lobe points where it's hunting (at you).
function drawChaserBody(e, o) {
  let ux = 1, uy = 0;
  if (G.player && G.player.px) { const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y, d = Math.hypot(dx, dy) || 1; ux = dx / d; uy = dy / d; }
  const lx = e.x + ux * e.r * 1.15, ly = e.y + uy * e.r * 1.15;
  bond(e.x, e.y, lx, ly, o.glow);
  molNode(e.x, e.y, e.r * 0.6, o.col, o.glow);
  molNode(lx, ly, e.r * 0.42, '#dfeaf5', o.glow);
}
// Cutter — a 3-atom ring that turns slowly (the ring is the blade).
function drawCutterBody(e, o) {
  const a = G.reduceMotion ? 0 : G.time * 1.3;
  const pts = [];
  for (let i = 0; i < 3; i++) { const ang = a + i * TAU / 3; pts.push({ x: e.x + Math.cos(ang) * e.r * 1.2, y: e.y + Math.sin(ang) * e.r * 1.2 }); }
  for (let i = 0; i < 3; i++) bond(pts[i].x, pts[i].y, pts[(i + 1) % 3].x, pts[(i + 1) % 3].y, o.glow);
  molNode(e.x, e.y, e.r * 0.32, '#dfeaf5', o.glow);
  for (const q of pts) molNode(q.x, q.y, e.r * 0.4, o.col, o.glow);
}
// Sentinel — a caged atom: shell tight + dim while dormant, FLARES open (an
// electron snapping toward you) the moment you rest on safe land.
function drawSentinelBody(e, o) {
  const pc = G.player && G.player.px ? (Math.floor(G.player.px.y / CELL) * COLS + Math.floor(G.player.px.x / CELL)) : -1;
  const armed = pc >= 0 && G.grid[pc] === FILLED;
  molNode(e.x, e.y, e.r * 0.55, o.col, o.glow);
  const rr = armed ? e.r * 1.55 : e.r * 0.95;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = o.glow; ctx.globalAlpha = armed ? 0.5 : 0.22; ctx.lineWidth = armed ? 1.5 : 1;
  ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, TAU); ctx.stroke(); ctx.restore();
  if (armed) {
    let ux = 0, uy = 0; if (G.player) { const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y, d = Math.hypot(dx, dy) || 1; ux = dx / d; uy = dy / d; }
    molNode(e.x + ux * rr, e.y + uy * rr, e.r * 0.34, '#dfeaf5', o.glow);
  }
}
// The Qix (boss) — a grand luminous mass: a bright core with a hot white heart,
// wreathed in two smooth, symmetric rings of orbiting electrons (the molecular
// look, refined). Pleasant + imposing, not jittery. REDUCE-MOTION freezes it to
// a clean static molecule. Shrinks (via e.r) as you claim the board.
function drawQixBody(e, o) {
  const r = e.r, rm = G.reduceMotion, t = rm ? 0 : G.time;
  // grand soft halo
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 1.9);
  g.addColorStop(0, o.glow); g.addColorStop(0.5, hexA(o.glow, 0.14)); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = rm ? 0.26 : 0.24 + 0.06 * Math.sin(t * 1.5); ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * 1.9, 0, TAU); ctx.fill();
  ctx.restore();
  // outer ring — 6 electrons on a clean circular orbit, slowly turning
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = t * 0.4 + i * TAU / N, rr = r * 1.06;
    molNode(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, r * 0.16, i % 2 ? '#ffd9c0' : '#fff2ea', o.glow);
  }
  // inner ring — 3 electrons counter-rotating closer in (depth)
  for (let i = 0; i < 3; i++) {
    const a = -t * 0.6 + i * TAU / 3, rr = r * 0.66;
    molNode(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, r * 0.13, '#fff5ee', o.glow);
  }
  // luminous core + a softly-breathing warm heart (kept restrained — not blinding)
  molNode(e.x, e.y, r * 0.52, o.col, o.glow);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const cg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 0.4);
  cg.addColorStop(0, '#ffe0d6'); cg.addColorStop(1, hexA(o.glow, 0));
  ctx.globalAlpha = rm ? 0.42 : 0.38 + 0.12 * Math.sin(t * 2); ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.4, 0, TAU); ctx.fill();
  ctx.restore();
}
// Wraith — an unstable isotope: a faint trembling nucleus; it solidifies and
// telegraphs (charge ring + aim line) before it blinks at you.
function drawWraithBody(e, o) {
  const charging = e.charging > 0;
  const a = charging ? 1 : 0.4 + 0.15 * Math.sin(G.time * 6 + e.x);
  const jx = G.reduceMotion ? 0 : Math.sin(G.time * 11 + e.y) * 0.6, jy = G.reduceMotion ? 0 : Math.cos(G.time * 9 + e.x) * 0.6;
  ctx.save(); ctx.globalAlpha = a;
  molNode(e.x + jx, e.y + jy, e.r * 0.6, o.col, o.glow);
  for (let i = 0; i < 2; i++) {
    const ang = (G.reduceMotion ? 0 : G.time * (i ? -1.4 : 1.4)) + i * Math.PI;
    molNode(e.x + jx + Math.cos(ang) * e.r * 1.05, e.y + jy + Math.sin(ang) * e.r * 0.65, e.r * 0.28, '#dfeaf5', o.glow);
  }
  ctx.restore();
  if (charging) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const k = 1 - e.charging / 0.7;
    ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(G.time * 30)); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.4 + k * 1.8), 0, TAU); ctx.stroke();
    if (G.player && G.player.px) { const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y, d = Math.hypot(dx, dy) || 1; ctx.strokeStyle = '#5cf0ff'; ctx.globalAlpha = 0.5 * k; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + dx / d * CELL * 2, e.y + dy / d * CELL * 2); ctx.stroke(); }
    ctx.restore();
  }
}
// Firefly (Bloom) — a warm glowing nucleus with a soft trailing spark, and a
// faint ring tracing its orbit so the path it follows is readable at a glance.
function drawFireflyBody(e, o) {
  // (no orbit-ring hint — the path should be read from the firefly itself)
  const flick = G.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(G.time * 8 + e.x);
  // a small spark trailing behind along the direction of travel
  const tx = e.x - Math.sin(e.oang) * Math.sign(e.ow) * e.r * 1.1;
  const ty = e.y + Math.cos(e.oang) * Math.sign(e.ow) * e.r * 1.1;
  molNode(tx, ty, e.r * 0.22, '#fff7d6', o.glow);
  molNode(e.x, e.y, e.r * 0.6 * flick, o.col, o.glow);
}
// Sprite (Bloom) — a curled bud: a calm core ringed by petals that swell and
// brighten while it charges, telegraphing the coming hop.
function drawSpriteBody(e, o) {
  // brief green zip streak from where it just hopped (motion-on only)
  if (e.zipT > 0 && e.zipFrom) {
    const k = e.zipT / 0.22;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.strokeStyle = o.glow; ctx.shadowColor = o.glow; ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.55 * k; ctx.lineWidth = e.r * 0.6 * k;
    ctx.beginPath(); ctx.moveTo(e.zipFrom.x, e.zipFrom.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    ctx.restore();
  }
  const charging = e.charging > 0;
  const k = charging ? 1 - e.charging / (e.chargeMax || 0.6) : 0;     // 0 -> 1 over the tell
  const swell = 1 + k * 0.5;
  molNode(e.x, e.y, e.r * 0.46 * swell, o.col, o.glow);
  const petals = 5, spin = G.reduceMotion ? 0 : G.time * 0.6;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = charging ? 0.5 + 0.4 * k : 0.32;
  for (let i = 0; i < petals; i++) {
    const ang = spin + i * TAU / petals, rr = e.r * (0.85 + k * 0.5);
    molNode(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr, e.r * 0.2, '#eafff0', o.glow);
  }
  ctx.restore();
  if (charging) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = o.glow; ctx.globalAlpha = G.reduceMotion ? 0.45 : 0.3 + 0.5 * Math.abs(Math.sin(G.time * 26)); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.2 + k * 1.0), 0, TAU); ctx.stroke(); ctx.restore();
  }
}

export function drawWorld() {
  const sx = (G.shakeAmt && !G.reduceMotion) ? rand(-G.shakeAmt, G.shakeAmt) : 0;
  const sy = (G.shakeAmt && !G.reduceMotion) ? rand(-G.shakeAmt, G.shakeAmt) : 0;
  ctx.save();
  const cxp = OFF_X + PW / 2, cyp = OFF_Y + PH / 2;
  // a barely-there breathing zoom keeps the frame alive without ever shrinking
  // below 1 (which would expose the board edges). Always >= 1.
  const breath = G.reduceMotion ? 1 : 1 + 0.005 * (0.5 + 0.5 * Math.sin(G.time * 0.6));
  const introZoom = 1 + G.introT * G.introT * 0.05;   // a gentle punch-in that settles as the level fades up
  const z = G.zoom * breath * introZoom;
  ctx.translate(cxp, cyp); ctx.scale(z, z); ctx.translate(-cxp, -cyp);
  ctx.translate(OFF_X + sx, OFF_Y + sy);

  ctx.save();
  roundRectPath(0, 0, PW, PH, 8); ctx.clip();

  ctx.drawImage(G.nebula.canvas, 0, 0, PW, PH);

  // twinkles (hidden under fog where unrevealed)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of G.twinkles) {
    ctx.globalAlpha = G.reduceMotion ? 0.5 : 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(G.time * t.spd + t.phase));
    ctx.fillStyle = G.pal.star;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // floating motes over the revealed cosmos — warm flickering embers in magma
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of G.motes) {
    if (G.reduceMotion) {   // motion off: steady, no flicker
      ctx.globalAlpha = m.a * 0.6;
      ctx.fillStyle = m.pr ? '#7fd0ff' : (m.em || m.du) ? G.pal.blobs[3] : m.sn ? G.pal.star : G.pal.blobs[4];
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); continue;
    }
    if (m.em) { ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(G.time * 8 + m.x)); ctx.fillStyle = G.pal.blobs[3]; }
    else if (m.cr) { ctx.globalAlpha = m.a * (0.35 + 0.65 * Math.abs(Math.sin(G.time * 3 + m.x * 0.5))); ctx.fillStyle = G.pal.blobs[4]; }
    else if (m.bu) { ctx.globalAlpha = m.a * 0.8; ctx.fillStyle = G.pal.blobs[4]; }   // rising bubble
    else if (m.sp) { ctx.globalAlpha = m.a * (0.4 + 0.6 * Math.abs(Math.sin(G.time * 2.5 + m.x * 0.4))); ctx.fillStyle = G.pal.blobs[4]; }   // drifting spore
    else if (m.wi) { ctx.globalAlpha = m.a * (0.45 + 0.55 * Math.abs(Math.sin(G.time * 1.1 + m.x * 0.2))); ctx.fillStyle = G.pal.blobs[4]; }   // drifting dawn wisp
    else if (m.sn) { ctx.globalAlpha = m.a; ctx.fillStyle = G.pal.star; }   // falling snow (steady, cool white)
    else if (m.du) { ctx.globalAlpha = m.a * (0.3 + 0.7 * Math.abs(Math.sin(G.time * 2 + m.x * 0.5))); ctx.fillStyle = Math.sin(m.x) > 0.5 ? G.pal.blobs[3] : G.pal.star; }   // twinkling stardust
    else if (m.pr) { ctx.globalAlpha = m.a * (0.2 + 0.8 * Math.abs(Math.sin(G.time * 5 + m.x))); ctx.fillStyle = Math.sin(m.x * 1.3) > 0 ? '#5cf0ff' : '#ff5ce0'; }   // flickering prism spark
    else { ctx.globalAlpha = m.a; ctx.fillStyle = G.pal.star; }
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
  }
  ctx.restore();

  ctx.drawImage(G.fog.canvas, 0, 0, PW, PH);
  drawVeilTells();
  drawShootingStars();
  drawObstacles();

  // Bloom garden decor — flora that blooms on the land you've claimed (FILLED cells)
  if (G.pal.style === 'bloom' && G.bloomDecor.length) {
    const dt2 = G.reduceMotion ? 0 : G.time;
    ctx.save();
    for (const d of G.bloomDecor) { if (G.grid[d.cell] === FILLED) drawBloomDecor(d, dt2); }
    ctx.restore();
  }

  // coastline glow
  if (G.borderPath) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // tamed: a soft warm glow + a crisp hot-WHITE core, so the captured edge
    // reads as light cutting the rock rather than a screaming orange band.
    ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 8 * BLUR_SCALE; ctx.strokeStyle = G.pal.edge;
    ctx.globalAlpha = 0.32; ctx.lineWidth = 2.5; ctx.stroke(G.borderPath);
    ctx.globalAlpha = 0.9; ctx.lineWidth = 1; ctx.shadowBlur = 4 * BLUR_SCALE; ctx.strokeStyle = '#fff'; ctx.stroke(G.borderPath);
    ctx.restore();
  }

  // power-ups — each labelled so it's clear BEFORE you grab it (like the enemy cards)
  const PU_LABEL: Record<string, string> = {
    score: 'POINTS', freeze: 'FREEZE', slow: 'SLOW', shield: 'SHIELD',
    bomb: 'BOMB', life: '+1 LIFE', time: '+TIME', surge: '2× SCORE',
  };
  for (const p of G.pickups) {
    const bob = (G.reduceMotion ? 0 : Math.sin(p.bob) * 2.5);
    const fade = clamp(p.life / 2, 0, 1);
    const ringPulse = G.reduceMotion ? 0.5 : 0.5 + 0.4 * Math.sin(G.time * 6);
    ctx.save();
    ctx.globalAlpha = fade;
    drawGlowOrb(p.x, p.y + bob, 5.5, '#fff', p.col, 20);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = p.col; ctx.globalAlpha = fade * ringPulse;
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 9 + (G.reduceMotion ? 0 : Math.sin(G.time * 6) * 1.5), 0, TAU); ctx.stroke();
    ctx.restore();
    drawPUGlyph(p.type, p.x, p.y + bob, p.col, fade);
    glowText(PU_LABEL[p.type] || p.type.toUpperCase(), p.x, p.y + bob + 17, 7.5, p.col,
      { weight: 800, spacing: 1, blur: 3, alpha: fade });
  }

  // trail
  if (G.hasTrail && G.trailPoints.length) {
    const pts = G.trailPoints.slice();
    if (G.player && G.player.px) pts.push(G.player.px);
    const ls = CELL / 18;   // scale the wire with the cell so it reads bold on big boards
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.shadowColor = G.pal.accent; ctx.shadowBlur = 18 * BLUR_SCALE; ctx.strokeStyle = G.pal.accent;
    ctx.globalAlpha = 0.5; ctx.lineWidth = 6 * ls; ctx.stroke();
    ctx.strokeStyle = G.pal.trail; ctx.globalAlpha = 1; ctx.shadowBlur = 8 * BLUR_SCALE; ctx.lineWidth = 2.4 * ls; ctx.stroke();
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    // (no decorative energy pulse — the clean wire reads smoother; the only thing
    //  that travels the line now is the fuse spark below, which is real information.)
    // the FUSE spark — crawls the line from its base; reddens + grows as it nears you
    const f = clamp(G.fuseT / G.fuseMax, 0, 1);
    if (total > 2 && f > 0.001) {
      const fp = pointAlong(pts, f * total);
      const hot = f > 0.66, col = hot ? '#ff5a2e' : f > 0.4 ? '#ff9a3a' : '#ffd24a';
      ctx.globalCompositeOperation = 'lighter';
      const flick = 0.7 + 0.3 * Math.sin(G.time * (20 + f * 30));
      drawGlowOrb(fp.x, fp.y, (2 + f * 2.2) * flick * ls, '#fff', col, (10 + f * 16) * ls);
    }
    ctx.restore();
  }

  // particles
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  // capture shockwave rings — expand-and-fade (ease-out), drawn additively
  for (const r of G.rings) {
    const k = clamp(r.life / r.dur, 0, 1), e = 1 - (1 - k) * (1 - k), a = (1 - k) * (1 - k);
    ctx.globalAlpha = a; ctx.strokeStyle = r.col; ctx.lineWidth = Math.max(0.5, r.w0 * (1 - k));
    ctx.shadowColor = r.col; ctx.shadowBlur = 8 * (1 - k);
    ctx.beginPath(); ctx.arc(r.x, r.y, r.max * e, 0, TAU); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // enemies (danger glow scales with proximity to player)
  for (const e of G.enemies) {
    const pulse = G.reduceMotion ? 1 : 1 + Math.sin(G.time * 6 + e.x) * 0.08;   // core breathing (calm in reduce-motion)
    const frozen = G.enemyFreezeT > 0;
    // dormant veil-sleeper: a faint tell under the dark, not a full threat glow
    if (e.type === 'sleeper' && e.asleep) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 + 0.12 * Math.sin(G.time * 2 + e.y);
      const dg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 2.4);
      dg.addColorStop(0, '#ff5c6e'); dg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 2.4, 0, TAU); ctx.fill(); ctx.restore();
      continue;
    }
    const isCh = e.type === 'chaser', isSent = e.type === 'sentinel', isCut = e.type === 'cutter', isWr = e.type === 'wraith', isQix = e.type === 'qix';
    const isFf = e.type === 'firefly', isSp = e.type === 'sprite';
    let prox = 0;
    if (G.player && G.player.px && G.state === 'playing') prox = clamp(1 - Math.hypot(G.player.px.x - e.x, G.player.px.y - e.y) / (CELL * 6), 0, 1);
    const col = frozen ? '#bfe9ff' : isFf ? '#ffe69a' : isSp ? '#c98cff' : isCut ? '#ffe93b' : isSent ? '#ffb14a' : isWr ? '#c89cff' : isQix ? '#d8404e' : isCh ? CHASER_COL : ENEMY_COL;
    const glow = frozen ? '#bfe9ff' : isFf ? '#ffd45c' : isSp ? '#9a4cff' : isCut ? '#fff07a' : isSent ? '#ffd07a' : isWr ? '#5cf0ff' : isQix ? '#ef5a4e' : isCh ? CHASER_GLOW : ENEMY_GLOW;
    const o = { col, glow, frozen };
    // distinct silhouette per type (each telegraphs its behaviour)
    if (isCh) drawChaserBody(e, o);
    else if (isCut) drawCutterBody(e, o);
    else if (isSent) drawSentinelBody(e, o);
    else if (isWr) drawWraithBody(e, o);
    else if (isQix) drawQixBody(e, o);
    else if (isFf) drawFireflyBody(e, o);
    else if (isSp) drawSpriteBody(e, o);
    else drawDrifterBody(e, o, pulse);
    // shared close-range danger ring
    if (prox > 0.35 && !frozen) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = glow; ctx.globalAlpha = (prox - 0.35) * 1.2 * (0.6 + 0.4 * (G.reduceMotion ? 0 : Math.sin(G.time * 14)));
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 2.1, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }

  // player
  if (G.player && G.player.px && G.state === 'playing') {
    // invuln feedback: a strobe normally, but a steady dim in reduce-motion (no flashing)
    const blink = G.player.invuln > 0 ? (G.reduceMotion ? 0.6 : (Math.sin(G.time * 30) > 0 ? 0.35 : 1)) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.globalCompositeOperation = 'lighter';
    // hero size scales with the cell so it stays a chunky, trackable token on big
    // boards instead of a fixed tiny dot (reference cell ~18).
    const hs = CELL / 18;
    // a flowing speed streak through the recent positions — tapered + brightest
    // near the hero — so motion reads as fast/alive instead of a faint bead trail.
    const tl = G.player.tail;
    if (tl.length > 1 && !G.reduceMotion) {   // the motion streak is decorative — drop it in reduce-motion
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = G.pal.trail;
      ctx.shadowColor = G.pal.trail; ctx.shadowBlur = 6 * hs;
      for (let i = 1; i < tl.length; i++) {
        const a = i / tl.length;
        ctx.globalAlpha = a * a * 0.6 * blink; ctx.lineWidth = (0.8 + i * 0.45) * hs;
        ctx.beginPath(); ctx.moveTo(tl[i - 1].x, tl[i - 1].y); ctx.lineTo(tl[i].x, tl[i].y); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = blink; ctx.globalCompositeOperation = 'source-over';
    const px = G.player.px.x, py = G.player.px.y;
    // shield bubble (kept)
    ctx.globalCompositeOperation = 'lighter';
    if (G.shield) {
      ctx.strokeStyle = '#7dffc4'; ctx.globalAlpha = (0.5 + 0.25 * (G.reduceMotion ? 0 : Math.sin(G.time * 6))) * blink;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 17 * hs, 0, TAU); ctx.stroke();
    }
    // directional CRYSTAL hero — a cut gem (two facets + a center ridge + a hot
    // core) that points the way you travel, so heading + identity read instantly.
    let ha = G.player.heroAng != null ? G.player.heroAng : -Math.PI / 2;
    if (G.player.dir && (G.player.dir.x || G.player.dir.y)) { ha = Math.atan2(G.player.dir.y, G.player.dir.x); G.player.heroAng = ha; }
    const cs = 5.5 * hs, F = cs * 1.7, T = cs * 0.9, Bk = cs * 0.95;
    ctx.save(); ctx.translate(px, py); ctx.rotate(ha);
    // soft halo
    ctx.globalCompositeOperation = 'lighter';
    const hgrad = ctx.createRadialGradient(0, 0, 0, 0, 0, cs * 2.3);
    hgrad.addColorStop(0, G.pal.player); hgrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 * blink; ctx.fillStyle = hgrad; ctx.beginPath(); ctx.arc(0, 0, cs * 2.3, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = blink;
    // upper facet — bright white
    ctx.beginPath(); ctx.moveTo(F, 0); ctx.lineTo(0, -T); ctx.lineTo(-Bk, 0); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    // lower facet — tinted, for a cut-gem dimension
    ctx.beginPath(); ctx.moveTo(F, 0); ctx.lineTo(0, T); ctx.lineTo(-Bk, 0); ctx.closePath();
    const lg = ctx.createLinearGradient(F, 0, -Bk, 0);
    lg.addColorStop(0, '#eef4ff'); lg.addColorStop(1, G.pal.player);
    ctx.fillStyle = lg; ctx.fill();
    // crisp rim
    ctx.beginPath(); ctx.moveTo(F, 0); ctx.lineTo(0, -T); ctx.lineTo(-Bk, 0); ctx.lineTo(0, T); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.3; ctx.strokeStyle = G.pal.edge2; ctx.globalAlpha = 0.9 * blink; ctx.stroke();
    // center ridge + a hot core glint toward the front
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 * blink;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-Bk, 0); ctx.lineTo(F, 0); ctx.stroke();
    const core = ctx.createRadialGradient(cs * 0.45, 0, 0, cs * 0.45, 0, cs * 0.95);
    core.addColorStop(0, '#ffffff'); core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.8 * blink; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cs * 0.45, 0, cs * 0.95, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // popups
  for (const p of G.popups) {
    glowText(p.text, p.x, p.y, p.size, p.color, { blur: 12, weight: 800, alpha: clamp(p.life / p.max, 0, 1) });
  }

  ctx.restore(); // clip

  // time pressure (0 calm -> 1 critical): drives the reactive frame + vignette.
  let tension = 0;
  if (!G.reduceMotion && G.state === 'playing' && isFinite(G.levelTimeMax)) {
    const tf = clamp(1 - G.levelT / G.levelTimeMax, 0, 1);
    if (tf < 0.28) tension = ((0.28 - tf) / 0.28) * (0.7 + 0.3 * Math.sin(G.time * 9));
  }
  // reactive frame — a zone-tinted border that FLASHES on every capture/hit and
  // PULSES red under time pressure, so the frame responds to the game.
  const fglow = G.reduceMotion ? 0 : G.flash * 0.9 + tension * 0.7;
  ctx.save(); roundRectPath(0, 0, PW, PH, 8);
  ctx.strokeStyle = tension > 0.25 ? '#ff5a4a' : G.pal.edge2;
  ctx.globalAlpha = 0.12 + fglow * 0.6; ctx.lineWidth = 1.5 + fglow * 2.4;
  if (fglow > 0.01) { ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = 16 * fglow; }
  ctx.stroke(); ctx.restore();
  // vignette — reddens + tightens as the clock runs out
  const VR = Math.max(PW, PH), vigA = 0.32 + tension * 0.3;
  const vg = ctx.createRadialGradient(PW / 2, PH / 2, VR * (0.42 - tension * 0.12), PW / 2, PH / 2, VR * 0.82);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, tension > 0.1 ? `rgba(40,2,8,${vigA})` : `rgba(0,0,0,${vigA})`);
  ctx.fillStyle = vg; roundRectPath(0, 0, PW, PH, 8); ctx.fill();

  // hint + banner (over board, crisp)
  if (G.hintActive && G.state === 'playing') {
    const a = 0.5 + 0.4 * Math.sin(G.time * 3);
    glowText('leave the edge, draw a loop, return — reveal the cosmos', PW / 2, PH - 26, 13, G.pal.edge2, { blur: 8, alpha: a, weight: 700, spacing: 1 });
  }
  if (G.banner.t > 0) {
    const a = clamp(G.banner.t * 1.6, 0, 1);   // pop in, fade out over the last ~0.6s
    if (G.banner.enemy) {
      const bloom = G.banner.enemy === 'firefly' || G.banner.enemy === 'sprite';
      const be = G.banner.enemy;
      const ec = be === 'chaser' ? CHASER_COL : be === 'cutter' ? '#ffe93b' : be === 'sentinel' ? '#ffb14a' : be === 'firefly' ? '#ffe69a' : be === 'sprite' ? '#c98cff' : be === 'qix' ? '#d8404e' : '#ff3a4e';
      const eg = be === 'chaser' ? CHASER_GLOW : be === 'cutter' ? '#fff07a' : be === 'sentinel' ? '#ffd07a' : be === 'firefly' ? '#ffd45c' : be === 'sprite' ? '#9a4cff' : be === 'qix' ? '#ef5a4e' : '#ff6a4a';
      // preview the ACTUAL creature design (not a generic orb) — kept high + small
      // so its glow/electrons never crowd the "NEW BLOOM/THREAT" label below it
      const bx = PW / 2, by = PH / 2 - 96, br = CELL * 0.66;
      const fe: any = { x: bx, y: by, r: br, ax: bx, ay: by, orad: 0, oang: 0, ow: 1, charging: 0, baseR: br, vx: br, vy: 0 };
      const bo = { col: ec, glow: eg };
      ctx.save(); ctx.globalAlpha = a;
      if (be === 'firefly') drawFireflyBody(fe, bo);
      else if (be === 'sprite') drawSpriteBody(fe, bo);
      else if (be === 'qix') drawQixBody(fe, bo);
      else if (be === 'chaser') drawChaserBody(fe, bo);
      else if (be === 'cutter') drawCutterBody(fe, bo);
      else if (be === 'sentinel') drawSentinelBody(fe, bo);
      else if (be === 'wraith') drawWraithBody(fe, bo);
      else drawGlowOrb(bx, by, CELL * 0.5, ec, eg, CELL * 2);
      ctx.restore();
      glowText(bloom ? 'NEW BLOOM' : 'NEW THREAT', PW / 2, PH / 2 - 46, 9, eg, { blur: 6, weight: 800, spacing: 3, alpha: a * 0.8 });
    }
    glowText(G.banner.text, PW / 2, PH / 2 - 12, G.banner.enemy ? 20 : 25, G.pal.edge2, { blur: 20, weight: 800, spacing: 3, core: '#fff', alpha: a });
    // shrink the desc to fit the board width (mono advance ~0.6*size + 1px spacing),
    // so long copy never overflows the screen on a narrow phone.
    const subSize = Math.max(9, Math.min(15, (PW * 0.9 / Math.max(1, G.banner.sub.length) - 1) / 0.6));
    glowText(G.banner.sub, PW / 2, PH / 2 + 22, subSize, '#cfe6ff', { blur: 6, font: 'mono', spacing: 1, alpha: a });
  }

  ctx.restore(); // world

  if (G.flash > 0.001) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.4})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
  // level intro: fade the world up from the void (HUD draws after, so it stays put)
  if (G.introT > 0.001) { ctx.save(); ctx.fillStyle = `rgba(4,5,12,${G.introT})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
}
function drawPUGlyph(type, x, y, col, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = '#06121a'; ctx.fillStyle = '#06121a'; ctx.lineWidth = 1.6;
  ctx.translate(x, y);
  if (type === 'life') { ctx.beginPath(); ctx.moveTo(0, 2.4); ctx.bezierCurveTo(-3.4, -1.6, -1.2, -3.6, 0, -1.4); ctx.bezierCurveTo(1.2, -3.6, 3.4, -1.6, 0, 2.4); ctx.closePath(); ctx.fill(); }
  else if (type === 'shield') { ctx.beginPath(); ctx.moveTo(0, -3.4); ctx.lineTo(3, -2); ctx.lineTo(3, 1); ctx.lineTo(0, 3.6); ctx.lineTo(-3, 1); ctx.lineTo(-3, -2); ctx.closePath(); ctx.fill(); }
  else if (type === 'freeze') { for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -3.6); ctx.lineTo(0, 3.6); ctx.stroke(); ctx.restore(); } }
  else if (type === 'slow') { ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -2.6); ctx.moveTo(0, 0); ctx.lineTo(2, 0.6); ctx.stroke(); }
  else if (type === 'bomb') { ctx.beginPath(); ctx.arc(0, 1, 3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(1.6, -1.7); ctx.lineTo(3.2, -3.3); ctx.stroke(); }   // bomb + fuse
  else if (type === 'surge') { ctx.beginPath(); ctx.moveTo(1.2, -3.6); ctx.lineTo(-2, 0.4); ctx.lineTo(0, 0.4); ctx.lineTo(-1.2, 3.6); ctx.lineTo(2.4, -0.8); ctx.lineTo(0.4, -0.8); ctx.closePath(); ctx.fill(); }   // lightning bolt
  else if (type === 'time') { ctx.beginPath(); ctx.moveTo(-2.8, -3.3); ctx.lineTo(2.8, -3.3); ctx.lineTo(-2.8, 3.3); ctx.lineTo(2.8, 3.3); ctx.closePath(); ctx.stroke(); }   // hourglass
  else { ctx.beginPath(); for (let i = 0; i < 5; i++) { const ang = -Math.PI / 2 + i * TAU / 5; const ang2 = ang + TAU / 10; ctx.lineTo(Math.cos(ang) * 3.6, Math.sin(ang) * 3.6); ctx.lineTo(Math.cos(ang2) * 1.6, Math.sin(ang2) * 1.6); } ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
