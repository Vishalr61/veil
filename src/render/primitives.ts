/* =========================================================================
   Render primitives — text, glow, and shape helpers that draw to the shared
   ctx. No game state. (drawScanlines takes the canvas size as params.)
   ========================================================================= */

import { ctx } from './surface';
import { TAU } from '../core/math';

export function setFont(size, weight, spacing, family) {
  const fam = family === 'pixel' ? "'Press Start 2P', monospace"
    : family === 'mono' ? "'VT323', monospace"
    : "'Segoe UI', system-ui, Arial, sans-serif";
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
// retro title with chromatic aberration (cyan/magenta split + white core)
export function retroTitle(txt, x, y, size, opts) {
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
// CRT scanlines + vignette overlay (canvas size passed in)
export function drawScanlines(CW, CH, vig?: number) {
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
export function retroButton(r, label, col) {
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
