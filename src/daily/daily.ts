/* =========================================================================
   Daily challenge — one seeded board per day for everyone.

   The seed is derived from the UTC date, so the same day produces the same
   board (enemy layout + veil content) on every device. The shareable result
   is spoiler-light (a reveal bar + score), the Wordle-style growth loop.
   ========================================================================= */

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function todayKey(now: Date): string {
  return dateKey(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

// xfnv-1a hash of the date key -> 32-bit seed.
export function seedFromDateKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h ^ (h >>> 16)) >>> 0;
}

export interface DailyResult {
  key: string;      // date key, e.g. "2026-06-16"
  score: number;
  level: number;    // level reached
  percent: number;  // reveal % on the final level (0..1)
  streak?: number;  // consecutive days played
}

// Recognizable, spoiler-light, copy-pasteable.
export function shareText(r: DailyResult): string {
  const filled = Math.max(0, Math.min(5, Math.round(r.percent * 5)));
  const bar = '🟦'.repeat(filled) + '⬛'.repeat(5 - filled);
  const streak = r.streak && r.streak > 1 ? `\n🔥 ${r.streak} day streak` : '';
  return `VEIL ${r.key}\n${bar} ${Math.round(r.percent * 100)}%\nScore ${r.score} · Lv ${r.level}${streak}`;
}

// True if curKey is exactly the day after prevKey (UTC), for streak counting.
export function isConsecutive(prevKey: string, curKey: string): boolean {
  const p = Date.parse(prevKey + 'T00:00:00Z');
  const c = Date.parse(curKey + 'T00:00:00Z');
  return Number.isFinite(p) && Number.isFinite(c) && c - p === 86400000;
}
