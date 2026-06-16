/* =========================================================================
   SeededRng — deterministic PRNG (mulberry32).

   The whole point: given the same seed and the same sequence of calls, this
   produces the same numbers on every device. That's what lets a daily
   challenge hand everyone the same board. Keep it OUT of presentation code
   (particles, shake, nebula gen) — only simulation that affects outcome
   should draw from a seeded stream.
   ========================================================================= */

export class SeededRng {
  private a: number;        // current state
  private seed0: number;    // original seed, so fork() is stable as the stream advances

  constructor(seed: number) {
    this.seed0 = seed >>> 0;
    this.a = seed >>> 0;
  }

  /** Next float in [0, 1). */
  next(): number {
    let a = this.a;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this.a = a;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Uniform pick from a non-empty array. */
  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Weighted pick: weightOf(item) returns a non-negative weight. */
  weighted<T>(items: T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += weightOf(it);
    let r = this.next() * total;
    for (const it of items) {
      r -= weightOf(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /**
   * Derive an independent child stream from a label. Stable regardless of how
   * far this stream has advanced, so each subsystem (enemies, spawns, veil)
   * can own a fork without one's draw count desyncing another.
   */
  fork(label: string | number): SeededRng {
    let h = (this.seed0 ^ 0x9e3779b9) >>> 0;
    const s = String(label);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    }
    return new SeededRng((h ^ (h >>> 16)) >>> 0);
  }
}
