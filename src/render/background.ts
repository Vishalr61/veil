/* =========================================================================
   Background art — pure off-screen surface generators (nebula + veil fog),
   themed per band. No game state; play-field dimensions are passed in.
   ========================================================================= */

import { SS } from '../core/constants';
import { TAU, rand } from '../core/math';

function createSurface(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * SS);
  c.height = Math.round(h * SS);
  const cx = c.getContext('2d') as CanvasRenderingContext2D;
  cx.setTransform(SS, 0, 0, SS, 0, 0);
  return { canvas: c, ctx: cx, w, h };
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// The Depths — a molten cavern, not a tinted star field. Heat rises from a lava
// sea below; glowing veins crack the rock; embers drift up. `depth` (0..1 within
// the band) drives how hot/turbulent it gets across the three floors.
function genMagmaNebula(c, p, PW, PH, depth) {
  const B = p.blobs;   // [near-black, dark, deep-red, lava, bright]

  // base: cool dark basalt up top, warming toward the molten floor below
  const base = c.createLinearGradient(0, 0, 0, PH);
  base.addColorStop(0, '#160406'); base.addColorStop(0.5, B[0]);
  base.addColorStop(0.82, B[1]); base.addColorStop(1, '#5c1810');
  c.fillStyle = base; c.fillRect(0, 0, PW, PH);

  c.globalCompositeOperation = 'lighter';

  // the molten sea — a strong glow rising from the bottom edge, hotter deeper
  const seaH = PH * (0.42 + depth * 0.18);
  const sea = c.createLinearGradient(0, PH, 0, PH - seaH);
  sea.addColorStop(0, hexA(B[4], 0.4 + depth * 0.28)); sea.addColorStop(0.25, hexA(B[3], 0.38));
  sea.addColorStop(0.7, hexA(B[2], 0.16)); sea.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sea; c.fillRect(0, PH - seaH, PW, seaH);

  // molten rock clouds — soft glowing masses, biased toward the floor
  for (let i = 0, n = 26 + Math.round(depth * 10); i < n; i++) {
    const x = rand(-80, PW + 80), yf = Math.random(), y = PH * (1 - yf * yf) + rand(-40, 40);
    const r = rand(70, 260), col = Math.random() < 0.6 ? B[2] : B[3];
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(0.45, col + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.16, 0.4); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // lava veins — branching cracks of light, each with a bright hot core
  for (let i = 0, n = 9 + Math.round(depth * 8); i < n; i++) {
    const pts: number[][] = [[rand(0, PW), PH + 10]];
    for (let k = 0; k < 7; k++) { const [px, py] = pts[k]; pts.push([px + rand(-36, 36), py - rand(36, 78)]); }
    const trace = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]); c.stroke(); };
    c.shadowColor = B[4]; c.shadowBlur = 9 + depth * 10;
    c.globalAlpha = rand(0.3, 0.55) + depth * 0.18; c.strokeStyle = B[3]; c.lineWidth = rand(2, 4) + depth * 1.5; trace();
    c.shadowBlur = 0;
    c.globalAlpha = rand(0.5, 0.8); c.strokeStyle = B[4]; c.lineWidth = rand(0.8, 1.6); trace();
  }

  // hot cores — the brightest molten pockets, in the lower field
  for (let i = 0; i < 5; i++) {
    const x = rand(PW * 0.12, PW * 0.88), y = rand(PH * 0.45, PH * 0.96), r = rand(40, 100);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, B[4]); g.addColorStop(0.3, B[3] + '88'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.4, 0.7); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // rising embers — sparks, denser and brighter near the floor, thinning upward
  for (let i = 0, n = 150 + Math.round(depth * 130); i < n; i++) {
    const r0 = Math.random(), y = PH * (1 - r0 * r0), low = 1 - y / PH, x = Math.random() * PW;
    c.globalAlpha = rand(0.2, 0.85) * (0.35 + low * 0.65);
    c.fillStyle = Math.random() < 0.35 ? B[4] : B[3];
    if (Math.random() < 0.06) { c.shadowColor = B[4]; c.shadowBlur = 5; } else c.shadowBlur = 0;
    c.beginPath(); c.arc(x, y, rand(0.5, 1.6) * (0.6 + low), 0, TAU); c.fill();
  }
  c.shadowBlur = 0;

  // heat haze — faint warm horizontal shimmer over the lower field
  for (let i = 0; i < 4; i++) {
    const y = rand(PH * 0.4, PH), h = rand(28, 70);
    const g = c.createLinearGradient(0, y - h, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, hexA(B[3], 0.07)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.25, 0.45); c.fillStyle = g; c.fillRect(0, y - h, PW, h * 2);
  }

  c.shadowBlur = 0; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}

