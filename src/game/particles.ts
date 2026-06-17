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
  for (let i = 0; i < 46; i++)
    G.motes.push({ x: Math.random() * PW, y: Math.random() * PH, vx: rand(-6, 6), vy: rand(-6, 6), r: rand(0.5, 1.6), a: rand(0.05, 0.3) });
}
export function updateMotes(dt) {
  for (const m of G.motes) {
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.x < 0) m.x += PW; else if (m.x > PW) m.x -= PW;
    if (m.y < 0) m.y += PH; else if (m.y > PH) m.y -= PH;
  }
}
