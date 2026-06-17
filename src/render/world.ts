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
function drawObstacles() {
  const magma = G.pal.style === 'magma';
  ctx.save();
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const idx = y * COLS + x;
      if (G.grid[idx] !== OBSTACLE) continue;
      const px = x * CELL, py = y * CELL;
      if (magma) {
        // cooled basalt: dark body with a glowing lava seam only where it meets
        // open space, so the seams trace the chamber outlines like cracks.
        ctx.fillStyle = G.pal.blobs[1];
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py + CELL - 2, CELL, 2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = G.pal.blobs[3]; ctx.lineWidth = 1.5;   // lava orange, no blur (cheap)
        ctx.beginPath();
        if (G.grid[idx - COLS] === EMPTY) { ctx.moveTo(px + 0.5, py + 0.75); ctx.lineTo(px + CELL - 0.5, py + 0.75); }
        if (G.grid[idx + COLS] === EMPTY) { ctx.moveTo(px + 0.5, py + CELL - 0.75); ctx.lineTo(px + CELL - 0.5, py + CELL - 0.75); }
        if (G.grid[idx - 1] === EMPTY) { ctx.moveTo(px + 0.75, py + 0.5); ctx.lineTo(px + 0.75, py + CELL - 0.5); }
        if (G.grid[idx + 1] === EMPTY) { ctx.moveTo(px + CELL - 0.75, py + 0.5); ctx.lineTo(px + CELL - 0.75, py + CELL - 0.5); }
        ctx.stroke();
        ctx.restore();
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

  // floating motes over the revealed cosmos
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of G.motes) { ctx.globalAlpha = m.a; ctx.fillStyle = G.pal.star; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill(); }
  ctx.restore();

  ctx.drawImage(G.fog.canvas, 0, 0, PW, PH);
  drawVeilTells();
  drawShootingStars();
  drawObstacles();

  // coastline glow
  if (G.borderPath) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = G.pal.edge; ctx.shadowBlur = 14; ctx.strokeStyle = G.pal.edge;
    ctx.globalAlpha = 0.5; ctx.lineWidth = 3.5; ctx.stroke(G.borderPath);
    ctx.globalAlpha = 0.95; ctx.lineWidth = 1.4; ctx.shadowBlur = 6; ctx.strokeStyle = G.pal.edge2; ctx.stroke(G.borderPath);
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
    const isCh = e.type === 'chaser', isSent = e.type === 'sentinel', isSleep = e.type === 'sleeper', isCut = e.type === 'cutter';
    let prox = 0;
    if (G.player && G.player.px && G.state === 'playing') prox = clamp(1 - Math.hypot(G.player.px.x - e.x, G.player.px.y - e.y) / (CELL * 6), 0, 1);
    const col = frozen ? '#bfe9ff' : isCut ? '#ffe93b' : isSleep ? '#ff3a4e' : isSent ? '#ffb14a' : isCh ? CHASER_COL : ENEMY_COL;
    const glow = frozen ? '#bfe9ff' : isCut ? '#fff07a' : isSleep ? '#ff6a4a' : isSent ? '#ffd07a' : isCh ? CHASER_GLOW : ENEMY_GLOW;
    drawGlowOrb(e.x, e.y, e.r * pulse, col, glow, e.r * (3.2 + prox * 2.4));
    if (prox > 0.35 && !frozen) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = glow; ctx.globalAlpha = (prox - 0.35) * 1.2 * (0.6 + 0.4 * Math.sin(G.time * 14));
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

  // frame + vignette
  ctx.save(); roundRectPath(0, 0, PW, PH, 8); ctx.strokeStyle = 'rgba(140,180,255,0.10)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  const vg = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.35, PW / 2, PH / 2, PH * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
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
  else { ctx.beginPath(); for (let i = 0; i < 5; i++) { const ang = -Math.PI / 2 + i * TAU / 5; const ang2 = ang + TAU / 10; ctx.lineTo(Math.cos(ang) * 3.6, Math.sin(ang) * 3.6); ctx.lineTo(Math.cos(ang2) * 1.6, Math.sin(ang2) * 1.6); } ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
