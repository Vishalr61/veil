/* =========================================================================
   Difficulty — Easy / Medium / Hard.

   Medium is the game EXACTLY as tuned today; its config is all-neutral (flags on,
   every multiplier 1, the same literal lives/invuln), so the wired systems read
   the config and reproduce current behavior bit-for-bit. Easy/Hard are expressed
   as deltas relative to Medium.

   FAIRNESS: the daily challenge always runs at Medium regardless of the player's
   choice — see effectiveDiff() — so the seeded board AND the rules are identical
   for everyone. Systems should call effectiveDiff(), not read G.diff directly.

   These helpers are PURE (config in, value out) so they can be unit-tested
   without standing up the whole game. ========================================= */

import { G } from './state';
import type { EnemyCounts } from './enemies';

export type Diff = 'easy' | 'medium' | 'hard';

export interface DiffConfig {
  key: Diff;
  label: string;
  // pressure
  fuse: boolean;            // is the open-line fuse active?
  fuseScale: number;        // multiplier on the fuse window (Hard tightens)
  clock: boolean;           // is the level clock active?
  clockScale: number;       // multiplier on the time budget (Hard tightens)
  lives: number;            // starting lives
  targetDelta: number;      // added to the blueprint clear target (Easy lowers)
  targetFloor: number;      // minimum clear target after the delta
  // enemies
  speedBase: number;        // multiplier on the 140 base speed
  speedRamp: number;        // multiplier on the per-level +9 ramp
  speedCap: number;         // absolute speed cap (Medium = 240)
  countDelta: number;       // enemies per floor: Easy -1 (min 1), Hard +1 (non-summit)
  chaserFromLevel: number;  // suppress chasers before this level (0 = never suppress)
  cutterFromLevel: number;  // suppress cutters before this level
  invulnScale: number;      // multiplier on spawn invulnerability
  // hero movement (cells/s-ish): Easy ramps far gentler so deep floors stay
  // controllable — its difficulty comes from enemy count, not hero speed.
  heroBase: number;
  heroRamp: number;
  heroCap: number;
  heroLevelCap: number;     // level past which hero speed STOPS rising (holds this level's speed)
  // economy
  pickupFreq: number;       // pickup frequency multiplier (interval is divided by this)
  riftScale: number;        // multiplier on rift (hazard) count
  scoreMult: number;        // score multiplier
}

// MEDIUM = today. All-neutral on purpose; do NOT retune.
const medium: DiffConfig = {
  key: 'medium', label: 'MED',
  fuse: true, fuseScale: 1, clock: true, clockScale: 1, lives: 3,
  targetDelta: 0, targetFloor: 0,
  speedBase: 1, speedRamp: 1, speedCap: 240, countDelta: 0, chaserFromLevel: 0, cutterFromLevel: 0, invulnScale: 1,
  heroBase: 13.5, heroRamp: 0.5, heroCap: 20, heroLevelCap: 999,   // today's hero-speed curve (no level clamp)
  pickupFreq: 1, riftScale: 1, scoreMult: 1,
};

// EASY = "Bloom": its own lush garden mode, not Medium-lite. No time pressure,
// near-flat speed (the ramp comes from count/maze/hazard/reward, not movement),
// and a roster of gentle garden critters built by bloomBlueprint (not
// applyDiffCounts — the schedule/count fields below are inert for Easy now).
const easy: DiffConfig = {
  key: 'easy', label: 'EASY',
  fuse: false, fuseScale: 1, clock: false, clockScale: 1, lives: 3,
  targetDelta: -0.10, targetFloor: 0.50,
  // speed is intentionally near-flat: a low ramp + a low cap so deeper Bloom
  // floors escalate via the other levers, never twitch.
  speedBase: 0.7, speedRamp: 0.15, speedCap: 120, countDelta: 0, chaserFromLevel: 0, cutterFromLevel: 0, invulnScale: 1.5,
  heroBase: 11, heroRamp: 0.06, heroCap: 12, heroLevelCap: 10,   // ramps over L1-10, then HOLDS (L10 speed forever)
  pickupFreq: 1.5, riftScale: 1, scoreMult: 0.75,   // rifts controlled by bloomBlueprint, so no extra scale
};

