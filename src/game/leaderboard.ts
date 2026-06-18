/* =========================================================================
   Local leaderboard — a top-N table of finished runs, persisted to
   localStorage. No backend; this is the device's own high-score list (the
   single `veil_highscore` still drives the menu's HI and the NEW BEST card).
   ========================================================================= */

export interface ScoreEntry {
  score: number;
  level: number;
  date: string;    // YYYY-MM-DD
  daily?: boolean;
}

const KEY = 'veil_scores';
const MAX = 10;

let entries: ScoreEntry[] = load();
let justSet: ScoreEntry | null = null;   // the most recent run, if it made the table (for highlighting)

function load(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return a.filter((e) => e && typeof e.score === 'number').slice(0, MAX);
    }
  } catch (e) {}
  return [];
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch (e) {} }

export function getScores(): ScoreEntry[] { return entries; }
export function justSetEntry(): ScoreEntry | null { return justSet; }

// Insert a finished run; returns its 1-based rank if it made the table, else 0.
export function submitScore(e: ScoreEntry): number {
  justSet = null;
  if (!e || e.score <= 0) return 0;
  entries.push(e);
  entries.sort((a, b) => b.score - a.score);
  const rank = entries.indexOf(e) + 1;
  entries = entries.slice(0, MAX);
  save();
  if (rank <= MAX) { justSet = e; return rank; }
  return 0;
}
