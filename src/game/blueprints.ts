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

// "The Depths" (magma band) — a crafted three-floor descent.
const AUTHORED: Record<number, LevelBlueprint> = {
  // Teach the loop: open board, one slow bouncer, caches only, no punishment.
  1: { title: 'SURFACE CRACK', motif: 'open', density: 0, target: 0.60,
       caches: 3, rifts: 0, depth: 0.15,
       enemies: { drifter: 1, chaser: 0, cutter: 0, sentinel: 0, sleeper: 0 } },
  // Teach routing: scattered basalt columns, still no rifts/hunters.
  2: { title: 'BASALT COLUMNS', motif: 'pillars', density: 0.05, target: 0.64,
       caches: 4, rifts: 0, depth: 0.5,
       enemies: { drifter: 2, chaser: 0, cutter: 0, sentinel: 0, sleeper: 0 } },
  // The climax: lava veins carve the board into chambers holding the richest
  // caches and the first rifts; the chaser arrives. Risk + reward + a hunter.
  3: { title: 'MOLTEN CHAMBER', motif: 'veins', density: 0.08, target: 0.66,
       caches: 5, rifts: 2, depth: 0.9,
       enemies: { drifter: 2, chaser: 1, cutter: 0, sentinel: 0, sleeper: 0 } },
};

// Visual intensity from position within a 3-level band: 0, 0.5, 1.0.
export function depthForLevel(lv: number): number {
  return (((lv - 1) % 3) + 3) % 3 / 2;
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
