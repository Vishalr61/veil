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
// Luminous button — a soft glowing rounded pill. Primary = tinted fill + bright
// border + white label; secondary = thin ghost outline + tinted label.
export function luminousButton(r, label, col, opts?) {
  opts = opts || {};
  const primary = !!opts.primary;
  ctx.save();
  roundRectPath(r.x, r.y, r.w, r.h, r.h / 2);
  ctx.globalAlpha = primary ? 0.16 : 0.05; ctx.fillStyle = col; ctx.fill();
  roundRectPath(r.x + 1, r.y + 1, r.w - 2, r.h - 2, (r.h - 2) / 2);
  ctx.globalAlpha = primary ? 1 : 0.55; ctx.strokeStyle = col; ctx.lineWidth = primary ? 2 : 1.4;
  ctx.shadowColor = col; ctx.shadowBlur = primary ? 16 : 7; ctx.stroke();
  ctx.restore();
  glowText(label, r.x + r.w / 2, r.y + r.h / 2 + 0.5, Math.min(primary ? 18 : 15, r.h * 0.42),
    primary ? '#ffffff' : col, { blur: primary ? 10 : 6, weight: primary ? 700 : 500, spacing: 1.5, core: primary ? '#fff' : undefined });
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
