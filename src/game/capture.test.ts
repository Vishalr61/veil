/* Capture scoring: the combo multiplier and the chain-milestone callout.
   doCapture is the real claim path; with no enemies the flood-fill claims the
   open board, which is enough to exercise the combo + milestone logic. */
import { G, CELL, COMBO_WINDOW, resetG, hasPopup, cellAt } from '../test/g-fixture';
import { describe, it, expect, beforeEach } from 'vitest';
import { doCapture, comboMult, boldClearBonus } from './capture';

beforeEach(() => resetG());

describe('boldClearBonus(percent, target, level) = over>0.08 ? round(over*100*(12+level*4)) : 0', () => {
  it('pays nothing at or below the overshoot threshold, or under target', () => {
    expect(boldClearBonus(0.75, 0.70, 1)).toBe(0);   // 5pp over — under the 8pp threshold
    expect(boldClearBonus(0.60, 0.70, 1)).toBe(0);   // below the target entirely
  });
  it('scales with overshoot and level past the threshold', () => {
    expect(boldClearBonus(0.85, 0.70, 1)).toBe(240);   // over .15, L1: round(15*(12+4))  = 240
    expect(boldClearBonus(0.90, 0.70, 5)).toBe(640);   // over .20, L5: round(20*(12+20)) = 640
  });
});

describe('comboMult() = min(1 + 0.3*(combo-1), 6)', () => {
  it('rises 0.3 per chain step', () => {
    G.combo = 1; expect(comboMult()).toBeCloseTo(1.0, 5);
    G.combo = 2; expect(comboMult()).toBeCloseTo(1.3, 5);
    G.combo = 5; expect(comboMult()).toBeCloseTo(2.2, 5);
    G.combo = 17; expect(comboMult()).toBeCloseTo(5.8, 5);
  });
  it('caps at 6x', () => {
    G.combo = 18; expect(comboMult()).toBeCloseTo(6.0, 5);   // 1 + 0.3*17 = 6.1 -> 6
    G.combo = 40; expect(comboMult()).toBeCloseTo(6.0, 5);
  });
});

// A capture inside the combo window advances the chain by one.
function captureWithCombo(startCombo: number) {
  G.combo = startCombo;
  G.comboT = COMBO_WINDOW;                          // > 0 => combo increments
  G.player.px = { x: CELL * 5, y: CELL * 5 };
  G.trailCells = [cellAt(5, 5), cellAt(6, 5), cellAt(7, 5)];
  doCapture();
}

describe('chain milestones', () => {
  it('fires the milestone callout at combo 4', () => {
    captureWithCombo(3);
    expect(G.combo).toBe(4);
    expect(hasPopup('CHAIN!')).toBe(true);          // "4x CHAIN!"
  });

  it('does not fire on a non-milestone step (combo 5)', () => {
    captureWithCombo(4);
    expect(G.combo).toBe(5);
    expect(hasPopup('CHAIN!')).toBe(false);         // regular "x… CHAIN" has no "!"
  });

  it('starts the chain at 1 when the window has lapsed', () => {
    G.combo = 6; G.comboT = 0;                       // window expired
    G.player.px = { x: CELL * 5, y: CELL * 5 };
    G.trailCells = [cellAt(5, 5), cellAt(6, 5)];
    doCapture();
    expect(G.combo).toBe(1);
  });
});
