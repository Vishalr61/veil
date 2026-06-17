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
};

// Visual intensity from position within a 5-level band: 0, .25, .5, .75, 1.0.
export function depthForLevel(lv: number): number {
  return (((lv - 1) % 5) + 5) % 5 / 4;
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
