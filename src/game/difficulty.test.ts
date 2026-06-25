/* Difficulty config + pure levers. Asserts the SPEC: Medium reproduces today's
   formulas exactly (the soon-to-be-redesigned themed mode still uses them for now);
   Easy is the Bloom garden (fuse + clock off); Hard is the standard campaign baseline
   parked from the old Medium; the daily runs that baseline. */
import '../test/browser-env';
import { describe, it, expect, beforeEach } from 'vitest';
import { G } from '../game/state';
import {
  DIFFS, effectiveDiff, fuseWindow, levelClock, clearTarget, enemySpeed,
  applyDiffCounts, riftCount, invulnFor, playerSpeed,
} from './difficulty';
import { bloomRoster, bloomBlueprint, bloomNewEnemy, blueprintForLevel, gridRoster, gridBlueprint, gridNewEnemy } from './blueprints';

const EASY = DIFFS.easy, MED = DIFFS.medium, HARD = DIFFS.hard;
const counts = (o: any = {}) => ({ drifter: 2, chaser: 1, cutter: 1, sentinel: 0, sleeper: 0, ...o });

describe('Medium = the Grid (fuse-only, its own themed mode)', () => {
  it('keeps the fuse but turns the level CLOCK off', () => {
    expect(MED.fuse).toBe(true);
    expect(fuseWindow(1, MED)).toBeCloseTo(5.88, 5);         // fuse on, scale 1: max(2.8, 6 - lv*0.12)
    expect(fuseWindow(27, MED)).toBeCloseTo(2.8, 5);
    expect(MED.clock).toBe(false);
    expect(levelClock(60, MED)).toBe(Infinity);              // no level clock
  });
  it('sits between Bloom and the campaign: 3 lives, slower-than-baseline enemies, more invuln', () => {
    expect(MED.lives).toBe(3);
    expect(enemySpeed(1, MED)).toBeCloseTo(126, 5);          // 140 * 0.9
    expect(enemySpeed(99, MED)).toBe(190);                   // capped below the campaign baseline (240)
    expect(enemySpeed(1, MED)).toBeLessThan(enemySpeed(1, HARD));   // gentler than the baseline (Hard)
    expect(invulnFor(1.0, MED)).toBeCloseTo(1.2, 5);
  });
  it('leaves the clear target to the blueprint (delta 0, still capped at 0.74)', () => {
    expect(clearTarget(0.66, MED)).toBeCloseTo(0.66, 5);
    expect(clearTarget(0.80, MED)).toBe(0.74);
  });
});

describe('Easy = no time pressure', () => {
  it('disables the fuse and the level clock', () => {
    expect(EASY.fuse).toBe(false);
    expect(fuseWindow(5, EASY)).toBe(Infinity);
    expect(EASY.clock).toBe(false);
    expect(levelClock(60, EASY)).toBe(Infinity);
  });
  it('lowers the clear target but clamps at the 0.50 floor', () => {
    expect(clearTarget(0.66, EASY)).toBeCloseTo(0.56, 5);    // 0.66 - 0.10
    expect(clearTarget(0.58, EASY)).toBeCloseTo(0.50, 5);    // 0.48 -> floored
    expect(clearTarget(0.55, EASY)).toBe(0.50);              // 0.45 -> floored
  });
  it('is forgiving: a life cushion, near-flat + capped enemies, more invuln', () => {
    expect(EASY.lives).toBe(3);
    expect(enemySpeed(1, EASY)).toBeCloseTo(98, 5);          // 140 * 0.7
    expect(enemySpeed(99, EASY)).toBe(120);                  // low cap, flattened ramp
    expect(invulnFor(1.0, EASY)).toBeCloseTo(1.5, 5);
  });
});