// HARD = the standard campaign, parked here from the old Medium: timed + fused, the
// full hunter roster across the seven zones. (The old "screws" Hard is retired; the
// NEW Medium becomes its own themed mode — see the Medium plan.)
const hard: DiffConfig = {
  key: 'hard', label: 'HARD',
  fuse: true, fuseScale: 1, clock: true, clockScale: 1, lives: 3,
  targetDelta: 0, targetFloor: 0,
  speedBase: 1, speedRamp: 1, speedCap: 240, countDelta: 0, chaserFromLevel: 0, cutterFromLevel: 0, invulnScale: 1,
  heroBase: 13.5, heroRamp: 0.5, heroCap: 20, heroLevelCap: 999,
  pickupFreq: 1, riftScale: 1, scoreMult: 1,
};

export const DIFFS: Record<Diff, DiffConfig> = { easy, medium, hard };
export const DIFF_ORDER: Diff[] = ['easy', 'medium', 'hard'];

// The difficulty actually in force. The daily runs the standard-campaign config
// (now Hard, after the old Medium was parked there) so every player gets the same
// fair baseline — and it stays put when the NEW Medium becomes its own themed mode.
export function effectiveDiff(): DiffConfig {
  if (G.isDaily) return DIFFS.hard;
  return DIFFS[(G.diff as Diff)] || DIFFS.easy;
}

/* ----------------------------- persistence ----------------------------- */
const KEY = 'veil_diff';
export function loadDiff(): Diff {
  try { const v = localStorage.getItem(KEY); if (v === 'easy' || v === 'medium' || v === 'hard') return v; } catch (e) {}
  return 'easy';   // Bloom is the default mode the app opens in
}
export function setDiff(d: Diff) {
  G.diff = d;
  try { localStorage.setItem(KEY, d); } catch (e) {}
}

/* ----------------------------- pure levers ----------------------------- */
const TARGET_CAP = 0.74;   // the existing campaign cap, unchanged for every mode

// Clear target after the per-mode delta + floor, still capped at 0.74.
export function clearTarget(bpTarget: number, cfg: DiffConfig): number {
  return Math.min(Math.max(bpTarget + cfg.targetDelta, cfg.targetFloor), TARGET_CAP);
}

// Fuse window (seconds) for an open line; Infinity when the fuse is off (Easy).
// Medium reproduces the current player.ts formula exactly.
export function fuseWindow(level: number, cfg: DiffConfig): number {
  if (!cfg.fuse) return Infinity;
  return Math.max(2.8, 6 - level * 0.12) * cfg.fuseScale;
}

// Level time budget; Infinity when the clock is off (Easy).
export function levelClock(budget: number, cfg: DiffConfig): number {
  return cfg.clock ? budget * cfg.clockScale : Infinity;
}

// Enemy speed; Medium reproduces enemies.ts' min(140 + 9*(lv-1), 240).
export function enemySpeed(level: number, cfg: DiffConfig): number {
  return Math.min(140 * cfg.speedBase + 9 * cfg.speedRamp * (level - 1), cfg.speedCap);
}

// Hero move speed; Medium/Hard reproduce today's min(13.5 + 0.5*(lv-1), 20). Easy
// ramps far gentler (cap 15) so the player stays in control on deep floors —
// difficulty there comes from the rising enemy count, not twitch movement.
export function playerSpeed(level: number, cfg: DiffConfig): number {
  const L = Math.min(level, cfg.heroLevelCap);   // freeze the ramp past heroLevelCap (Easy: L10 onward)
  return Math.min(cfg.heroBase + cfg.heroRamp * (L - 1), cfg.heroCap);
}

// Spawn invulnerability scaled per mode (Easy more, Hard less).
export function invulnFor(base: number, cfg: DiffConfig): number {
  return base * cfg.invulnScale;
}

// Rift (hazard) count after the per-mode density scale.
export function riftCount(bpRifts: number, cfg: DiffConfig): number {
  return Math.round(bpRifts * cfg.riftScale);
}

// Per-mode enemy roster for a floor: schedule delays (Easy holds back chaser /
// cutter) + the count delta, keeping at least one non-boss enemy. The qix boss
// is added by the caller for summits; the +count delta skips summit floors.
export function applyDiffCounts(counts: EnemyCounts, level: number, summit: boolean, cfg: DiffConfig): EnemyCounts {
  const c: EnemyCounts = { ...counts };
  if (level < cfg.chaserFromLevel) c.chaser = 0;
  if (level < cfg.cutterFromLevel) c.cutter = 0;
  if (cfg.countDelta < 0) c.drifter = Math.max(0, c.drifter + cfg.countDelta);
  else if (cfg.countDelta > 0 && !summit) c.drifter = c.drifter + cfg.countDelta;
  const total = c.drifter + c.chaser + c.cutter + (c.sentinel || 0) + (c.sleeper || 0) + (c.wraith || 0);
  if (total < 1) c.drifter = 1;
  return c;
}
