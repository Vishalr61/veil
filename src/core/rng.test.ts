import { describe, it, expect } from 'vitest';
import { SeededRng } from './rng';

describe('SeededRng', () => {
  it('same seed -> identical sequence', () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);
    const sa = Array.from({ length: 256 }, () => a.next());
    const sb = Array.from({ length: 256 }, () => b.next());
    expect(sa).toEqual(sb);
  });

  it('different seeds -> different sequences', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('next() stays in [0, 1)', () => {
    const r = new SeededRng(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays in [0, n) and is integral', () => {
    const r = new SeededRng(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('fork is stable no matter how far the parent has advanced', () => {
    const p1 = new SeededRng(99);
    const f1 = p1.fork('enemies');
    const p2 = new SeededRng(99);
    p2.next(); p2.next(); p2.next();
    const f2 = p2.fork('enemies');
    expect(f1.next()).toEqual(f2.next());
  });

  it('forks with different labels diverge', () => {
    const p = new SeededRng(5);
    expect(p.fork('enemies').next()).not.toEqual(p.fork('spawns').next());
  });

  it('weighted respects weights (0-weight items never chosen)', () => {
    const r = new SeededRng(3);
    const items = ['a', 'b', 'c'];
    const w: Record<string, number> = { a: 0, b: 1, c: 0 };
    for (let i = 0; i < 1000; i++) {
      expect(r.weighted(items, (it) => w[it])).toBe('b');
    }
  });
});
