/* =========================================================================
   Particles, score popups, and ambient motes — pure presentation fx over the
   shared G state. None of this affects the deterministic sim; it's free to use
   Math.random. Spawned by capture, pickups, death, etc.; ticked each frame.
   ========================================================================= */

import { G } from './state';
import { rand, TAU } from '../core/math';
import { PW, PH } from '../core/dims';

// A radial burst of particles — used when the veil gives up a cache or rift.
export function veilBurst(x: number, y: number, col: string) {
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * TAU, sp = rand(40, 165);
    G.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.4, 0.9), max: 0.9, r: rand(1.2, 3), col });
  }
}

// A celebratory spark spray from the point a capture closes, count + power
// scaled to the area claimed. Rendered additively (no shadowBlur), so it's
// cheap. `calm` (reduce-motion) keeps it small and gentle.
export function captureBurst(x: number, y: number, col: string, area: number, calm?: boolean) {
  const n = Math.min(calm ? 12 : 44, (calm ? 4 : 9) + Math.floor(area * (calm ? 0.08 : 0.26)));
  const power = (calm ? 0.6 : 1) * (1 + Math.min(1.5, area * 0.006));
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * TAU, sp = rand(50, 230) * power;
    G.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.35, 0.9), max: 0.9, r: rand(1, 3.2), col });
  }
}

export function spawnPopup(x, y, text, color, size) {
  G.popups.push({ x, y, vy: -26, life: 1.1, max: 1.1, text, color, size: size || 14 });
}
export function updatePopups(dt) {
  for (let i = G.popups.length - 1; i >= 0; i--) {
    const p = G.popups[i];
    p.y += p.vy * dt; p.vy *= 0.92; p.life -= dt;
    if (p.life <= 0) G.popups.splice(i, 1);
  }
}
export function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
}
export function initMotes() {
  G.motes.length = 0;
  const style = G.pal && G.pal.style;
  const magma = style === 'magma';   // the Depths: rising embers
  const caves = style === 'caves';   // Crystal Caves: slow-drifting crystal sparkle
  const ocean = style === 'ocean';   // the Abyss: rising bubbles
  const flora = style === 'flora';   // the Overgrowth: drifting glowing spores
  const sky = style === 'sky';       // the Expanse: slow-drifting dawn wisps
  const aurora = style === 'aurora'; // Aurora: gently falling snow
  const space = style === 'space';   // Deep Space: slow-drifting twinkling stardust
  const rift = style === 'rift';     // The Rift: flickering prism sparks
  for (let i = 0; i < 46; i++)
    G.motes.push({
      x: Math.random() * PW, y: Math.random() * PH,
      vx: caves ? rand(-3, 3) : ocean ? rand(-4, 4) : flora ? rand(-4, 4) : sky ? rand(-12, 12) : aurora ? rand(-7, 7) : space ? rand(-2, 2) : rift ? rand(-9, 9) : rand(-5, 5),
      vy: magma ? rand(-26, -10) : ocean ? rand(-22, -8) : caves ? rand(-3, 3) : flora ? rand(-5, 5) : sky ? rand(-2, 2) : aurora ? rand(10, 26) : space ? rand(-2, 2) : rift ? rand(-9, 9) : rand(-6, 6),
      r: rand(0.5, magma ? 1.9 : caves ? 1.7 : ocean ? 1.8 : flora ? 1.7 : sky ? 1.8 : aurora ? 1.7 : space ? 1.5 : rift ? 1.6 : 1.6),
      a: magma ? rand(0.15, 0.5) : caves ? rand(0.2, 0.55) : ocean || flora ? rand(0.1, 0.3) : sky ? rand(0.06, 0.22) : aurora ? rand(0.12, 0.4) : space ? rand(0.1, 0.4) : rift ? rand(0.15, 0.5) : rand(0.05, 0.3),
      em: magma, cr: caves, bu: ocean, sp: flora, wi: sky, sn: aurora, du: space, pr: rift,
    });
}
export function updateMotes(dt) {
  for (const m of G.motes) {
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.x < 0) m.x += PW; else if (m.x > PW) m.x -= PW;
    if (m.y < 0) m.y += PH; else if (m.y > PH) m.y -= PH;
  }
}