export function genNebula(p, level, PW, PH, depth = 0) {
  level = level || 1;
  const s = createSurface(PW, PH), c = s.ctx;
  // band style drives the backdrop flavor (magma / caves / ocean / surface / sky / aurora / space)
  const style = p.style || 'space';
  if (style === 'magma') { genMagmaNebula(c, p, PW, PH, depth); return s; }
  c.fillStyle = '#04050d'; c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'lighter';
  const big = style === 'magma' || style === 'surface';
  const wispy = style === 'aurora' || style === 'sky';
  const dense = style === 'space' || style === 'ocean';

  // nebula clouds
  const blobCount = dense ? 60 : big ? 32 : 44;
  for (let i = 0; i < blobCount; i++) {
    const col = p.blobs[(Math.random() * p.blobs.length) | 0];
    const x = rand(-80, PW + 80), y = rand(-60, PH + 60);
    const r = big ? rand(160, 360) : dense ? rand(36, 150) : rand(70, 300);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(0.4, col + '66'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.2, 0.5); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // signature accent per band
  if (style === 'caves') {
    for (let i = 0; i < 14; i++) {                      // crystal shards
      const x = rand(0, PW), y = rand(0, PH), h = rand(20, 60), w = rand(6, 16);
      c.globalAlpha = rand(0.15, 0.4); c.fillStyle = p.blobs[3];
      c.save(); c.translate(x, y); c.rotate(rand(0, TAU));
      c.beginPath(); c.moveTo(0, -h); c.lineTo(w, h * 0.5); c.lineTo(-w, h * 0.5); c.closePath(); c.fill();
      c.restore();
    }
  } else if (style === 'sky') {
    for (let i = 0; i < 6; i++) {                        // soft horizontal cloud bands
      const y = rand(0, PH), h = rand(40, 110);
      const g = c.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, p.blobs[4] + '40'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = rand(0.2, 0.5); c.fillStyle = g; c.fillRect(0, y - h, PW, h * 2);
    }
  } else if (style === 'aurora') {
    for (let i = 0; i < 6; i++) {                        // vertical aurora ribbons
      const x = rand(0, PW), w = rand(30, 90), col = i % 2 ? p.blobs[3] : p.accent;
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col + '50'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = rand(0.25, 0.55); c.fillStyle = g; c.fillRect(x - w, 0, w * 2, PH);
    }
  }

  // dust filaments / lanes — structure, not just round blobs
  for (let i = 0, n = wispy ? 11 : 5; i < n; i++) {
    const col = p.blobs[2 + ((Math.random() * 3) | 0)], len = rand(120, 380);
    c.save();
    c.translate(rand(0, PW), rand(0, PH)); c.rotate(rand(0, TAU));
    const g = c.createLinearGradient(-len / 2, 0, len / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col + '40'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.1, 0.24); c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 0, len / 2, rand(8, 22), 0, 0, TAU); c.fill();
    c.restore();
  }

  // bright cores
  for (let i = 0; i < 5; i++) {
    const x = rand(PW * 0.2, PW * 0.8), y = rand(PH * 0.2, PH * 0.8), r = rand(40, 110);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, p.blobs[p.blobs.length - 1]); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.4, 0.72); c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // a focal landmark: a distant galaxy — gives the level a sense of place
  const gx = rand(PW * 0.25, PW * 0.75), gy = rand(PH * 0.22, PH * 0.6), gr = rand(64, 116);
  const gg = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
  gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.2, p.blobs[p.blobs.length - 1]);
  gg.addColorStop(0.55, p.blobs[2] + '66'); gg.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.62; c.fillStyle = gg;
  c.beginPath(); c.arc(gx, gy, gr, 0, TAU); c.fill();
  for (let k = 0; k < 64; k++) {                 // flattened halo of stars around it
    const a = rand(0, TAU), rr = rand(6, gr * 0.92);
    c.globalAlpha = rand(0.3, 0.9); c.fillStyle = p.star;
    c.beginPath(); c.arc(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr * 0.5, rand(0.4, 1.3), 0, TAU); c.fill();
  }

  // star field — varied sizes, a few tinted stars
  for (let i = 0, n = (style === 'sky' || style === 'surface') ? 150 : dense ? 420 : 320; i < n; i++) {
    const x = Math.random() * PW, y = Math.random() * PH, a = Math.random();
    const r = a > 0.92 ? rand(1.2, 2.4) : rand(0.4, 1.1);
    c.globalAlpha = rand(0.25, 0.95); c.fillStyle = a > 0.97 ? p.edge2 : p.star;
    if (a > 0.95) { c.shadowColor = p.star; c.shadowBlur = 6; } else c.shadowBlur = 0;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  // open star clusters
  c.shadowBlur = 0;
  for (let cl = 0; cl < 3; cl++) {
    const cxs = rand(PW * 0.1, PW * 0.9), cys = rand(PH * 0.1, PH * 0.9);
    for (let k = 0; k < 22; k++) {
      c.globalAlpha = rand(0.3, 0.9); c.fillStyle = p.star;
      c.beginPath(); c.arc(cxs + rand(-26, 26), cys + rand(-26, 26), rand(0.4, 1.2), 0, TAU); c.fill();
    }
  }

  c.shadowBlur = 0; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  return s;
}

