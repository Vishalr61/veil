import { describe, it, expect } from 'vitest';
import { SeededRng } from '../core/rng';
import { genObstacles, obstacleBudget, openInteriorCount } from './terrain';

const COLS = 24, ROWS = 40, START = COLS >> 1; // top-middle border cell, as in-game

function gen(seed: number, level: number, startIdx = START) {
  return genObstacles(new SeededRng(seed), { cols: COLS, rows: ROWS, level, startIdx });
}

// independent flood-fill connectivity check
function allOpenReachable(obst: Uint8Array, cols: number, rows: number, startIdx: number): boolean {
  const seen = new Uint8Array(cols * rows);
  const stack = [startIdx];
  seen[startIdx] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % cols, y = (i / cols) | 0;
    const ns = [x + 1 < cols ? i + 1 : -1, x - 1 >= 0 ? i - 1 : -1, y + 1 < rows ? i + cols : -1, y - 1 >= 0 ? i - cols : -1];
    for (const nb of ns) { if (nb < 0 || seen[nb] || obst[nb]) continue; seen[nb] = 1; stack.push(nb); }
  }
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++) { const i = y * cols + x; if (!obst[i] && !seen[i]) return false; }
  return true;
}

const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);

describe('terrain', () => {
  it('level 1 is fully open (no obstacles)', () => {
    expect(sum(gen(1, 1))).toBe(0);
  });

  it('same seed -> identical terrain', () => {
    expect(Array.from(gen(7, 5))).toEqual(Array.from(gen(7, 5)));
  });

  it('obstacle budget rises with level and is capped', () => {
    expect(obstacleBudget(1)).toBe(0);
    expect(obstacleBudget(5)).toBeGreaterThan(0);
    expect(obstacleBudget(50)).toBeLessThanOrEqual(0.16);
  });

  it('keeps the open playfield fully connected (160 seed/level cases)', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const level of [3, 6, 10, 20])
        expect(allOpenReachable(gen(seed, level), COLS, ROWS, START)).toBe(true);
  });

  it('keeps the spawn cell clear', () => {
    for (let seed = 1; seed <= 20; seed++) expect(gen(seed, 20)[START]).toBe(0);
  });

  it('has no dead-ends (every open interior cell has >= 2 open neighbors)', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const level of [3, 8, 20]) {
        const o = gen(seed, level);
        for (let y = 1; y < ROWS - 1; y++)
          for (let x = 1; x < COLS - 1; x++) {
            const i = y * COLS + x;
            if (o[i]) continue;
            let c = 0;
            if (!o[i + 1]) c++; if (!o[i - 1]) c++; if (!o[i + COLS]) c++; if (!o[i - COLS]) c++;
            expect(c).toBeGreaterThanOrEqual(2);
          }
      }
  });

  it('erosion does not collapse the playfield (stays mostly open)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const open = openInteriorCount(gen(seed, 30), COLS, ROWS);
      expect(open).toBeGreaterThan((COLS - 2) * (ROWS - 2) * 0.5);
    }
  });

  it('openInteriorCount = interior minus obstacles', () => {
    const o = gen(3, 10);
    expect(openInteriorCount(o, COLS, ROWS)).toBe((COLS - 2) * (ROWS - 2) - sum(o));
  });

  // motif layouts must hold the same guarantees as the default blobs.
  for (const motif of ['pillars', 'veins'] as const) {
    it(`motif '${motif}' stays connected, dead-end-free, spawn-clear, mostly open`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const o = genObstacles(new SeededRng(seed), { cols: COLS, rows: ROWS, level: 3, startIdx: START, motif, density: 0.08 });
        expect(o[START]).toBe(0);                                    // spawn clear
        expect(allOpenReachable(o, COLS, ROWS, START)).toBe(true);   // connected
        expect(openInteriorCount(o, COLS, ROWS)).toBeGreaterThan((COLS - 2) * (ROWS - 2) * 0.5);  // mostly open
        for (let y = 1; y < ROWS - 1; y++)
          for (let x = 1; x < COLS - 1; x++) {
            const i = y * COLS + x;
            if (o[i]) continue;
            let c = 0;
            if (!o[i + 1]) c++; if (!o[i - 1]) c++; if (!o[i + COLS]) c++; if (!o[i - COLS]) c++;
            expect(c).toBeGreaterThanOrEqual(2);                     // no dead-ends
          }
      }
    });
  }

  it("motif 'open' places nothing", () => {
    const o = genObstacles(new SeededRng(5), { cols: COLS, rows: ROWS, level: 3, startIdx: START, motif: 'open', density: 0.08 });
    expect(sum(o)).toBe(0);
  });

  // Determinism guard: deep levels fall back to explicit blobs + obstacleBudget,
  // which must be byte-identical to the default (no-motif) path the daily replays.
  it('blobs fallback == default path (deep levels unchanged)', () => {
    for (const level of [4, 6, 10, 20])
      for (let seed = 1; seed <= 10; seed++) {
        const fallback = genObstacles(new SeededRng(seed), { cols: COLS, rows: ROWS, level, startIdx: START, motif: 'blobs', density: obstacleBudget(level) });
        const def = genObstacles(new SeededRng(seed), { cols: COLS, rows: ROWS, level, startIdx: START });
        expect(Array.from(fallback)).toEqual(Array.from(def));
      }
  });
});
