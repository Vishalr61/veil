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
import { EMPTY, OBSTACLE } from '../core/constants';
import { VEIL_CACHE } from '../sim/veil';
import { hexA } from './background';
import { roundRectPath, drawGlowOrb, pointAlong, glowText } from './primitives';
import { CHASER_COL, CHASER_GLOW, ENEMY_COL, ENEMY_GLOW } from '../core/palettes';

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
function drawShootingStars() {
  if (!G.shootingStars.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const s of G.shootingStars) {
    const a = Math.sin((s.life / s.max) * Math.PI);     // fade in then out
    const tx = s.x - s.vx * 0.045, ty = s.y - s.vy * 0.045;
    const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, G.pal.edge2);
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
      } else if (style === 'sky') {
        drawSkyCloud(px, py, x, y, idx);
      } else if (style === 'aurora') {
        drawIceRock(px, py, x, y, idx);
      } else if (style === 'space') {
        drawAsteroid(px, py, x, y, idx);
      } else if (style === 'rift') {
        drawRiftShard(px, py, x, y, idx);
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
export function drawWorld() {
  const sx = (G.shakeAmt && !G.reduceMotion) ? rand(-G.shakeAmt, G.shakeAmt) : 0;
  const sy = (G.shakeAmt && !G.reduceMotion) ? rand(-G.shakeAmt, G.shakeAmt) : 0;
  ctx.save();
  const cxp = OFF_X + PW / 2, cyp = OFF_Y + PH / 2;
  ctx.translate(cxp, cyp); ctx.scale(G.zoom, G.zoom); ctx.translate(-cxp, -cyp);
  ctx.translate(OFF_X + sx, OFF_Y + sy);

  ctx.save();
  roundRectPath(0, 0, PW, PH, 8); ctx.clip();

  ctx.drawImage(G.nebula.canvas, 0, 0, PW, PH);

  // twinkles (hidden under fog where unrevealed)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of G.twinkles) {
    ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(G.time * t.spd + t.phase));
    ctx.fillStyle = G.pal.star;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // floating motes over the revealed cosmos — warm flickering embers in magma
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of G.motes) {
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

  // coastline glow
  if (G.borderPath) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // tamed: a soft warm glow + a crisp hot-WHITE core, so the captured edge
    // reads as light cutting the rock rather than a screaming orange band.
    ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 8; ctx.strokeStyle = G.pal.edge;
    ctx.globalAlpha = 0.32; ctx.lineWidth = 2.5; ctx.stroke(G.borderPath);
    ctx.globalAlpha = 0.9; ctx.lineWidth = 1; ctx.shadowBlur = 4; ctx.strokeStyle = '#fff'; ctx.stroke(G.borderPath);
    ctx.restore();
  }

  // power-ups
  for (const p of G.pickups) {
    const bob = Math.sin(p.bob) * 2.5;
    const fade = clamp(p.life / 2, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    drawGlowOrb(p.x, p.y + bob, 5.5, '#fff', p.col, 20);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = p.col; ctx.globalAlpha = fade * (0.5 + 0.4 * Math.sin(G.time * 6));
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p.x, p.y + bob, 9 + Math.sin(G.time * 6) * 1.5, 0, TAU); ctx.stroke();
    ctx.restore();
    drawPUGlyph(p.type, p.x, p.y + bob, p.col, fade);
  }

  // trail
  if (G.hasTrail && G.trailPoints.length) {
    const pts = G.trailPoints.slice();
    if (G.player && G.player.px) pts.push(G.player.px);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.shadowColor = G.pal.accent; ctx.shadowBlur = 16; ctx.strokeStyle = G.pal.accent;
    ctx.globalAlpha = 0.5; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = G.pal.trail; ctx.globalAlpha = 1; ctx.shadowBlur = 8; ctx.lineWidth = 2.4; ctx.stroke();
    // live energy pulse running along the wire
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (total > 4) {
      const pos = pointAlong(pts, (G.time * 220) % total);
      ctx.globalCompositeOperation = 'lighter';
      drawGlowOrb(pos.x, pos.y, 2.4, '#fff', G.pal.edge2, 12);
    }
    ctx.restore();
  }

  // particles
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  ctx.restore();

  // enemies (danger glow scales with proximity to player)
  for (const e of G.enemies) {
    const pulse = 1 + Math.sin(G.time * 6 + e.x) * 0.08;
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
    const isCh = e.type === 'chaser', isSent = e.type === 'sentinel', isSleep = e.type === 'sleeper', isCut = e.type === 'cutter', isWr = e.type === 'wraith';
    let prox = 0;
    if (G.player && G.player.px && G.state === 'playing') prox = clamp(1 - Math.hypot(G.player.px.x - e.x, G.player.px.y - e.y) / (CELL * 6), 0, 1);
    const col = frozen ? '#bfe9ff' : isCut ? '#ffe93b' : isSleep ? '#ff3a4e' : isSent ? '#ffb14a' : isWr ? '#c89cff' : isCh ? CHASER_COL : ENEMY_COL;
    const glow = frozen ? '#bfe9ff' : isCut ? '#fff07a' : isSleep ? '#ff6a4a' : isSent ? '#ffd07a' : isWr ? '#5cf0ff' : isCh ? CHASER_GLOW : ENEMY_GLOW;
    const wghost = isWr && e.charging <= 0 ? 0.6 + 0.25 * Math.sin(G.time * 4 + e.x) : 1;   // ghostly between blinks
    ctx.save(); ctx.globalAlpha = wghost;
    drawGlowOrb(e.x, e.y, e.r * pulse, col, glow, e.r * (3.2 + prox * 2.4));
    ctx.restore();
    // wraith telegraph: a growing flicker ring + a line toward where it will blink
    if (isWr && e.charging > 0 && !frozen) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const k = 1 - e.charging / 0.55;
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(G.time * 30));
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.4 + k * 1.7), 0, TAU); ctx.stroke();
      if (G.player && G.player.px) {
        const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y, d = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = '#5cf0ff'; ctx.globalAlpha = 0.55 * k; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + dx / d * CELL * 2, e.y + dy / d * CELL * 2); ctx.stroke();
      }
      ctx.restore();
    }
    if (prox > 0.35 && !frozen) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = glow; ctx.globalAlpha = (prox - 0.35) * 1.2 * (0.6 + 0.4 * Math.sin(G.time * 14));
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.9, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.save();
    // hunters (chaser) get a tracking eye: the pupil + glint lean toward the
    // player, so a glance reads "this one is watching you". Others stay neutral.
    let ex = 0, ey = 0;
    if (isCh && G.player && G.player.px) {
      const dx = G.player.px.x - e.x, dy = G.player.px.y - e.y, d = Math.hypot(dx, dy) || 1;
      ex = dx / d; ey = dy / d;
    }
    ctx.fillStyle = frozen ? 'rgba(10,30,50,0.5)' : 'rgba(20,0,6,0.55)';
    ctx.beginPath(); ctx.arc(e.x + ex * e.r * 0.2, e.y + ey * e.r * 0.2, e.r * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9;
    const gx = isCh ? e.x + ex * e.r * 0.34 : e.x - e.r * 0.18;
    const gy = isCh ? e.y + ey * e.r * 0.34 : e.y - e.r * 0.18;
    ctx.beginPath(); ctx.arc(gx, gy, e.r * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // player
  if (G.player && G.player.px && G.state === 'playing') {
    const blink = G.player.invuln > 0 ? (Math.sin(G.time * 30) > 0 ? 0.35 : 1) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < G.player.tail.length; i++) {
      const t = G.player.tail[i], a = (i / G.player.tail.length) * 0.5;
      ctx.globalAlpha = a * blink; ctx.fillStyle = G.pal.trail;
      ctx.beginPath(); ctx.arc(t.x, t.y, 2 + i * 0.25, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = blink; ctx.globalCompositeOperation = 'source-over';
    drawGlowOrb(G.player.px.x, G.player.px.y, 5.5, '#ffffff', G.pal.player, 22);
    ctx.globalCompositeOperation = 'lighter';
    // shield ring
    if (G.shield) {
      ctx.strokeStyle = '#7dffc4'; ctx.globalAlpha = (0.6 + 0.3 * Math.sin(G.time * 6)) * blink;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(G.player.px.x, G.player.px.y, 12, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = G.pal.accent; ctx.globalAlpha = (0.4 + 0.3 * Math.sin(G.time * 8)) * blink;
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(G.player.px.x, G.player.px.y, 9 + Math.sin(G.time * 8) * 1.5, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // popups
  for (const p of G.popups) {
    glowText(p.text, p.x, p.y, p.size, p.color, { blur: 12, weight: 800, alpha: clamp(p.life / p.max, 0, 1) });
  }

  ctx.restore(); // clip

  // frame + vignette — gentle and aspect-aware (radius off the LARGER side) so a
  // wide window doesn't black out the side edges and hide barriers there.
  ctx.save(); roundRectPath(0, 0, PW, PH, 8); ctx.strokeStyle = 'rgba(140,180,255,0.10)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  const VR = Math.max(PW, PH);
  const vg = ctx.createRadialGradient(PW / 2, PH / 2, VR * 0.42, PW / 2, PH / 2, VR * 0.82);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = vg; roundRectPath(0, 0, PW, PH, 8); ctx.fill();

  // hint + banner (over board, crisp)
  if (G.hintActive && G.state === 'playing') {
    const a = 0.5 + 0.4 * Math.sin(G.time * 3);
    glowText('leave the edge, draw a loop, return — reveal the cosmos', PW / 2, PH - 26, 13, G.pal.edge2, { blur: 8, alpha: a, weight: 700, spacing: 1 });
  }
  if (G.banner.t > 0) {
    const a = clamp(G.banner.t * 1.6, 0, 1);   // pop in, fade out over the last ~0.6s
    if (G.banner.enemy) {
      const ec = G.banner.enemy === 'chaser' ? CHASER_COL : G.banner.enemy === 'cutter' ? '#ffe93b' : G.banner.enemy === 'sentinel' ? '#ffb14a' : '#ff3a4e';
      const eg = G.banner.enemy === 'chaser' ? CHASER_GLOW : G.banner.enemy === 'cutter' ? '#fff07a' : G.banner.enemy === 'sentinel' ? '#ffd07a' : '#ff6a4a';
      ctx.save(); ctx.globalAlpha = a; drawGlowOrb(PW / 2, PH / 2 - 62, CELL * 0.5, ec, eg, CELL * 2); ctx.restore();
      glowText('NEW THREAT', PW / 2, PH / 2 - 30, 9, eg, { blur: 8, font: 'pixel', spacing: 2, alpha: a * 0.8 });
    }
    glowText(G.banner.text, PW / 2, PH / 2 - 12, G.banner.enemy ? 20 : 24, G.pal.edge2, { blur: 22, font: 'pixel', spacing: 2, core: '#fff', alpha: a });
    glowText(G.banner.sub, PW / 2, PH / 2 + 22, 15, '#cfe6ff', { blur: 6, font: 'mono', spacing: 1, alpha: a });
  }

  ctx.restore(); // world

  if (G.flash > 0.001) { ctx.save(); ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.4})`; ctx.fillRect(0, 0, CW, CH); ctx.restore(); }
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
  else { ctx.beginPath(); for (let i = 0; i < 5; i++) { const ang = -Math.PI / 2 + i * TAU / 5; const ang2 = ang + TAU / 10; ctx.lineTo(Math.cos(ang) * 3.6, Math.sin(ang) * 3.6); ctx.lineTo(Math.cos(ang2) * 1.6, Math.sin(ang2) * 1.6); } ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
