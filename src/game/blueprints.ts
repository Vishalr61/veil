/* =========================================================================
   Level blueprints — the single source of truth for what each level IS.

   Early levels are AUTHORED (hand-tuned layout motif, enemies, veil content,
   target, a per-level title and a visual "depth"). Levels past the authored
   set fall back to the original procedural formulas, so endless play and the
   daily challenge for deep levels are unchanged. `initLevel` reads a blueprint
   and never branches on the level number itself.
   ========================================================================= */

import { obstacleBudget, ObstacleMotif } from '../sim/terrain';
import { veilCacheCount, veilHazardCount } from '../sim/veil';
import { enemyCounts, EnemyCounts } from './enemies';

export interface LevelBlueprint {
  title: string;          // '' => banner falls back to LEVEL N + band name
  motif: ObstacleMotif;
  density: number;        // fraction of interior turned to rock
  target: number;         // reveal target fraction
  caches: number;
  rifts: number;
  enemies: EnemyCounts;
  depth: number;          // 0..1 visual intensity within the band (calm -> turbulent)
}

// "The Depths" (magma band) — a crafted five-floor climb. Pressure (target,
// hunters, rifts) and reward (caches) both rise monotonically; cutter/sentinel
// are held for later bands, so the Depths roster is drifter + chaser only.
const AUTHORED: Record<number, LevelBlueprint> = {
  // Teach the loop: open board, one slow bouncer, caches only, no punishment.
  1: { title: 'SURFACE CRACK', motif: 'open', density: 0, target: 0.58,
       caches: 3, rifts: 0, depth: 0.10,
       enemies: { drifter: 1, chaser: 0, cutter: 0, sentinel: 0, sleeper: 0 } },
  // Teach routing: scattered basalt columns, still no rifts/hunters.
  2: { title: 'BASALT COLUMNS', motif: 'pillars', density: 0.05, target: 0.62,
       caches: 4, rifts: 0, depth: 0.30,
       enemies: { drifter: 2, chaser: 0, cutter: 0, sentinel: 0, sleeper: 0 } },
  // Risk arrives: lava veins carve chambers, the first rifts appear, and the
  // chaser debuts (auto "NEW THREAT" card).
  3: { title: 'MOLTEN VEINS', motif: 'veins', density: 0.08, target: 0.66,
       caches: 5, rifts: 2, depth: 0.55,
       enemies: { drifter: 2, chaser: 1, cutter: 0, sentinel: 0, sleeper: 0 } },
  // Ramp: denser rock, more drifters, hotter.
  4: { title: 'MAGMA RISE', motif: 'veins', density: 0.10, target: 0.68,
       caches: 6, rifts: 2, depth: 0.78,
       enemies: { drifter: 3, chaser: 1, cutter: 0, sentinel: 0, sleeper: 0 } },
  // Summit by intensity: TWO chasers converging, max rifts + caches, highest
  // target, hottest visuals. Clearing it climbs into the Crystal Caves (L6).
  5: { title: 'THE FORGE-HEART', motif: 'veins', density: 0.10, target: 0.70,
       caches: 7, rifts: 3, depth: 1.0,
       enemies: { drifter: 2, chaser: 2, cutter: 0, sentinel: 0, sleeper: 0 } },

  // "Crystal Caves" (L6-10) — a crafted climb in the amethyst grotto, harder
  // than the Depths and introducing the CUTTER as its signature new threat.
  // Gentle re-entry on floor 1, then the climb resumes.
  6: { title: 'GEODE HOLLOW', motif: 'pillars', density: 0.06, target: 0.66,
       caches: 4, rifts: 1, depth: 0.1,
       enemies: { drifter: 2, chaser: 1, cutter: 0, sentinel: 0, sleeper: 0 } },
  // The cutter debuts (auto "NEW THREAT" card) — races to slice your line.
  7: { title: 'FAULT LINE', motif: 'veins', density: 0.08, target: 0.68,
       caches: 5, rifts: 2, depth: 0.3,
       enemies: { drifter: 2, chaser: 1, cutter: 1, sentinel: 0, sleeper: 0 } },
  8: { title: 'THE PRISM', motif: 'pillars', density: 0.10, target: 0.70,
       caches: 6, rifts: 2, depth: 0.5,
       enemies: { drifter: 3, chaser: 1, cutter: 1, sentinel: 0, sleeper: 0 } },
  9: { title: 'SHARD MAZE', motif: 'veins', density: 0.11, target: 0.72,
       caches: 7, rifts: 3, depth: 0.75,
       enemies: { drifter: 3, chaser: 2, cutter: 1, sentinel: 0, sleeper: 0 } },
  // Summit: two chasers + two cutters, max rifts + caches, brightest crystal.
  10: { title: 'THE GEODE CORE', motif: 'veins', density: 0.12, target: 0.74,
        caches: 8, rifts: 4, depth: 1.0,
        enemies: { drifter: 3, chaser: 2, cutter: 2, sentinel: 0, sleeper: 0 } },

  // "The Abyss" (L11-15) — the ocean trench. No new enemy type (the roster is
  // fully introduced by now); the climb continues by intensity + the environment.
  11: { title: 'THE SHALLOWS', motif: 'pillars', density: 0.08, target: 0.74,
        caches: 7, rifts: 3, depth: 0.1,
        enemies: { drifter: 3, chaser: 1, cutter: 1, sentinel: 0, sleeper: 0 } },
  12: { title: 'DRIFT CURRENT', motif: 'veins', density: 0.10, target: 0.76,
        caches: 8, rifts: 4, depth: 0.3,
        enemies: { drifter: 3, chaser: 2, cutter: 1, sentinel: 0, sleeper: 0 } },
  13: { title: 'THE TRENCH', motif: 'veins', density: 0.12, target: 0.78,
        caches: 9, rifts: 4, depth: 0.5,
        enemies: { drifter: 4, chaser: 2, cutter: 1, sentinel: 0, sleeper: 0 } },
  14: { title: 'BLACK WATER', motif: 'veins', density: 0.13, target: 0.79,
        caches: 9, rifts: 5, depth: 0.75,
        enemies: { drifter: 4, chaser: 2, cutter: 2, sentinel: 0, sleeper: 0 } },
  // Summit of the trench: the most crowded, deepest, darkest water.
  15: { title: 'THE MAW', motif: 'veins', density: 0.14, target: 0.80,
        caches: 10, rifts: 6, depth: 1.0,
        enemies: { drifter: 4, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },

  // "The Overgrowth" (L16-20) — the bioluminescent fungal cavern. Near the
  // reveal ceiling now; the climb is mostly about pressure (enemies + rifts).
  16: { title: 'ROOTWAY', motif: 'pillars', density: 0.08, target: 0.75,
        caches: 8, rifts: 3, depth: 0.1,
        enemies: { drifter: 3, chaser: 2, cutter: 1, sentinel: 0, sleeper: 0 } },
  17: { title: 'SPOREFALL', motif: 'veins', density: 0.10, target: 0.76,
        caches: 9, rifts: 4, depth: 0.3,
        enemies: { drifter: 4, chaser: 2, cutter: 1, sentinel: 0, sleeper: 0 } },
  18: { title: 'THE THICKET', motif: 'veins', density: 0.12, target: 0.78,
        caches: 9, rifts: 5, depth: 0.5,
        enemies: { drifter: 4, chaser: 2, cutter: 2, sentinel: 0, sleeper: 0 } },
  19: { title: 'MYCELIUM DEEP', motif: 'veins', density: 0.13, target: 0.79,
        caches: 10, rifts: 5, depth: 0.75,
        enemies: { drifter: 4, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },
  // Summit: the densest growth, most hunters, brightest spore-light.
  20: { title: 'THE HEARTWOOD', motif: 'veins', density: 0.14, target: 0.80,
        caches: 11, rifts: 6, depth: 1.0,
        enemies: { drifter: 5, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },

  // "The Expanse" (L21-25) — breaking out of the dark into open dawn sky. Highest
  // targets in the run (brushing the 0.82 ceiling); the climb is pure pressure as
  // hunters and rifts peak. Floor 1 is a calm re-entry above the cloud banks.
  21: { title: 'FIRST LIGHT', motif: 'pillars', density: 0.08, target: 0.76,
        caches: 9, rifts: 3, depth: 0.1,
        enemies: { drifter: 4, chaser: 2, cutter: 1, sentinel: 0, sleeper: 0 } },
  22: { title: 'THE UPDRAFT', motif: 'veins', density: 0.10, target: 0.77,
        caches: 10, rifts: 4, depth: 0.3,
        enemies: { drifter: 4, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },
  23: { title: 'CLOUDBREAK', motif: 'veins', density: 0.12, target: 0.79,
        caches: 10, rifts: 5, depth: 0.5,
        enemies: { drifter: 5, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },
  24: { title: 'THE HIGH REACHES', motif: 'veins', density: 0.13, target: 0.80,
        caches: 11, rifts: 6, depth: 0.75,
        enemies: { drifter: 5, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },
  // Summit: the sun breaks the horizon — most hunters and rifts in the run, the
  // highest reveal target, the brightest sky. Clearing it climbs into the Aurora.
  25: { title: 'DAYBREAK', motif: 'veins', density: 0.14, target: 0.81,
        caches: 12, rifts: 7, depth: 1.0,
        enemies: { drifter: 5, chaser: 4, cutter: 3, sentinel: 0, sleeper: 0 } },

  // "Aurora" (L26-30) — the polar night beneath flowing green-violet curtains.
  // The reveal targets brush the 0.82 ceiling; the climb is pure pressure as the
  // hunter pack peaks. Floor 1 is a calm starlit re-entry over the snow.
  26: { title: 'POLAR NIGHT', motif: 'pillars', density: 0.09, target: 0.78,
        caches: 11, rifts: 5, depth: 0.1,
        enemies: { drifter: 4, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },
  27: { title: 'THE SHIMMER', motif: 'veins', density: 0.11, target: 0.79,
        caches: 11, rifts: 6, depth: 0.3,
        enemies: { drifter: 5, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },
  28: { title: 'FROSTFALL', motif: 'veins', density: 0.12, target: 0.80,
        caches: 12, rifts: 6, depth: 0.5,
        enemies: { drifter: 5, chaser: 4, cutter: 2, sentinel: 0, sleeper: 0 } },
  29: { title: 'GLACIER CROWN', motif: 'veins', density: 0.13, target: 0.81,
        caches: 12, rifts: 7, depth: 0.75,
        enemies: { drifter: 5, chaser: 4, cutter: 3, sentinel: 0, sleeper: 0 } },
  // Summit: the corona blazes overhead — the most crowded board of the run, the
  // highest reveal target. Clearing it climbs out into Deep Space.
  30: { title: 'THE CORONA', motif: 'veins', density: 0.14, target: 0.82,
        caches: 13, rifts: 8, depth: 1.0,
        enemies: { drifter: 6, chaser: 4, cutter: 3, sentinel: 0, sleeper: 0 } },

  // "Deep Space" (L31-35) — out past the aurora into the open cosmos: the
  // crafted finale of the climb. The reveal target sits at the ceiling; the only
  // way left to climb is the densest hunter packs in the run. Beyond L35 the
  // procedural endless curve takes over (still deep space), seamlessly.
  31: { title: 'THE VOID', motif: 'pillars', density: 0.09, target: 0.80,
        caches: 12, rifts: 6, depth: 0.1,
        enemies: { drifter: 5, chaser: 3, cutter: 2, sentinel: 0, sleeper: 0 } },
  32: { title: 'STARFALL', motif: 'veins', density: 0.11, target: 0.81,
        caches: 13, rifts: 7, depth: 0.3,
        enemies: { drifter: 5, chaser: 4, cutter: 3, sentinel: 0, sleeper: 0 } },
  33: { title: 'NEBULA GATE', motif: 'veins', density: 0.12, target: 0.81,
        caches: 13, rifts: 8, depth: 0.5,
        enemies: { drifter: 6, chaser: 4, cutter: 3, sentinel: 0, sleeper: 0 } },
  34: { title: 'EVENT HORIZON', motif: 'veins', density: 0.13, target: 0.82,
        caches: 14, rifts: 8, depth: 0.75,
        enemies: { drifter: 6, chaser: 4, cutter: 3, sentinel: 0, sleeper: 0 } },
  // The summit of the whole journey: the most crowded board in the run, against
  // a ringed planet and the open void.
  35: { title: 'SINGULARITY', motif: 'veins', density: 0.14, target: 0.82,
        caches: 15, rifts: 9, depth: 1.0,
        enemies: { drifter: 6, chaser: 5, cutter: 3, sentinel: 0, sleeper: 0 } },
};

// Visual intensity from position within a 5-level band: 0, .25, .5, .75, 1.0.
export function depthForLevel(lv: number): number {
  return (((lv - 1) % 5) + 5) % 5 / 4;
}

// The level time budget in seconds (Airxonix-style clock): generous early,
// tighter each level, floored at 35s so deep levels stay playable.
export function levelTimeBudget(lv: number): number {
  return Math.max(35, 70 - lv * 1.5);
}

export function blueprintForLevel(lv: number): LevelBlueprint {
  const authored = AUTHORED[lv];
  if (authored) return authored;
  // Procedural fallback — reproduces today's behavior exactly for deep levels.
  return {
    title: '',
    motif: 'blobs',
    density: obstacleBudget(lv),
    target: Math.min(0.66 + 0.02 * (lv - 1), 0.82),
    caches: veilCacheCount(lv),
    rifts: veilHazardCount(lv),
    enemies: enemyCounts(lv),
    depth: depthForLevel(lv),
  };
}

// The non-basic enemy first introduced at this level (its blueprint count rises
// from 0), or null — drives the "NEW THREAT" intro card. Blueprint-driven so it
// tracks whatever an authored level actually spawns (e.g. the L3 guardian).
export function newEnemyAtLevel(lv: number): string | null {
  const cur = blueprintForLevel(lv).enemies as any;
  const prev = blueprintForLevel(lv - 1).enemies as any;
  for (const t of ['chaser', 'cutter', 'sentinel', 'sleeper']) {
    if (cur[t] > 0 && prev[t] === 0) return t;
  }
  return null;
}

/* ============================ EASY: THE BLOOM TRANSFORM =================== */
// Easy is its own mode — a lush "Bloom" garden run, not Medium-lite. It rewrites
// the base blueprint: gentler-but-mazier maps, richer caches, a gentle rift ramp,
// and a roster of drifters + the Bloom critters (firefly/sprite) with NO
// chaser/cutter. Movement speed stays near-flat (difficulty.ts); the climb is
// carried by enemy count, maze complexity, hazards, and reward. Formula-based so
// it stays endless-safe. Never runs in the daily (the daily forces Medium).

// The Bloom roster for an Easy floor — Airxonix-style THEMED floors: some are a
// single creature (a firefly meadow, a sprite hollow), some are mixes, and the
// summit (every 5th) is a full mix + the Qix. The featured count grows slowly
// with depth. No hunters (chaser/cutter/sentinel always 0).
// Per-floor non-boss enemy BUDGET: ramps +1 every 2 floors and CAPS at 10. Past
// the cap (~floor 17) the count holds — only the map + enemy type keep changing,
// so deeper play is an endurance run, not an ever-denser screen. The Nucleus boss
// and the drifters it emits are extra and do NOT count toward this 10.
export const BLOOM_ENEMY_CAP = 10;
function bloomBudget(lv: number): number {
  return Math.min(2 + Math.floor((lv - 1) / 2), BLOOM_ENEMY_CAP);
}
export function bloomRoster(lv: number): EnemyCounts {
  const z: EnemyCounts = { drifter: 0, firefly: 0, sprite: 0, chaser: 0, cutter: 0, sentinel: 0, sleeper: 0 };
  const b = bloomBudget(lv);
  if (lv === 1) { z.drifter = b; return z; }                                  // teach: drifters only
  if (lv === 2) { z.firefly = b; return z; }                                  // FIREFLY debut — fireflies only
  if (lv === 3) { z.drifter = Math.ceil(b / 2); z.firefly = Math.floor(b / 2); return z; }
  if (lv === 4) { z.sprite = b; return z; }                                   // SPRITE debut — sprites only
  // L5+: a rotating set of themed floors within each 5-floor band — a single-type
  // floor for each creature (Airxonix-style), a mix, then the boss summit.
  switch ((lv - 1) % 5) {
    case 0: z.firefly = b; break;                                             // firefly meadow (all fireflies)
    case 1: z.sprite = b; break;                                              // sprite hollow (all sprites)
    case 2: z.drifter = b; break;                                             // drifter swarm (all drifters)
    case 3: z.firefly = Math.ceil(b / 2); z.sprite = Math.floor(b / 2); break; // fae mix (firefly + sprite)
    // summit: THE NUCLEUS carries it (and emits drifters), so the base roster is a
    // light mix around the boss — capped low so the floor never gets out of hand.
    default: z.firefly = Math.min(Math.ceil(b / 3), 3); z.sprite = Math.min(Math.ceil(b / 3), 3);
  }
  return z;
}
export function bloomBlueprint(base: LevelBlueprint, lv: number): LevelBlueprint {
  // gentler early, mazier deeper (board-complexity lever); the target is left to
  // the base — Easy's clearTarget delta lowers it in initLevel. Floors alternate
  // between organic GROVES (clumped thickets) and carved VEINS so layouts vary.
  const motif: ObstacleMotif = lv <= 1 ? 'open' : lv <= 3 ? 'pillars' : (lv % 2 === 0 ? 'grove' : 'veins');
  return {
    ...base,
    motif,
    density: Math.min(0.03 + 0.015 * (lv - 1), 0.13),                // gentle start, denser deeper
    caches: base.caches + 2,                                          // reward-intensity lever
    rifts: lv <= 2 ? 0 : Math.min(1 + Math.floor((lv - 3) / 2), 5),   // gentle hazard ramp
    enemies: bloomRoster(lv),
  };
}
// The new Bloom critter introduced at this Easy floor (drives the "NEW BLOOM"
// card). Fixed debut floors — themed floors make types come and go, so we can't
// infer "new" from the previous floor (it would re-fire on every reappearance).
export function bloomNewEnemy(lv: number): string | null {
  if (lv === 2) return 'firefly';
  if (lv === 4) return 'sprite';
  return null;
}

/* ============================ MEDIUM = THE GRID =========================== */
// Medium's own themed mode, built like Bloom. Increment 1 maps the Grid roster
// onto existing AI — GLITCH = drifter (straight bouncer), TRACER = chaser
// (re-aims at you), DAEMON = cutter (races your line). Bespoke renders, intro
// cards, Grid names + THE KERNEL boss land in Increment 2; the floor structure
// here is final. Same +1-every-2-floors budget, capped at 10 (hunters held lower
// so a Medium floor never becomes an all-homing wall).
export const GRID_ENEMY_CAP = 10;
function gridBudget(lv: number): number {
  return Math.min(2 + Math.floor((lv - 1) / 2), GRID_ENEMY_CAP);
}
export function gridRoster(lv: number): EnemyCounts {
  const z: EnemyCounts = { drifter: 0, chaser: 0, cutter: 0, charger: 0, sentinel: 0, sleeper: 0 };
  const b = gridBudget(lv);
  // Teaching band (L1-5): GLITCH alone, then each reactive type debuts GENTLY (one of it
  // among glitches) so you meet it before the pure floors hit; L5 is the first summit.
  if (lv === 1) { z.drifter = b; return z; }                                   // teach: GLITCH only (passive)
  if (lv === 2) { z.chaser = 1; z.drifter = b - 1; return z; }                 // TRACER debut
  if (lv === 3) { z.chaser = Math.min(3, Math.ceil(b / 2)); z.drifter = b - z.chaser; return z; }
  if (lv === 4) { z.charger = 1; z.drifter = b - 1; return z; }                // CHARGER debut
  // L6+: rotating PURE single-type floors (Airxonix-style) — a tracer-only swarm, a
  // charger-only gauntlet, a glitch-only storm — then a mix, then the summit (+ NUCLEUS).
  switch ((lv - 1) % 5) {
    case 0: z.chaser = Math.min(7, b); break;                                  // TRACER ONLY
    case 1: z.charger = Math.min(5, b); break;                                 // CHARGER ONLY
    case 2: z.drifter = b; break;                                              // GLITCH ONLY
    case 3: z.chaser = Math.min(3, Math.ceil(b / 2)); z.charger = Math.min(2, Math.floor(b / 3)); z.drifter = b - z.chaser - z.charger; break;  // mix
    default: z.chaser = Math.min(3, Math.ceil(b / 3)); z.charger = Math.min(2, Math.ceil(b / 4)); z.drifter = b - z.chaser - z.charger;  // summit mix
  }
  if (z.drifter + z.chaser + (z.charger || 0) < 1) z.drifter = 1;             // never an empty floor
  return z;
}
export function gridBlueprint(base: LevelBlueprint, lv: number): LevelBlueprint {
  // open start, then alternating pillar/vein mazes (the bespoke Grid terrain motif
  // — chip blocks / data buses — is Increment 3; pillars/veins read fine for now).
  const motif: ObstacleMotif = lv <= 1 ? 'open' : lv <= 3 ? 'pillars' : (lv % 2 === 0 ? 'pillars' : 'veins');
  return {
    ...base,
    motif,
    density: Math.min(0.04 + 0.016 * (lv - 1), 0.13),                // gentle start, denser deeper
    target: Math.min(0.58 + 0.012 * (lv - 1), 0.72),                 // moderate, rising (between Bloom + campaign)
    caches: base.caches + 1,                                          // a touch more reward than the campaign base
    rifts: lv <= 2 ? 0 : Math.min(1 + Math.floor((lv - 3) / 2), 5),   // gentle hazard ramp
    enemies: gridRoster(lv),
  };
}
// New Grid enemy introduced at this floor (drives the intro card). GLITCH is the L1
// base (no card, like Bloom's drifter); the reactive pair debut with cards — TRACER
// (chaser AI) at L2, CHARGER at L4 — matching gridRoster.
export function gridNewEnemy(lv: number): string | null {
  if (lv === 2) return 'tracer';
  if (lv === 4) return 'charger';
  return null;
}

/* ============================ THE DAILY CHALLENGE ========================= */
// A self-contained 10-floor gauntlet in The Rift (its own zone), distinct from
// the campaign. Same difficulty curve every day; the date seeds the actual
// boards + enemy placement, so it's the same challenge for everyone that day.
// The Rift roster adds the SENTINEL (floor 4) and the WRAITH (floor 6).
export const DAILY_FLOORS = 10;
const DAILY: Record<number, LevelBlueprint> = {
  1:  { title: 'BREACH',        motif: 'pillars', density: 0.05, target: 0.66, caches: 4,  rifts: 1, depth: 0.18,
        enemies: { drifter: 2, chaser: 0, cutter: 0, sentinel: 0, sleeper: 0, wraith: 0 } },
  2:  { title: 'FRACTURE',      motif: 'veins',   density: 0.08, target: 0.68, caches: 5,  rifts: 2, depth: 0.30,
        enemies: { drifter: 2, chaser: 1, cutter: 0, sentinel: 0, sleeper: 0, wraith: 0 } },
  3:  { title: 'SPLINTER',      motif: 'veins',   density: 0.10, target: 0.70, caches: 5,  rifts: 2, depth: 0.40,
        enemies: { drifter: 2, chaser: 1, cutter: 1, sentinel: 0, sleeper: 0, wraith: 0 } },
  // The Sentinel wakes — it strikes whenever you rest on safe ground.
  4:  { title: 'THE WATCH',     motif: 'veins',   density: 0.10, target: 0.72, caches: 6,  rifts: 2, depth: 0.40,
        enemies: { drifter: 3, chaser: 1, cutter: 1, sentinel: 1, sleeper: 0, wraith: 0 } },
  5:  { title: 'UNRAVEL',       motif: 'veins',   density: 0.11, target: 0.74, caches: 7,  rifts: 3, depth: 0.52,
        enemies: { drifter: 3, chaser: 2, cutter: 1, sentinel: 1, sleeper: 0, wraith: 0 } },
  // The Wraith appears — it blinks through the rift straight at you.
  6:  { title: 'PHANTOMS',      motif: 'veins',   density: 0.12, target: 0.76, caches: 7,  rifts: 3, depth: 0.62,
        enemies: { drifter: 3, chaser: 2, cutter: 1, sentinel: 1, sleeper: 0, wraith: 1 } },
  7:  { title: 'COLLAPSE',      motif: 'veins',   density: 0.12, target: 0.78, caches: 8,  rifts: 4, depth: 0.72,
        enemies: { drifter: 3, chaser: 2, cutter: 2, sentinel: 1, sleeper: 0, wraith: 1 } },
  8:  { title: 'DISSOLUTION',   motif: 'veins',   density: 0.13, target: 0.79, caches: 8,  rifts: 5, depth: 0.84,
        enemies: { drifter: 4, chaser: 2, cutter: 2, sentinel: 1, sleeper: 0, wraith: 2 } },
  9:  { title: 'THE MAELSTROM', motif: 'veins',   density: 0.13, target: 0.80, caches: 9,  rifts: 5, depth: 0.93,
        enemies: { drifter: 4, chaser: 3, cutter: 2, sentinel: 2, sleeper: 0, wraith: 2 } },
  // The core of the rift — the most crowded board, highest target. Clear it to win the day.
  10: { title: 'THE CORE',      motif: 'veins',   density: 0.14, target: 0.82, caches: 10, rifts: 6, depth: 1.00,
        enemies: { drifter: 4, chaser: 3, cutter: 2, sentinel: 2, sleeper: 0, wraith: 2 } },
};
export function dailyBlueprint(floor: number): LevelBlueprint {
  return DAILY[Math.max(1, Math.min(DAILY_FLOORS, floor))];
}
// The new threat introduced at this daily floor (drives the "NEW THREAT" card).
export function dailyNewEnemy(floor: number): string | null {
  const cur = dailyBlueprint(floor).enemies as any;
  const prev = floor > 1 ? dailyBlueprint(floor - 1).enemies as any : {};
  for (const t of ['chaser', 'cutter', 'sentinel', 'wraith']) {
    if (cur[t] > 0 && !(prev[t] > 0)) return t;
  }
  return null;
}