// Band-specific texture on the dark veil — the surface the player actually stares at.
function fogSignature(c, pal, style, PW, PH, depth = 0) {
  const d1 = pal.blobs[1], d2 = pal.blobs[2];
  if (style === 'caves') {                              // rocky angular shards
    for (let i = 0; i < 26; i++) {
      const x = rand(0, PW), y = rand(0, PH), w = rand(20, 60), h = rand(14, 40);
      c.globalAlpha = rand(0.12, 0.24); c.fillStyle = d1;
      c.save(); c.translate(x, y); c.rotate(rand(-0.4, 0.4));
      c.beginPath(); c.moveTo(-w / 2, h / 2); c.lineTo(0, -h / 2); c.lineTo(w / 2, h / 2); c.closePath(); c.fill();
      c.restore();
    }
  } else if (style === 'ocean') {                       // horizontal caustic ripples
    for (let i = 0; i < 28; i++) {
      c.globalAlpha = rand(0.04, 0.1); c.fillStyle = d2;
      c.beginPath(); c.ellipse(rand(0, PW), rand(0, PH), rand(40, 120), rand(1.5, 4), 0, 0, TAU); c.fill();
    }
  } else if (style === 'sky') {                         // soft cloud cover
    for (let i = 0; i < 18; i++) {
      const x = rand(0, PW), y = rand(0, PH), r = rand(34, 96);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(d2, 0.14)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 1; c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  } else if (style === 'magma') {                       // ember cracks (denser/hotter deeper)
    const crackN = 8 + Math.round(depth * 16);
    for (let i = 0; i < crackN; i++) {
      let x = rand(0, PW), y = rand(0, PH);
      c.globalAlpha = 1; c.strokeStyle = hexA(pal.blobs[3], 0.16 + depth * 0.18); c.lineWidth = rand(0.6, 1.6) + depth;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rand(-40, 40); y += rand(-40, 40); c.lineTo(x, y); }
      c.stroke();
    }
  } else if (style === 'aurora') {                      // faint vertical shimmer
    for (let i = 0; i < 8; i++) {
      const x = rand(0, PW), w = rand(20, 60);
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, hexA(pal.blobs[3], 0.1)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 1; c.fillStyle = g; c.fillRect(x - w, 0, w * 2, PH);
    }
  } else if (style === 'surface') {                     // organic mottling
    for (let i = 0; i < 30; i++) {
      c.globalAlpha = rand(0.08, 0.18); c.fillStyle = d2;
      c.beginPath(); c.arc(rand(0, PW), rand(0, PH), rand(10, 36), 0, TAU); c.fill();
    }
  } else {                                              // space: faint stars in the dark
    for (let i = 0; i < 120; i++) {
      c.globalAlpha = rand(0.05, 0.22); c.fillStyle = pal.star;
      c.beginPath(); c.arc(Math.random() * PW, Math.random() * PH, rand(0.3, 0.9), 0, TAU); c.fill();
    }
  }
  c.globalAlpha = 1;
}

export function genFog(pal, PW, PH, depth = 0) {
  const style = pal.style || 'space';
  const s = createSurface(PW, PH), c = s.ctx;
  const d0 = pal.blobs[0], d1 = pal.blobs[1];           // band-tinted near-black
  c.fillStyle = d0; c.fillRect(0, 0, PW, PH);
  const g = c.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, hexA(d1, 0.5)); g.addColorStop(1, hexA(d0, 0));   // subtle lift up top
  c.fillStyle = g; c.fillRect(0, 0, PW, PH);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * PW, y = Math.random() * PH, r = rand(40, 160);
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, Math.random() > 0.5 ? 'rgba(0,0,0,0.5)' : hexA(d1, 0.16));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  fogSignature(c, pal, style, PW, PH, depth);
  for (let i = 0; i < 500; i++) {
    c.globalAlpha = rand(0.02, 0.06);
    c.fillStyle = Math.random() > 0.5 ? hexA(d1, 1) : '#000';
    c.fillRect(Math.random() * PW, Math.random() * PH, 1.4, 1.4);
  }
  c.globalAlpha = 1;
  return s;
}
