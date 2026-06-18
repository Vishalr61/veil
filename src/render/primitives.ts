/* =========================================================================
   Render primitives — text, glow, and shape helpers that draw to the shared
   ctx. No game state. (drawScanlines takes the canvas size as params.)
   ========================================================================= */

import { ctx } from './surface';
import { TAU } from '../core/math';

export function setFont(size, weight, spacing, family) {
  // Luminous design language: Space Grotesk for all UI text, Space Mono for
  // numerals (score / leaderboard). 'pixel' is a legacy alias that now renders
  // in Space Grotesk too, so old call sites read cleanly without edits.
  const fam = family === 'mono' ? "'Space Mono', ui-monospace, monospace"
    : "'Space Grotesk', system-ui, -apple-system, Arial, sans-serif";
  ctx.font = `${weight || 600} ${size}px ${fam}`;
  try { (ctx as any).letterSpacing = (spacing || 0) + 'px'; } catch (e) {}
}
export function glowText(txt, x, y, size, color, opts) {
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
// Luminous wordmark — wide tracked caps filled with a cool light gradient over a
// soft bloom, so the title reads as light emerging from the dark.
export function luminousTitle(txt, x, y, size, opts) {
  opts = opts || {};
  const sp = opts.spacing == null ? size * 0.16 : opts.spacing;
  ctx.save();
  setFont(size, 700, sp, undefined);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cx = x - sp / 2;   // canvas letterSpacing adds a trailing gap; nudge back to true centre
  ctx.shadowColor = opts.glow || '#6fd8ff'; ctx.shadowBlur = opts.blur || 30;
  ctx.globalAlpha = 0.5; ctx.fillStyle = opts.glow || '#6fd8ff'; ctx.fillText(txt, cx, y);   // outer bloom
  ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, opts.top || '#eafaff'); g.addColorStop(1, opts.bot || '#8fd6ff');
  ctx.shadowBlur = (opts.blur || 30) * 0.45; ctx.fillStyle = g; ctx.fillText(txt, cx, y);
  ctx.restore();
}
// Soft focus vignette (no scanlines) — used under the menus to draw the eye in.
export function drawVignette(CW, CH, amt?: number) {
  amt = amt == null ? 0.5 : amt;
  ctx.save();
  const v = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.32, CW / 2, CH / 2, CH * 0.82);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${amt})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, CW, CH);
  ctx.restore();
}
// Faint CRT texture for in-game only (lighter than before) + vignette.
export function drawScanlines(CW, CH, vig?: number) {
  vig = vig == null ? 0.5 : vig;
  ctx.save();
  ctx.globalAlpha = 0.03; ctx.fillStyle = '#000';
  for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1);
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(CW / 2, CH / 2, CH * 0.3, CW / 2, CH / 2, CH * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${vig})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, CW, CH);
  ctx.restore();
}
// A small glyph drawn to the LEFT of a button label (centred as a group).
function drawBtnIcon(kind, cx, cy, rr, col) {
  ctx.save();
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6;
  if (kind === 'play') {                                   // ▶ go
    ctx.beginPath(); ctx.moveTo(cx - rr * 0.62, cy - rr * 0.95);
    ctx.lineTo(cx + rr * 0.95, cy); ctx.lineTo(cx - rr * 0.62, cy + rr * 0.95);
    ctx.closePath(); ctx.fill();
  } else if (kind === 'daily') {                           // ✦ four-point sparkle
    ctx.beginPath(); ctx.moveTo(cx, cy - rr);
    ctx.quadraticCurveTo(cx + rr * 0.18, cy - rr * 0.18, cx + rr, cy);
    ctx.quadraticCurveTo(cx + rr * 0.18, cy + rr * 0.18, cx, cy + rr);
    ctx.quadraticCurveTo(cx - rr * 0.18, cy + rr * 0.18, cx - rr, cy);
    ctx.quadraticCurveTo(cx - rr * 0.18, cy - rr * 0.18, cx, cy - rr);
    ctx.closePath(); ctx.fill();
  } else if (kind === 'scores') {                          // ▁▄█ ascending bars
    const bw = rr * 0.46, gp = rr * 0.3, totalW = bw * 3 + gp * 2, x0 = cx - totalW / 2, base = cy + rr * 0.95;
    for (let i = 0; i < 3; i++) { const h = rr * (0.8 + i * 0.62); roundRectPath(x0 + i * (bw + gp), base - h, bw, h, bw * 0.35); ctx.fill(); }
  }
  ctx.restore();
}
// Luminous button — a soft glowing pill with depth: a tinted fill, a top sheen, a
// crisp glowing border, and an optional leading icon. Primary reads brighter with
// a white label; secondary is a quieter tinted ghost.
export function luminousButton(r, label, col, opts?) {
  opts = opts || {};
  const primary = !!opts.primary;
  const rad = r.h / 2, cyB = r.y + r.h / 2;
  ctx.save();
  // tinted body + soft outer halo
  roundRectPath(r.x, r.y, r.w, r.h, rad);
  ctx.shadowColor = col; ctx.shadowBlur = primary ? 20 : 9;
  ctx.globalAlpha = primary ? 0.20 : 0.07; ctx.fillStyle = col; ctx.fill();
  ctx.shadowBlur = 0;
  // top sheen for depth (a white highlight fading down)
  roundRectPath(r.x, r.y, r.w, r.h, rad); ctx.save(); ctx.clip();
  const sheen = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  sheen.addColorStop(0, `rgba(255,255,255,${primary ? 0.16 : 0.07})`); sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 1; ctx.fillStyle = sheen; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
  // crisp glowing border
  roundRectPath(r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad - 1);
  ctx.globalAlpha = primary ? 1 : 0.62; ctx.strokeStyle = col; ctx.lineWidth = primary ? 2 : 1.4;
  ctx.shadowColor = col; ctx.shadowBlur = primary ? 13 : 6; ctx.stroke();
  ctx.restore();
  // icon + label, centred as one group
  const fs = Math.min(primary ? 17 : 14, r.h * 0.42), lcol = primary ? '#ffffff' : col;
  const iconR = opts.icon ? fs * 0.6 : 0, gap = opts.icon ? fs * 0.6 : 0;
  ctx.save(); setFont(fs, primary ? 700 : 600, primary ? 2 : 1.4, undefined);
  const tw = ctx.measureText(label).width; ctx.restore();
  const startX = r.x + r.w / 2 - (iconR * 2 + gap + tw) / 2;
  if (opts.icon) drawBtnIcon(opts.icon, startX + iconR, cyB, iconR, lcol);
  glowText(label, startX + iconR * 2 + gap, cyB + 0.5, fs, lcol,
    { blur: primary ? 9 : 6, weight: primary ? 700 : 600, spacing: primary ? 2 : 1.4, align: 'left', core: primary ? '#fff' : undefined });
}
export function fmtScore(n) { return String(Math.round(n)).padStart(7, '0'); }
export function drawGlowOrb(x, y, r, core, glow, glowR) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, glowR || r * 3);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, glowR || r * 3, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}
export function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function pointAlong(pts, dist) {
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, len = Math.hypot(dx, dy);
    if (dist <= len) return { x: pts[i - 1].x + dx * (dist / len), y: pts[i - 1].y + dy * (dist / len) };
    dist -= len;
  }
  return pts[pts.length - 1];
}