describe('Easy = the Bloom garden roster + map transform', () => {
  const total = (r: any) => r.drifter + (r.firefly || 0) + (r.sprite || 0);
  it('never spawns hunters, and is never an empty floor', () => {
    for (const lv of [1, 2, 4, 5, 8, 20]) {
      const r = bloomRoster(lv);
      expect(r.chaser).toBe(0); expect(r.cutter).toBe(0); expect(r.sentinel).toBe(0);
      expect(total(r)).toBeGreaterThanOrEqual(1);
    }
  });
  it('debuts the firefly at L2 and the sprite at L4, each on a single-type floor', () => {
    expect(bloomRoster(1).drifter).toBeGreaterThan(0);               // L1 = drifters only
    expect(bloomRoster(1).firefly).toBe(0); expect(bloomRoster(1).sprite).toBe(0);
    expect(bloomRoster(2).firefly).toBeGreaterThan(0);               // L2 = fireflies only
    expect(bloomRoster(2).drifter).toBe(0); expect(bloomRoster(2).sprite).toBe(0);
    expect(bloomRoster(4).sprite).toBeGreaterThan(0);                // L4 = sprites only
    expect(bloomRoster(4).drifter).toBe(0); expect(bloomRoster(4).firefly).toBe(0);
    expect(bloomNewEnemy(1)).toBe(null);
    expect(bloomNewEnemy(2)).toBe('firefly');
    expect(bloomNewEnemy(4)).toBe('sprite');
    expect(bloomNewEnemy(7)).toBe(null);                             // sprite reappears but isn't "new"
  });
  it('has Airxonix-style single-type themed floors for EACH creature deeper in', () => {
    expect(bloomRoster(6).drifter + bloomRoster(6).sprite!).toBe(0); // L6 = firefly meadow
    expect(bloomRoster(6).firefly).toBeGreaterThan(0);
    expect(bloomRoster(7).drifter + bloomRoster(7).firefly!).toBe(0);// L7 = sprite hollow
    expect(bloomRoster(7).sprite).toBeGreaterThan(0);
    expect(bloomRoster(8).firefly! + bloomRoster(8).sprite!).toBe(0);// L8 = drifter swarm
    expect(bloomRoster(8).drifter).toBeGreaterThan(0);
  });
  it('escalates count deeper, then CAPS total non-boss enemies at 10', () => {
    expect(bloomRoster(6).firefly!).toBeGreaterThan(bloomRoster(2).firefly!);   // deeper firefly floor has more
    const total = (r: any) => r.drifter + (r.firefly || 0) + (r.sprite || 0);
    expect(total(bloomRoster(8))).toBeLessThan(total(bloomRoster(18)));         // still rising mid-game (both drifter swarms)
    for (const lv of [20, 40, 99]) expect(total(bloomRoster(lv))).toBeLessThanOrEqual(10);   // hard cap
    const base = blueprintForLevel(3);
    expect(bloomBlueprint(base, 1).rifts).toBe(0);
    expect(bloomBlueprint(base, 3).rifts).toBe(1);
    expect(bloomBlueprint(base, 99).rifts).toBeLessThanOrEqual(5);
  });
  it('keeps Bloom richer on rewards (more caches than the base)', () => {
    const base = blueprintForLevel(4);
    expect(bloomBlueprint(base, 4).caches).toBe(base.caches + 2);
  });
});

describe('Medium = the Grid roster + blueprint', () => {
  const total = (r: any) => r.drifter + r.chaser + r.cutter;
  it('teaches GLITCH-only on L1, then debuts TRACER (L2) and DAEMON (L4)', () => {
    expect(gridRoster(1).chaser).toBe(0); expect(gridRoster(1).cutter).toBe(0);
    expect(gridRoster(1).drifter).toBeGreaterThan(0);
    expect(gridRoster(2).chaser).toBe(1);                    // TRACER debut (one, among glitches)
    expect(gridRoster(4).cutter).toBe(1);                    // DAEMON debut (one)
  });
  it('is never an empty floor, caps the total at 10, and holds hunters low (fair Medium)', () => {
    for (const lv of [1, 2, 5, 8, 20, 99]) {
      const r = gridRoster(lv);
      expect(total(r)).toBeGreaterThanOrEqual(1);
      expect(total(r)).toBeLessThanOrEqual(10);
      expect(r.chaser).toBeLessThanOrEqual(4);
      expect(r.cutter).toBeLessThanOrEqual(3);
    }
  });
  it('escalates the budget deeper, then caps at 10', () => {
    expect(total(gridRoster(8))).toBeGreaterThan(total(gridRoster(2)));
    for (const lv of [20, 40, 99]) expect(total(gridRoster(lv))).toBe(10);
  });
  it('blueprint: a moderate rising target, more reward than base, gentle rift ramp', () => {
    const base = blueprintForLevel(3);
    expect(gridBlueprint(base, 1).rifts).toBe(0);
    expect(gridBlueprint(base, 3).rifts).toBe(1);
    expect(gridBlueprint(base, 99).rifts).toBeLessThanOrEqual(5);
    expect(gridBlueprint(base, 1).target).toBeCloseTo(0.58, 5);
    expect(gridBlueprint(base, 99).target).toBeLessThanOrEqual(0.72);
    expect(gridBlueprint(base, 4).caches).toBe(base.caches + 1);
  });
  it('introduces no card yet (bespoke GLITCH/TRACER/DAEMON cards land in Increment 2)', () => {
    expect(gridNewEnemy(2)).toBe(null);
    expect(gridNewEnemy(4)).toBe(null);
  });
});

