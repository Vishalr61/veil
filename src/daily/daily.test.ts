import { describe, it, expect } from 'vitest';
import { dateKey, todayKey, seedFromDateKey, shareText } from './daily';

describe('daily', () => {
  it('dateKey zero-pads month and day', () => {
    expect(dateKey(2026, 6, 1)).toBe('2026-06-01');
    expect(dateKey(2026, 12, 25)).toBe('2026-12-25');
  });

  it('todayKey uses UTC date components', () => {
    const d = new Date(Date.UTC(2026, 5, 16, 23, 30)); // month is 0-based: 5 = June
    expect(todayKey(d)).toBe('2026-06-16');
  });

  it('same date -> same seed, different date -> different seed', () => {
    expect(seedFromDateKey('2026-06-16')).toBe(seedFromDateKey('2026-06-16'));
    expect(seedFromDateKey('2026-06-16')).not.toBe(seedFromDateKey('2026-06-17'));
  });

  it('seed is a uint32', () => {
    const s = seedFromDateKey('2026-06-16');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });

  it('shareText carries date, reveal %, score and level', () => {
    const t = shareText({ key: '2026-06-16', score: 12340, level: 4, percent: 0.73 });
    expect(t).toContain('VEIL 2026-06-16');
    expect(t).toContain('73%');
    expect(t).toContain('Score 12340');
    expect(t).toContain('Lv 4');
  });
});
