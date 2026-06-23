/* Difficulty config + pure levers. Asserts the SPEC: Medium reproduces today's
   formulas exactly; Easy removes time pressure (fuse + clock off) and delays the
   enemy schedule; Hard tightens; the daily is always Medium. */
import '../test/browser-env';
import { describe, it, expect, beforeEach } from 'vitest';
import { G } from '../game/state';
import {
  DIFFS, effectiveDiff, fuseWindow, levelClock, clearTarget, enemySpeed,
  applyDiffCounts, riftCount, invulnFor,
} from './difficulty';

const EASY = DIFFS.easy, MED = DIFFS.medium, HARD = DIFFS.hard;
const counts = (o: any = {}) => ({ drifter: 2, chaser: 1, cutter: 1, sentinel: 0, sleeper: 0, ...o });

describe('Medium reproduces today exactly', () => {
  it('matches the source fuse / clock / lives / target / speed', () => {
    expect(MED.fuse).toBe(true); expect(MED.clock).toBe(true); expect(MED.lives).toBe(3);
    expect(fuseWindow(1, MED)).toBeCloseTo(5.88, 5);          // max(2.8, 6 - lv*0.12)
    expect(fuseWindow(27, MED)).toBeCloseTo(2.8, 5);          // the 2.8 floor
    expect(levelClock(60, MED)).toBe(60);                     // budget unchanged
    expect(clearTarget(0.66, MED)).toBeCloseTo(0.66, 5);      // min(bp, 0.74)
    expect(clearTarget(0.80, MED)).toBe(0.74);                // cap
    expect(enemySpeed(1, MED)).toBe(140);                     // min(140 + 9*(lv-1), 240)
    expect(enemySpeed(12, MED)).toBe(239);
    expect(enemySpeed(50, MED)).toBe(240);                    // cap
  });
  it('leaves the enemy schedule and counts untouched', () => {
    expect(applyDiffCounts(counts(), 3, false, MED)).toMatchObject({ chaser: 1, cutter: 1, drifter: 2 });
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
  it('is forgiving: more lives, slower + capped enemies, more invuln', () => {
    expect(EASY.lives).toBe(5);
    expect(enemySpeed(1, EASY)).toBeCloseTo(98, 5);          // 140 * 0.7
    expect(enemySpeed(99, EASY)).toBe(140);                  // low cap
    expect(invulnFor(1.0, EASY)).toBeCloseTo(1.5, 5);
  });
});

describe('Easy enemy-schedule delays', () => {
  it('zeros the chaser before L6 and the cutter before L11', () => {
    const l3 = applyDiffCounts(counts(), 3, false, EASY);
    expect(l3.chaser).toBe(0); expect(l3.cutter).toBe(0);
    const l7 = applyDiffCounts(counts(), 7, false, EASY);
    expect(l7.chaser).toBe(1);                               // L7 >= 6 -> allowed
    expect(l7.cutter).toBe(0);                               // L7 < 11 -> still held
    const l11 = applyDiffCounts(counts(), 11, false, EASY);
    expect(l11.chaser).toBe(1); expect(l11.cutter).toBe(1);
  });
  it('drops one enemy but never below a single one', () => {
    expect(applyDiffCounts(counts({ drifter: 3, chaser: 0, cutter: 0 }), 2, false, EASY).drifter).toBe(2);
    expect(applyDiffCounts(counts({ drifter: 1, chaser: 0, cutter: 0 }), 1, false, EASY).drifter).toBe(1);
  });
});

describe('Hard turns the screws', () => {
  it('tightens fuse + clock, fewer lives, faster enemies, less invuln', () => {
    expect(fuseWindow(1, HARD)).toBeCloseTo(5.88 * 0.8, 5);
    expect(levelClock(60, HARD)).toBeCloseTo(48, 5);
    expect(HARD.lives).toBe(2);
    expect(enemySpeed(1, HARD)).toBeCloseTo(154, 5);         // 140 * 1.1
    expect(invulnFor(1.0, HARD)).toBeCloseTo(0.7, 5);
  });
  it('adds an enemy on non-summit floors only, never delays the schedule', () => {
    expect(applyDiffCounts(counts({ drifter: 2 }), 4, false, HARD).drifter).toBe(3);
    expect(applyDiffCounts(counts({ drifter: 2 }), 5, true, HARD).drifter).toBe(2);   // summit -> no +1
    expect(applyDiffCounts(counts(), 3, false, HARD).chaser).toBe(1);                  // no delay
  });
});

describe('rift density', () => {
  it('Easy halves rifts; Medium/Hard unchanged', () => {
    expect(riftCount(3, EASY)).toBe(2);                      // round(1.5)
    expect(riftCount(4, EASY)).toBe(2);
    expect(riftCount(3, MED)).toBe(3);
    expect(riftCount(3, HARD)).toBe(3);
  });
});

describe('effectiveDiff: the daily is always Medium', () => {
  beforeEach(() => { G.isDaily = false; G.diff = 'medium'; });
  it('returns the chosen mode for normal play', () => {
    G.diff = 'easy'; expect(effectiveDiff().key).toBe('easy');
    G.diff = 'hard'; expect(effectiveDiff().key).toBe('hard');
  });
  it('forces Medium during the daily, ignoring the choice', () => {
    G.diff = 'easy'; G.isDaily = true;
    expect(effectiveDiff().key).toBe('medium');
  });
});
