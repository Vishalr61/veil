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

// The Depths — a lit molten cavern. Dark layered rock (strata) is the surface;
// a deep forge-glow lights the chamber, light shafts angle down, molten lakes
// pool and bloom at the floor, and bloomed lava veins seep through the rock.
// `depth` (0..1 within the band) makes the lower floors hotter and brighter.
function genMagmaNebula(c, p, PW, PH, depth) {
  const B = p.blobs;   // [near-black, dark, deep-red, lava, bright]
  // Uncovered = a LIT molten chamber: the revealed rock is clearly brighter than
  // the near-black covered veil (the "draw light into the dark" payoff). Within
  // the reveal it's still hot/cold: cool-violet rock vs warm orange lava.
  const R0 = '#15101f', R1 = '#241a30', R2 = '#34233a';   // lit basalt (brighter than the veil's near-black)

  // 1. Lit basalt grade — violet ceiling down to a warm molten floor.
  const base = c.createLinearGradient(0, 0, 0, PH);
  base.addColorStop(0, '#120d1c'); base.addColorStop(0.5, R0);
  base.addColorStop(0.85, R1); base.addColorStop(1, '#4a2018');
  c.fillStyle = base; c.fillRect(0, 0, PW, PH);

  // 2. Sedimentary strata — layered rock (the "tunneling down" read).
  const N = 11;
  let prevEdge: number[] | null = null;
  for (let i = 0; i <= N; i++) {
    const baseY = i / N * PH, edge: number[] = [];
    for (let k = 0; k <= 8; k++) edge.push(baseY + rand(-16, 16));
    if (prevEdge) {
      const t = Math.random();
      c.globalAlpha = rand(0.28, 0.5);
      c.fillStyle = t < 0.5 ? '#040409' : t < 0.82 ? R1 : R2;
      c.beginPath(); c.moveTo(0, prevEdge[0]);
      for (let k = 1; k <= 8; k++) c.lineTo(k / 8 * PW, prevEdge[k]);
      for (let k = 8; k >= 0; k--) c.lineTo(k / 8 * PW, edge[k]);
      c.closePath(); c.fill();
      if (t >= 0.82) {
        c.globalAlpha = rand(0.3, 0.55); c.strokeStyle = hexA(B[3], 0.6); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(0, prevEdge[0]); for (let k = 1; k <= 8; k++) c.lineTo(k / 8 * PW, prevEdge[k]); c.stroke();
      }
    }
    prevEdge = edge;
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'lighter';

  // 2.5 Warm ambient — molten light fills the WHOLE chamber so the uncovered area
  //     reads clearly brighter than the dark covered veil (the core "light" payoff).
  const aw = c.createRadialGradient(PW / 2, PH * 0.62, 0, PW / 2, PH * 0.62, Math.max(PW, PH) * 0.72);
  aw.addColorStop(0, hexA(B[3], 0.24)); aw.addColorStop(0.5, hexA(B[2], 0.17)); aw.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = aw; c.fillRect(0, 0, PW, PH);

  // 3. Focal forge-glow — a deep warm light source so the chamber reads as LIT.
  const fx = rand(PW * 0.3, PW * 0.7), fy = rand(PH * 0.58, PH * 0.82), fr = PH * (0.42 + depth * 0.12);
  const fg = c.createRadialGradient(fx, fy, 0, fx, fy, fr);
  fg.addColorStop(0, hexA(B[3], 0.34 + depth * 0.22)); fg.addColorStop(0.4, hexA(B[2], 0.16)); fg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = fg; c.beginPath(); c.arc(fx, fy, fr, 0, TAU); c.fill();

  // 4. Light shafts angling down from above (subtle volumetrics).
  for (let i = 0, n = 2 + Math.round(depth); i < n; i++) {
    const x = rand(PW * 0.2, PW * 0.8), w = rand(28, 64);
    const g = c.createLinearGradient(0, 0, 0, PH * 0.72);
    g.addColorStop(0, hexA(B[3], 0.09 + depth * 0.05)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.6; c.fillStyle = g;
    c.beginPath(); c.moveTo(x - w * 0.4, 0); c.lineTo(x + w * 0.4, 0); c.lineTo(x + w, PH * 0.72); c.lineTo(x - w, PH * 0.72); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;

  // 5. Molten lakes pooling at the floor — wide and bloomed.
  for (let i = 0, n = 3 + Math.round(depth * 2); i < n; i++) {
    const x = rand(0, PW), y = PH - rand(0, PH * 0.1), r = rand(60, 130);
    c.shadowColor = B[4]; c.shadowBlur = 28;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(B[4], 0.85)); g.addColorStop(0.4, hexA(B[3], 0.5)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.5, 0.8); c.fillStyle = g;
    c.beginPath(); c.ellipse(x, y, r, r * 0.5, 0, 0, TAU); c.fill();
  }
  c.shadowBlur = 0;

  // 6. Lava veins — bloomed branching cracks seeping DOWN through the rock.
  const drawSeg = (x0, y0, x1, y1, w) => {
    c.shadowColor = B[4]; c.shadowBlur = 12 + depth * 8;
    c.globalAlpha = 0.5; c.strokeStyle = B[3]; c.lineWidth = w;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.shadowBlur = 0; c.globalAlpha = 1; c.strokeStyle = B[4]; c.lineWidth = Math.max(0.7, w * 0.38);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  };
  const stack: any[] = [];
  for (let i = 0, seeds = 5 + Math.round(depth * 4); i < seeds; i++)
    stack.push({ x: rand(0, PW), y: rand(0, PH * 0.35), ang: Math.PI / 2 + rand(-0.5, 0.5), width: rand(2.4, 4), life: 7 + ((Math.random() * 5) | 0) });
  let guard = 0;
  while (stack.length && guard++ < 500) {
    const v = stack.pop(); let x = v.x, y = v.y, ang = v.ang, width = v.width, life = v.life;
    while (life-- > 0) {
      ang += rand(-0.45, 0.45);
      const len = rand(14, 28), nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      drawSeg(x, y, nx, ny, width);
      x = nx; y = ny; width = Math.max(0.8, width * 0.93);
      if (x < -20 || x > PW + 20 || y < -20 || y > PH + 20) break;
      if (Math.random() < 0.25 && width > 1.3 && stack.length < 70)
        stack.push({ x, y, ang: ang + (Math.random() < 0.5 ? 1 : -1) * rand(0.5, 1.1), width: width * 0.7, life: 3 + ((Math.random() * 3) | 0) });
    }
  }
  c.shadowBlur = 0;

  // 7. Ember sparks + mineral glints, denser toward the hot floor.
  for (let i = 0, n = 70 + Math.round(depth * 50); i < n; i++) {
    const r0 = Math.random(), y = PH * (1 - r0 * r0), low = 1 - y / PH;
    c.globalAlpha = rand(0.15, 0.6) * (0.4 + low * 0.6);
    c.fillStyle = Math.random() < 0.4 ? B[4] : Math.random() < 0.6 ? B[3] : p.star;
    c.beginPath(); c.arc(Math.random() * PW, y, rand(0.4, 1.3), 0, TAU); c.fill();
  }

  // 8. Cavern enclosure — gentle vignette + ceiling (aspect-aware radius off the
  //    larger side so wide screens don't black out the edges; softer than before).
  c.globalCompositeOperation = 'source-over';
  const VR = Math.max(PW, PH);
  const vig = c.createRadialGradient(PW / 2, PH * 0.52, VR * 0.34, PW / 2, PH * 0.52, VR * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = vig; c.fillRect(0, 0, PW, PH);
  const ceil = c.createLinearGradient(0, 0, 0, PH * 0.2);
  ceil.addColorStop(0, 'rgba(0,0,0,0.2)'); ceil.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = ceil; c.fillRect(0, 0, PW, PH * 0.2);
  c.globalAlpha = 1;
}

// A cluster of faceted, glowing amethyst shards — the Crystal Caves' hero motif.
function drawCrystalCluster(c, cx, cy, size, B, depth) {
  for (let i = 0, shards = 3 + ((Math.random() * 3) | 0); i < shards; i++) {
    const ang = rand(-0.6, 0.6) + (i / shards - 0.5) * 1.2;
    const hh = size * rand(0.7, 1.5), w = hh * rand(0.16, 0.28);
    c.save(); c.translate(cx + rand(-size * 0.5, size * 0.5), cy + rand(-size * 0.4, size * 0.4)); c.rotate(ang);
    c.shadowColor = B[4]; c.shadowBlur = 8 + depth * 8;
    const g = c.createLinearGradient(0, -hh / 2, 0, hh / 2);
    g.addColorStop(0, hexA(B[4], 0.95)); g.addColorStop(0.45, hexA(B[3], 0.7)); g.addColorStop(1, hexA(B[2], 0.3));
    c.fillStyle = g; c.globalAlpha = rand(0.7, 0.95);
    c.beginPath(); c.moveTo(0, -hh / 2); c.lineTo(w / 2, -hh * 0.1); c.lineTo(w * 0.35, hh / 2); c.lineTo(-w * 0.35, hh / 2); c.lineTo(-w / 2, -hh * 0.1); c.closePath(); c.fill();
    c.shadowBlur = 0; c.globalAlpha = rand(0.4, 0.7); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.6; c.stroke();
    c.restore();
  }
}

// Crystal Caves — a LIT amethyst grotto: cool violet rock (clearly brighter than
// the dark veil) studded with glowing crystal clusters and geodes. Distinct from
// the Depths (lava) by motif (crystal) and hue (magenta-violet vs orange).
function genCrystalNebula(c, p, PW, PH, depth) {
  const B = p.blobs;   // [near-black violet, dark violet, deep purple, amethyst, lilac]

  // 1. lit amethyst rock grade — brighter than the veil (the reveal payoff)
  const base = c.createLinearGradient(0, 0, 0, PH);
  base.addColorStop(0, '#120a20'); base.addColorStop(0.55, '#1e1232'); base.addColorStop(1, '#341c52');
  c.fillStyle = base; c.fillRect(0, 0, PW, PH);
  // rock value mottle so it's not flat
  for (let i = 0; i < 10; i++) {
    const x = rand(0, PW), y = rand(0, PH), r = rand(120, 280);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() < 0.5 ? hexA('#2a1648', 0.5) : 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.3, 0.6); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  // crystalline rock facets — angular planes give the rock a geometric, cut surface
  for (let i = 0; i < 30; i++) {
    const x = rand(0, PW), y = rand(0, PH), sz = rand(24, 64);
    c.globalAlpha = rand(0.05, 0.13); c.fillStyle = Math.random() < 0.5 ? '#0c0618' : '#3a2658';
    c.save(); c.translate(x, y); c.rotate(rand(0, TAU));
    c.beginPath(); c.moveTo(0, -sz * rand(0.6, 1)); c.lineTo(sz * rand(0.3, 0.6), 0); c.lineTo(0, sz * rand(0.6, 1)); c.lineTo(-sz * rand(0.3, 0.6), 0); c.closePath(); c.fill(); c.restore();
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';

  // 2. violet ambient wash — fills the grotto with light so uncovered clearly reads brighter than the veil
  const aw = c.createRadialGradient(PW / 2, PH * 0.55, 0, PW / 2, PH * 0.55, Math.max(PW, PH) * 0.72);
  aw.addColorStop(0, hexA(B[3], 0.2)); aw.addColorStop(0.5, hexA(B[2], 0.17)); aw.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = aw; c.fillRect(0, 0, PW, PH);

  // 2.5 mineral veins — thin lilac crystal seams threading the rock (fills the empty space with structure)
  for (let i = 0, seeds = 5 + Math.round(depth * 4); i < seeds; i++) {
    let vx = rand(0, PW), vy = rand(0, PH), ang = rand(0, TAU);
    c.shadowColor = B[4]; c.shadowBlur = 5 + depth * 5;
    c.globalAlpha = rand(0.18, 0.34) + depth * 0.12; c.strokeStyle = B[3]; c.lineWidth = rand(0.7, 1.5);
    c.beginPath(); c.moveTo(vx, vy);
    for (let k = 0, segs = 4 + ((Math.random() * 4) | 0); k < segs; k++) { ang += rand(-0.6, 0.6); const len = rand(18, 40); vx += Math.cos(ang) * len; vy += Math.sin(ang) * len; c.lineTo(vx, vy); }
    c.stroke();
  }
  c.shadowBlur = 0;

  // 3. geodes — large crystal-lined hollows glowing from within
  for (let i = 0, n = 3 + Math.round(depth * 2); i < n; i++) {
    const x = rand(PW * 0.1, PW * 0.9), y = rand(PH * 0.22, PH * 0.92), r = rand(60, 120);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(B[4], 0.5)); g.addColorStop(0.5, hexA(B[3], 0.3)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.4, 0.7); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // 4. crystal clusters — the hero element, more/larger deeper
  for (let i = 0, n = 9 + Math.round(depth * 7); i < n; i++)
    drawCrystalCluster(c, rand(PW * 0.06, PW * 0.94), rand(PH * 0.12, PH * 0.96), rand(13, 36), B, depth);

  // 5. prism glints — sparkle in the rock
  for (let i = 0, n = 100 + Math.round(depth * 60); i < n; i++) {
    c.globalAlpha = rand(0.2, 0.7); c.fillStyle = Math.random() < 0.4 ? B[4] : p.star;
    c.beginPath(); c.arc(Math.random() * PW, Math.random() * PH, rand(0.4, 1.3), 0, TAU); c.fill();
  }

  // 6. gentle, aspect-aware vignette
  c.globalCompositeOperation = 'source-over';
  const VR = Math.max(PW, PH);
  const vig = c.createRadialGradient(PW / 2, PH * 0.5, VR * 0.34, PW / 2, PH * 0.5, VR * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = vig; c.fillRect(0, 0, PW, PH);
  c.globalAlpha = 1;
}

// The Abyss — a LIT ocean trench: deep teal water (brighter than the veil) with
// god-ray light shafts from the surface, wavering caustic ripples, rising
// bubbles, drifting bioluminescent blooms, and a hero vent bloom. Distinct from
// the Depths (lava) and Caves (crystal) by motif (water/light) and hue (cyan).
function genOceanNebula(c, p, PW, PH, depth) {
  const B = p.blobs;   // [near-black, dark teal, teal, bright cyan, aqua]

  // 1. lit deep-water grade — lighter near the top (toward the distant surface)
  const base = c.createLinearGradient(0, 0, 0, PH);
  base.addColorStop(0, '#0a2c36'); base.addColorStop(0.5, '#072028'); base.addColorStop(1, '#04141c');
  c.fillStyle = base; c.fillRect(0, 0, PW, PH);
  for (let i = 0; i < 10; i++) {   // water depth mottle
    const x = rand(0, PW), y = rand(0, PH), r = rand(120, 280);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() < 0.5 ? hexA(B[1], 0.6) : 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.3, 0.6); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';

  // 2. cyan ambient — fills the trench with light (uncovered reads brighter than veil)
  const aw = c.createRadialGradient(PW / 2, PH * 0.35, 0, PW / 2, PH * 0.35, Math.max(PW, PH) * 0.78);
  aw.addColorStop(0, hexA(B[2], 0.22)); aw.addColorStop(0.5, hexA(B[1], 0.18)); aw.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = aw; c.fillRect(0, 0, PW, PH);

  // 3. god-ray shafts — sunlight piercing down from the surface
  for (let i = 0, n = 2 + Math.round(depth * 2); i < n; i++) {
    const x = rand(PW * 0.15, PW * 0.85), w = rand(36, 80);
    const g = c.createLinearGradient(0, 0, 0, PH * 0.85);
    g.addColorStop(0, hexA(B[3], 0.12 + depth * 0.05)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.7; c.fillStyle = g;
    c.beginPath(); c.moveTo(x - w * 0.3, 0); c.lineTo(x + w * 0.3, 0); c.lineTo(x + w, PH * 0.85); c.lineTo(x - w, PH * 0.85); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;

  // 4. caustic ripples — wavering horizontal light bands (the signature)
  for (let i = 0, n = 16 + Math.round(depth * 10); i < n; i++) {
    const y = rand(0, PH); c.globalAlpha = rand(0.05, 0.14); c.strokeStyle = B[4]; c.lineWidth = rand(0.6, 1.6);
    c.beginPath(); let lx = 0; c.moveTo(0, y);
    for (let k = 1; k <= 8; k++) c.lineTo(k / 8 * PW, y + Math.sin(k * 1.3 + i) * rand(4, 12));
    c.stroke();
  }

  // 5. bioluminescent blooms — soft glowing plankton/jelly orbs
  for (let i = 0, n = 5 + Math.round(depth * 4); i < n; i++) {
    const x = rand(0, PW), y = rand(PH * 0.1, PH * 0.95), r = rand(26, 64);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(B[4], 0.6)); g.addColorStop(0.5, hexA(B[3], 0.28)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.4, 0.7); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // 6. HERO landmark — a large bioluminescent vent: a bright core with rising tendrils
  const vx = rand(PW * 0.25, PW * 0.75), vy = rand(PH * 0.55, PH * 0.9);
  const vg = c.createRadialGradient(vx, vy, 0, vx, vy, PH * 0.34);
  vg.addColorStop(0, hexA(B[4], 0.5)); vg.addColorStop(0.4, hexA(B[3], 0.22)); vg.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.8; c.fillStyle = vg; c.beginPath(); c.arc(vx, vy, PH * 0.34, 0, TAU); c.fill();
  c.shadowColor = B[4]; c.shadowBlur = 8;
  for (let t = 0; t < 6; t++) {
    let tx = vx + rand(-30, 30), ty = vy; c.globalAlpha = rand(0.25, 0.5); c.strokeStyle = B[4]; c.lineWidth = rand(1, 2.4);
    c.beginPath(); c.moveTo(tx, ty);
    for (let k = 0; k < 5; k++) { tx += rand(-14, 14); ty -= rand(24, 44); c.lineTo(tx, ty); }
    c.stroke();
  }
  c.shadowBlur = 0;

  // 7. bioluminescent kelp — tall wavy strands rising from the seabed (vertical life)
  for (let i = 0, n = 4 + Math.round(depth * 3); i < n; i++) {
    let kx = rand(0, PW), ky = PH + 10;
    c.shadowColor = B[4]; c.shadowBlur = 6;
    c.globalAlpha = rand(0.12, 0.28); c.strokeStyle = B[3]; c.lineWidth = rand(1, 2.2);
    c.beginPath(); c.moveTo(kx, ky);
    for (let k = 0; k < 7; k++) { kx += Math.sin(k * 0.9 + i) * rand(6, 16); ky -= rand(40, 70); c.lineTo(kx, ky); }
    c.stroke();
  }
  c.shadowBlur = 0;

  // 8. fish schools — tight clusters of tiny darting glints (movement/life)
  for (let i = 0, n = 2 + Math.round(depth * 2); i < n; i++) {
    const cx2 = rand(PW * 0.15, PW * 0.85), cy2 = rand(PH * 0.2, PH * 0.85);
    for (let k = 0; k < 10; k++) { c.globalAlpha = rand(0.18, 0.45); c.fillStyle = B[4]; c.beginPath(); c.arc(cx2 + rand(-22, 22), cy2 + rand(-14, 14), rand(0.5, 1.2), 0, TAU); c.fill(); }
  }

  // 9. seabed coral bumps glowing along the bottom
  for (let i = 0; i < 14; i++) {
    const bx2 = rand(0, PW), r = rand(8, 22);
    const g = c.createRadialGradient(bx2, PH, 0, bx2, PH, r);
    g.addColorStop(0, hexA(B[3], 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.3, 0.6); c.fillStyle = g; c.beginPath(); c.arc(bx2, PH, r, 0, TAU); c.fill();
  }

  // 10. rising bubbles + marine-snow glints
  for (let i = 0, n = 48 + Math.round(depth * 28); i < n; i++) {
    c.globalAlpha = rand(0.12, 0.38); c.fillStyle = Math.random() < 0.5 ? B[4] : p.star;
    const x = Math.random() * PW, y = Math.random() * PH, r = rand(0.5, 1.8);
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (Math.random() < 0.3) { c.globalAlpha *= 0.5; c.beginPath(); c.arc(x + 0.6, y - 0.6, r * 0.5, 0, TAU); c.fill(); }  // bubble highlight
  }

  // 11. gentle, aspect-aware vignette
  c.globalCompositeOperation = 'source-over';
  const VR = Math.max(PW, PH);
  const vig = c.createRadialGradient(PW / 2, PH * 0.5, VR * 0.34, PW / 2, PH * 0.5, VR * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = vig; c.fillRect(0, 0, PW, PH);
  c.globalAlpha = 1;
}

// A glowing mushroom — bulbous cap on a stem, the Overgrowth's hero motif.
function drawMushroom(c, x, y, size, B) {
  c.save();
  c.strokeStyle = hexA(B[2], 0.5); c.lineWidth = size * 0.16; c.globalAlpha = rand(0.4, 0.7);
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-size * 0.15, size * 0.15), y - size * 0.9); c.stroke();   // stem
  const cy2 = y - size * 0.9, cr = size * rand(0.5, 0.8);
  const g = c.createRadialGradient(x, cy2, 0, x, cy2, cr);
  g.addColorStop(0, hexA(B[4], 0.85)); g.addColorStop(0.5, hexA(B[3], 0.55)); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = rand(0.6, 0.9); c.fillStyle = g;
  c.beginPath(); c.ellipse(x, cy2, cr, cr * 0.62, 0, Math.PI, TAU); c.fill();   // dome cap
  c.globalAlpha = 0.8; c.fillStyle = hexA('#ffffff', 0.5);
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + rand(-cr * 0.6, cr * 0.6), cy2 - rand(0, cr * 0.4), 0.9, 0, TAU); c.fill(); }  // cap spots
  c.restore();
}

// The Overgrowth — a LIT bioluminescent fungal cavern: mossy green rock with
// glowing mushrooms, hanging vines, drifting spores, and a hero heart-tree.
// Distinct motif (flora) + hue (emerald-lime) from lava/crystal/water.
function genFloraNebula(c, p, PW, PH, depth) {
  const B = p.blobs;   // [near-black green, dark green, green, emerald, lime]

  // 1. lit mossy grade — brighter than the veil
  const base = c.createLinearGradient(0, 0, 0, PH);
  base.addColorStop(0, '#0a2014'); base.addColorStop(0.55, '#0c2818'); base.addColorStop(1, '#123a22');
  c.fillStyle = base; c.fillRect(0, 0, PW, PH);
  for (let i = 0; i < 10; i++) {   // mossy mottle
    const x = rand(0, PW), y = rand(0, PH), r = rand(120, 280);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, Math.random() < 0.5 ? hexA(B[2], 0.4) : 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.3, 0.6); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'lighter';

  // 2. green ambient — lit grotto, brighter than the veil
  const aw = c.createRadialGradient(PW / 2, PH * 0.5, 0, PW / 2, PH * 0.5, Math.max(PW, PH) * 0.75);
  aw.addColorStop(0, hexA(B[2], 0.22)); aw.addColorStop(0.5, hexA(B[1], 0.18)); aw.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = aw; c.fillRect(0, 0, PW, PH);

  // 3. hanging vines/roots from the ceiling (drooping curved strands + leaf glints)
  for (let i = 0, n = 5 + Math.round(depth * 3); i < n; i++) {
    let vx = rand(0, PW), vy = -10;
    c.globalAlpha = rand(0.14, 0.3); c.strokeStyle = B[2]; c.lineWidth = rand(1, 2.2);
    c.beginPath(); c.moveTo(vx, vy);
    for (let k = 0; k < 7; k++) { vx += Math.sin(k * 0.8 + i) * rand(5, 14); vy += rand(40, 70); c.lineTo(vx, vy); }
    c.stroke();
    c.globalAlpha = rand(0.3, 0.6); c.fillStyle = hexA(B[4], 0.6);   // leaf glints
    c.beginPath(); c.arc(vx, vy, 1.4, 0, TAU); c.fill();
  }

  // 4. spore clouds — soft glowing green blooms
  for (let i = 0, n = 5 + Math.round(depth * 4); i < n; i++) {
    const x = rand(0, PW), y = rand(PH * 0.1, PH * 0.95), r = rand(30, 70);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(B[4], 0.5)); g.addColorStop(0.5, hexA(B[3], 0.26)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = rand(0.4, 0.7); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }

  // 5. glowing mushrooms — the hero motif, more/larger deeper, rooted near the floor
  for (let i = 0, n = 6 + Math.round(depth * 6); i < n; i++)
    drawMushroom(c, rand(PW * 0.06, PW * 0.94), rand(PH * 0.4, PH * 0.98), rand(16, 40), B);

  // 6. HERO landmark — a great heart-tree: a big glow with branching roots
  const hxc = rand(PW * 0.3, PW * 0.7), hyc = rand(PH * 0.55, PH * 0.85);
  const hg = c.createRadialGradient(hxc, hyc, 0, hxc, hyc, PH * 0.32);
  hg.addColorStop(0, hexA(B[4], 0.45)); hg.addColorStop(0.4, hexA(B[3], 0.22)); hg.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.8; c.fillStyle = hg; c.beginPath(); c.arc(hxc, hyc, PH * 0.32, 0, TAU); c.fill();
  for (let t = 0; t < 6; t++) {
    let tx = hxc, ty = hyc; c.globalAlpha = rand(0.22, 0.44); c.strokeStyle = B[3]; c.lineWidth = rand(1, 2.4);
    let a = -Math.PI / 2 + rand(-1, 1);
    c.beginPath(); c.moveTo(tx, ty);
    for (let k = 0; k < 5; k++) { a += rand(-0.4, 0.4); const len = rand(20, 40); tx += Math.cos(a) * len; ty += Math.sin(a) * len; c.lineTo(tx, ty); }
    c.stroke();
  }

  // 7. drifting spore glints
  for (let i = 0, n = 56 + Math.round(depth * 28); i < n; i++) {
    c.globalAlpha = rand(0.12, 0.38); c.fillStyle = Math.random() < 0.45 ? B[4] : p.star;
    c.beginPath(); c.arc(Math.random() * PW, Math.random() * PH, rand(0.4, 1.4), 0, TAU); c.fill();
  }

  // 8. gentle, aspect-aware vignette
  c.globalCompositeOperation = 'source-over';
  const VR = Math.max(PW, PH);
  const vig = c.createRadialGradient(PW / 2, PH * 0.5, VR * 0.34, PW / 2, PH * 0.5, VR * 0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = vig; c.fillRect(0, 0, PW, PH);
  c.globalAlpha = 1;
}

export function genNebula(p, level, PW, PH, depth = 0) {
  level = level || 1;
  const s = createSurface(PW, PH), c = s.ctx;
  // band style drives the backdrop flavor (magma / caves / ocean / flora / sky / aurora / space)
  const style = p.style || 'space';
  if (style === 'magma') { genMagmaNebula(c, p, PW, PH, depth); return s; }
  if (style === 'caves') { genCrystalNebula(c, p, PW, PH, depth); return s; }
  if (style === 'ocean') { genOceanNebula(c, p, PW, PH, depth); return s; }
  if (style === 'flora') { genFloraNebula(c, p, PW, PH, depth); return s; }
  c.fillStyle = '#04050d'; c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'lighter';
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
  if (style === 'caves') {                              // crystalline rock face — dark shards + faint embedded crystals
    for (let i = 0; i < 30; i++) {                       // dark angular rock shards
      const x = rand(0, PW), y = rand(0, PH), w = rand(20, 60), h = rand(14, 40);
      c.globalAlpha = rand(0.12, 0.24); c.fillStyle = Math.random() < 0.5 ? '#000' : d1;
      c.save(); c.translate(x, y); c.rotate(rand(-0.4, 0.4));
      c.beginPath(); c.moveTo(-w / 2, h / 2); c.lineTo(0, -h / 2); c.lineTo(w / 2, h / 2); c.closePath(); c.fill();
      c.restore();
    }
    for (let i = 0, n = 10 + Math.round(depth * 8); i < n; i++) {   // faint embedded crystal outlines (geodes beneath)
      const x = rand(0, PW), y = rand(0, PH), h = rand(10, 26);
      c.save(); c.translate(x, y); c.rotate(rand(0, TAU)); c.globalAlpha = rand(0.1, 0.26) + depth * 0.1;
      c.strokeStyle = hexA(pal.blobs[3], 0.6); c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, -h / 2); c.lineTo(h * 0.18, 0); c.lineTo(0, h / 2); c.lineTo(-h * 0.18, 0); c.closePath(); c.stroke();
      c.restore();
    }
    for (let i = 0; i < 50; i++) {                       // mineral glints
      c.globalAlpha = rand(0.12, 0.4); c.fillStyle = Math.random() < 0.3 ? hexA(pal.blobs[4], 0.6) : 'rgba(170,160,200,0.4)';
      c.fillRect(Math.random() * PW, Math.random() * PH, 1.2, 1.2);
    }
    c.globalAlpha = 1;
  } else if (style === 'ocean') {                       // deep water — caustics + bubbles + bio glints
    for (let i = 0; i < 28; i++) {                       // horizontal caustic ripples
      c.globalAlpha = rand(0.04, 0.1); c.fillStyle = d2;
      c.beginPath(); c.ellipse(rand(0, PW), rand(0, PH), rand(40, 120), rand(1.5, 4), 0, 0, TAU); c.fill();
    }
    for (let i = 0, n = 26 + Math.round(depth * 14); i < n; i++) {   // bubbles
      const x = rand(0, PW), y = rand(0, PH), r = rand(1, 3.5);
      c.globalAlpha = rand(0.1, 0.3); c.strokeStyle = hexA(pal.blobs[4], 0.6); c.lineWidth = 0.7;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    }
    for (let i = 0; i < 30; i++) {                       // bioluminescent glints
      c.globalAlpha = rand(0.08, 0.26); c.fillStyle = Math.random() < 0.35 ? hexA(pal.blobs[4], 0.5) : 'rgba(150,200,210,0.32)';
      c.fillRect(Math.random() * PW, Math.random() * PH, 1.2, 1.2);
    }
    c.globalAlpha = 1;
  } else if (style === 'sky') {                         // soft cloud cover
    for (let i = 0; i < 18; i++) {
      const x = rand(0, PW), y = rand(0, PH), r = rand(34, 96);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(d2, 0.14)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 1; c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  } else if (style === 'magma') {                       // a textured dark BASALT WALL — the unmined rock you stare at
    // faint layered strata so the veil reads as a stone face, not flat dark
    for (let i = 0; i < 9; i++) {
      const yb = (i + rand(0.2, 0.8)) / 9 * PH, hh = rand(10, 26);
      c.globalAlpha = rand(0.06, 0.13); c.fillStyle = i % 2 ? '#0c0a15' : '#171327';
      c.beginPath(); c.moveTo(0, yb);
      for (let k = 1; k <= 6; k++) c.lineTo(k / 6 * PW, yb + rand(-9, 9));
      for (let k = 6; k >= 0; k--) c.lineTo(k / 6 * PW, yb + hh + rand(-9, 9));
      c.closePath(); c.fill();
    }
    // angular rock facets — surface relief
    for (let i = 0; i < 22; i++) {
      const x = rand(0, PW), y = rand(0, PH), sz = rand(20, 52);
      c.globalAlpha = rand(0.05, 0.12); c.fillStyle = Math.random() < 0.5 ? '#000' : '#1b1630';
      c.save(); c.translate(x, y); c.rotate(rand(0, TAU));
      c.beginPath(); c.moveTo(rand(-sz, -sz * 0.3), rand(-sz, -sz * 0.3)); c.lineTo(rand(sz * 0.3, sz), rand(-sz, 0));
      c.lineTo(rand(0, sz), rand(sz * 0.3, sz)); c.lineTo(rand(-sz, 0), rand(0, sz)); c.closePath(); c.fill(); c.restore();
    }
    // dark fractures running through the rock
    for (let i = 0; i < 14; i++) {
      let x = rand(0, PW), y = rand(0, PH);
      c.globalAlpha = rand(0.1, 0.22); c.strokeStyle = '#000'; c.lineWidth = rand(0.6, 1.5);
      c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 3; k++) { x += rand(-44, 44); y += rand(-44, 44); c.lineTo(x, y); } c.stroke();
    }
    // glowing lava ember cracks (more, hotter deeper)
    const crackN = 14 + Math.round(depth * 16);
    for (let i = 0; i < crackN; i++) {
      let x = rand(0, PW), y = rand(0, PH);
      c.globalAlpha = 1; c.strokeStyle = hexA(pal.blobs[3], 0.18 + depth * 0.18); c.lineWidth = rand(0.6, 1.6) + depth;
      c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rand(-40, 40); y += rand(-40, 40); c.lineTo(x, y); } c.stroke();
    }
    // mineral flecks — tiny cool/gold glints caught in the rock
    for (let i = 0; i < 55; i++) {
      c.globalAlpha = rand(0.1, 0.4);
      c.fillStyle = Math.random() < 0.3 ? hexA(pal.blobs[4], 0.6) : 'rgba(150,150,180,0.4)';
      c.fillRect(Math.random() * PW, Math.random() * PH, 1.2, 1.2);
    }
    c.globalAlpha = 1;
  } else if (style === 'aurora') {                      // faint vertical shimmer
    for (let i = 0; i < 8; i++) {
      const x = rand(0, PW), w = rand(20, 60);
      const g = c.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, hexA(pal.blobs[3], 0.1)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 1; c.fillStyle = g; c.fillRect(x - w, 0, w * 2, PH);
    }
  } else if (style === 'flora') {                       // overgrown veil — roots/vines + organic mottle + spore glints
    for (let i = 0; i < 30; i++) {                       // organic mossy mottle
      c.globalAlpha = rand(0.08, 0.18); c.fillStyle = Math.random() < 0.5 ? '#000' : d2;
      c.beginPath(); c.arc(rand(0, PW), rand(0, PH), rand(10, 36), 0, TAU); c.fill();
    }
    for (let i = 0, n = 12 + Math.round(depth * 8); i < n; i++) {   // dark roots/vines
      let x = rand(0, PW), y = rand(0, PH); c.globalAlpha = rand(0.1, 0.22); c.strokeStyle = '#000'; c.lineWidth = rand(0.8, 1.8);
      c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rand(-30, 30); y += rand(10, 44); c.lineTo(x, y); } c.stroke();
    }
    for (let i = 0; i < 34; i++) {                       // spore glints
      c.globalAlpha = rand(0.08, 0.26); c.fillStyle = Math.random() < 0.35 ? hexA(pal.blobs[4], 0.5) : 'rgba(170,210,170,0.32)';
      c.fillRect(Math.random() * PW, Math.random() * PH, 1.2, 1.2);
    }
    c.globalAlpha = 1;
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
  // The Depths veil is COOL basalt (warm ember cracks come from fogSignature);
  // other bands keep their band-tinted near-black.
  const d0 = style === 'magma' ? '#0a0813' : style === 'caves' ? '#0b0716' : style === 'ocean' ? '#04161c' : style === 'flora' ? '#06160c' : pal.blobs[0];
  const d1 = style === 'magma' ? '#15121f' : style === 'caves' ? '#1a1030' : style === 'ocean' ? '#0a3038' : style === 'flora' ? '#0e3018' : pal.blobs[1];
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
  if (style === 'magma') {   // a faint heartbeat of heat behind the veil, so the dark isn't dead-flat
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0, n = 3 + Math.round(depth * 3); i < n; i++) {
      const x = rand(PW * 0.15, PW * 0.85), y = rand(PH * 0.5, PH * 1.05), r = rand(120, 240);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(pal.blobs[2], 0.1 + depth * 0.06)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.restore();
  } else if (style === 'caves') {   // a faint glow of crystal light behind the veil
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0, n = 3 + Math.round(depth * 3); i < n; i++) {
      const x = rand(PW * 0.12, PW * 0.88), y = rand(PH * 0.2, PH * 0.95), r = rand(110, 220);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(pal.blobs[3], 0.09 + depth * 0.06)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.restore();
  } else if (style === 'ocean') {   // a faint bioluminescent glow behind the veil
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0, n = 3 + Math.round(depth * 3); i < n; i++) {
      const x = rand(PW * 0.12, PW * 0.88), y = rand(PH * 0.15, PH * 0.95), r = rand(110, 210);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(pal.blobs[3], 0.08 + depth * 0.05)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.restore();
  } else if (style === 'flora') {   // a faint spore-glow behind the veil
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0, n = 3 + Math.round(depth * 3); i < n; i++) {
      const x = rand(PW * 0.12, PW * 0.88), y = rand(PH * 0.2, PH * 0.95), r = rand(100, 200);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(pal.blobs[3], 0.08 + depth * 0.05)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.restore();
  }
  for (let i = 0; i < 500; i++) {
    c.globalAlpha = rand(0.02, 0.06);
    c.fillStyle = Math.random() > 0.5 ? hexA(d1, 1) : '#000';
    c.fillRect(Math.random() * PW, Math.random() * PH, 1.4, 1.4);
  }
  c.globalAlpha = 1;
  return s;
}
