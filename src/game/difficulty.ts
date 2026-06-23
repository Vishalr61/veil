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
  pickupFreq: 1, riftScale: 1, scoreMult: 1,
};

// EASY = no time pressure; the squeeze + dodging carry it. Forgiving elsewhere,
// but the clear target and the enemies stay real ("easy, not trivial").
const easy: DiffConfig = {
  key: 'easy', label: 'EASY',
  fuse: false, fuseScale: 1, clock: false, clockScale: 1, lives: 5,
  targetDelta: -0.10, targetFloor: 0.50,
  speedBase: 0.7, speedRamp: 0.4, speedCap: 140, countDelta: -1, chaserFromLevel: 6, cutterFromLevel: 11, invulnScale: 1.5,
  pickupFreq: 1.5, riftScale: 0.5, scoreMult: 0.75,
};

// HARD = Medium with the screws turned — the optimization mode.
const hard: DiffConfig = {
  key: 'hard', label: 'HARD',
  fuse: true, fuseScale: 0.8, clock: true, clockScale: 0.8, lives: 2,
  targetDelta: 0, targetFloor: 0,
  speedBase: 1.1, speedRamp: 1.1, speedCap: 240, countDelta: 1, chaserFromLevel: 0, cutterFromLevel: 0, invulnScale: 0.7,
  pickupFreq: 0.6, riftScale: 1, scoreMult: 1.5,
};

export const DIFFS: Record<Diff, DiffConfig> = { easy, medium, hard };
export const DIFF_ORDER: Diff[] = ['easy', 'medium', 'hard'];

// The difficulty actually in force. The daily is always Medium for fairness.
export function effectiveDiff(): DiffConfig {
  if (G.isDaily) return DIFFS.medium;
  return DIFFS[(G.diff as Diff)] || DIFFS.medium;
}

/* ----------------------------- persistence ----------------------------- */
const KEY = 'veil_diff';
export function loadDiff(): Diff {
  try { const v = localStorage.getItem(KEY); if (v === 'easy' || v === 'medium' || v === 'hard') return v; } catch (e) {}
  return 'medium';
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