describe('hero move speed', () => {
  it('Hard reproduces today; Medium/Grid is livelier than Bloom but holds by L14; Easy gentlest', () => {
    expect(playerSpeed(1, HARD)).toBeCloseTo(13.5, 5);        // the baseline (old Medium) now lives in Hard
    expect(playerSpeed(50, HARD)).toBe(20);                   // ramps to its cap, no level clamp
    expect(playerSpeed(1, MED)).toBeCloseTo(12.5, 5);         // Grid: between Bloom (11) and the baseline (13.5)
    expect(playerSpeed(20, MED)).toBe(playerSpeed(14, MED));  // holds L14 speed forever after L14
    expect(playerSpeed(100, MED)).toBe(playerSpeed(14, MED));
    expect(playerSpeed(6, EASY)).toBeLessThan(playerSpeed(6, MED));   // Easy calmer than the Grid
    expect(playerSpeed(20, EASY)).toBe(playerSpeed(10, EASY));        // Easy holds L10 speed forever after L10
    expect(playerSpeed(100, EASY)).toBe(playerSpeed(10, EASY));
    expect(playerSpeed(10, EASY)).toBeLessThan(12);                  // and it's slow/controllable
  });
});

describe('Hard = the standard campaign (parked from the old Medium)', () => {
  it('reproduces the baseline: fuse + clock on, 3 lives, today\'s enemy speed + invuln', () => {
    expect(fuseWindow(1, HARD)).toBeCloseTo(5.88, 5);        // no fuse scale (baseline)
    expect(levelClock(60, HARD)).toBe(60);                   // full clock budget
    expect(HARD.lives).toBe(3);
    expect(enemySpeed(1, HARD)).toBe(140);                   // baseline speed (no 1.1 screw)
    expect(invulnFor(1.0, HARD)).toBeCloseTo(1, 5);
  });
  it('leaves the enemy counts + schedule untouched (no +1, no delay)', () => {
    expect(applyDiffCounts(counts({ drifter: 2 }), 4, false, HARD).drifter).toBe(2);  // countDelta 0
    expect(applyDiffCounts(counts(), 3, false, HARD).chaser).toBe(1);
  });
});

describe('rift density', () => {
  it('Easy passes rifts through (bloomBlueprint controls them); Medium/Hard unchanged', () => {
    expect(riftCount(3, EASY)).toBe(3);                      // riftScale 1 — no extra scaling
    expect(riftCount(4, EASY)).toBe(4);
    expect(riftCount(3, MED)).toBe(3);
    expect(riftCount(3, HARD)).toBe(3);
  });
});

describe('effectiveDiff: the daily runs the standard-campaign baseline', () => {
  beforeEach(() => { G.isDaily = false; G.diff = 'easy'; });
  it('returns the chosen mode for normal play', () => {
    G.diff = 'easy'; expect(effectiveDiff().key).toBe('easy');
    G.diff = 'hard'; expect(effectiveDiff().key).toBe('hard');
  });
  it('forces the baseline (Hard) during the daily, ignoring the choice', () => {
    G.diff = 'easy'; G.isDaily = true;
    expect(effectiveDiff().key).toBe('hard');
  });
});
