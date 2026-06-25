/* =========================================================================
   Mobile FX budget. Phones/tablets pay a real fill-rate cost for two things
   that desktop GPUs shrug off: the volume of additive ('lighter') glow draws
   from particles/motes, and the native `shadowBlur` used on the per-frame
   trail + border. So on coarse-pointer devices we trim BOTH — fewer transient
   particles, fewer ambient motes, softer blur — while desktop stays at full
   richness. This is the gap that made "motion off" feel faster on a phone.

   ALL OF THIS IS PRESENTATION ONLY. None of these values feed the seeded sim,
   so trimming them can never change a daily/board outcome. (Determinism rule.)

   Resolved once at load: a device doesn't switch pointer class mid-session.
   ========================================================================= */

function detectCoarse(): boolean {
  try {
    return typeof matchMedia === 'function' &&
      (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches);
  } catch (e) { return false; }
}

/** True on phones/tablets (coarse pointer / no hover) — the low-FX path. */
export const LOW_FX = detectCoarse();

/** Multiplier on transient particle SPAWN counts (capture sparks, veil bursts). */
export const FX_SCALE = LOW_FX ? 0.55 : 1;

/** Hard ceiling on live transient particles so dense capture chains can't spike a phone frame. */
export const MAX_PARTICLES = LOW_FX ? 130 : 400;

/** Ambient mote population seeded per level. */
export const MOTE_COUNT = LOW_FX ? 28 : 46;

/** Radius multiplier on the few per-frame `shadowBlur` glows (trail + border). */
export const BLUR_SCALE = LOW_FX ? 0.6 : 1;

/** Clamp a desired spawn count to the FX scale AND remaining particle headroom. */
export function budgetSpawn(desired: number, liveCount: number): number {
  const scaled = Math.round(desired * FX_SCALE);
  return Math.max(0, Math.min(scaled, MAX_PARTICLES - liveCount));
}
