/* =========================================================================
   Lifetime stats — small localStorage-backed totals across all runs on this
   device (runs played, caches uncovered, best chain, farthest level). Shown on
   the scores screen as a sense-of-progression footer. No backend, no sim impact.
   ========================================================================= */

export interface LifetimeStats { runs: number; caches: number; bestChain: number; bestLevel: number; }

const KEY = 'veil_lifetime';
let s: LifetimeStats = load();

function load(): LifetimeStats {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r && typeof r.runs === 'number')
      return { runs: r.runs | 0, caches: r.caches | 0, bestChain: r.bestChain | 0, bestLevel: r.bestLevel | 0 };
  } catch (e) {}
  return { runs: 0, caches: 0, bestChain: 0, bestLevel: 0 };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

export function getLifetime(): LifetimeStats { return s; }

// Fold one finished run into the lifetime totals (called once per game-over).
export function recordRun(caches: number, chain: number, level: number) {
  s.runs++;
  s.caches += Math.max(0, caches | 0);
  if (chain > s.bestChain) s.bestChain = chain;
  if (level > s.bestLevel) s.bestLevel = level;
  save();
}
