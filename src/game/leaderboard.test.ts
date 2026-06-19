/* Local leaderboard: ordering (desc by score), top-N cap, 1-based rank,
   rejection of non-positive scores, and persistence round-trip via localStorage.
   Each test gets a fresh module + cleared storage so state never leaks. */
import '../test/browser-env';   // provides the localStorage stub
import { describe, it, expect, beforeEach, vi } from 'vitest';

type LB = typeof import('./leaderboard');
let lb: LB;

const E = (score: number, level = 1, daily = false) => ({ score, level, date: '2026-06-19', daily });

beforeEach(async () => {
  (globalThis as any).localStorage.clear();
  vi.resetModules();
  lb = await import('./leaderboard');
});

describe('ordering + rank', () => {
  it('orders entries by score, highest first', () => {
    lb.submitScore(E(100)); lb.submitScore(E(300)); lb.submitScore(E(200));
    expect(lb.getScores().map((e) => e.score)).toEqual([300, 200, 100]);
  });

  it('returns the 1-based rank of a placed run', () => {
    expect(lb.submitScore(E(1000))).toBe(1);
    expect(lb.submitScore(E(500))).toBe(2);
    expect(lb.submitScore(E(1500))).toBe(1);   // new top -> rank 1
    expect(lb.submitScore(E(750))).toBe(3);    // 1500, 1000, 750, 500
  });
});

describe('top-N cap (10)', () => {
  it('keeps only the ten highest', () => {
    for (let i = 1; i <= 12; i++) lb.submitScore(E(i * 100));
    const scores = lb.getScores().map((e) => e.score);
    expect(scores.length).toBe(10);
    expect(scores[0]).toBe(1200);
    expect(scores[9]).toBe(300);               // 100 and 200 dropped off the bottom
  });

  it('returns 0 for a run that does not make the table', () => {
    for (let i = 0; i < 12; i++) lb.submitScore(E(2000 + i));
    expect(lb.submitScore(E(1))).toBe(0);      // below the full table -> off the board
  });
});

describe('validation + persistence', () => {
  it('rejects non-positive scores', () => {
    expect(lb.submitScore(E(0))).toBe(0);
    expect(lb.submitScore(E(-50))).toBe(0);
    expect(lb.getScores().length).toBe(0);
  });

  it('persists across a reload (save -> load round-trip)', async () => {
    lb.submitScore(E(500, 8)); lb.submitScore(E(700, 11, true));
    vi.resetModules();
    const reloaded = await import('./leaderboard');
    expect(reloaded.getScores().map((e) => e.score)).toEqual([700, 500]);
    expect(reloaded.getScores()[0]).toMatchObject({ score: 700, level: 11, daily: true });
  });
});
