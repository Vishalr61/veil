/* =========================================================================
   FPS / frame-time meter — a diagnostic overlay, OFF by default. Enable it by
   loading the page with `?fps` in the URL (e.g. veilgame.vercel.app/?fps).

   It reads the RAW requestAnimationFrame interval (before the sim's dt clamp),
   so it shows the true frame cadence, and labels the current MOTION mode — so
   you can flip motion on/off (pause → MOTION) on a real device and read the gap
   directly. Plain fillText, no glow, so the meter itself is ~free and doesn't
   perturb the thing it's measuring.
   ========================================================================= */

import { ctx } from './surface';
import { CW, CH, safeBottom } from '../core/dims';
import { SS } from '../core/constants';
import { G } from '../game/state';

export const FPS_ON = (() => {
  try { return /[?&]fps\b/.test(location.search); } catch (e) { return false; }
})();

const N = 120;              // ~2s window at 60fps
const buf: number[] = [];
let head = 0;

export function sampleFrame(rawMs: number) {
  if (rawMs <= 0 || rawMs > 1000) return;   // drop tab-switch / first-frame gaps
  if (buf.length < N) buf.push(rawMs); else { buf[head] = rawMs; head = (head + 1) % N; }
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export function drawFpsMeter() {
  if (!buf.length) return;
  const s = buf.slice().sort((a, b) => a - b);
  const p50 = pct(s, 0.5), p95 = pct(s, 0.95);
  const fps = p50 > 0 ? Math.round(1000 / p50) : 0;
  const txt = `MOTION ${G.reduceMotion ? 'OFF' : 'ON '}   ${fps} fps   p50 ${p50.toFixed(1)}  p95 ${p95.toFixed(1)} ms`;

  ctx.setTransform(SS, 0, 0, SS, 0, 0);
  ctx.save();
  ctx.font = '600 12px ui-monospace, "Space Mono", monospace';
  ctx.textBaseline = 'middle';
  const padX = 8, w = ctx.measureText(txt).width + padX * 2, h = 22;
  const x = 10, y = CH - Math.max(safeBottom, 8) - h - 4;
  ctx.fillStyle = 'rgba(4,6,14,0.78)';
  ctx.fillRect(x, y, w, h);
  // p95 jank is the real tell on mobile; colour by it.
  ctx.fillStyle = p95 <= 20 ? '#7CFFB0' : p95 <= 33 ? '#FFD66B' : '#FF6B6B';
  ctx.fillText(txt, x + padX, y + h / 2 + 0.5);
  ctx.restore();
}
